package chesscom

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"

	"golang.org/x/time/rate"
)

const statsURL = "https://api.chess.com/pub/player/%s/stats"

type Client struct {
	http    *http.Client
	limiter *rate.Limiter
}

func NewClient(qps float64) *Client {
	burst := int(qps) + 1
	if burst < 2 {
		burst = 2
	}
	return &Client{
		http: &http.Client{
			Timeout: 30 * time.Second,
		},
		limiter: rate.NewLimiter(rate.Limit(qps), burst),
	}
}

// ErrRateLimited signals HTTP 429; includes optional Retry-After hint.
type ErrRateLimited struct {
	After time.Duration
}

func (e ErrRateLimited) Error() string { return "chess.com: rate limited (429)" }

type statsResponse struct {
	ChessRapid  *gameType `json:"chess_rapid"`
	ChessBlitz  *gameType `json:"chess_blitz"`
	ChessBullet *gameType `json:"chess_bullet"`
}

type gameType struct {
	Last struct {
		Rating int `json:"rating"`
	} `json:"last"`
}

// Ratings 为 pub /stats 的 last.rating；某分项缺失则为 nil。
type Ratings struct {
	Blitz  *int
	Rapid  *int
	Bullet *int
}

// FetchStats 请求 GET /pub/player/{username}/stats（仅用于该棋钟在 games 中无对局时的补分）。
func (c *Client) FetchStats(ctx context.Context, username string) (Ratings, error) {
	url := fmt.Sprintf(statsURL, username)
	var out Ratings
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
			var s statsResponse
			if err := json.Unmarshal(body, &s); err != nil {
				return err
			}
			out = Ratings{}
			if s.ChessRapid != nil {
				r := s.ChessRapid.Last.Rating
				out.Rapid = &r
			}
			if s.ChessBlitz != nil {
				b := s.ChessBlitz.Last.Rating
				out.Blitz = &b
			}
			if s.ChessBullet != nil {
				u := s.ChessBullet.Last.Rating
				out.Bullet = &u
			}
			return nil
		case http.StatusTooManyRequests:
			return ErrRateLimited{After: parseRetryAfter(resp.Header.Get("Retry-After"))}
		case http.StatusNotFound:
			return fmt.Errorf("chess.com: player not found (%s)", username)
		default:
			return fmt.Errorf("chess.com: status %d: %s", resp.StatusCode, truncate(string(body), 200))
		}
	})
	return out, err
}

func parseRetryAfter(h string) time.Duration {
	if h == "" {
		return 5 * time.Second
	}
	if sec, err := strconv.Atoi(h); err == nil && sec > 0 {
		return time.Duration(sec) * time.Second
	}
	if t, err := http.ParseTime(h); err == nil {
		d := time.Until(t)
		if d > 0 {
			return d
		}
	}
	return 5 * time.Second
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func withRetry(ctx context.Context, fn func() error) error {
	backoff := 500 * time.Millisecond
	var last error
	for attempt := 0; attempt < 6; attempt++ {
		last = fn()
		if last == nil {
			return nil
		}
		var rl ErrRateLimited
		if errors.As(last, &rl) {
			wait := backoff
			if rl.After > wait {
				wait = rl.After
			}
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(wait):
			}
			if backoff < 30*time.Second {
				backoff *= 2
			}
			continue
		}
		return last
	}
	return last
}
