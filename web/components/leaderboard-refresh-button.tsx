"use client";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function LeaderboardRefreshButton({ onRefetch }: { onRefetch?: () => void }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        onRefetch?.();
        router.refresh();
      }}
    >
      刷新数据
    </Button>
  );
}
