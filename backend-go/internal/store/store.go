package store

import (
	"context"
	"database/sql"

	"github.com/google/uuid"
)

type Profile struct {
	ID            uuid.UUID
	ChessUsername string
}

type Store struct {
	db *sql.DB
}

// DB 暴露底层连接，供 HTTP API 等只读查询使用。
func (s *Store) DB() *sql.DB {
	return s.db
}

func (s *Store) ListProfiles(ctx context.Context) ([]Profile, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, chess_username FROM profiles ORDER BY chess_username`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []Profile
	for rows.Next() {
		var idStr string
		var p Profile
		if err := rows.Scan(&idStr, &p.ChessUsername); err != nil {
			return nil, err
		}
		id, err := uuid.Parse(idStr)
		if err != nil {
			return nil, err
		}
		p.ID = id
		list = append(list, p)
	}
	return list, rows.Err()
}

