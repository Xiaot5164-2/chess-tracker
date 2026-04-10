/** mysql2 ER_DUP_ENTRY */
export function isDuplicateKeyError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) {
    return false;
  }
  const o = err as { errno?: number; code?: string };
  return o.errno === 1062 || o.code === "ER_DUP_ENTRY";
}
