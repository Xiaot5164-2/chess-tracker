"use client";

import { startTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const OPTIONS = [
  { value: "7", label: "近 7 日" },
  { value: "30", label: "近 30 日" },
  { value: "90", label: "近 90 日" },
] as const;

export function LeaderboardPeriodSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get("period") ?? "7";
  const value = OPTIONS.some((o) => o.value === current) ? current : "7";

  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="shrink-0">涨跌与走势</span>
      <select
        className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-foreground"
        value={value}
        onChange={(e) => {
          const p = new URLSearchParams(searchParams.toString());
          p.delete("tc");
          p.set("period", e.target.value);
          startTransition(() => {
            const qs = p.toString();
            router.push(qs ? `${pathname}?${qs}` : pathname);
          });
        }}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
