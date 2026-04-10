"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { deleteStudent } from "@/app/leaderboard/actions";
import { Button } from "@/components/ui/button";
import { deleteStudentInitialState } from "@/lib/players/types";

const inputClass =
  "flex h-9 w-full min-w-[140px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Props = {
  profileId: string;
  studentLabel: string;
  /** `icon`：与棋手名列并排的小图标；`formOnly`：仅密码表单（由菜单进入） */
  variant?: "default" | "icon" | "formOnly";
  /** `formOnly` 时：取消或删除成功后回到外层 */
  onDismiss?: () => void;
};

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path
        d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DeleteStudentRow({ profileId, studentLabel, variant = "default", onDismiss }: Props) {
  const router = useRouter();
  const formOnly = variant === "formOnly";
  const [open, setOpen] = useState(formOnly);
  const [formKey, setFormKey] = useState(0);
  const [state, formAction, pending] = useActionState(deleteStudent, deleteStudentInitialState);

  useEffect(() => {
    if (state.ok && state.message) {
      if (formOnly) {
        onDismiss?.();
      } else {
        setOpen(false);
      }
      router.refresh();
    }
  }, [state.ok, state.message, formOnly, onDismiss, router]);

  const dismiss = () => {
    if (formOnly) {
      onDismiss?.();
    } else {
      setOpen(false);
      setFormKey((k) => k + 1);
    }
  };

  if (!open) {
    if (variant === "icon") {
      return (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          title="删除该学生"
          aria-label={`删除学生：${studentLabel}`}
          onClick={() => {
            setFormKey((k) => k + 1);
            setOpen(true);
          }}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      );
    }
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => {
          setFormKey((k) => k + 1);
          setOpen(true);
        }}
      >
        删除
      </Button>
    );
  }

  return (
    <form
      key={formKey}
      action={formAction}
      className={`flex flex-col gap-2 text-left ${formOnly || variant === "icon" ? "w-full max-w-[min(100%,280px)] basis-full" : "max-w-[220px]"}`}
    >
      <input type="hidden" name="profile_id" value={profileId} />
      <p className="text-xs text-muted-foreground">
        将删除「{studentLabel}」及其战绩数据，不可恢复。请输入确认密码。
      </p>
      <input
        type="password"
        name="confirm_password"
        autoComplete="off"
        placeholder="确认密码"
        className={inputClass}
        aria-label="删除确认密码"
      />
      {state.message ? (
        <p className={`text-xs ${state.ok ? "text-emerald-400" : "text-destructive"}`} role="status">
          {state.message}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="outline" className="border-destructive/60 text-destructive" disabled={pending}>
          {pending ? "删除中…" : "确认删除"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={dismiss}>
          取消
        </Button>
      </div>
    </form>
  );
}
