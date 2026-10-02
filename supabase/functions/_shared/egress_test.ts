/**
 * Transport-level tests for the edge egress guard.
 *
 * These cover the rejections that happen *before* any socket is opened, so the
 * suite is offline and deterministic in CI. The address classifier itself lives
 * in ./egress-policy.ts and is covered far more thoroughly (including parity
 * against the Next.js runtime) by __tests__/lib/egress-policy.test.ts under
 * `bun test`.
 *
 * Run with: deno task test
 */

import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { BlockedUrlError, createSsrfProtectedTransport } from "./egress.ts";

const send = createSsrfProtectedTransport();

Deno.test("rejects unsupported protocols", async () => {
  await assertRejects(
    async () => send("ftp://example.com/x", {}),
    BlockedUrlError,
    "unsupported protocol",
  );
  await assertRejects(
    async () => send("file:///etc/passwd", {}),
    BlockedUrlError,
    "unsupported protocol",
  );
});

Deno.test("rejects credentials embedded in the URL", async () => {
  await assertRejects(
    async () => send("https://user:pass@example.com/x", {}),
    BlockedUrlError,
    "credentials in URL are not allowed",
  );
});

Deno.test("rejects malformed URLs", async () => {
  await assertRejects(
    async () => send("not a url", {}),
    BlockedUrlError,
    "invalid URL",
  );
});

Deno.test("rejects blocked hostname suffixes without resolving", async () => {
  for (const url of [
    "http://printer.local/webhook",
    "http://db.internal/notify",
    "http://nas.lan/hook",
    "http://router.home.arpa/hook",
    "http://metadata.google.internal/computeMetadata/v1/",
  ]) {
    await assertRejects(
      async () => send(url, {}),
      BlockedUrlError,
      "blocked hostname suffix",
      `expected ${url} to be blocked`,
    );
  }
});

Deno.test(
  "rejects private and metadata IP literals without resolving",
  async () => {
    for (const url of [
      "http://127.0.0.1/hook",
      "http://10.0.0.5/hook",
      "http://192.168.1.1/hook",
      "http://169.254.169.254/latest/meta-data/",
      "http://[::1]/hook",
      "http://[fd00:ec2::254]/hook",
      "http://[fe80::1]/hook",
    ]) {
      await assertRejects(
        async () => send(url, {}),
        BlockedUrlError,
        undefined,
        `expected ${url} to be blocked`,
      );
    }
  },
);

Deno.test("BlockedUrlError identifies itself as an SSRF block", async () => {
  try {
    await send("http://127.0.0.1/hook", {});
    throw new Error("should have been blocked");
  } catch (error) {
    assertEquals((error as Error).name, "BlockedUrlError");
    assertStringIncludes(
      (error as Error).message,
      "URL blocked by SSRF filter",
    );
  }
});
