/**
 * Chess.com 月度对局 JSON（与 backend-go/internal/chesscom/games.go 对齐）。
 */

export type PlayerSide = {
  username?: string;
  result?: string;
  rating?: number | null;
};

export type FinishedGame = {
  url?: string;
  uuid?: string;
  pgn?: string;
  time_control?: string;
  end_time?: number;
  rated?: boolean | null;
  accuracies?: { white?: number | null; black?: number | null } | null;
  tcn?: string;
  initial_setup?: string;
  fen?: string;
  time_class?: string;
  rules?: string;
  eco?: string;
  white?: PlayerSide;
  black?: PlayerSide;
};

const ARCHIVES_URL = (u: string) =>
  `https://api.chess.com/pub/player/${encodeURIComponent(u.toLowerCase().trim())}/games/archives`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 约 2 req/s，与 Worker 一致 */
export async function chessComThrottle(): Promise<void> {
  await sleep(500);
}

export async function fetchGameArchiveURLs(username: string): Promise<string[]> {
  await chessComThrottle();
  const res = await fetch(ARCHIVES_URL(username), {
    headers: { "User-Agent": "chess-tracker-web/1.0" },
    cache: "no-store",
  });
  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    throw new Error(`Chess.com archives HTTP ${res.status}`);
  }
  const j = (await res.json()) as { archives?: string[] };
  return Array.isArray(j.archives) ? j.archives : [];
}

const archiveYearMonthPath = /\/games\/(\d{4})\/(\d{2})(?:$|[/?#])/;

export function parseArchiveYearMonth(archiveURL: string): { year: number; month: number } | null {
  const mat = archiveURL.match(archiveYearMonthPath);
  if (!mat) return null;
  const year = Number(mat[1]);
  const mo = Number(mat[2]);
  if (!Number.isFinite(year) || mo < 1 || mo > 12) return null;
  return { year, month: mo };
}

function monthRangeUTC(year: number, month1to12: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month1to12, 0, 23, 59, 59, 999));
  return { start, end };
}

/** 保留与 [now−days, now]（UTC）有交集的月份归档 URL（与 Go FilterArchivesOverlappingLastDays 一致）。 */
export function filterArchivesOverlappingLastDays(archives: string[], days: number): string[] {
  if (days <= 0 || archives.length === 0) return [];
  const now = new Date();
  const from = new Date(now.getTime() - days * 86_400_000);
  const out: string[] = [];
  for (const u of archives) {
    const parsed = parseArchiveYearMonth(u);
    if (!parsed) continue;
    const { start: ms, end: me } = monthRangeUTC(parsed.year, parsed.month);
    if (ms <= now && me >= from) {
      out.push(u);
    }
  }
  return out;
}

export async function fetchGamesForMonthURL(monthURL: string): Promise<FinishedGame[]> {
  await chessComThrottle();
  const res = await fetch(monthURL, {
    headers: { "User-Agent": "chess-tracker-web/1.0" },
    cache: "no-store",
  });
  if (res.status === 404 || res.status === 410) {
    return [];
  }
  if (!res.ok) {
    throw new Error(`Chess.com games month HTTP ${res.status}`);
  }
  const j = (await res.json()) as { games?: FinishedGame[] };
  return Array.isArray(j.games) ? j.games : [];
}

export function playerColor(g: FinishedGame, chessUsername: string): "white" | "black" | "" {
  const u = chessUsername.trim().toLowerCase();
  if (g.white?.username && g.white.username.trim().toLowerCase() === u) return "white";
  if (g.black?.username && g.black.username.trim().toLowerCase() === u) return "black";
  return "";
}

export function playerResult(g: FinishedGame, chessUsername: string): string {
  const c = playerColor(g, chessUsername);
  if (c === "white") return String(g.white?.result ?? "");
  if (c === "black") return String(g.black?.result ?? "");
  return "";
}

export function endTimeUTC(g: FinishedGame): Date | null {
  const t = g.end_time;
  if (t == null || typeof t !== "number" || t <= 0) return null;
  return new Date(t * 1000);
}

export function gameID(g: FinishedGame): string {
  const id = String(g.uuid ?? "").trim();
  if (id) return truncate64(id);
  const u = String(g.url ?? "").trim();
  return u ? truncate64(u) : "";
}

function truncate64(s: string): string {
  if (s.length <= 64) return s;
  return s.slice(0, 64);
}
