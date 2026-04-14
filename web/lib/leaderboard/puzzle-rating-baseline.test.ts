import { describe, expect, it } from "vitest";

import { puzzleRatingBaselineWithSparseFallback } from "./get-puzzle-leaderboard-payload";

describe("puzzleRatingBaselineWithSparseFallback", () => {
  it("日历锚点前有行时用该锚点（与 ratingAtOrBefore 一致）", () => {
    const series = [
      { statDate: "2026-04-01", rating: 1500, attempts: 1 },
      { statDate: "2026-04-14", rating: 1520, attempts: 0 },
    ];
    const b = puzzleRatingBaselineWithSparseFallback(series, "2026-04-14", 7);
    expect(b).toBe(1500);
  });

  it("日表不足 8 个自然日时回退到 endDate 之前最早一日分（docker 常见：仅 5 日）", () => {
    const series = [
      { statDate: "2026-04-10", rating: 1600, attempts: 0 },
      { statDate: "2026-04-11", rating: 1605, attempts: 0 },
      { statDate: "2026-04-12", rating: 1610, attempts: 0 },
      { statDate: "2026-04-13", rating: 1615, attempts: 0 },
      { statDate: "2026-04-14", rating: 1651, attempts: 0 },
    ];
    const b7 = puzzleRatingBaselineWithSparseFallback(series, "2026-04-14", 7);
    expect(b7).toBe(1600);
    const b30 = puzzleRatingBaselineWithSparseFallback(series, "2026-04-14", 30);
    expect(b30).toBe(1600);
  });

  it("仅 endDate 当日一行时无基线", () => {
    const series = [{ statDate: "2026-04-14", rating: 1651, attempts: 0 }];
    expect(puzzleRatingBaselineWithSparseFallback(series, "2026-04-14", 7)).toBeNull();
  });
});
