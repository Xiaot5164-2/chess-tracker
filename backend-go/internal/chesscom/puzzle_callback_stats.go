package chesscom

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
)

// PuzzleCallbackStats 来自 …/puzzles/{username} JSON（statsInfo.stats + 顶层 rank/percentile）。
type PuzzleCallbackStats struct {
	Rating        int
	HighestRating *int
	AttemptCount  int
	PassedCount   int
	FailedCount   int
	TotalSeconds  int64
	LastDateRaw   *string
	PuzzleRank    *int64
	Percentile    *float64
}

type puzzleCallbackJSON struct {
	StatsInfo *struct {
		Stats *struct {
			Rating        *int    `json:"rating"`
			HighestRating *int    `json:"highest_rating"`
			AttemptCount  *int    `json:"attempt_count"`
			PassedCount   *int    `json:"passed_count"`
			FailedCount   *int    `json:"failed_count"`
			TotalSeconds  *int64  `json:"total_seconds"`
			LastDate      *string `json:"last_date"`
		} `json:"stats"`
	} `json:"statsInfo"`
	Rank       *int64   `json:"rank"`
	Percentile *float64 `json:"percentile"`
}

// FetchPuzzleCallbackStats 拉取并解析谜题 callback；无 rating 时返回 (nil, nil)。
func (c *PuzzleCallbackClient) FetchPuzzleCallbackStats(ctx context.Context, chessUsername string) (*PuzzleCallbackStats, error) {
	u := strings.TrimSpace(strings.ToLower(chessUsername))
	if u == "" {
		return nil, fmt.Errorf("empty username")
	}
	full := puzzleCurrentURL + url.PathEscape(u)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, full, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; chess-tracker-worker/1.0; +https://github.com/)")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("chess.com puzzle callback: status %d", resp.StatusCode)
	}

	var wrap puzzleCallbackJSON
	if err := json.Unmarshal(body, &wrap); err != nil {
		return nil, fmt.Errorf("puzzle callback json: %w", err)
	}
	if wrap.StatsInfo == nil || wrap.StatsInfo.Stats == nil || wrap.StatsInfo.Stats.Rating == nil {
		return nil, nil
	}
	st := wrap.StatsInfo.Stats
	out := &PuzzleCallbackStats{
		Rating:        *st.Rating,
		HighestRating: st.HighestRating,
		PuzzleRank:    wrap.Rank,
		Percentile:    wrap.Percentile,
		LastDateRaw:   st.LastDate,
	}
	if st.AttemptCount != nil {
		out.AttemptCount = *st.AttemptCount
	}
	if st.PassedCount != nil {
		out.PassedCount = *st.PassedCount
	}
	if st.FailedCount != nil {
		out.FailedCount = *st.FailedCount
	}
	if st.TotalSeconds != nil {
		out.TotalSeconds = *st.TotalSeconds
	}
	return out, nil
}

// FetchPuzzleCurrentRating 仅解析 rating；无数据时 (nil, nil)。
func (c *PuzzleCallbackClient) FetchPuzzleCurrentRating(ctx context.Context, chessUsername string) (*int, error) {
	s, err := c.FetchPuzzleCallbackStats(ctx, chessUsername)
	if err != nil || s == nil {
		return nil, err
	}
	r := s.Rating
	return &r, nil
}
