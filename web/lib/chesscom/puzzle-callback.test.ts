import { describe, expect, it } from "vitest";

import { parsePuzzleCurrentRating, puzzleCallbackUrl } from "./puzzle-callback";

describe("puzzleCallbackUrl", () => {
  it("uses single-slash path and lowercases", () => {
    expect(puzzleCallbackUrl("Erik")).toBe(
      "https://www.chess.com/callback/stats/tactics2/new/puzzles/erik",
    );
  });
});

describe("parsePuzzleCurrentRating", () => {
  it("reads statsInfo.stats.rating", () => {
    expect(
      parsePuzzleCurrentRating({
        statsInfo: { stats: { rating: 1868 } },
      }),
    ).toBe(1868);
  });

  it("returns undefined when missing", () => {
    expect(parsePuzzleCurrentRating({})).toBeUndefined();
    expect(parsePuzzleCurrentRating(null)).toBeUndefined();
  });
});
