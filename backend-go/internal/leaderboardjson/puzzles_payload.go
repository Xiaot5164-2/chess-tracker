package leaderboardjson

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

// PuzzleRow 与 Next.js GET /api/leaderboard/puzzles 行结构一致（camelCase）。
type PuzzleRow struct {
	ProfileID            string   `json:"profile_id"`
	ChessUsername        string   `json:"chess_username"`
	DisplayName          *string  `json:"display_name"`
	AvatarURL            *string  `json:"avatar_url"`
	Rating               *float64 `json:"rating"`
	Attempts             *float64 `json:"attempts"`
	PassRatePct          *float64 `json:"passRatePct"`
	AvgSecondsPerAttempt *float64 `json:"avgSecondsPerAttempt"`
	RatingDelta7         *float64 `json:"ratingDelta7"`
	RatingDelta30        *float64 `json:"ratingDelta30"`
	AttemptsLast7Days    *float64 `json:"attemptsLast7Days"`
	AttemptsLast30Days   *float64 `json:"attemptsLast30Days"`
}

// PuzzlePayloadOK 成功体。
type PuzzlePayloadOK struct {
	OK             bool        `json:"ok"`
	SnapLabel      *string     `json:"snapLabel"`
	SnapInstantISO *string     `json:"snapInstantIso"`
	Rows           []PuzzleRow `json:"rows"`
}

type puzzleDayRow struct {
	statDate string
	rating   *int
	attempts *int
}

func ymdAddDays(ymd string, delta int) (string, error) {
	t, err := time.Parse("2006-01-02", ymd)
	if err != nil {
		return "", err
	}
	return t.UTC().AddDate(0, 0, delta).Format("2006-01-02"), nil
}

func ratingAtOrBefore(series []puzzleDayRow, ymd string) *int {
	var best *puzzleDayRow
	for i := range series {
		r := &series[i]
		if r.statDate > ymd || r.rating == nil {
			continue
		}
		if best == nil || r.statDate > best.statDate {
			best = r
		}
	}
	if best == nil {
		return nil
	}
	return best.rating
}

// puzzleRatingBaselineWithSparseFallback：日历锚点无行时，用 endDate 之前最早一日分（与 TS 端一致）。
func puzzleRatingBaselineWithSparseFallback(series []puzzleDayRow, endDate string, minusDays int) *int {
	anchor, err := ymdAddDays(endDate, -minusDays)
	if err != nil {
		return nil
	}
	if at := ratingAtOrBefore(series, anchor); at != nil {
		return at
	}
	var oldest *puzzleDayRow
	for i := range series {
		r := &series[i]
		if r.statDate >= endDate || r.rating == nil {
			continue
		}
		if oldest == nil || r.statDate < oldest.statDate {
			oldest = r
		}
	}
	if oldest == nil {
		return nil
	}
	return oldest.rating
}

func sumAttemptsInclusive(series []puzzleDayRow, startYmd, endYmd string) *float64 {
	if startYmd > endYmd {
		return nil
	}
	sum := 0
	hit := false
	for i := range series {
		r := &series[i]
		if r.statDate >= startYmd && r.statDate <= endYmd {
			hit = true
			if r.attempts != nil && *r.attempts >= 0 {
				sum += *r.attempts
			}
		}
	}
	if !hit {
		return nil
	}
	x := float64(sum)
	return &x
}

