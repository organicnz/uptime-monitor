import { readFileSync } from "bun:fs";
import { join } from "bun:path";
import { describe, expect, it } from "bun:test";

import {
  MIN_FILE_FUNCS,
  MIN_FILE_LINES,
  MIN_FUNCS,
  MIN_LINES,
  parseLcov,
  summarize,
} from "../../scripts/coverage-check";

const ROOT = join(import.meta.dir, "..", "..");

/**
 * The coverage gate reads Bun's lcov report rather than scraping the
 * console table. These tests pin the arithmetic, because the gate is the
 * thing that decides whether a change is allowed to merge: an off-by-one
 * in the aggregate is a gate that is off by one.
 */

/** A lcov report with two files, one fully covered and one not. */
const SAMPLE = `TN:
SF:lib/covered.ts
FNF:2
FNH:2
LF:10
LH:10
DA:1,1
end_of_record
SF:lib/partial.ts
FNF:4
FNH:1
LF:20
LH:5
DA:1,1
end_of_record
`;

describe("parseLcov", () => {
  it("reads the per-file counters", () => {
    const files = parseLcov(SAMPLE);

    expect(files).toHaveLength(2);
    expect(files[0]).toEqual({
      file: "lib/covered.ts",
      funcsFound: 2,
      funcsHit: 2,
      linesFound: 10,
      linesHit: 10,
    });
    expect(files[1]).toEqual({
      file: "lib/partial.ts",
      funcsFound: 4,
      funcsHit: 1,
      linesFound: 20,
      linesHit: 5,
    });
  });

  it("ignores the per-line records", () => {
    const files = parseLcov(SAMPLE);

    expect(files[1].linesFound).toBe(20);
    expect(files[1].linesHit).toBe(5);
  });

  it("returns nothing for an empty report", () => {
    expect(parseLcov("")).toEqual([]);
  });
});

describe("summarize", () => {
  it("averages the per-file percentages, the way Bun's own table does", () => {
    const summary = summarize(parseLcov(SAMPLE));

    // Functions: (100% + 25%) / 2 = 62.5%.
    expect(summary.funcs).toBeCloseTo(62.5, 5);
    // Lines: (100% + 25%) / 2 = 62.5%.
    expect(summary.lines).toBeCloseTo(62.5, 5);
    expect(summary.files).toBe(2);
  });

  it("is not the ratio of the totals, which would weight the large file", () => {
    const summary = summarize(parseLcov(SAMPLE));

    // The summed ratio would be (2 + 1) / (2 + 4) = 30% for functions.
    // Averaging the per-file percentages gives 62.5%, and it is the
    // average that matches the "All files" row Bun prints.
    expect(summary.funcs).not.toBeCloseTo(30, 5);
  });

  it("reports the weakest file for each metric", () => {
    const summary = summarize(parseLcov(SAMPLE));

    expect(summary.worstFuncs).toEqual({
      file: "lib/partial.ts",
      percent: 25,
    });
    expect(summary.worstLines).toEqual({
      file: "lib/partial.ts",
      percent: 25,
    });
  });

  it("treats a file with nothing to cover as fully covered", () => {
    const summary = summarize([
      {
        file: "lib/types-only.ts",
        funcsFound: 0,
        funcsHit: 0,
        linesFound: 0,
        linesHit: 0,
      },
    ]);

    expect(summary.funcs).toBe(100);
    expect(summary.lines).toBe(100);
  });

  it("summarizes an empty report as zero rather than dividing by zero", () => {
    const summary = summarize([]);

    expect(summary.funcs).toBe(0);
    expect(summary.lines).toBe(0);
    expect(summary.files).toBe(0);
    expect(summary.worstFuncs).toBeNull();
  });
});

describe("the coverage gate measures a stable set", () => {
  it("replaces the Supabase server client before any test file loads", () => {
    // `mock.module` is process-wide, so the module the suite replaces has
    // to be replaced before anything can load it. Otherwise the real
    // module is evaluated in some test orders and not in others, and the
    // set of files the report covers — and therefore the number the gate
    // compares — moves with the order.
    const setup = readFileSync(join(ROOT, "__tests__", "setup.ts"), "utf-8");

    expect(setup).toContain('mock.module("@/lib/supabase/server"');
  });

  it("keeps the command-line tools out of the measurement", () => {
    // Each script is a command-line tool whose entry point is a process,
    // so its `main()` cannot be covered by a unit suite. What the scripts
    // decide lives in exported functions that the suite does cover.
    const bunfig = readFileSync(join(ROOT, "bunfig.toml"), "utf-8");

    expect(bunfig).toContain('"scripts/**"');
  });

  it("holds every file to its own floor", () => {
    // The aggregate can hide a file that nothing imports any more: it
    // drops out of the report and the average barely moves. The floor is
    // what stops that.
    expect(MIN_FILE_FUNCS).toBe(80);
    expect(MIN_FILE_LINES).toBe(70);
    expect(MIN_FUNCS).toBe(85);
    expect(MIN_LINES).toBe(85);
  });
});
