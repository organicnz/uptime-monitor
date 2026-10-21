/**
 * Ambient backdrop for the public status page.
 *
 * Deliberately low-contrast: this renders behind readable text, so it sets
 * mood, not information. Status shifts the hue and the drift speed of the noise
 * field; the page's own banner carries the actual verdict.
 *
 * See the note in ./latency-trend.ts for why this is a TypeScript module.
 */
export const statusBackdropShader = /* wgsl */ `
struct Params {
  time: f32,
  status: f32,
  aspect: f32,
  intensity: f32,
  resolution: vec2f,
  padding: vec2f,
};

@group(0) @binding(0) var<uniform> params: Params;

fn hash21(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.xyx) * 0.1031);
  p3 = p3 + dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn valueNoise(p: vec2f) -> f32 {
  let cell = floor(p);
  let local = fract(p);
  // smooth is a WGSL reserved word, so the easing curve is named fade.
  let fade = local * local * (3.0 - 2.0 * local);

  let a = hash21(cell);
  let b = hash21(cell + vec2f(1.0, 0.0));
  let c = hash21(cell + vec2f(0.0, 1.0));
  let d = hash21(cell + vec2f(1.0, 1.0));

  return mix(mix(a, b, fade.x), mix(c, d, fade.x), fade.y);
}

fn fbm(p: vec2f) -> f32 {
  var sum = 0.0;
  var amplitude = 0.5;
  var point = p;
  for (var i = 0; i < 4; i = i + 1) {
    sum = sum + amplitude * valueNoise(point);
    amplitude = amplitude * 0.5;
    point = point * 2.02;
  }
  return sum;
}

fn statusTint(status: f32) -> vec3f {
  if (status < 0.5) { return vec3f(0.937, 0.267, 0.267); }
  if (status < 1.5) { return vec3f(0.063, 0.725, 0.506); }
  if (status < 2.5) { return vec3f(0.965, 0.627, 0.043); }
  if (status < 3.5) { return vec3f(0.259, 0.596, 0.965); }
  return vec3f(0.976, 0.686, 0.180);
}

@fragment
fn fs_main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  let resolution = max(params.resolution, vec2f(1.0, 1.0));
  let uv = fragCoord.xy / resolution;
  let point = vec2f(uv.x * params.aspect, uv.y);

  // Drift scales with urgency: a healthy page is nearly static.
  let urgency = select(1.0, 2.2, params.status < 0.5);
  let t = params.time * 0.05 * urgency;

  let field = fbm(point * 2.4 + vec2f(t, t * 0.6));
  let vignette = clamp(1.0 - length(uv - 0.5) * 1.1, 0.0, 1.0);

  let base = vec3f(0.02, 0.02, 0.035);
  let amount = clamp(field * params.intensity * vignette, 0.0, 1.0);

  return vec4f(mix(base, statusTint(params.status), amount), 1.0);
}
`;
