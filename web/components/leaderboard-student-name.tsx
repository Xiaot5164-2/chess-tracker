"use client";

import { useState, type ReactNode } from "react";

import { DeleteStudentRow } from "@/components/delete-student-row";
import { EditStudentDisplayName } from "@/components/edit-student-display-name";

type Stage = "idle" | "menu" | "rename" | "delete";

type Props = {
  profileId: string;
  chessUsername: string;
  displayName: string | null;
  chessComLink?: ReactNode;
};

export function LeaderboardStudentName({ profileId, chessUsername, displayName, chessComLink }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const label = (displayName?.trim() ? displayName : chessUsername) ?? chessUsername;

  if (stage === "rename") {
    return (
      <EditStudentDisplayName
        embedded
        profileId={profileId}
        chessUsername={chessUsername}
        displayName={displayName}
        chessComLink={chessComLink}
        onDismiss={() => setStage("idle")}
      />
    );
  }

  if (stage === "delete") {
    return (
      <DeleteStudentRow
        variant="formOnly"
        profileId={profileId}
        studentLabel={displayName ?? chessUsername}
        onDismiss={() => setStage("idle")}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {stage === "menu" ? (
          <span className="max-w-full truncate font-medium leading-tight text-foreground">{label}</span>
        ) : (
          <button
            type="button"
            onClick={() => setStage("menu")}
            className="max-w-full truncate rounded-sm text-left font-medium leading-tight text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="点击展开菜单"
            aria-label={`棋手：${label}，点击展开菜单`}
            aria-haspopup="menu"
          >
            {label}
          </button>
        )}
        {chessComLink}
      </div>
      {stage === "menu" ? (
        <div
          role="menu"
          aria-label="棋手操作"
          className="flex max-w-xs flex-col gap-0.5 rounded-md border border-border bg-muted/30 p-1 text-sm shadow-sm"
        >
          <button
            type="button"
            role="menuitem"
            className="rounded px-2 py-2 text-left text-foreground hover:bg-muted/80"
            onClick={() => setStage("rename")}
          >
            修改展示名
          </button>
          <button
            type="button"
            role="menuitem"
            className="rounded px-2 py-2 text-left text-destructive hover:bg-destructive/10"
            onClick={() => setStage("delete")}
          >
            删除该学生
          </button>
          <button
            type="button"
            role="menuitem"
            className="rounded px-2 py-2 text-left text-muted-foreground hover:bg-muted/80"
            onClick={() => setStage("idle")}
          >
            取消
          </button>
        </div>
      ) : null}
    </div>
  );
}
