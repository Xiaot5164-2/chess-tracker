/**
 * Chess.com 页面 callback：当前谜题分在 JSON `statsInfo.stats.rating`。
 * 须使用单斜杠路径 …/puzzles/{username}（`puzzles//user` 会返回 HTML）。
 */
export const PUZZLE_CALLBACK_BASE = "https://www.chess.com/callback/stats/tactics2/new/puzzles/";

export function puzzleCallbackUrl(chessUsername: string): string {
  const u = encodeURIComponent(chessUsername.trim().toLowerCase());
  return `${PUZZLE_CALLBACK_BASE}${u}`;
}

export function parsePuzzleCurrentRating(json: unknown): number | undefined {
  if (!json || typeof json !== "object") {
    return undefined;
  }
  const o = json as { statsInfo?: { stats?: { rating?: unknown } } };
  const r = o.statsInfo?.stats?.rating;
  if (typeof r === "number" && Number.isFinite(r)) {
    return Math.round(r);
  }
  return undefined;
}

export async function fetchChessComPuzzleCurrentRating(
  chessUsername: string,
  timeoutMs = 12_000,
): Promise<number | undefined> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(puzzleCallbackUrl(chessUsername), {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; chess-tracker-web/1.0)" },
      cache: "no-store",
    });
    if (!res.ok) {
      return undefined;
    }
    const j: unknown = await res.json();
    return parsePuzzleCurrentRating(j);
  } catch {
    return undefined;
  } finally {
    clearTimeout(t);
  }
}
