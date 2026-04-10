package store

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ChesscomGame is one row aligned with Chess.com monthly games JSON + tracked student.
type ChesscomGame struct {
	ChesscomUUID  string
	GameURL       string
	PGN           string
	TimeControl   sql.NullString
	EndTime       sql.NullTime
	Rated         *bool // NULL when nil (MySQL TINYINT)
	TimeClass     sql.NullString
	Rules         sql.NullString
	WhiteUsername string
	BlackUsername string
	WhiteRating   sql.NullInt32
	BlackRating   sql.NullInt32
	WhiteResult   sql.NullString
	BlackResult   sql.NullString
	PlayerColor   string // white | black
	PlayerRating  sql.NullInt32
	PlayerResult  sql.NullString
	AccuracyWhite sql.NullFloat64
	AccuracyBlack sql.NullFloat64
	TCN           sql.NullString
	FEN           sql.NullString
	InitialSetup  sql.NullString
	EcoURL        sql.NullString
	HalfMoves             sql.NullInt32
	TimeBudgetSec         sql.NullInt32
	AvgSecondsPerOwnMove  sql.NullFloat64
}

// UpsertChesscomGame inserts or updates one game (PK profile_id + chesscom_uuid).
func (s *Store) UpsertChesscomGame(ctx context.Context, profileID uuid.UUID, g ChesscomGame) error {
	g.ChesscomUUID = strings.TrimSpace(g.ChesscomUUID)
	if g.ChesscomUUID == "" {
		return nil
	}
	g.GameURL = strings.TrimSpace(g.GameURL)
	if g.GameURL == "" {
		return nil
	}
	const q = `
INSERT INTO games (
  profile_id, chesscom_uuid, game_url, pgn, time_control, end_time, rated,
  time_class, rules, white_username, black_username,
  white_rating, black_rating, white_result, black_result,
  player_color, player_rating, player_result,
  accuracy_white, accuracy_black, tcn, fen, initial_setup, eco_url,
  half_moves, time_budget_sec, avg_seconds_per_own_move, fetched_at
) VALUES (
  ?, ?, ?, ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?, ?, ?, ?,
  ?, ?, ?, UTC_TIMESTAMP(6)
)
ON DUPLICATE KEY UPDATE
  game_url = VALUES(game_url),
  pgn = VALUES(pgn),
  time_control = VALUES(time_control),
  end_time = VALUES(end_time),
  rated = VALUES(rated),
  time_class = VALUES(time_class),
  rules = VALUES(rules),
  white_username = VALUES(white_username),
  black_username = VALUES(black_username),
  white_rating = VALUES(white_rating),
  black_rating = VALUES(black_rating),
  white_result = VALUES(white_result),
  black_result = VALUES(black_result),
  player_color = VALUES(player_color),
  player_rating = VALUES(player_rating),
  player_result = VALUES(player_result),
  accuracy_white = VALUES(accuracy_white),
  accuracy_black = VALUES(accuracy_black),
  tcn = VALUES(tcn),
  fen = VALUES(fen),
  initial_setup = VALUES(initial_setup),
  eco_url = VALUES(eco_url),
  half_moves = VALUES(half_moves),
  time_budget_sec = VALUES(time_budget_sec),
  avg_seconds_per_own_move = VALUES(avg_seconds_per_own_move),
  fetched_at = UTC_TIMESTAMP(6)
`
	var rated any
	if g.Rated != nil {
		rated = *g.Rated
	}
	_, err := s.db.ExecContext(ctx, q,
		profileID.String(),
		g.ChesscomUUID,
		g.GameURL,
		g.PGN,
		g.TimeControl,
		g.EndTime,
		rated,
		g.TimeClass,
		g.Rules,
		g.WhiteUsername,
		g.BlackUsername,
		g.WhiteRating,
		g.BlackRating,
		g.WhiteResult,
		g.BlackResult,
		g.PlayerColor,
		g.PlayerRating,
		g.PlayerResult,
		g.AccuracyWhite,
		g.AccuracyBlack,
		g.TCN,
		g.FEN,
		g.InitialSetup,
		g.EcoURL,
		g.HalfMoves,
		g.TimeBudgetSec,
		g.AvgSecondsPerOwnMove,
	)
	return err
}

// NullString is a small helper for optional strings.
func NullString(s string) sql.NullString {
	s = strings.TrimSpace(s)
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

// NullInt32FromPtr maps an optional rating pointer to sql.NullInt32.
func NullInt32FromPtr(p *int) sql.NullInt32 {
	if p == nil {
		return sql.NullInt32{}
	}
	return sql.NullInt32{Int32: int32(*p), Valid: true}
}

// NullFloat64FromPtr maps optional accuracy.
func NullFloat64FromPtr(p *float64) sql.NullFloat64 {
	if p == nil {
		return sql.NullFloat64{}
	}
	return sql.NullFloat64{Float64: *p, Valid: true}
}

// EndTimeNull converts unix seconds to NullTime in UTC.
func EndTimeNull(sec int64) sql.NullTime {
	if sec <= 0 {
		return sql.NullTime{}
	}
	t := time.Unix(sec, 0).UTC()
	return sql.NullTime{Time: t, Valid: true}
}
