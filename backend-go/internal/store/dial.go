package store

import (
	"context"
	"fmt"
	"net"
	"time"
)

// preferIPDial：ipv6Only 时只拨 AAAA，无 IPv6 即失败；否则按 preferIPv6 决定先试 v6 或 v4。
func preferIPDial(ctx context.Context, network, addr string, preferIPv6, ipv6Only bool) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		if ipv6Only {
			return nil, fmt.Errorf("split host:port %q: %w (DATABASE_IPV6_ONLY=1)", addr, err)
		}
		d := &net.Dialer{Timeout: 8 * time.Second}
		return d.DialContext(ctx, network, addr)
	}
	addrs, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		if ipv6Only {
			return nil, fmt.Errorf("resolve %q: %w (DATABASE_IPV6_ONLY=1)", host, err)
		}
		d := &net.Dialer{Timeout: 8 * time.Second}
		return d.DialContext(ctx, network, addr)
	}
	if len(addrs) == 0 {
		if ipv6Only {
			return nil, fmt.Errorf("resolve %q: no addresses (DATABASE_IPV6_ONLY=1)", host)
		}
		d := &net.Dialer{Timeout: 8 * time.Second}
		return d.DialContext(ctx, network, addr)
	}
	var v4, v6 []net.IP
	for _, a := range addrs {
		if a.IP.To4() != nil {
			v4 = append(v4, a.IP)
		} else if len(a.IP) > 0 {
			v6 = append(v6, a.IP)
		}
	}
	var order []net.IP
	switch {
	case ipv6Only:
		order = v6
		if len(order) == 0 {
			return nil, fmt.Errorf("host %q has no IPv6 (AAAA) records (DATABASE_IPV6_ONLY=1)", host)
		}
	case preferIPv6:
		order = append(v6, v4...)
	default:
		order = append(v4, v6...)
	}
	d := &net.Dialer{Timeout: 8 * time.Second}
	var lastErr error
	for _, ip := range order {
		target := net.JoinHostPort(ip.String(), port)
		c, err := d.DialContext(ctx, network, target)
		if err == nil {
			return c, nil
		}
		lastErr = err
	}
	if lastErr != nil {
		return nil, lastErr
	}
	if ipv6Only {
		return nil, fmt.Errorf("dial %s: no route or refused (DATABASE_IPV6_ONLY=1)", host)
	}
	return d.DialContext(ctx, network, addr)
}
