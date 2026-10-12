import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("..", import.meta.url));

describe("verify-linux-package cloudflared pin", () => {
  it("compares the packaged cloudflared license to LICENSE-APACHE, not repo LICENSE", () => {
    const src = readFileSync(new URL("./verify-linux-package.mjs", import.meta.url), "utf8");
    expect(src).toContain('sha256(path.join(root, "LICENSE-APACHE"))');
    expect(src).not.toMatch(/cloudflared-LICENSE\.txt"\)\) !== sha256\(path.join\(root, "LICENSE"\)\)/);
    const license = readFileSync(`${root}/LICENSE`, "utf8");
    const apache = readFileSync(`${root}/LICENSE-APACHE`, "utf8");
    expect(license).not.toBe(apache);
    expect(apache).toContain("Apache License");
  });
});
