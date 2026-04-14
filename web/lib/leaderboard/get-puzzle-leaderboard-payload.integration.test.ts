import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { getPuzzleLeaderboardPayload } from "./get-puzzle-leaderboard-payload";
import { isDatabaseConfigured } from "@/lib/db/env";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function tryLoadDatabaseUrlFromEnvLocal() {
  if (process.env.DATABASE_URL) return;
  const p = path.join(__dirname, "../../.env.local");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const m = t.match(/^DATABASE_URL\s*=\s*(.+)$/);
    if (m) {
      let v = m[1].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      process.env.DATABASE_URL = v;
      return;
    }
  }
}

tryLoadDatabaseUrlFromEnvLocal();
const dbConfigured = isDatabaseConfigured();

describe.skipIf(!dbConfigured)("getPuzzleLeaderboardPayload (integration)", () => {
  it("多日 daily_puzzle_stats 时应出现近7或近30涨跌", async () => {
    const r = await getPuzzleLeaderboardPayload();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const withRating = r.rows.filter((x) => x.rating != null && Number.isFinite(x.rating));
    expect(withRating.length).toBeGreaterThan(0);
    const withAnyDelta = withRating.filter(
      (x) =>
        (x.ratingDelta7 != null && Number.isFinite(x.ratingDelta7)) ||
        (x.ratingDelta30 != null && Number.isFinite(x.ratingDelta30)),
    );
    expect(withAnyDelta.length).toBeGreaterThan(0);
  });
});
