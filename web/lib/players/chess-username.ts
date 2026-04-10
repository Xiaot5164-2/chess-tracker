/** Normalize and validate Chess.com-style usernames for Pub API paths. */
export function normalizeChessUsername(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s || s.length > 64) {
    return null;
  }
  if (!/^[a-z0-9_-]+$/.test(s)) {
    return null;
  }
  return s;
}
