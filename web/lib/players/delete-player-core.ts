import type { DeleteStudentState } from "@/lib/players/types";
import { getMysqlPool } from "@/lib/db/pool";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function logDev(stage: string, err: unknown) {
  if (process.env.NODE_ENV === "development") {
    console.error(`[deleteStudent:${stage}]`, err);
  }
}

function expectedDeletePassword(): string {
  const fromEnv = process.env.STUDENT_DELETE_PASSWORD?.trim();
  return fromEnv || "19930426";
}

export type DeleteStudentInput = {
  profile_id: string;
  password: string;
};

export async function deleteStudentCore(input: DeleteStudentInput): Promise<DeleteStudentState> {
  try {
    const profileId = input.profile_id.trim();
    if (!profileId || !UUID_RE.test(profileId)) {
      return { ok: false, message: "无效的学生 ID。" };
    }

    const password = input.password.trim();
    if (!password) {
      return { ok: false, message: "请输入确认密码。" };
    }

    if (password !== expectedDeletePassword()) {
      return { ok: false, message: "密码错误。" };
    }

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
            "未配置数据库：在 web/.env.local 设置 DATABASE_URL（mysql://...）后方可删除学生。修改后需重启 dev 服务器。",
        };
      }
      return { ok: false, message: msg };
    }

    const [res] = await pool.execute("DELETE FROM profiles WHERE id = ?", [profileId]);
    const header = res as { affectedRows?: number };
    if (!header.affectedRows) {
      return { ok: false, message: "未找到该学生，可能已被删除。" };
    }

    return { ok: true, message: "已删除该学生及其关联数据。" };
  } catch (e) {
    logDev("unexpected", e);
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
