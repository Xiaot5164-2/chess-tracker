import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { isDatabaseConfigured } from "./env";

describe("isDatabaseConfigured", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env = { ...saved };
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("is false when DATABASE_URL unset", () => {
    delete process.env.DATABASE_URL;
    expect(isDatabaseConfigured()).toBe(false);
  });

  it("is true when DATABASE_URL set", () => {
    process.env.DATABASE_URL = "mysql://u:p@127.0.0.1:3306/chess_tracker";
    expect(isDatabaseConfigured()).toBe(true);
  });
});
