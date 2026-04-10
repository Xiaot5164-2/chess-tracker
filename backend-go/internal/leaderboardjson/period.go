package leaderboardjson

import (
	"math"
	"sort"
	"strings"
	"time"
)

// DayPoint 与 web/lib/leaderboard/rapid-period 一致。
type DayPoint struct {
	D string  `json:"d"`
	R float64 `json:"r"`
}

func utcCalendarDayKey(d string) string {
	if len(d) >= 10 {
		return d[:10]
	}
	return d
}

// RapidDeltaOverDays 与 TS rapidDeltaOverDays 对齐。
func RapidDeltaOverDays(points []DayPoint, days int) *float64 {
	var finite []DayPoint
	for _, p := range points {
		if isFinite(p.R) {
			finite = append(finite, p)
		}
	}
	if len(finite) < 2 {
		return nil
	}
	sorted := append([]DayPoint(nil), finite...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].D < sorted[j].D })
	latest := sorted[len(sorted)-1]
	cutoff := time.Now().UTC()
	cutoff = time.Date(cutoff.Year(), cutoff.Month(), cutoff.Day(), 0, 0, 0, 0, time.UTC)
	cutoff = cutoff.AddDate(0, 0, -days)
	cutoffStr := cutoff.Format("2006-01-02")

	baseline := sorted[0]
	for _, p := range sorted {
		if utcCalendarDayKey(p.D) <= cutoffStr {
			baseline = p
		} else {
			break
		}
	}
	d := latest.R - baseline.R
	if !isFinite(d) {
		return nil
	}
	return &d
}

func isFinite(f float64) bool {
	return !math.IsNaN(f) && !math.IsInf(f, 0)
}

func UtcPeriodStartDate(days int) string {
	cutoff := time.Now().UTC()
	cutoff = time.Date(cutoff.Year(), cutoff.Month(), cutoff.Day(), 0, 0, 0, 0, time.UTC)
	cutoff = cutoff.AddDate(0, 0, -days)
	return cutoff.Format("2006-01-02")
}

func chartKeyFromRecordedAt(recordedAt any) string {
	switch v := recordedAt.(type) {
	case time.Time:
		if v.IsZero() {
			return ""
		}
		t := v.UTC().Truncate(time.Hour)
		return t.Format(time.RFC3339)
	default:
		s := strings.TrimSpace(toStr(recordedAt))
		if s == "" {
			return s
		}
		var d time.Time
		var err error
		if len(s) <= 10 {
			d, err = time.Parse("2006-01-02", s[:10])
			if err != nil {
				return s[:min(10, len(s))]
			}
			d = time.Date(d.Year(), d.Month(), d.Day(), 0, 0, 0, 0, time.UTC)
		} else {
			d, err = time.Parse(time.RFC3339Nano, s)
			if err != nil {
				d, err = time.Parse(time.RFC3339, s)
			}
			if err != nil {
				if len(s) >= 10 {
					return s[:10]
				}
				return s
			}
		}
		d = d.UTC().Truncate(time.Hour)
		return d.Format(time.RFC3339)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func toStr(v any) string {
	if v == nil {
		return ""
	}
	switch x := v.(type) {
	case []byte:
		return string(x)
	case string:
		return x
	default:
		return ""
	}
}

func chessScoreRatePercent(wins, draws, totalGames float64) *float64 {
	if totalGames <= 0 || !isFinite(wins) || !isFinite(draws) || !isFinite(totalGames) {
		return nil
	}
	pct := (wins + 0.5*draws) / totalGames * 100
	if !isFinite(pct) {
		return nil
	}
	return &pct
}
