export function getDatabaseUrl(): string {
  const u = process.env.DATABASE_URL?.trim();
  if (!u) {
    throw new Error("DATABASE_URL is not set");
  }
  return u;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}
