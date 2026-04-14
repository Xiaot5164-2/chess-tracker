import Link from "next/link";

const navItems = [
  { href: "/leaderboard", label: "对局榜" },
  { href: "/leaderboard/puzzles", label: "谜题榜" },
  { href: "/players/new", label: "添加学生" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/90 bg-[hsl(38,18%,8%)]/95 shadow-md shadow-black/30 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
        <Link
          href="/"
          className="font-heading flex shrink-0 items-center gap-2 text-lg font-semibold tracking-tight text-foreground sm:text-xl"
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-lg text-primary-foreground shadow-inner shadow-black/20"
            aria-hidden
          >
            ♔
          </span>
          <span className="max-w-[11rem] truncate sm:max-w-none">Chess Tracker</span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-1 sm:gap-2" aria-label="主导航">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground sm:px-3"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/"
            className="ml-1 rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 sm:ml-2"
          >
            首页
          </Link>
        </nav>
      </div>
    </header>
  );
}
