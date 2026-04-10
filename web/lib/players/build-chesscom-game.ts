import type { FinishedGame } from "@/lib/chesscom/games-archive";
import { gameID as chessGameId, playerColor, playerResult } from "@/lib/chesscom/games-archive";

function truncateUTF8(s: string, maxBytes: number): string {
  const enc = new TextEncoder();
  if (enc.encode(s).length <= maxBytes) return s;
  let t = s;
  while (t.length > 0 && enc.encode(t).length > maxBytes) {
    t = t.slice(0, -1);
  }
  return t;
}

function nullString(s: string | undefined): string | null {
  const t = String(s ?? "").trim();
  return t === "" ? null : t;
}

function nullInt32(p: number | null | undefined): number | null {
  if (p == null || typeof p !== "number" || !Number.isFinite(p)) return null;
  return Math.round(p);
}

export type ChesscomGameRow = {
  chesscom_uuid: string;
  game_url: string;
  pgn: string | null;
  time_control: string | null;
  end_time: Date | null;
  rated: boolean | null;
  time_class: string | null;
  rules: string | null;
  white_username: string;
  black_username: string;
  white_rating: number | null;
  black_rating: number | null;
  white_result: string | null;
  black_result: string | null;
  player_color: "white" | "black";
  player_rating: number | null;
  player_result: string | null;
  accuracy_white: number | null;
  accuracy_black: number | null;
  tcn: string | null;
  fen: string | null;
  initial_setup: string | null;
  eco_url: string | null;
};

export function buildChesscomGame(g: FinishedGame, profileChess: string): ChesscomGameRow | null {
  const uid = chessGameId(g);
  if (!uid) return null;
  const color = playerColor(g, profileChess);
  if (color !== "white" && color !== "black") return null;

  let url = String(g.url ?? "").trim();
  if (!url) url = "https://www.chess.com/game/unknown";
  url = truncateUTF8(url, 768);

  const whiteU = String(g.white?.username ?? "").trim() || "unknown";
  const blackU = String(g.black?.username ?? "").trim() || "unknown";

  const whiteRating = nullInt32(g.white?.rating ?? null);
  const blackRating = nullInt32(g.black?.rating ?? null);
  const pr = playerResult(g, profileChess);
  const playerRating = color === "white" ? whiteRating : blackRating;

  const row: ChesscomGameRow = {
    chesscom_uuid: truncateUTF8(uid, 64),
    game_url: url,
    pgn: g.pgn ?? null,
    time_control: nullString(g.time_control),
    end_time: g.end_time != null && g.end_time > 0 ? new Date(g.end_time * 1000) : null,
    rated: g.rated === undefined || g.rated === null ? null : Boolean(g.rated),
    time_class: nullString(g.time_class),
    rules: nullString(g.rules),
    white_username: whiteU,
    black_username: blackU,
    white_rating: whiteRating,
    black_rating: blackRating,
    white_result: nullString(g.white?.result),
    black_result: nullString(g.black?.result),
    player_color: color,
    player_rating: playerRating,
    player_result: pr ? pr : null,
    accuracy_white: g.accuracies?.white != null ? Number(g.accuracies.white) : null,
    accuracy_black: g.accuracies?.black != null ? Number(g.accuracies.black) : null,
    tcn: g.tcn ? truncateUTF8(g.tcn, 2048) : null,
    fen: g.fen ? String(g.fen) : null,
    initial_setup: g.initial_setup ? truncateUTF8(g.initial_setup, 512) : null,
    eco_url: g.eco ? truncateUTF8(g.eco, 1024) : null,
  };

  if (row.accuracy_white != null && !Number.isFinite(row.accuracy_white)) row.accuracy_white = null;
  if (row.accuracy_black != null && !Number.isFinite(row.accuracy_black)) row.accuracy_black = null;

  return row;
}
