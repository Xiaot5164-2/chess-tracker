package store

import (
	"fmt"
	"net/url"
	"strings"
)

// toMySQLDSN 将 `mysql://...` 转为 go-sql-driver 的 DSN，或透传已是 `user:pass@tcp(...)/db` 形式。
func toMySQLDSN(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("empty database URL")
	}
	low := strings.ToLower(raw)
	if strings.HasPrefix(low, "postgresql://") || strings.HasPrefix(low, "postgres://") {
		return "", fmt.Errorf("DATABASE_URL looks like PostgreSQL; this stack uses MySQL (mysql://...)")
	}
	if strings.HasPrefix(low, "mysql://") {
		u, err := url.Parse(raw)
		if err != nil {
			return "", fmt.Errorf("parse mysql URL: %w", err)
		}
		user := u.User.Username()
		pass, _ := u.User.Password()
		host := u.Hostname()
		if host == "" {
			return "", fmt.Errorf("mysql URL missing host")
		}
		port := u.Port()
		if port == "" {
			port = "3306"
		}
		db := strings.TrimPrefix(u.Path, "/")
		if db == "" {
			return "", fmt.Errorf("mysql URL missing database name in path")
		}
		q := u.Query()
		if !q.Has("parseTime") {
			q.Set("parseTime", "true")
		}
		if !q.Has("loc") {
			q.Set("loc", "UTC")
		}
		encPass := pass
		// go-sql-driver 期望原始密码；URL 中已编码的 %40 等由 url.Parse 解码
		return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?%s", user, encPass, host, port, db, q.Encode()), nil
	}
	if !strings.Contains(raw, "parseTime=") {
		sep := "?"
		if strings.Contains(raw, "?") {
			sep = "&"
		}
		raw = raw + sep + "parseTime=true&loc=UTC"
	}
	return raw, nil
}
