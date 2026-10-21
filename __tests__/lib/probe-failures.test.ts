import { chmodSync, mkdtempSync, writeFileSync } from "bun:fs";
import { tmpdir } from "bun:os";
import { join } from "bun:path";
import { afterEach, describe, expect, it } from "bun:test";

import { type ProbeJob, runProbeBatch } from "@/lib/probe";

/**
 * The bridge when the probe misbehaves.
 *
 * The probe is an accelerator, not a dependency: every failure here has to
 * end in `null`, which is the signal for the caller to do the work
 * in-process instead. A bridge that threw would take the check down with
 * it, and a bridge that waited forever would hold a cron slot open.
 *
 * The tests point `PROBE_BINARY` at a script that misbehaves in a
 * particular way, because the failure modes are different failures: a
 * binary that cannot be started, one that exits badly, one that says
 * something that is not JSON, and one that never finishes.
 */

const isWindows = process.platform === "win32";

const job: ProbeJob = {
  kind: "http",
  id: "x",
  url: "http://localhost:1/",
  resolvedIp: "127.0.0.1",
  method: "GET",
  headers: {},
  body: null,
  timeoutMs: 1_000,
  readBody: false,
  maxBodyBytes: 1_024,
};

let originalBinary: string | undefined;

afterEach(() => {
  if (originalBinary === undefined) delete Bun.env.PROBE_BINARY;
  else Bun.env.PROBE_BINARY = originalBinary;
  originalBinary = undefined;
});

/** Point the bridge at a script that does the given thing. */
function useBinary(script: string, executable = true): string {
  const dir = mkdtempSync(join(tmpdir(), "probe-failure-"));
  const path = join(dir, "probe");
  writeFileSync(path, script);
  if (executable) chmodSync(path, 0o755);
  Bun.env.PROBE_BINARY = path;
  return path;
}

describe.skipIf(isWindows)("the probe bridge when the probe misbehaves", () => {
  it("falls back when the binary cannot be started", async () => {
    // The file is there, but it is not executable: an exec format error
    // or a permission problem.
    useBinary("#!/bin/sh\nexit 0\n", false);

    expect(await runProbeBatch([job])).toBeNull();
  });

  it("falls back when the binary exits badly", async () => {
    useBinary("#!/bin/sh\necho 'probe: something went wrong' >&2\nexit 3\n");

    expect(await runProbeBatch([job])).toBeNull();
  });

  it("falls back when the binary says something that is not JSON", async () => {
    useBinary("#!/bin/sh\necho 'not json at all'\n");

    expect(await runProbeBatch([job])).toBeNull();
  });

  it("falls back when the binary never finishes", async () => {
    // A wedged probe must not hold the check open: the deadline kills it
    // and the caller does the work itself.
    useBinary("#!/bin/sh\nsleep 30\n");

    expect(await runProbeBatch([job], Date.now() + 150)).toBeNull();
  });
});
