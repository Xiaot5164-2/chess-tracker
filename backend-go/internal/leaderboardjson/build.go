package leaderboardjson

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// TimeControl 与 Next.js 一致。
type TimeControl string

const (
	TCrapid  TimeControl = "rapid"
	TCblitz  TimeControl = "blitz"
	TCbullet TimeControl = "bullet"
	TCpuzzle TimeControl = "puzzle"
)

type tcMeta struct {
	label, scoreColumn string
	viewName            string
	ratingCol, recCol   string
}

func meta(tc TimeControl) tcMeta {
	switch tc {
	case TCblitz:
		return tcMeta{"Blitz", "分数", "v_leaderboard_blitz", "blitz_rating", "blitz_recorded_at"}
	case TCbullet:
		return tcMeta{"Bullet", "分数", "v_leaderboard_bullet", "bullet_rating", "bullet_recorded_at"}
	case TCpuzzle:
		return tcMeta{"谜题当前分", "谜题当前分", "v_leaderboard_puzzle", "puzzle_rating", "puzzle_recorded_at"}
	default:
		return tcMeta{"Rapid", "分数", "v_leaderboard_rapid", "rapid_rating", "rapid_recorded_at"}
	}
}

// Row 与前端 LeaderboardRowModel 对齐（JSON 字段名 camelCase）。
type Row struct {
	ProfileID           string   `json:"profile_id"`
	ChessUsername       string   `json:"chess_username"`
	DisplayName         *string  `json:"display_name"`
	AvatarURL           *string  `json:"avatar_url"`
	Rating              *float64 `json:"rating"`
	PeriodDelta         *float64 `json:"periodDelta"`
	TotalGames          *float64 `json:"totalGames"`
	RatePct             *float64 `json:"ratePct"`
	AvgOpponentRating       *float64 `json:"avgOpponentRating"`
	AvgHalfMoves            *float64 `json:"avgHalfMoves"`
	AvgSecondsPerOwnMove    *float64 `json:"avgSecondsPerOwnMove"`
	EstimatedTotalOwnSeconds *float64 `json:"estimatedTotalOwnSeconds"`
}

// PayloadOK 与 Next getLeaderboardPayload 成功体一致。
type PayloadOK struct {
	OK                  bool         `json:"ok"`
	TimeControl         string       `json:"timeControl"`
	PeriodDays          int          `json:"periodDays"`
	TcLabel             string       `json:"tcLabel"`
	ScoreColumnLabel    string       `json:"scoreColumnLabel"`
	ShowGamePeriodCols  bool         `json:"showGamePeriodCols"`
	SnapLabel           *string      `json:"snapLabel"`
	SnapInstantISO      *string      `json:"snapInstantIso"`
	Rows                []Row        `json:"rows"`
}

// ParseTimeControl 解析查询参数。
func ParseTimeControl(s string) TimeControl {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "blitz":
		return TCblitz
	case "bullet":
		return TCbullet
	case "puzzle":
		return TCpuzzle
	default:
		return TCrapid
	}
}

// ParsePeriodDays 解析 period 查询参数。
func ParsePeriodDays(s string) int {
	switch strings.TrimSpace(s) {
	case "30":
		return 30
	case "90":
		return 90
	default:
		return 7
	}
}

func normProfileID(b any) string {
	switch v := b.(type) {
	case []byte:
		return string(v)
	case string:
		return v
	default:
		return fmt.Sprint(v)
	}
}

func nullStr(ns sql.NullString) *string {
	if !ns.Valid {
		return nil
	}
	return &ns.String
}

func f64p(n sql.NullFloat64) *float64 {
	if !n.Valid || !isFinite(n.Float64) {
		return nil
	}
	x := n.Float64
	return &x
}

func f64FromInt(n sql.NullInt64) *float64 {
	if !n.Valid {
		return nil
	}
	x := float64(n.Int64)
	return &x
}

