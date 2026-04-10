import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { chessScoreRatePercent, rapidDeltaOverDays, utcPeriodStartDate } from "./rapid-period";

describe("rapidDeltaOverDays", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null for empty", () => {
    expect(rapidDeltaOverDays([], 7)).toBeNull();
  });

  it("returns null with single day", () => {
    expect(rapidDeltaOverDays([{ d: "2026-04-08", r: 1500 }], 7)).toBeNull();
  });

  it("computes delta from baseline on or before cutoff", () => {
    const pts = [
      { d: "2026-04-01", r: 1400 },
      { d: "2026-04-08", r: 1450 },
    ];
    const d = rapidDeltaOverDays(pts, 7);
    expect(d).toBe(50);
  });

  it("ignores non-finite ratings so delta is not NaN", () => {
    const pts = [
      { d: "2026-04-01", r: 1400 },
      { d: "2026-04-05", r: Number.NaN },
      { d: "2026-04-08", r: 1450 },
    ];
    expect(rapidDeltaOverDays(pts, 7)).toBe(50);
  });

  it("uses UTC calendar day when points are hourly ISO timestamps", () => {
    const pts = [
      { d: "2026-04-01T08:00:00.000Z", r: 1400 },
      { d: "2026-04-08T10:00:00.000Z", r: 1450 },
    ];
    expect(rapidDeltaOverDays(pts, 7)).toBe(50);
  });
});

describe("utcPeriodStartDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-08T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns UTC date string days before today midnight", () => {
    expect(utcPeriodStartDate(7)).toBe("2026-04-01");
  });
});

describe("chessScoreRatePercent", () => {
  it("returns null when no games", () => {
    expect(chessScoreRatePercent(0, 0, 0)).toBeNull();
  });

  it("uses (wins + 0.5 * draws) / totalGames * 100", () => {
    expect(chessScoreRatePercent(2, 2, 4)).toBe(75);
    expect(chessScoreRatePercent(1, 0, 2)).toBe(50);
  });
});
