import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { latencyTrendShader } from "@/components/shaders/latency-trend";
import { statusBackdropShader } from "@/components/shaders/status-backdrop";

/**
 * Two layers of shader verification, because neither alone is sufficient:
 *
 * 1. `vgpu check` runs a real WGSL front end over the exact string the app
 *    ships. The mock adapter does *not* validate WGSL -- a deliberately broken
 *    shader is accepted by it -- so this is the only layer that catches invalid
 *    syntax or types.
 * 2. The mock adapter *does* reject unknown binding names, so it catches
 *    shader/JS binding drift that typechecking cannot see.
 *
 * What neither layer covers: whether the output looks correct. The mock is a
 * recording device that returns zeroed pixels and both charts are `ssr: false`
 * client components, so visual verification needs a real GPU in a browser.
 */

const SHADERS: Array<{ name: string; source: string }> = [
  { name: "latency-trend", source: latencyTrendShader },
  { name: "status-backdrop", source: statusBackdropShader },
];

const VALIDATE_TIMEOUT_MS = 120_000;

async function runVgpuCheck(name: string, source: string) {
  const dir = mkdtempSync(join(tmpdir(), "vgpu-check-"));
  const file = join(dir, `${name}.wgsl`);
  writeFileSync(file, source);

  const proc = Bun.spawn(["npx", "vgpu", "check", file]);
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  let ok = exitCode === 0;
  try {
    const parsed = JSON.parse(stdout) as { ok?: boolean };
    if (typeof parsed.ok === "boolean") ok = parsed.ok;
  } catch {
    // Non-JSON output falls back to the exit code.
  }

  return { ok, detail: `${stdout}${stderr}`.slice(0, 600) };
}

describe("WGSL validation", () => {
  for (const shader of SHADERS) {
    it(
      `${shader.name} passes vgpu check`,
      async () => {
        const result = await runVgpuCheck(shader.name, shader.source);
        expect(
          result.ok,
          `vgpu check rejected ${shader.name}:\n${result.detail}`,
        ).toBe(true);
      },
      VALIDATE_TIMEOUT_MS,
    );

    it(`${shader.name} exposes only a fragment entry point`, () => {
      expect(shader.source).toContain("@fragment");
      expect(shader.source).toMatch(/fn\s+fs_main/);
      expect(shader.source).not.toContain("@vertex");
    });

    it(`${shader.name} reads its own resolution uniform`, () => {
      expect(shader.source).toContain("params.resolution");
      expect(shader.source).not.toMatch(/fragCoord\.xy\s*\/\s*[0-9]/);
    });
  }
});

describe("latency trend layout contract", () => {
  it("declares Sample as vec2f + f32 + f32", () => {
    expect(latencyTrendShader).toMatch(
      /struct Sample \{[\s\S]*position: vec2f,[\s\S]*status: f32,[\s\S]*padding: f32,[\s\S]*\};/,
    );
  });

  it("binds both the uniform and the storage buffer it declares", () => {
    expect(latencyTrendShader).toContain("var<uniform> params");
    expect(latencyTrendShader).toContain("var<storage, read> samples");
  });
});

describe("mock adapter accepts the shipped bindings", () => {
  it("binds params and samples", async () => {
    const mock = await import("vgpu/mock");
    const gpu = await mock.init();
    const offscreen = mock.target(gpu, {
      size: [32, 16],
      format: "rgba8unorm",
    });
    const params = mock.uniforms(gpu, {
      count: 0,
      time: 0,
      resolution: [32, 16],
      padding: [0, 0],
    });
    const samples = mock.storage(gpu, 512 * 4 * 4, "read");

    const chart = mock.effect(gpu, latencyTrendShader, {
      set: { params, samples },
    });
    mock.frame(gpu, (f) => f.pass(offscreen, chart));

    expect(chart).toBeDefined();
    gpu.dispose();
  }, 30_000);

  it("binds params for the backdrop", async () => {
    const mock = await import("vgpu/mock");
    const gpu = await mock.init();
    const offscreen = mock.target(gpu, {
      size: [32, 16],
      format: "rgba8unorm",
    });
    const params = mock.uniforms(gpu, {
      time: 0,
      status: 1,
      aspect: 2,
      intensity: 0.16,
      resolution: [32, 16],
      padding: [0, 0],
    });

    const backdrop = mock.effect(gpu, statusBackdropShader, {
      set: { params },
    });
    mock.frame(gpu, (f) => f.pass(offscreen, backdrop));

    expect(backdrop).toBeDefined();
    gpu.dispose();
  }, 30_000);
});
