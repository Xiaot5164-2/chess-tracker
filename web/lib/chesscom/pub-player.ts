export type ChessPubPlayer = {
  username: string;
  avatar: string | null;
  /** Chess.com display name when present */
  name: string | null;
};

export async function fetchChessComPlayer(rawUsername: string): Promise<ChessPubPlayer | null> {
  const username = rawUsername.trim().toLowerCase();
  if (!username) {
    return null;
  }

  const url = `https://api.chess.com/pub/player/${encodeURIComponent(username)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "chess-tracker-web/1.0" },
    cache: "no-store",
  });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Chess.com 返回 ${res.status}`);
  }

  const data = (await res.json()) as {
    username?: string;
    avatar?: string;
    name?: string;
  };

  return {
    username: (data.username ?? username).toLowerCase(),
    avatar: data.avatar ?? null,
    name: data.name ?? null,
  };
}
