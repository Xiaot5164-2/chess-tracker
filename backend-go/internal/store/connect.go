package store

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"net"
	"sync/atomic"
	"time"

	"github.com/go-sql-driver/mysql"
)

var dialCounter int64

// Connect 依次尝试 PrimaryURL、可选 FallbackURL；TCP 顺序由 preferIPv6 / ipv6Only 控制。
func Connect(ctx context.Context, primary, fallback string, preferIPv6, ipv6Only bool) (*Store, func(), error) {
	switch {
	case ipv6Only:
		log.Println("database: DATABASE_IPV6_ONLY=1 — only IPv6 TCP, no IPv4 fallback")
	case preferIPv6:
		log.Println("database: TCP dial order: IPv6 then IPv4 (per resolved address)")
	default:
		log.Println("database: TCP dial order: IPv4 then IPv6 (DATABASE_PREFER_IPV4 unset)")
	}

	var lastErr error

	if s, c, err := connectOnce(ctx, primary, preferIPv6, ipv6Only); err == nil {
		return s, c, nil
	} else {
		lastErr = err
	}

	if fallback != "" {
		if s, c, err := connectOnce(ctx, fallback, preferIPv6, ipv6Only); err == nil {
			log.Println("database: connected using DATABASE_URL_FALLBACK")
			return s, c, nil
		} else {
			lastErr = err
		}
	}

	hint := "set DATABASE_URL or DATABASE_URL_FALLBACK to mysql://user:pass@host:3306/db"
	if ipv6Only {
		hint = "DATABASE_IPV6_ONLY=1 requires IPv6 reachability for the DB host; unset to allow IPv4"
	}
	return nil, nil, fmt.Errorf("ping database: %w (%s)", lastErr, hint)
}

func connectOnce(ctx context.Context, connString string, preferIPv6, ipv6Only bool) (*Store, func(), error) {
	dsn, err := toMySQLDSN(connString)
	if err != nil {
		return nil, nil, err
	}
	cfg, err := mysql.ParseDSN(dsn)
	if err != nil {
		return nil, nil, fmt.Errorf("parse mysql DSN: %w", err)
	}

	netName := fmt.Sprintf("chess_tracker_dial_%d", atomic.AddInt64(&dialCounter, 1))
	mysql.RegisterDialContext(netName, func(ctx context.Context, addr string) (net.Conn, error) {
		return preferIPDial(ctx, "tcp", addr, preferIPv6, ipv6Only)
	})
	cfg.Net = netName

	connector, err := mysql.NewConnector(cfg)
	if err != nil {
		return nil, nil, fmt.Errorf("mysql connector: %w", err)
	}
	db := sql.OpenDB(connector)
	db.SetMaxOpenConns(8)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(30 * time.Minute)

	pingCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	if err := db.PingContext(pingCtx); err != nil {
		db.Close()
		return nil, nil, err
	}
	_, _ = db.ExecContext(ctx, "SET SESSION time_zone = '+00:00'")
	cleanup := func() { db.Close() }
	return &Store{db: db}, cleanup, nil
}
