import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadOrCreateOperatorToken,
  operatorTokenMatches,
} from "../src/web/operatorToken.js";

describe("operator token (Decision 090)", () => {
  it("mints once and returns the same token on later boots", async () => {
    const directory = await mkdtemp(join(tmpdir(), "operator-token-"));
    const path = join(directory, "nested", "operator-token");

    const first = await loadOrCreateOperatorToken(path);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    const second = await loadOrCreateOperatorToken(path);
    expect(second).toBe(first);
    expect((await readFile(path, "utf8")).trim()).toBe(first);
  });

  it("matches only the exact token and never non-strings", () => {
    expect(operatorTokenMatches("secret-token-value-of-length-32!", "secret-token-value-of-length-32!")).toBe(true);
    expect(operatorTokenMatches("secret-token-value-of-length-32!", "secret-token-value-of-length-32")).toBe(false);
    expect(operatorTokenMatches("secret-token-value-of-length-32!", "")).toBe(false);
    expect(operatorTokenMatches("secret-token-value-of-length-32!", undefined)).toBe(false);
    expect(operatorTokenMatches("secret-token-value-of-length-32!", ["array"])).toBe(false);
  });
});
