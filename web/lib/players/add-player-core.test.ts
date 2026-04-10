import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { addPlayerCore } from "./add-player-core";

describe("addPlayerCore", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env = { ...saved };
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              username: "demo_user",
              name: "Demo",
              avatar: "https://example.com/a.png",
            }),
        }),
      ),
    );
  });

  afterEach(() => {
    process.env = { ...saved };
    vi.unstubAllGlobals();
  });

  it("returns validation error without calling network for invalid username", async () => {
    const r = await addPlayerCore({ chess_username: "bad name" });
    expect(r.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns friendly message when DATABASE_URL missing", async () => {
    delete process.env.DATABASE_URL;
    const r = await addPlayerCore({ chess_username: "demo_user" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/DATABASE_URL|数据库/);
  });
});