// BuildPuzzlePayload 从 MySQL 组装谜题榜（最新一日累计 + 近 7/30 日涨跌与做题量）。
func BuildPuzzlePayload(ctx context.Context, db *sql.DB) (*PuzzlePayloadOK, error) {
	snapRaw, _ := queryLatestSnapshot(ctx, db, TCpuzzle)
	var snapLabel *string
	var snapISO *string
	if t, ok := snapRaw.(time.Time); ok && !t.IsZero() {
		loc, err := time.LoadLocation("Asia/Singapore")
		if err != nil {
			loc = time.UTC
		}
		s := t.In(loc).Format("2006-01-02 15:04")
		snapLabel = &s
		iso := t.UTC().Format(time.RFC3339Nano)
		snapISO = &iso
	}

	prows, err := db.QueryContext(ctx,
		`SELECT id, chess_username, display_name, avatar_url FROM profiles ORDER BY chess_username ASC`)
	if err != nil {
		return nil, fmt.Errorf("profiles: %w", err)
	}
	type prof struct {
		id, user string
		disp, av sql.NullString
	}
	var profiles []prof
	for prows.Next() {
		var id, user string
		var disp, av sql.NullString
		if err := prows.Scan(&id, &user, &disp, &av); err != nil {
			prows.Close()
			return nil, err
		}
		profiles = append(profiles, prof{id, user, disp, av})
	}
	prows.Close()
	if err := prows.Err(); err != nil {
		return nil, err
	}

	latest, err := db.QueryContext(ctx,
		`SELECT d.profile_id, x.mx AS end_stat_date,
       COALESCE(d.rating_day_end, d.rating_day_start) AS rating_day_end,
       d.cum_attempts, d.cum_passed, d.cum_total_seconds
FROM daily_puzzle_stats d
INNER JOIN (
  SELECT profile_id, MAX(stat_date) AS mx
  FROM daily_puzzle_stats
  GROUP BY profile_id
) x ON d.profile_id = x.profile_id AND d.stat_date = x.mx`)
	if err != nil {
		return nil, fmt.Errorf("puzzle latest: %w", err)
	}
	defer latest.Close()

	type latestRec struct {
		endDate            string
		rating             sql.NullInt64
		attempts, passed   sql.NullInt64
		totalSec           sql.NullInt64
	}
	by := map[string]latestRec{}
	for latest.Next() {
		var pid string
		var endD sql.NullString
		var rating, att, passed, ts sql.NullInt64
		if err := latest.Scan(&pid, &endD, &rating, &att, &passed, &ts); err != nil {
			return nil, err
		}
		ed := ""
		if endD.Valid {
			ed = strings.TrimSpace(endD.String)
			if len(ed) >= 10 {
				ed = ed[:10]
			}
		}
		by[pid] = latestRec{endDate: ed, rating: rating, attempts: att, passed: passed, totalSec: ts}
	}
	if err := latest.Err(); err != nil {
		return nil, err
	}

	seriesBy := map[string][]puzzleDayRow{}
	hist, err := db.QueryContext(ctx,
		`SELECT d.profile_id, d.stat_date,
       COALESCE(d.rating_day_end, d.rating_day_start) AS rating_day_end,
       d.attempts
       FROM daily_puzzle_stats d
       INNER JOIN (
         SELECT profile_id, MAX(stat_date) AS mx
         FROM daily_puzzle_stats
         GROUP BY profile_id
       ) x ON d.profile_id = x.profile_id
          AND d.stat_date >= DATE_SUB(x.mx, INTERVAL 400 DAY)
       ORDER BY d.profile_id, d.stat_date ASC`)
	if err != nil {
		return nil, fmt.Errorf("puzzle hist: %w", err)
	}
	for hist.Next() {
		var pid string
		var sd sql.NullString
		var rating, att sql.NullInt64
		if err := hist.Scan(&pid, &sd, &rating, &att); err != nil {
			hist.Close()
			return nil, err
		}
		s := ""
		if sd.Valid {
			s = strings.TrimSpace(sd.String)
			if len(s) >= 10 {
				s = s[:10]
			}
		}
		if s == "" {
			continue
		}
		var rPtr, aPtr *int
		if rating.Valid {
			v := int(rating.Int64)
			rPtr = &v
		}
		if att.Valid {
			v := int(att.Int64)
			aPtr = &v
		}
		seriesBy[pid] = append(seriesBy[pid], puzzleDayRow{statDate: s, rating: rPtr, attempts: aPtr})
	}
	hist.Close()
	if err := hist.Err(); err != nil {
		return nil, err
	}

	for pid, ser := range seriesBy {
		var maxD string
		for _, row := range ser {
			if row.statDate > maxD {
				maxD = row.statDate
			}
		}
		if maxD == "" {
			continue
		}
		if r, ok := by[pid]; ok {
			if r.endDate == "" {
				r.endDate = maxD
				by[pid] = r
			}
		} else {
			by[pid] = latestRec{endDate: maxD}
		}
	}

	rows := make([]PuzzleRow, 0, len(profiles))
	for _, p := range profiles {
		pid := normProfileID(p.id)
		m, ok := by[pid]
		var pr PuzzleRow
		pr.ProfileID = pid
		pr.ChessUsername = p.user
		pr.DisplayName = nullStr(p.disp)
		pr.AvatarURL = nullStr(p.av)

		if !ok {
			rows = append(rows, pr)
			continue
		}

		if m.rating.Valid {
			x := float64(m.rating.Int64)
			pr.Rating = &x
		}
		var attN *float64
		if m.attempts.Valid && m.attempts.Int64 >= 0 {
			x := float64(m.attempts.Int64)
			attN = &x
			pr.Attempts = &x
		}
		if attN != nil && *attN > 0 && m.passed.Valid {
			pct := (float64(m.passed.Int64) / *attN) * 100
			if isFinite(pct) {
				pr.PassRatePct = &pct
			}
		}
		if attN != nil && *attN > 0 && m.totalSec.Valid {
			avg := float64(m.totalSec.Int64) / *attN
			if isFinite(avg) {
				avg = math.Round(avg*1000) / 1000
				pr.AvgSecondsPerAttempt = &avg
			}
		}

		ser := seriesBy[pid]
		endDate := m.endDate
		if endDate != "" && m.rating.Valid {
			rEnd := int(m.rating.Int64)
			r7 := puzzleRatingBaselineWithSparseFallback(ser, endDate, 7)
			r30 := puzzleRatingBaselineWithSparseFallback(ser, endDate, 30)
			if r7 != nil {
				d := float64(rEnd - *r7)
				if isFinite(d) {
					pr.RatingDelta7 = &d
				}
			}
			if r30 != nil {
				d := float64(rEnd - *r30)
				if isFinite(d) {
					pr.RatingDelta30 = &d
				}
			}
			start7, err1 := ymdAddDays(endDate, -6)
			start30, err2 := ymdAddDays(endDate, -29)
			if err1 == nil && err2 == nil {
				if s := sumAttemptsInclusive(ser, start7, endDate); s != nil {
					pr.AttemptsLast7Days = s
				}
				if s := sumAttemptsInclusive(ser, start30, endDate); s != nil {
					pr.AttemptsLast30Days = s
				}
			}
		}

		rows = append(rows, pr)
	}

	sort.Slice(rows, func(i, j int) bool {
		return rows[i].ChessUsername < rows[j].ChessUsername
	})

	return &PuzzlePayloadOK{
		OK:             true,
		SnapLabel:      snapLabel,
		SnapInstantISO: snapISO,
		Rows:           rows,
	}, nil
}

// PuzzlePayloadJSON 序列化。
func PuzzlePayloadJSON(p *PuzzlePayloadOK) ([]byte, error) {
	return json.Marshal(p)
}
