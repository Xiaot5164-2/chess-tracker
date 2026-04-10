package apihttp

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"time"

	"chess-tracker/backend-go/internal/leaderboardjson"
	"chess-tracker/backend-go/internal/store"
)

// NewHandler 注册只读 HTTP API（查库）。
func NewHandler(st *store.Store) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	})
	mux.HandleFunc("/v1/ready", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		if err := st.DB().PingContext(ctx); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": err.Error()})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	})
	mux.HandleFunc("/v1/leaderboard", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		period := leaderboardjson.ParsePeriodDays(r.URL.Query().Get("period"))
		tc := leaderboardjson.ParseTimeControl(r.URL.Query().Get("timeControl"))
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
		defer cancel()
		payload, err := leaderboardjson.Build(ctx, st.DB(), period, tc)
		if err != nil {
			log.Printf("[api] leaderboard: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": err.Error(), "code": "build"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(payload)
	})
	mux.HandleFunc("/v1/leaderboard/puzzles", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Minute)
		defer cancel()
		payload, err := leaderboardjson.BuildPuzzlePayload(ctx, st.DB())
		if err != nil {
			log.Printf("[api] leaderboard/puzzles: %v", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			_ = json.NewEncoder(w).Encode(map[string]any{"ok": false, "error": err.Error(), "code": "build"})
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(payload)
	})
	return mux
}

// StripPrefix 可选：挂载在子路径时使用。
func StripPrefix(prefix string, h http.Handler) http.Handler {
	p := strings.TrimSuffix(prefix, "/")
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if p != "" && strings.HasPrefix(r.URL.Path, p) {
			r2 := r.Clone(r.Context())
			u := *r2.URL
			u.Path = strings.TrimPrefix(u.Path, p)
			if u.Path == "" {
				u.Path = "/"
			}
			r2.URL = &u
			h.ServeHTTP(w, r2)
			return
		}
		h.ServeHTTP(w, r)
	})
}
