import { describe, expect, it } from "vitest";

import {
  leaderboardPathForTimeControl,
  leaderboardTimeControlConfig,
  parseLeaderboardTimeControl,
  parseLeaderboardTimeControlFromPathname,
  parseLeaderboardTimeControlFromSlug,
} from "./time-control";

describe("parseLeaderboardTimeControl", () => {
  it("defaults to rapid", () => {
    expect(parseLeaderboardTimeControl(undefined)).toBe("rapid");
    expect(parseLeaderboardTimeControl("")).toBe("rapid");
    expect(parseLeaderboardTimeControl("fast")).toBe("rapid");
  });

  it("accepts blitz, bullet, and puzzle", () => {
    expect(parseLeaderboardTimeControl("blitz")).toBe("blitz");
    expect(parseLeaderboardTimeControl("bullet")).toBe("bullet");
    expect(parseLeaderboardTimeControl(["bullet"])).toBe("bullet");
    expect(parseLeaderboardTimeControl("puzzle")).toBe("puzzle");
  });
});

describe("leaderboardTimeControlConfig", () => {
  it("maps views and rating types", () => {
    expect(leaderboardTimeControlConfig("rapid").view).toBe("v_leaderboard_rapid");
    expect(leaderboardTimeControlConfig("blitz").ratingType).toBe("chess_blitz");
    expect(leaderboardTimeControlConfig("bullet").ratingField).toBe("bullet_rating");
    expect(leaderboardTimeControlConfig("puzzle").ratingType).toBe("chess_puzzle_current");
    expect(leaderboardTimeControlConfig("puzzle").view).toBe("v_leaderboard_puzzle");
    expect(leaderboardTimeControlConfig("puzzle").scoreColumnLabel).toBe("谜题当前分");
    expect(leaderboardTimeControlConfig("rapid").scoreColumnLabel).toBe("分数");
  });
});

describe("parseLeaderboardTimeControlFromSlug", () => {
  it("maps optional catch-all segments", () => {
    expect(parseLeaderboardTimeControlFromSlug(undefined)).toBe("rapid");
    expect(parseLeaderboardTimeControlFromSlug([])).toBe("rapid");
    expect(parseLeaderboardTimeControlFromSlug(["blitz"])).toBe("blitz");
    expect(parseLeaderboardTimeControlFromSlug(["bullet"])).toBe("bullet");
    expect(parseLeaderboardTimeControlFromSlug(["puzzle"])).toBe("puzzle");
  });
});

describe("leaderboardPathForTimeControl", () => {
  it("uses /leaderboard for rapid", () => {
    expect(leaderboardPathForTimeControl("rapid")).toBe("/leaderboard");
    expect(leaderboardPathForTimeControl("blitz")).toBe("/leaderboard/blitz");
    expect(leaderboardPathForTimeControl("puzzle")).toBe("/leaderboard/puzzles");
  });
});

describe("parseLeaderboardTimeControlFromPathname", () => {
  it("reads blitz/bullet from path", () => {
    expect(parseLeaderboardTimeControlFromPathname("/leaderboard")).toBe("rapid");
    expect(parseLeaderboardTimeControlFromPathname("/leaderboard/blitz")).toBe("blitz");
    expect(parseLeaderboardTimeControlFromPathname("/leaderboard/bullet?period=30")).toBe("bullet");
    expect(parseLeaderboardTimeControlFromPathname("/leaderboard/puzzles")).toBe("puzzle");
    expect(parseLeaderboardTimeControlFromPathname("/leaderboard/blitzer")).toBe("rapid");
  });
});
