package pgnmetrics

import (
	"database/sql"
	"math"
	"regexp"
	"strconv"
	"strings"
)

var (
	moveNumberToken = regexp.MustCompile(`^\d+\.(\.\.)?$`)
	clkTag          = regexp.MustCompile(`\[%clk\s*([0-9]+):([0-9]+):([0-9]+(?:\.[0-9]+)?)\]`)
	resultToken     = regexp.MustCompile(`^(1-0|0-1|1/2-1/2|\*|1–0|0–1)$`)
)

// MovetextBody returns text after PGN headers (tag pairs). Chess.com archive 在着法注释里含
// {[%clk ...]}，其中 `]` 若用「整段 PGN 最后一个 ]」切分会把棋步区截断，导致半回合数恒为 1、用时率异常。
// 优先用「首个空行」分隔头与 body（PGN 常规）；否则按行跳过以 `[` 开头的行。
func movetextBody(pgn string) string {
	pgn = strings.TrimSpace(pgn)
	if pgn == "" {
		return ""
	}
	if idx := strings.Index(pgn, "\n\n"); idx >= 0 {
		return strings.TrimSpace(pgn[idx+2:])
	}
	lines := strings.Split(pgn, "\n")
	for i := 0; i < len(lines); i++ {
		ln := strings.TrimSpace(lines[i])
		if ln == "" {
			continue
		}
		if strings.HasPrefix(ln, "[") {
			continue
		}
		return strings.TrimSpace(strings.Join(lines[i:], "\n"))
	}
	return ""
}

func stripBracedComments(s string) string {
	for {
		start := strings.Index(s, "{")
		if start < 0 {
			return s
		}
		end := strings.Index(s[start:], "}")
		if end < 0 {
			return s[:start]
		}
		s = s[:start] + s[start+end+1:]
	}
}

// HalfMoveCount counts plies from PGN movetext (Chess.com monthly archive format).
func HalfMoveCount(pgn string) int {
	body := movetextBody(pgn)
	if body == "" {
		return 0
	}
	body = stripBracedComments(body)
	var n int
	for _, tok := range strings.Fields(body) {
		if resultToken.MatchString(tok) {
			break
		}
		if moveNumberToken.MatchString(tok) {
			continue
		}
		n++
	}
	return n
}

// TimeBudgetSeconds parses Chess.com time_control (e.g. "600", "180+2"); Daily "1/86400" returns 0.
func TimeBudgetSeconds(timeControl string) int {
	tc := strings.TrimSpace(timeControl)
	if tc == "" || strings.Contains(tc, "/") {
		return 0
	}
	base := tc
	if i := strings.Index(tc, "+"); i >= 0 {
		base = tc[:i]
	}
	v, err := strconv.Atoi(strings.TrimSpace(base))
	if err != nil || v < 0 {
		return 0
	}
	return v
}

// TimeIncrementSeconds 解析 Fischer 等「基础+加秒」中的加秒（如 "180+2" -> 2）；无则为 0。
func TimeIncrementSeconds(timeControl string) int {
	tc := strings.TrimSpace(timeControl)
	if tc == "" || strings.Contains(tc, "/") {
		return 0
	}
	i := strings.Index(tc, "+")
	if i < 0 {
		return 0
	}
	v, err := strconv.Atoi(strings.TrimSpace(tc[i+1:]))
	if err != nil || v < 0 {
		return 0
	}
	return v
}

// LastClkSeconds returns the last [%clk H:MM:SS.x] value in the PGN (seconds as float).
func LastClkSeconds(pgn string) (float64, bool) {
	ms := clkTag.FindAllStringSubmatch(pgn, -1)
	if len(ms) == 0 {
		return 0, false
	}
	last := ms[len(ms)-1]
	if len(last) < 4 {
		return 0, false
	}
	h, err1 := strconv.ParseFloat(last[1], 64)
	mi, err2 := strconv.ParseFloat(last[2], 64)
	sec, err3 := strconv.ParseFloat(last[3], 64)
	if err1 != nil || err2 != nil || err3 != nil {
		return 0, false
	}
	return h*3600 + mi*60 + sec, true
}

