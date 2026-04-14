package leaderboardjson

import "testing"

func TestPuzzleRatingBaselineWithSparseFallback(t *testing.T) {
	one := func(d string, r int) puzzleDayRow {
		v := r
		return puzzleDayRow{statDate: d, rating: &v, attempts: nil}
	}
	t.Run("anchor_hit", func(t *testing.T) {
		ser := []puzzleDayRow{one("2026-04-01", 1500), one("2026-04-14", 1520)}
		b := puzzleRatingBaselineWithSparseFallback(ser, "2026-04-14", 7)
		if b == nil || *b != 1500 {
			t.Fatalf("want 1500, got %v", b)
		}
	})
	t.Run("sparse_five_days", func(t *testing.T) {
		ser := []puzzleDayRow{
			one("2026-04-10", 1600),
			one("2026-04-11", 1605),
			one("2026-04-12", 1610),
			one("2026-04-13", 1615),
			one("2026-04-14", 1651),
		}
		b := puzzleRatingBaselineWithSparseFallback(ser, "2026-04-14", 7)
		if b == nil || *b != 1600 {
			t.Fatalf("want 1600 baseline, got %v", b)
		}
	})
	t.Run("single_day_no_baseline", func(t *testing.T) {
		ser := []puzzleDayRow{one("2026-04-14", 1651)}
		b := puzzleRatingBaselineWithSparseFallback(ser, "2026-04-14", 7)
		if b != nil {
			t.Fatalf("want nil, got %v", *b)
		}
	})
}
