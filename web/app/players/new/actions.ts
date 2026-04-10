"use server";

import { addPlayerCore } from "@/lib/players/add-player-core";
import type { AddPlayerState } from "@/lib/players/types";

export async function addPlayer(_prev: AddPlayerState, formData: FormData): Promise<AddPlayerState> {
  try {
    return await addPlayerCore({
      chess_username: String(formData.get("chess_username") ?? ""),
      display_name: String(formData.get("display_name") ?? ""),
    });
  } catch (e) {
    console.error("[addPlayer]", e);
    return {
      ok: false,
      message:
        e instanceof Error
          ? e.message
          : "添加失败（服务器异常）。请查看运行 next dev 的终端日志；并确认已配置 DATABASE_URL、已应用 mysql/migrations。",
    };
  }
}
