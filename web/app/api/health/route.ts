import { NextResponse } from "next/server";

/** 用于确认 Node 进程与路由栈正常（不访问数据库）。 */
export function GET() {
  return NextResponse.json({ ok: true });
}
