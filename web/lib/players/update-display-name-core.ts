import type { UpdateDisplayNameState } from "@/lib/players/types";
import { getMysqlPool } from "@/lib/db/pool";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_LEN = 200;

function logDev(stage: string, err: unknown) {
  if (process.env.NODE_ENV === "development") {
    console.error(`[updateDisplayName:${stage}]`, err);
  }
}

export type UpdateDisplayNameInput = {
  profile_id: string;
  display_name: string;
};

export async function updateDisplayNameCore(input: UpdateDisplayNameInput): Promise<UpdateDisplayNameState> {
  try {
    const profileId = input.profile_id.trim();
    if (!profileId || !UUID_RE.test(profileId)) {
      return { ok: false, message: "无效的学生 ID。" };
    }

    const raw = input.display_name.trim();
    if (raw.length > MAX_LEN) {
      return { ok: false, message: `展示名最长 ${MAX_LEN} 个字符。` };
    }
    const display_name = raw.length === 0 ? null : raw;

    let pool;
    try {
      pool = getMysqlPool();
    } catch (e) {
      logDev("getMysqlPool", e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("DATABASE_URL")) {
        return {
          ok: false,
          message:
            "未配置数据库：在 web/.env.local 设置 DATABASE_URL（mysql://...）后方可修改展示名。修改后需重启 dev 服务器。",
        };
      }
      return { ok: false, message: msg };
    }

    const [res] = await pool.execute("UPDATE profiles SET display_name = ? WHERE id = ?", [display_name, profileId]);
    const header = res as { affectedRows?: number };
    if (!header.affectedRows) {
      return { ok: false, message: "未找到该学生，可能已被删除。" };
    }

    return {
      ok: true,
      message: display_name == null ? "已清空展示名，排行榜将显示 Chess.com 用户名。" : "展示名已更新。",
    };
  } catch (e) {
    logDev("unexpected", e);
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
