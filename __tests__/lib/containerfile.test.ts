import { readFileSync } from "bun:fs";
import { join } from "bun:path";
import { describe, expect, it } from "bun:test";

const ROOT = join(import.meta.dir, "..", "..");

/**
 * The container image.
 *
 * The image build is the one build in this repository that has no
 * `.env.local`: the file is excluded from the build context, because it is
 * where the secrets live. That matters more than it looks, because Next.js
 * inlines a `NEXT_PUBLIC_*` member access into the client bundle only when
 * the variable is present at build time. A variable that is missing stays a
 * runtime lookup, and the browser's `process` polyfill has an empty `env`,
 * so it resolves to nothing — a sign-in form that cannot find its own
 * Supabase URL.
 *
 * These assertions are the guard on that. The end-to-end suite catches the
 * symptom, but only for the build it makes itself; the image is built
 * elsewhere, by whoever deploys it.
 */
const containerfile = readFileSync(join(ROOT, "Containerfile"), "utf-8");

describe("the container image", () => {
  it("passes the public Supabase coordinates to the build", () => {
    for (const name of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]) {
      expect(containerfile).toContain(`ARG ${name}`);
      expect(containerfile).toContain(`ENV ${name}=$${name}`);
    }
  });

  it("puts the build arguments in the build stage, not the runtime one", () => {
    // The build stage is the one that runs `next build`, and the one that
    // has to have the values. A value handed to the runtime stage instead
    // arrives too late: the bundle was already built without it.
    const buildStage = containerfile.slice(
      containerfile.indexOf("AS build"),
      containerfile.indexOf("AS runtime"),
    );

    expect(buildStage).toContain("ARG NEXT_PUBLIC_SUPABASE_URL");
    expect(buildStage).toContain("ARG NEXT_PUBLIC_SUPABASE_ANON_KEY");
    expect(buildStage).toContain("RUN bun run build");
  });

  it("never bakes a secret into a layer", () => {
    // The service role key is a secret: it is read from the runtime
    // environment, and it has no business in an image layer.
    expect(containerfile).not.toContain("ARG SUPABASE_SERVICE_ROLE_KEY");
    expect(containerfile).not.toContain("ENV SUPABASE_SERVICE_ROLE_KEY");
  });

  it("keeps the local environment files out of the build context", () => {
    const dockerignore = readFileSync(join(ROOT, ".dockerignore"), "utf-8");

    // `.env.local` holds the secrets, so it must not be copied into the
    // image. `.env.local.example` is documentation, and is kept.
    expect(dockerignore).toMatch(/^\.env\.\*$/m);
    expect(dockerignore).toMatch(/^!\.env\.local\.example$/m);
  });
});
