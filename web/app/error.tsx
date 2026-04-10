"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col justify-center gap-6 px-4 py-16 text-center">
      <h1 className="font-heading text-2xl font-semibold text-foreground">出错了</h1>
      <p className="text-sm text-muted-foreground">
        {error.message || "页面渲染失败。若部署在 Vercel，请检查环境变量是否已配置。"}
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          重试
        </button>
        <Link
          href="/"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground"
        >
          回首页
        </Link>
      </div>
    </main>
  );
}
