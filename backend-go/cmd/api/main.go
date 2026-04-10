// HTTP API 服务：只读查询 MySQL（排行榜等），与 Next.js /api/* 并行可选。
package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"chess-tracker/backend-go/internal/apihttp"
	"chess-tracker/backend-go/internal/config"
	"chess-tracker/backend-go/internal/store"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	ctx := context.Background()
	st, cleanup, err := store.Connect(ctx, cfg.DatabaseURL, cfg.DatabaseURLFallback, cfg.PreferIPv6, cfg.IPv6Only)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer cleanup()

	if err := st.VerifyMySQLSchemaRequired(ctx); err != nil {
		log.Fatalf("mysql migration: %v", err)
	}

	addr := os.Getenv("API_LISTEN")
	if addr == "" {
		addr = ":8080"
	}

	h := apihttp.NewHandler(st)
	srv := &http.Server{
		Addr:              addr,
		Handler:           h,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      2 * time.Minute,
	}

	go func() {
		log.Printf("api: listening on %s (GET /health /v1/ready /v1/leaderboard)", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop
	shCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	_ = srv.Shutdown(shCtx)
	log.Println("api: shutdown")
}