func allClkSecondsOrdered(pgn string) []float64 {
	ms := clkTag.FindAllStringSubmatch(pgn, -1)
	out := make([]float64, 0, len(ms))
	for _, m := range ms {
		if len(m) < 4 {
			continue
		}
		h, err1 := strconv.ParseFloat(m[1], 64)
		mi, err2 := strconv.ParseFloat(m[2], 64)
		sec, err3 := strconv.ParseFloat(m[3], 64)
		if err1 != nil || err2 != nil || err3 != nil {
			continue
		}
		out = append(out, h*3600+mi*60+sec)
	}
	return out
}

// AvgSecondsPerOwnMove 仅统计「本方」每一步的思考用时（秒）。
// Fischer：第 n 步用时 ≈ 本步前剩余 − 本步后剩余 + 加秒（[%clk] 为走完该步并加上秒后的显示）。
func AvgSecondsPerOwnMove(pgn, timeControl, playerColor string) *float64 {
	b := float64(TimeBudgetSeconds(timeControl))
	if b <= 0 {
		return nil
	}
	inc := float64(TimeIncrementSeconds(timeControl))
	clks := allClkSecondsOrdered(pgn)
	if len(clks) == 0 {
		return nil
	}
	pc := strings.ToLower(strings.TrimSpace(playerColor))
	var secs []float64
	maxUsed := b + inc*4
	if maxUsed < b*3 {
		maxUsed = b * 3
	}
	switch pc {
	case "white":
		for i := 0; ; i++ {
			idx := 2 * i
			if idx >= len(clks) {
				break
			}
			var used float64
			if i == 0 {
				used = b - clks[0] + inc
			} else {
				used = clks[idx-2] - clks[idx] + inc
			}
			if used < 0 {
				used = 0
			}
			if used > maxUsed {
				continue
			}
			secs = append(secs, used)
		}
	case "black":
		if len(clks) < 2 {
			return nil
		}
		for i := 0; ; i++ {
			idx := 2*i + 1
			if idx >= len(clks) {
				break
			}
			var used float64
			if i == 0 {
				used = b - clks[1] + inc
			} else {
				used = clks[idx-2] - clks[idx] + inc
			}
			if used < 0 {
				used = 0
			}
			if used > maxUsed {
				continue
			}
			secs = append(secs, used)
		}
	default:
		return nil
	}
	if len(secs) == 0 {
		return nil
	}
	var sum float64
	for _, s := range secs {
		sum += s
	}
	avg := sum / float64(len(secs))
	if avg < 0 {
		avg = 0
	}
	return &avg
}

// DashboardMetricNulls 与 Worker UpsertChesscomGame 中对 games 表指标字段的语义一致。
// half_moves 存 PGN 半回合数；聚合展示「回合」时用 AVG(half_moves)/2。
// 第三项为 avg_seconds_per_own_move（秒）。
func DashboardMetricNulls(pgn, timeControl, playerColor string) (half sql.NullInt32, budget sql.NullInt32, avgSec sql.NullFloat64) {
	if hm := HalfMoveCount(pgn); hm > 0 && hm <= 10000 {
		half = sql.NullInt32{Int32: int32(hm), Valid: true}
	}
	if b := TimeBudgetSeconds(timeControl); b > 0 {
		budget = sql.NullInt32{Int32: int32(b), Valid: true}
	}
	if r := AvgSecondsPerOwnMove(pgn, timeControl, playerColor); r != nil {
		avgSec = sql.NullFloat64{Float64: *r, Valid: true}
	}
	return
}

// TimeUsageRatio 保留作向后兼容测试；写入 games 请用 AvgSecondsPerOwnMove。
func TimeUsageRatio(pgn, timeControl string) *float64 {
	b := TimeBudgetSeconds(timeControl)
	if b <= 0 {
		return nil
	}
	rem, ok := LastClkSeconds(pgn)
	if !ok {
		return nil
	}
	used := float64(b) - rem
	if used < 0 {
		used = 0
	}
	if used > float64(b)*1.5 {
		used = float64(b)
	}
	r := used / float64(b)
	if r < 0 {
		r = 0
	}
	if r > 2 {
		r = math.Min(r, 2)
	}
	return &r
}
