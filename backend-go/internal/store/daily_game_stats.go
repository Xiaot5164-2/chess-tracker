package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"chess-tracker/backend-go/internal/chesscom"
)

type dayAggKey struct {
	profileID string
	tc        string
	statDate  string // YYYY-MM-DD UTC
}

// RefreshDailyGameStatsFromGames 从 games 全量重建 daily_game_stats：
// 自每位棋手、每种棋钟（rapid/blitz/bullet）的最早对局日起至 UTC 当日，每个日历日一行；
// 有对局：盘数与胜负和来自当日对局，rating 为当日最后一盘 player_rating；
// 无对局：盘数与胜负相关为 0，rating 沿用上一日（与「当日结束时」一致）。
func (s *Store) RefreshDailyGameStatsFromGames(ctx context.Context, _ int) error {
	todayUTC := time.Now().UTC()
	endDate := time.Date(todayUTC.Year(), todayUTC.Month(), todayUTC.Day(), 0, 0, 0, 0, time.UTC)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("refresh daily_game_stats: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	if _, err := tx.ExecContext(ctx, `DELETE FROM daily_game_stats`); err != nil {
		return fmt.Errorf("refresh daily_game_stats delete: %w", err)
	}

	aggRows, err := tx.QueryContext(ctx, `
SELECT
  g.profile_id,
  LOWER(TRIM(g.time_class)) AS tc,
  DATE(g.end_time) AS stat_date,
  COUNT(*) AS n,
  SUM(CASE WHEN LOWER(TRIM(COALESCE(g.player_result, ''))) = 'win' THEN 1 ELSE 0 END) AS wins,
  SUM(
    CASE
      WHEN g.player_result IS NULL OR TRIM(g.player_result) = '' THEN 0
      WHEN LOWER(TRIM(g.player_result)) = 'win' THEN 0
      WHEN LOWER(TRIM(g.player_result)) IN (
        'agreed', 'repetition', 'stalemate', 'insufficient', '50move',
        'timevsinsufficient', 'insufficientmaterial', 'draw', 'bughousepartnerlose'
      ) THEN 0
      ELSE 1
    END
  ) AS losses,
  SUM(
    CASE WHEN LOWER(TRIM(g.player_result)) IN (
      'agreed', 'repetition', 'stalemate', 'insufficient', '50move',
      'timevsinsufficient', 'insufficientmaterial', 'draw', 'bughousepartnerlose'
    ) THEN 1 ELSE 0 END
  ) AS draws,
  SUM(CASE WHEN g.player_result IS NULL OR TRIM(g.player_result) = '' THEN 1 ELSE 0 END) AS outcome_unknown,
  AVG(CASE WHEN LOWER(TRIM(g.player_color)) = 'white' THEN g.black_rating ELSE g.white_rating END) AS avg_opp_rating,
  AVG(g.half_moves) / 2 AS avg_half_moves,
  AVG(g.avg_seconds_per_own_move) AS avg_seconds_per_own_move
FROM games g
WHERE g.end_time IS NOT NULL
  AND LOWER(TRIM(g.time_class)) IN ('rapid', 'blitz', 'bullet')
GROUP BY g.profile_id, LOWER(TRIM(g.time_class)), DATE(g.end_time)
`)
	if err != nil {
		return fmt.Errorf("refresh daily_game_stats aggregates: %w", err)
	}
	defer aggRows.Close()

	agg := make(map[dayAggKey]struct {
		n, wins, losses, draws, ou int
		avgOpp, avgHm, avgTur        sql.NullFloat64
	})
	for aggRows.Next() {
		var pid, tc string
		var statDate time.Time
		var n, wins, losses, draws, ou int64
		var avgOpp, avgHm, avgTur sql.NullFloat64
		if err := aggRows.Scan(&pid, &tc, &statDate, &n, &wins, &losses, &draws, &ou, &avgOpp, &avgHm, &avgTur); err != nil {
			return fmt.Errorf("refresh daily_game_stats scan agg: %w", err)
		}
		k := dayAggKey{profileID: pid, tc: tc, statDate: statDate.Format("2006-01-02")}
		agg[k] = struct {
			n, wins, losses, draws, ou int
			avgOpp, avgHm, avgTur        sql.NullFloat64
		}{int(n), int(wins), int(losses), int(draws), int(ou), avgOpp, avgHm, avgTur}
	}
	if err := aggRows.Err(); err != nil {
		return err
	}

	lastRows, err := tx.QueryContext(ctx, `
SELECT profile_id, tc, stat_date, player_rating FROM (
  SELECT
    g.profile_id,
    LOWER(TRIM(g.time_class)) AS tc,
    DATE(g.end_time) AS stat_date,
    g.player_rating AS player_rating,
    ROW_NUMBER() OVER (
      PARTITION BY g.profile_id, LOWER(TRIM(g.time_class)), DATE(g.end_time)
      ORDER BY g.end_time DESC, g.chesscom_uuid DESC
    ) AS rn
  FROM games g
  WHERE g.end_time IS NOT NULL
    AND LOWER(TRIM(g.time_class)) IN ('rapid', 'blitz', 'bullet')
) x
WHERE rn = 1
`)
	if err != nil {
		return fmt.Errorf("refresh daily_game_stats last rating: %w", err)
	}
	defer lastRows.Close()

	lastRating := make(map[dayAggKey]int)
	for lastRows.Next() {
		var pid, tc string
		var statDate time.Time
		var pr sql.NullInt64
		if err := lastRows.Scan(&pid, &tc, &statDate, &pr); err != nil {
			return fmt.Errorf("refresh daily_game_stats scan last: %w", err)
		}
		if !pr.Valid {
			continue
		}
		k := dayAggKey{profileID: pid, tc: tc, statDate: statDate.Format("2006-01-02")}
		lastRating[k] = int(pr.Int64)
	}
	if err := lastRows.Err(); err != nil {
		return err
	}

	boundRows, err := tx.QueryContext(ctx, `
SELECT profile_id, LOWER(TRIM(time_class)) AS tc, MIN(DATE(end_time)) AS d0
FROM games
WHERE end_time IS NOT NULL
  AND LOWER(TRIM(time_class)) IN ('rapid', 'blitz', 'bullet')
GROUP BY profile_id, LOWER(TRIM(time_class))
`)
	if err != nil {
		return fmt.Errorf("refresh daily_game_stats bounds: %w", err)
	}
	defer boundRows.Close()

	type bound struct {
		pid string
		tc  string
		d0  time.Time
	}
	var bounds []bound
	for boundRows.Next() {
		var b bound
		if err := boundRows.Scan(&b.pid, &b.tc, &b.d0); err != nil {
			return fmt.Errorf("refresh daily_game_stats scan bound: %w", err)
		}
		bounds = append(bounds, b)
	}
	if err := boundRows.Err(); err != nil {
		return err
	}

	type insRow struct {
		pid                              string
		statDate                         time.Time
		tc                               string
		games, wins, losses, draws, ou   int
		rating                           sql.NullInt64
		avgOpp, avgHalfMoves, avgTimeUse sql.NullFloat64
	}

	var out []insRow
	for _, b := range bounds {
		var carry sql.NullInt64
		for d := b.d0; !d.After(endDate); d = d.AddDate(0, 0, 1) {
			ds := d.Format("2006-01-02")
			k := dayAggKey{profileID: b.pid, tc: b.tc, statDate: ds}
			a, hasA := agg[k]
			lr, hasLR := lastRating[k]

			if hasA && a.n > 0 {
				var r sql.NullInt64
				switch {
				case hasLR:
					r = sql.NullInt64{Int64: int64(lr), Valid: true}
					carry = r
				case carry.Valid:
					r = carry
				}
				out = append(out, insRow{
					pid: b.pid, statDate: d, tc: b.tc,
					games: a.n, wins: a.wins, losses: a.losses, draws: a.draws, ou: a.ou,
					rating: r,
					avgOpp: a.avgOpp, avgHalfMoves: a.avgHm, avgTimeUse: a.avgTur,
				})
				continue
			}

			// 当日无对局：计数为 0，分数沿用上一日；仪表盘均值无对局则为 NULL
			out = append(out, insRow{
				pid: b.pid, statDate: d, tc: b.tc,
				games: 0, wins: 0, losses: 0, draws: 0, ou: 0,
				rating: carry,
			})
		}
	}

	const chunk = 400
	for i := 0; i < len(out); i += chunk {
		j := i + chunk
		if j > len(out) {
			j = len(out)
		}
		part := out[i:j]
		var sb strings.Builder
		sb.WriteString(`INSERT INTO daily_game_stats (
  profile_id, stat_date, time_class,
  games, wins, losses, draws, outcome_unknown,
  rating,
  avg_opponent_rating, avg_half_moves, avg_seconds_per_own_move,
  computed_at
) VALUES `)
		args := make([]any, 0, len(part)*12)
		for k, row := range part {
			if k > 0 {
				sb.WriteString(",")
			}
			sb.WriteString("(?,?,?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP(6))")
			args = append(args,
				row.pid, row.statDate, row.tc,
				row.games, row.wins, row.losses, row.draws, row.ou,
				row.rating,
				row.avgOpp, row.avgHalfMoves, row.avgTimeUse,
			)
		}
		if _, err := tx.ExecContext(ctx, sb.String(), args...); err != nil {
			return fmt.Errorf("refresh daily_game_stats insert: %w", err)
		}
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("refresh daily_game_stats commit: %w", err)
	}
	return nil
}

