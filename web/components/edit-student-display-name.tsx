"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { updateStudentDisplayName } from "@/app/leaderboard/actions";
import { Button } from "@/components/ui/button";
import { updateDisplayNameInitialState } from "@/lib/players/types";

const inputClass =
  "flex h-9 w-full min-w-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Props = {
  profileId: string;
  chessUsername: string;
  displayName: string | null;
  /** 棋手列内放在表单角上，例如 Chess.com 外链图标 */
  chessComLink?: ReactNode;
  /** 仅渲染表单（由外层先展示菜单再进入） */
  embedded?: boolean;
  /** `embedded` 时：取消或保存成功后回到外层 */
  onDismiss?: () => void;
};

export function EditStudentDisplayName({
  profileId,
  chessUsername,
  displayName,
  chessComLink,
  embedded = false,
  onDismiss,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(embedded);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState(updateStudentDisplayName, updateDisplayNameInitialState);

  useEffect(() => {
    if (state.ok && state.message) {
      if (embedded) {
        onDismiss?.();
      } else {
        setOpen(false);
      }
      router.refresh();
    }
  }, [state.ok, state.message, embedded, onDismiss, router]);

  const label = (displayName?.trim() ? displayName : chessUsername) ?? chessUsername;

  const dismiss = () => {
    if (embedded) {
      onDismiss?.();
    } else {
      setOpen(false);
      setFormKey((k) => k + 1);
    }
  };

  if (!embedded && !open) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setFormKey((k) => k + 1);
            setOpen(true);
          }}
          className="max-w-full truncate rounded-sm text-left font-medium leading-tight text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title="点击展开菜单"
          aria-label={`棋手：${label}，点击展开菜单`}
        >
          {label}
        </button>
        {chessComLink}
      </div>
    );
  }

  return (
    <form key={formKey} action={formAction} className="flex max-w-[min(100%,280px)] flex-col gap-2 text-left">
      <input type="hidden" name="profile_id" value={profileId} />
      {chessComLink ? <div className="flex justify-end gap-2">{chessComLink}</div> : null}
      <label className="text-xs font-medium text-muted-foreground" htmlFor={`display_name_${profileId}`}>
        展示名（留空则仅显示 {chessUsername}）
      </label>
      <input
        id={`display_name_${profileId}`}
        type="text"
        name="display_name"
        defaultValue={displayName ?? ""}
        autoComplete="off"
        placeholder={chessUsername}
        className={inputClass}
      />
      {state.message ? (
        <p className={`text-xs ${state.ok ? "text-emerald-400" : "text-destructive"}`} role="status">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "保存中…" : "保存"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={dismiss}>
          取消
        </Button>
      </div>
    </form>
  );
}
