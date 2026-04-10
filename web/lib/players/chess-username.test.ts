import { describe, expect, it } from "vitest";

import { normalizeChessUsername } from "./chess-username";

describe("normalizeChessUsername", () => {
  it("lowercases and trims", () => {
    expect(normalizeChessUsername("  Hikaru  ")).toBe("hikaru");
  });

  it("allows underscore and hyphen", () => {
    expect(normalizeChessUsername("player_one")).toBe("player_one");
    expect(normalizeChessUsername("a-b")).toBe("a-b");
  });

  it("rejects empty", () => {
    expect(normalizeChessUsername("")).toBeNull();
    expect(normalizeChessUsername("   ")).toBeNull();
  });

  it("rejects too long", () => {
    expect(normalizeChessUsername("a".repeat(65))).toBeNull();
  });

  it("rejects invalid chars", () => {
    expect(normalizeChessUsername("bad name")).toBeNull();
    expect(normalizeChessUsername("x@y")).toBeNull();
  });
});
