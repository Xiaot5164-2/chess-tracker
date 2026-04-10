package chesscom

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const archivesURL = "https://api.chess.com/pub/player/%s/games/archives"

// PlayerSide is white/black in monthly games JSON.
type PlayerSide struct {
	Username string `json:"username"`
	Result   string `json:"result"`
	Rating   *int   `json:"rating"`
}

// FinishedGame is one game from GET .../games/{YYYY}/{MM}.
type FinishedGame struct {
	URL         string `json:"url"`
	UUID        string `json:"uuid"`
	PGN         string `json:"pgn"`
	TimeControl string `json:"time_control"`
	EndTime     int64  `json:"end_time"`
	Rated       *bool  `json:"rated"`
	Accuracies  *struct {
		White *float64 `json:"white"`
		Black *float64 `json:"black"`
	} `json:"accuracies"`
	TCN          string     `json:"tcn"`
	InitialSetup string     `json:"initial_setup"`
	Fen          string     `json:"fen"`
	TimeClass    string     `json:"time_class"`
	Rules        string     `json:"rules"`
	Eco          string     `json:"eco"`
	White        PlayerSide `json:"white"`
	Black        PlayerSide `json:"black"`
}

type gamesArchivesResponse struct {
	Archives []string `json:"archives"`
}

type gamesMonthResponse struct {
	Games []FinishedGame `json:"games"`
}

// FetchGameArchiveURLs returns monthly archive API URLs (oldest first).
func (c *Client) FetchGameArchiveURLs(ctx context.Context, username string) ([]string, error) {
	url := fmt.Sprintf(archivesURL, strings.ToLower(strings.TrimSpace(username)))
	var out []string
	err := withRetry(ctx, func() error {
		if err := c.limiter.Wait(ctx); err != nil {
			return err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return err
		}
		req.Header.Set("User-Agent", "chess-tracker-worker/1.0")
		resp, err := c.http.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		if err != nil {
			return err
		}
		switch resp.StatusCode {
		case http.StatusOK:
			var a gamesArchivesResponse
			if err := json.Unmarshal(body, &a); err != nil {
				return err
			}
			out = a.Archives
			return nil
		case http.StatusTooManyRequests:
			return ErrRateLimited{After: parseRetryAfter(resp.Header.Get("Retry-After"))}
		case http.StatusNotFound:
			return fmt.Errorf("chess.com: player not found (%s)", username)
		default:
			return fmt.Errorf("chess.com: archives status %d: %s", resp.StatusCode, truncate(string(body), 200))
		}
	})
	return out, err
}

// FetchGamesForMonthURL downloads one monthly archive JSON (full URL from archives list).
func (c *Client) FetchGamesForMonthURL(ctx context.Context, monthURL string) ([]FinishedGame, error) {
	var out []FinishedGame
	err := withRetry(ctx, func() error {
		if err := c.limiter.Wait(ctx); err != nil {
			return err
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, monthURL, nil)
		if err != nil {
			return err
		}
		req.Header.Set("User-Agent", "chess-tracker-worker/1.0")
		resp, err := c.http.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
		if err != nil {
			return err
		}
		switch resp.StatusCode {
		case http.StatusOK:
			var m gamesMonthResponse
			if err := json.Unmarshal(body, &m); err != nil {
				return err
			}
			out = m.Games
			return nil
		case http.StatusTooManyRequests:
			return ErrRateLimited{After: parseRetryAfter(resp.Header.Get("Retry-After"))}
		case http.StatusNotFound, http.StatusGone:
			out = nil
			return nil
		default:
			return fmt.Errorf("chess.com: games month status %d: %s", resp.StatusCode, truncate(string(body), 200))
		}
	})
	return out, err
}

// PlayerResult returns the tracked player's result token (e.g. win, timeout) from white/black.
func PlayerResult(g FinishedGame, chessUsername string) string {
	if strings.EqualFold(g.White.Username, chessUsername) {
		return g.White.Result
	}
	if strings.EqualFold(g.Black.Username, chessUsername) {
		return g.Black.Result
	}
	return ""
}

// PlayerColor returns "white" or "black" for the tracked username, or "" if not in the game.
func PlayerColor(g FinishedGame, chessUsername string) string {
	if strings.EqualFold(g.White.Username, chessUsername) {
		return "white"
	}
	if strings.EqualFold(g.Black.Username, chessUsername) {
		return "black"
	}
	return ""
}

// EndTimeUTC converts EndTime unix seconds to UTC.
func EndTimeUTC(g FinishedGame) time.Time {
	if g.EndTime <= 0 {
		return time.Time{}
	}
	return time.Unix(g.EndTime, 0).UTC()
}

// GameID returns uuid when present, otherwise a stable id derived from the game URL (max 64 chars for DB).
func GameID(g FinishedGame) string {
	if id := strings.TrimSpace(g.UUID); id != "" {
		return truncate64(id)
	}
	u := strings.TrimSpace(g.URL)
	if u == "" {
		return ""
	}
	return truncate64(u)
}

func truncate64(s string) string {
	if len(s) <= 64 {
		return s
	}
	return s[:64]
}

var archiveYearMonthPath = regexp.MustCompile(`/games/(\d{4})/(\d{2})(?:$|[/?#])`)

// ParseArchiveYearMonth extracts calendar month from a monthly games API URL.
func ParseArchiveYearMonth(archiveURL string) (year int, month time.Month, ok bool) {
	mat := archiveYearMonthPath.FindStringSubmatch(archiveURL)
	if len(mat) != 3 {
		return 0, 0, false
	}
	y, err := strconv.Atoi(mat[1])
	if err != nil {
		return 0, 0, false
	}
	mo, err := strconv.Atoi(mat[2])
	if err != nil || mo < 1 || mo > 12 {
		return 0, 0, false
	}
	return y, time.Month(mo), true
}

func monthRangeUTC(year int, month time.Month) (start, end time.Time) {
	start = time.Date(year, month, 1, 0, 0, 0, 0, time.UTC)
	end = start.AddDate(0, 1, 0).Add(-time.Nanosecond)
	return start, end
}

// FilterArchivesOverlappingLastDays keeps archive URLs whose calendar month overlaps [now−days, now] in UTC.
func FilterArchivesOverlappingLastDays(archives []string, days int) []string {
	if days <= 0 || len(archives) == 0 {
		return nil
	}
	now := time.Now().UTC()
	from := now.AddDate(0, 0, -days)
	var out []string
	for _, u := range archives {
		y, m, ok := ParseArchiveYearMonth(u)
		if !ok {
			continue
		}
		ms, me := monthRangeUTC(y, m)
		if !me.Before(from) && !ms.After(now) {
			out = append(out, u)
		}
	}
	return out
}

// LastNArchives returns the last n entries (API returns oldest first).
func LastNArchives(archives []string, n int) []string {
	if n <= 0 || len(archives) == 0 {
		return nil
	}
	if len(archives) <= n {
		s := make([]string, len(archives))
		copy(s, archives)
		return s
	}
	return append([]string(nil), archives[len(archives)-n:]...)
}
