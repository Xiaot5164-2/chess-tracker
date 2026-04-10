/**
 * GET /pub/player/{username}/stats 的 last.rating。
 * 仅用于某棋钟在 `games` 中无对局时补写 daily_game_stats，不作为主数据源。
 */
export type ChessComPubStatsRatings = {
  chess_rapid?: number;
  chess_blitz?: number;
  chess_bullet?: number;
};

type StatsJson = {
  chess_blitz?: { last?: { rating?: number } };
  chess_rapid?: { last?: { rating?: number } };
  chess_bullet?: { last?: { rating?: number } };
};

export async function fetchChessComPubStats(username: string): Promise<ChessComPubStatsRatings> {
  const url = `https://api.chess.com/pub/player/${encodeURIComponent(username)}/stats`;
  const res = await fetch(url, {
    headers: { "User-Agent": "chess-tracker-web/1.0" },
    cache: "no-store",
  });
  if (res.status === 404) {
    return {};
  }
  if (!res.ok) {
    throw new Error(`Chess.com stats HTTP ${res.status}`);
  }
  const d = (await res.json()) as StatsJson;
  const out: ChessComPubStatsRatings = {};
  if (d.chess_blitz?.last?.rating != null) {
    out.chess_blitz = d.chess_blitz.last.rating;
  }
  if (d.chess_rapid?.last?.rating != null) {
    out.chess_rapid = d.chess_rapid.last.rating;
  }
  if (d.chess_bullet?.last?.rating != null) {
    out.chess_bullet = d.chess_bullet.last.rating;
  }
  return out;
}
