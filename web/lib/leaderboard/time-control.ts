export type LeaderboardTimeControl = "rapid" | "blitz" | "bullet" | "puzzle";

export type LeaderboardTCConfig = {
  view: string;
  ratingType: "chess_rapid" | "chess_blitz" | "chess_bullet" | "chess_puzzle_current";
  ratingField: string;
  recordedField: string;
  label: string;
  /** 表格「分数」列表头 */
  scoreColumnLabel: string;
};

const CONFIG: Record<LeaderboardTimeControl, LeaderboardTCConfig> = {
  rapid: {
    view: "v_leaderboard_rapid",
    ratingType: "chess_rapid",
    ratingField: "rapid_rating",
    recordedField: "rapid_recorded_at",
    label: "Rapid",
    scoreColumnLabel: "分数",
  },
  blitz: {
    view: "v_leaderboard_blitz",
    ratingType: "chess_blitz",
    ratingField: "blitz_rating",
    recordedField: "blitz_recorded_at",
    label: "Blitz",
    scoreColumnLabel: "分数",
  },
  bullet: {
    view: "v_leaderboard_bullet",
    ratingType: "chess_bullet",
    ratingField: "bullet_rating",
    recordedField: "bullet_recorded_at",
    label: "Bullet",
    scoreColumnLabel: "分数",
  },
  puzzle: {
    view: "v_leaderboard_puzzle",
    ratingType: "chess_puzzle_current",
    ratingField: "puzzle_rating",
    recordedField: "puzzle_recorded_at",
    label: "谜题当前分",
    scoreColumnLabel: "谜题当前分",
  },
};

export function leaderboardTimeControlConfig(tc: LeaderboardTimeControl): LeaderboardTCConfig {
  return CONFIG[tc];
}

export function parseLeaderboardTimeControl(raw: string | string[] | undefined): LeaderboardTimeControl {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === "blitz" || v === "bullet" || v === "puzzle") {
    return v;
  }
  return "rapid";
}

/** Optional catch-all under `/leaderboard/[[...slug]]`: absent or empty → Rapid. */
export function parseLeaderboardTimeControlFromSlug(slug: string[] | undefined): LeaderboardTimeControl {
  const head = slug?.[0];
  if (head === "blitz" || head === "bullet" || head === "puzzle") {
    return head;
  }
  return "rapid";
}

export function leaderboardPathForTimeControl(tc: LeaderboardTimeControl): string {
  if (tc === "rapid") {
    return "/leaderboard";
  }
  if (tc === "puzzle") {
    return "/leaderboard/puzzles";
  }
  return `/leaderboard/${tc}`;
}

/** Resolve current时限 from pathname（避免 /leaderboard/blitzer 误匹配 blitz）. */
export function parseLeaderboardTimeControlFromPathname(pathname: string): LeaderboardTimeControl {
  if (/(?:^|\/)leaderboard\/blitz(?:\/|$|\?)/.test(pathname)) {
    return "blitz";
  }
  if (/(?:^|\/)leaderboard\/bullet(?:\/|$|\?)/.test(pathname)) {
    return "bullet";
  }
  if (/(?:^|\/)leaderboard\/puzzles(?:\/|$|\?)/.test(pathname)) {
    return "puzzle";
  }
  return "rapid";
}