// SeedDailyGameStatsWhenNoGames 仅对「games 表中该棋钟无任何对局」的 profile×(rapid|blitz|bullet) 用 pub /stats 的 last.rating 写入 UTC 当日一行（games=0）。
// 已有对局推导的日统计不受影响（INSERT 新行或 ON DUPLICATE 且 games>0 时不改 rating）。
func (s *Store) SeedDailyGameStatsWhenNoGames(ctx context.Context, c *chesscom.Client) error {
	hasGames, err := s.profileTimeClassesWithGames(ctx)
	if err != nil {
		return err
	}
	profiles, err := s.ListProfiles(ctx)
	if err != nil {
		return err
	}
	if len(profiles) == 0 {
		return nil
	}
	today := time.Now().UTC()
	statDate := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC).Format("2006-01-02")

	const q = `
INSERT INTO daily_game_stats (
  profile_id, stat_date, time_class,
  games, wins, losses, draws, outcome_unknown,
  rating,
  avg_opponent_rating, avg_half_moves, avg_seconds_per_own_move,
  computed_at
) VALUES (?, ?, ?, 0, 0, 0, 0, 0, ?, NULL, NULL, NULL, UTC_TIMESTAMP(6))
ON DUPLICATE KEY UPDATE
  rating = IF(daily_game_stats.games = 0, VALUES(rating), daily_game_stats.rating),
  computed_at = IF(daily_game_stats.games = 0, UTC_TIMESTAMP(6), daily_game_stats.computed_at)
`

	for _, p := range profiles {
		ratings, err := c.FetchStats(ctx, p.ChessUsername)
		if err != nil {
			time.Sleep(400 * time.Millisecond)
			continue
		}
		for _, sl := range []struct {
			tc string
			r  *int
		}{
			{"rapid", ratings.Rapid},
			{"blitz", ratings.Blitz},
			{"bullet", ratings.Bullet},
		} {
			if sl.r == nil {
				continue
			}
			k := p.ID.String() + "|" + sl.tc
			if _, ok := hasGames[k]; ok {
				continue
			}
			if _, err := s.db.ExecContext(ctx, q, p.ID.String(), statDate, sl.tc, *sl.r); err != nil {
				return fmt.Errorf("seed daily_game_stats %s %s: %w", p.ChessUsername, sl.tc, err)
			}
		}
		time.Sleep(400 * time.Millisecond)
	}
	return nil
}

func (s *Store) profileTimeClassesWithGames(ctx context.Context) (map[string]struct{}, error) {
	rows, err := s.db.QueryContext(ctx, `
SELECT DISTINCT profile_id, LOWER(TRIM(time_class)) AS tc
FROM games
WHERE end_time IS NOT NULL
  AND LOWER(TRIM(time_class)) IN ('rapid', 'blitz', 'bullet')
`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]struct{})
	for rows.Next() {
		var pid, tc string
		if err := rows.Scan(&pid, &tc); err != nil {
			return nil, err
		}
		out[pid+"|"+tc] = struct{}{}
	}
	return out, rows.Err()
}
