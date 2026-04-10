/** Chess.com 公开资料页（与站内用户名对应）。 */
export function chessComMemberUrl(chessUsername: string): string {
  const u = chessUsername.trim().toLowerCase();
  if (!u) {
    return "https://www.chess.com";
  }
  return `https://www.chess.com/member/${encodeURIComponent(u)}`;
}
