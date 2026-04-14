import { redirect } from "next/navigation";

/** 默认进入 Rapid 对局榜（`/leaderboard` 即 rapid，见 `leaderboardPathForTimeControl`）。 */
export default function Home() {
  redirect("/leaderboard");
}