// Build 从 MySQL 组装与 Next.js getLeaderboardPayload 等价的 JSON 可序列化结构。
func Build(ctx context.Context, db *sql.DB, periodDays int, tc TimeControl) (*PayloadOK, error) {
	m := meta(tc)
	// profiles
	prows, err := db.QueryContext(ctx,
		`SELECT id, chess_username, display_name, avatar_url FROM profiles ORDER BY chess_username ASC`)
	if err != nil {
		return nil, fmt.Errorf("profiles: %w", err)
	}
	type prof struct {
		id, user string
		disp     sql.NullString
		av       sql.NullString
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

	lbMap := map[string]struct {
		rating *float64
		rec    *string
	}{}

	viewSQL := fmt.Sprintf(
		`SELECT profile_id, %s AS r, %s AS rec FROM %s`,
		m.ratingCol, m.recCol, m.viewName,
	)
	vrows, err := db.QueryContext(ctx, viewSQL)
	if viewErr := err; viewErr == nil {
		defer vrows.Close()
		for vrows.Next() {
			var pid string
			var r sql.NullInt64
			var rec sql.NullString
			if err := vrows.Scan(&pid, &r, &rec); err != nil {
				return nil, err
			}
			var rf *float64
			if r.Valid {
				x := float64(r.Int64)
				rf = &x
			}
			var rs *string
			if rec.Valid {
				rs = &rec.String
			}
			lbMap[pid] = struct {
				rating *float64
				rec    *string
			}{rf, rs}
		}
		if err := vrows.Err(); err != nil {
			return nil, err
		}
	} else {
		// fallback: latest from daily_* tables（与 TS queryLatestRatingsByProfile 一致）
		var q string
		var args []any
		if tc == TCpuzzle {
			q = `SELECT profile_id, rating_day_end AS rating, stat_date AS recorded_at FROM daily_puzzle_stats ORDER BY stat_date DESC`
		} else {
			tcGame := gameClass(tc)
			q = `SELECT profile_id, rating AS rating, stat_date AS recorded_at FROM daily_game_stats WHERE time_class = ? ORDER BY stat_date DESC`
			args = append(args, tcGame)
		}
		srows, err2 := db.QueryContext(ctx, q, args...)
		if err2 != nil {
			return nil, fmt.Errorf("leaderboard view+fallback: %w / %w", viewErr, err2)
		}
		defer srows.Close()
		seen := map[string]bool{}
		for srows.Next() {
			var pid string
			var rating sql.NullInt64
			var rec sql.NullString
			if err := srows.Scan(&pid, &rating, &rec); err != nil {
				return nil, err
			}
			if seen[pid] {
				continue
			}
			seen[pid] = true
			var rf *float64
			if rating.Valid {
				x := float64(rating.Int64)
				rf = &x
			}
			var rs *string
			if rec.Valid {
				s := rec.String
				rs = &s
			}
			lbMap[pid] = struct {
				rating *float64
				rec    *string
			}{rf, rs}
		}
		if err := srows.Err(); err != nil {
			return nil, err
		}
	}

	type listRow struct {
		profileID, user string
		disp, av        *string
		rating          *float64
		rec             *string
	}
	var list []listRow
	for _, p := range profiles {
		v := lbMap[p.id]
		list = append(list, listRow{
			profileID: p.id,
			user:      p.user,
			disp:      nullStr(p.disp),
			av:        nullStr(p.av),
			rating:    v.rating,
			rec:       v.rec,
		})
	}

	lookbackDays := periodDays + 30
	if lookbackDays < 100 {
		lookbackDays = 100
	}
	rangeStart := time.Now().UTC()
	rangeStart = time.Date(rangeStart.Year(), rangeStart.Month(), rangeStart.Day(), 0, 0, 0, 0, time.UTC)
	rangeStart = rangeStart.AddDate(0, 0, -lookbackDays)
	rangeStartStr := rangeStart.Format(time.RFC3339Nano)

	snapRaw, _ := queryLatestSnapshot(ctx, db, tc)

	seriesRows, err := querySeriesSince(ctx, db, tc, rangeStartStr)
	if err != nil {
		seriesRows = nil
	}
	periodStart := UtcPeriodStartDate(periodDays)

	gameAgg, err := queryDailyAgg(ctx, db, tc, periodStart)
	if err != nil {
		gameAgg = nil
	}
	dashRows, err := queryDashMetrics(ctx, db, tc, periodStart)
	if err != nil {
		dashRows = nil
	}

	seriesBy := map[string][]DayPoint{}
	for _, sr := range seriesRows {
		pid := normProfileID(sr.profileID)
		if pid == "" {
			continue
		}
		if !isFinite(sr.rating) {
			continue
		}
		seriesBy[pid] = append(seriesBy[pid], DayPoint{
			D: chartKeyFromRecordedAt(sr.recordedAt),
			R: sr.rating,
		})
	}

	var snapInstant *time.Time
	if snapRaw != nil {
		if t, ok := snapRaw.(time.Time); ok && !t.IsZero() {
			snapInstant = &t
		} else {
			s := strings.TrimSpace(toStr(snapRaw))
			if len(s) <= 10 {
				t, err := time.Parse("2006-01-02", s[:10])
				if err == nil {
					t = time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
					snapInstant = &t
				}
			} else {
				t, err := time.Parse(time.RFC3339, s)
				if err == nil {
					snapInstant = &t
				}
			}
		}
	}
	var snapLabel *string
	var snapISO *string
	if snapInstant != nil {
		loc, err := time.LoadLocation("Asia/Singapore")
		if err != nil {
			loc = time.UTC
		}
		s := snapInstant.In(loc).Format("2006-01-02 15:04")
		snapLabel = &s
		iso := snapInstant.UTC().Format(time.RFC3339Nano)
		snapISO = &iso
	}

	outRows := make([]Row, 0, len(list))
	for _, row := range list {
		full := seriesBy[row.profileID]
		var periodDelta *float64
		if len(full) > 0 {
			periodDelta = RapidDeltaOverDays(full, periodDays)
		}
		var agg *aggRec
		if gameAgg != nil {
			agg = gameAgg[row.profileID]
		}
		var ratePct *float64
		if agg != nil && agg.totalGames > 0 {
			ratePct = chessScoreRatePercent(float64(agg.wins), float64(agg.draws), float64(agg.totalGames))
		}
		var totalG *float64
		if agg != nil && agg.totalGames > 0 {
			x := float64(agg.totalGames)
			totalG = &x
		}
		var dash *dashRec
		if dashRows != nil {
			dash = dashRows[row.profileID]
		}
		av := dashAvg(dash, 1)
		as := dashAvg(dash, 2)
		var est *float64
		if totalG != nil && av != nil && as != nil && *totalG > 0 && isFinite(*av) && isFinite(*as) {
			x := *totalG * *av * *as
			if isFinite(x) {
				est = &x
			}
		}
		outRows = append(outRows, Row{
			ProfileID:              row.profileID,
			ChessUsername:          row.user,
			DisplayName:            row.disp,
			AvatarURL:              row.av,
			Rating:                 row.rating,
			PeriodDelta:            periodDelta,
			TotalGames:             totalG,
			RatePct:                ratePct,
			AvgOpponentRating:      dashAvg(dash, 0),
			AvgHalfMoves:           av,
			AvgSecondsPerOwnMove:   as,
			EstimatedTotalOwnSeconds: est,
		})
	}

	return &PayloadOK{
		OK:                 true,
		TimeControl:        string(tc),
		PeriodDays:         periodDays,
		TcLabel:            m.label,
		ScoreColumnLabel:   m.scoreColumn,
		ShowGamePeriodCols: tc != TCpuzzle,
		SnapLabel:          snapLabel,
		SnapInstantISO:     snapISO,
		Rows:               outRows,
	}, nil
}

func dashAvg(d *dashRec, i int) *float64 {
	if d == nil {
		return nil
	}
	switch i {
	case 0:
		return d.opp
	case 1:
		return d.half
	default:
		return d.timeU
	}
}

type seriesRow struct {
	profileID  any
	recordedAt any
	rating     float64
}

func querySeriesSince(ctx context.Context, db *sql.DB, tc TimeControl, rangeStartISO string) ([]seriesRow, error) {
	d0 := rangeStartISO
	if len(d0) >= 10 {
		d0 = d0[:10]
	}
	if tc == TCpuzzle {
		r, err := db.QueryContext(ctx,
			`SELECT profile_id, stat_date AS recorded_at, rating_day_end AS rating FROM daily_puzzle_stats
       WHERE stat_date >= ? AND rating_day_end IS NOT NULL ORDER BY stat_date ASC`, d0)
		if err != nil {
			return nil, err
		}
		defer r.Close()
		return scanSeries(r)
	}
	gc := gameClass(tc)
	r, err := db.QueryContext(ctx,
		`SELECT profile_id, stat_date AS recorded_at, rating AS rating FROM daily_game_stats
     WHERE time_class = ? AND stat_date >= ? AND rating IS NOT NULL ORDER BY stat_date ASC`, gc, d0)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	return scanSeries(r)
}

func scanSeries(r *sql.Rows) ([]seriesRow, error) {
	var out []seriesRow
	for r.Next() {
		var pid any
		var rec any
		var rating sql.NullInt64
		if err := r.Scan(&pid, &rec, &rating); err != nil {
			return nil, err
		}
		if !rating.Valid {
			continue
		}
		out = append(out, seriesRow{pid, rec, float64(rating.Int64)})
	}
	return out, r.Err()
}

func gameClass(tc TimeControl) string {
	switch tc {
	case TCblitz:
		return "blitz"
	case TCbullet:
		return "bullet"
	default:
		return "rapid"
	}
}

type aggRec struct {
	totalGames int
	wins       int
	draws      int
}

func queryDailyAgg(ctx context.Context, db *sql.DB, tc TimeControl, statDateGte string) (map[string]*aggRec, error) {
	if tc == TCpuzzle {
		return map[string]*aggRec{}, nil
	}
	gc := gameClass(tc)
	r, err := db.QueryContext(ctx,
		`SELECT profile_id,
            COALESCE(SUM(games), 0) AS total_games,
            COALESCE(SUM(wins), 0) AS wins,
            COALESCE(SUM(losses), 0) AS losses,
            COALESCE(SUM(draws), 0) AS draws
     FROM daily_game_stats
     WHERE time_class = ? AND stat_date >= ?
     GROUP BY profile_id`, gc, statDateGte)
	if err != nil {
		return nil, err
	}
	defer r.Close()
	out := map[string]*aggRec{}
	for r.Next() {
		var pid string
		var tg, w, l, d sql.NullInt64
		if err := r.Scan(&pid, &tg, &w, &l, &d); err != nil {
			return nil, err
		}
		out[pid] = &aggRec{
			totalGames: int(nullInt(tg)),
			wins:       int(nullInt(w)),
			draws:      int(nullInt(d)),
		}
	}
	return out, r.Err()
}

func nullInt(n sql.NullInt64) int64 {
	if !n.Valid {
		return 0
	}
	return n.Int64
}

type dashRec struct {
	opp, half, timeU *float64
}

func queryDashMetrics(ctx context.Context, db *sql.DB, tc TimeControl, periodStartUtcDay string) (map[string]*dashRec, error) {
	if tc == TCpuzzle {
		return map[string]*dashRec{}, nil
	}
	gc := gameClass(tc)
	startIso := periodStartUtcDay + "T00:00:00.000Z"
	full := `SELECT profile_id,
              AVG(CASE WHEN player_color = 'white' THEN black_rating ELSE white_rating END) AS avg_opp_rating,
              AVG(half_moves) / 2 AS avg_half_moves,
              AVG(avg_seconds_per_own_move) AS avg_seconds_per_own_move
       FROM games
       WHERE time_class = ?
         AND end_time >= ?
         AND end_time IS NOT NULL
       GROUP BY profile_id`
	r, err := db.QueryContext(ctx, full, gc, startIso)
	if err != nil {
		fallback := `SELECT profile_id,
                AVG(CASE WHEN player_color = 'white' THEN black_rating ELSE white_rating END) AS avg_opp_rating,
                NULL AS avg_half_moves,
                NULL AS avg_seconds_per_own_move
         FROM games
         WHERE time_class = ?
           AND end_time >= ?
           AND end_time IS NOT NULL
         GROUP BY profile_id`
		r2, err2 := db.QueryContext(ctx, fallback, gc, startIso)
		if err2 != nil {
			return map[string]*dashRec{}, nil
		}
		defer r2.Close()
		return scanDash(r2)
	}
	defer r.Close()
	return scanDash(r)
}

func scanDash(r *sql.Rows) (map[string]*dashRec, error) {
	out := map[string]*dashRec{}
	for r.Next() {
		var pid string
		var a1, a2, a3 sql.NullFloat64
		if err := r.Scan(&pid, &a1, &a2, &a3); err != nil {
			return nil, err
		}
		out[pid] = &dashRec{
			opp:   f64p(a1),
			half:  f64p(a2),
			timeU: f64p(a3),
		}
	}
	return out, r.Err()
}

func queryLatestSnapshot(ctx context.Context, db *sql.DB, tc TimeControl) (any, error) {
	if tc == TCpuzzle {
		var t sql.NullTime
		err := db.QueryRowContext(ctx,
			`SELECT MIN(p.computed_at) AS snap_at
       FROM daily_puzzle_stats p
       WHERE p.stat_date = (SELECT MAX(stat_date) FROM daily_puzzle_stats)`).Scan(&t)
		if err != nil {
			return nil, err
		}
		if !t.Valid {
			return nil, nil
		}
		return t.Time, nil
	}
	gc := gameClass(tc)
	var t sql.NullTime
	err := db.QueryRowContext(ctx,
		`SELECT MIN(s.computed_at) AS snap_at
     FROM daily_game_stats s
     WHERE s.time_class = ?
       AND s.stat_date = (
         SELECT MAX(stat_date) FROM daily_game_stats WHERE time_class = ?
       )`, gc, gc).Scan(&t)
	if err != nil {
		return nil, err
	}
	if !t.Valid {
		return nil, nil
	}
	return t.Time, nil
}

// PayloadJSON 序列化 PayloadOK（用于 HTTP 响应）。
func PayloadJSON(p *PayloadOK) ([]byte, error) {
	return json.Marshal(p)
}

// ParsePayloadRequest 从查询字符串解析 period 与棋钟。
func ParsePayloadRequest(periodStr, tcStr string) (int, TimeControl) {
	return ParsePeriodDays(periodStr), ParseTimeControl(tcStr)
}
