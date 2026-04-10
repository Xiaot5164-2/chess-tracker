"use server";

import { revalidatePath } from "next/cache";

import { deleteStudentCore } from "@/lib/players/delete-player-core";
import { updateDisplayNameCore } from "@/lib/players/update-display-name-core";
import type { DeleteStudentState, UpdateDisplayNameState } from "@/lib/players/types";

function revalidateLeaderboardRoutes() {
  revalidatePath("/leaderboard");
  revalidatePath("/leaderboard/blitz");
  revalidatePath("/leaderboard/bullet");
  revalidatePath("/leaderboard/puzzles");
}

export async function deleteStudent(
  _prev: DeleteStudentState,
  formData: FormData,
): Promise<DeleteStudentState> {
  try {
    const result = await deleteStudentCore({
      profile_id: String(formData.get("profile_id") ?? ""),
      password: String(formData.get("confirm_password") ?? ""),
    });
    if (result.ok) {
      revalidateLeaderboardRoutes();
    }
    return result;
  } catch (e) {
    console.error("[deleteStudent]", e);
    return {
      ok: false,
      message:
        e instanceof Error
          ? e.message
          : "删除失败（服务器异常）。请查看运行 next dev 的终端日志；并确认已配置 DATABASE_URL。",
    };
  }
}

export async function updateStudentDisplayName(
  _prev: UpdateDisplayNameState,
  formData: FormData,
): Promise<UpdateDisplayNameState> {
  try {
    const result = await updateDisplayNameCore({
      profile_id: String(formData.get("profile_id") ?? ""),
      display_name: String(formData.get("display_name") ?? ""),
    });
    if (result.ok) {
      revalidateLeaderboardRoutes();
    }
    return result;
  } catch (e) {
    console.error("[updateStudentDisplayName]", e);
    return {
      ok: false,
      message:
        e instanceof Error
          ? e.message
          : "更新失败（服务器异常）。请查看运行 next dev 的终端日志；并确认已配置 DATABASE_URL。",
    };
  }
}
