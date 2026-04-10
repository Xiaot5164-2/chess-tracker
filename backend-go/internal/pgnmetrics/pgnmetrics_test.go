package pgnmetrics

import (
	"math"
	"testing"
)

func TestHalfMoveCount(t *testing.T) {
	const pgn = `[Event "Live Chess"]
[White "a"][Black "b"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0`
	if n := HalfMoveCount(pgn); n != 6 {
		t.Fatalf("got %d want 6", n)
	}
}

// Chess.com 月度 archive 的真实 PGN：着法与 [%clk] 在注释花括号内。
func TestHalfMoveCountChessComArchiveWithClocks(t *testing.T) {
	const pgn = `[Event "Live Chess"]
[Site "Chess.com"]
[TimeControl "60+1"]
[Result "1-0"]

1. e4 {[%clk 0:01:01]} 1... c5 {[%clk 0:01:01]} 2. Nf3 {[%clk 0:01:01.3]} 2... e6 {[%clk 0:01:01.3]} 1-0`
	if n := HalfMoveCount(pgn); n != 4 {
		t.Fatalf("got %d want 4", n)
	}
	tr := AvgSecondsPerOwnMove(pgn, "60+1", "white")
	if tr == nil {
		t.Fatal("AvgSecondsPerOwnMove: nil")
	}
	if *tr < 0 || *tr > 120 || math.IsNaN(*tr) {
		t.Fatalf("AvgSecondsPerOwnMove: %g", *tr)
	}
}

func TestTimeBudgetSeconds(t *testing.T) {
	if v := TimeBudgetSeconds("600"); v != 600 {
		t.Fatalf("got %d", v)
	}
	if v := TimeBudgetSeconds("180+2"); v != 180 {
		t.Fatalf("got %d", v)
	}
	if v := TimeBudgetSeconds("1/86400"); v != 0 {
		t.Fatalf("got %d", v)
	}
}

func TestTimeIncrementSeconds(t *testing.T) {
	if v := TimeIncrementSeconds("180+2"); v != 2 {
		t.Fatalf("got %d", v)
	}
	if v := TimeIncrementSeconds("600"); v != 0 {
		t.Fatalf("got %d", v)
	}
	if v := TimeIncrementSeconds("60+1"); v != 1 {
		t.Fatalf("got %d", v)
	}
	if v := TimeIncrementSeconds("900+10"); v != 10 {
		t.Fatalf("900+10: got %d want 10", v)
	}
	if v := TimeBudgetSeconds("900+10"); v != 900 {
		t.Fatalf("900+10 base: got %d want 900", v)
	}
}

// 900+10：白前两步思考 50s、30s → 钟面 860s、840s（走完步并加 10s 后）。
func TestAvgSecondsPerOwnMove900Plus10(t *testing.T) {
	const pgn = `[Event "t"]
[TimeControl "900+10"]

1. e4 {[%clk 0:14:20]} 1... e5 {[%clk 0:14:10]} 2. Nf3 {[%clk 0:14:00]}
1-0`
	tr := AvgSecondsPerOwnMove(pgn, "900+10", "white")
	if tr == nil {
		t.Fatal("nil")
	}
	want := (50.0 + 30.0) / 2.0
	if math.Abs(*tr-want) > 0.01 {
		t.Fatalf("got %g want %g", *tr, want)
	}
}
