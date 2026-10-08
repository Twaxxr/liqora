import { effect, frame, init, target } from "../packages/liquid-glass/node_modules/vgpu/dist/node.js";
import { MaterialRenderer, materialShader, mapScale } from "../packages/liquid-glass/dist/gpu.js";
import { shapeSegments } from "../packages/liquid-glass/src/core/shape.ts";
import { concentricOutline, insetShape } from "../packages/liquid-glass/dist/core.js";
import assert from "node:assert/strict";

// The fragment shader is the optical reference, including the persistent map
// fingerprint. Compare every RGBA byte against the production compute path.
const benchmark = !process.argv.includes("--check");
const gpu = await init(benchmark ? { requiredFeatures: ["timestamp-query"] } : {});
const renderer = new MaterialRenderer(gpu);
const blank = { size: [1, 1], row: 0, rows: 1, columns: 1, dpr: 1, dark: 0, symmetric: 1,
  start: 0, count: 0, pad: [0, 0], optics: [20, 20, 0, 0], lighting: [0, 0, 0, 0] };
const reference = effect(gpu, materialShader, { set: {
  batch: { count: 1, pad: [0, 0, 0], shapes: Array.from({ length: 32 }, () => blank) },
  outline: { segments: Array.from({ length: 4096 }, () => [0, 0, 0, 0]) },
} });
let atlas;
async function original(geometries) {
  const measured = geometries.map((g) => ({ g, dpr: mapScale(g), columns: Math.ceil((g.width + 4) * mapScale(g)), rows: Math.ceil((g.height + 4) * mapScale(g)) }));
  const table = [], bands = [];
  let row = 0;
  const entries = measured.map(({ g, dpr, columns, rows }) => {
    const segments = g.outline
      ? g.outline.map((a, i) => [...a, ...g.outline[(i + 1) % g.outline.length]]).filter(([x, y, u, v]) => Math.hypot(u - x, v - y) > 0.00001)
      : shapeSegments(g.width, g.height, g.radius).segments;
    const start = table.length;
    table.push(...segments);
    bands.push(row);
    const entry = { size: [g.width, g.height], row, rows, columns, dpr, dark: g.appearance === "dark" ? 1 : 0,
      symmetric: g.outline ? 0 : 1, start, count: segments.length, pad: [0, 0],
      optics: [g.bezelWidth ?? g.zRadius ?? 20, g.zRadius ?? 20, g.bezelProfile === "convex" ? 1 : g.bezelProfile === "lip" ? 2 : 0, g.bevelMode ?? 0],
      lighting: [g.edgeHighlight ?? 0, g.specular ?? 0, g.fresnel ?? 0, g.distortion ?? 0] };
    row += rows * 4;
    return entry;
  });
  const width = Math.max(...measured.map((s) => s.columns));
  while (entries.length < 32) entries.push({ ...entries[0], row: row + 2 });
  while (table.length < 4096) table.push([0, 0, 0, 0]);
  if (!atlas) atlas = target(gpu, { size: [width, row], label: "liquid-glass/reference" });
  else atlas.resize([width, row]);
  reference.set({ batch: { count: geometries.length, pad: [0, 0, 0], shapes: entries }, outline: { segments: table } });
  frame(gpu, (f) => f.pass({ target: atlas, clear: [0, 0, 0, 0] }, reference));
  const rgba = await atlas.color.read({ mipLevel: 0, region: "all" });
  return measured.map((s, i) => {
    const pixels = new Uint8Array(s.columns * s.rows * 16);
    for (let y = 0; y < s.rows * 4; y++) {
      const start = (bands[i] + y) * width * 4;
      pixels.set(rgba.subarray(start, start + s.columns * 4), y * s.columns * 4);
    }
    return pixels;
  });
}

// vgpu's public timer covers render passes. Add the same native timestamp pair
// to its compute pass for this measurement only; production uses no hooks.
async function timed(work) {
  const device = gpu.gpu;
  const querySet = device.createQuerySet({ type: "timestamp", count: 2 });
  const resolve = device.createBuffer({ size: 256, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
  const readback = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  const create = device.createCommandEncoder;
  let captured = false;
  device.createCommandEncoder = function (options) {
    const encoder = create.call(device, options);
    for (const name of ["beginRenderPass", "beginComputePass"]) {
      const begin = encoder[name].bind(encoder);
      encoder[name] = (descriptor) => {
        if (captured) return begin(descriptor);
        captured = true;
        return begin({ ...descriptor, timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } });
      };
    }
    return encoder;
  };
  try {
    const start = performance.now();
    const result = await work();
    const wall = performance.now() - start;
    assert(captured, "GPU workload was not captured");
    device.createCommandEncoder = create;
    const encoder = device.createCommandEncoder();
    encoder.resolveQuerySet(querySet, 0, 2, resolve, 0);
    encoder.copyBufferToBuffer(resolve, 0, readback, 0, 16);
    device.queue.submit([encoder.finish()]);
    await readback.mapAsync(GPUMapMode.READ);
    const times = new BigUint64Array(readback.getMappedRange(), 0, 2);
    const duration = Number(times[1] - times[0]) / 1e6;
    readback.unmap();
    return { result, gpu: duration, wall };
  } finally {
    device.createCommandEncoder = create;
    querySet.destroy(); resolve.destroy(); readback.destroy();
  }
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
try {
  await renderer.warmed;
  await reference.compile({ colors: ["rgba8unorm"] });
  const cases = [];
  for (const dpr of [1, 1.25, 2]) for (const appearance of ["light", "dark"]) {
    cases.push(
      { width: 90, height: 60, radius: "capsule", dpr, appearance, bezelProfile: "convex", bezelWidth: 6, zRadius: 6 },
      { width: 131.4, height: 82.8, radius: "capsule", dpr, appearance, bezelProfile: "lip", bezelWidth: 10, zRadius: 10 },
      { width: 51.3, height: 26, radius: "capsule", dpr, appearance, bezelProfile: "convex", specular: .4, edgeHighlight: .2, fresnel: 1, distortion: .15 },
      { width: 80, height: 60, radius: 14, dpr, appearance },
      { width: 30, height: 100, radius: "capsule", dpr, appearance },
    );
  }
  cases.push({ width: 32, height: 32, radius: "circle", dpr: 2 }, { width: 80, height: 60, radius: 0, dpr: 1 });
  const outline = concentricOutline(insetShape({ width: 176, height: 190, radius: 40 }, 4), { x: 4, y: 4, width: 168, height: 28 }, 8);
  for (const dpr of [1, 2]) cases.push({ width: 168, height: 28, radius: 8, dpr, outline, bezelProfile: "lip", distortion: .1 });
  // The selection crosses short, changing capsules; submenus have long
  // straight sides. Cover both paths, including fractional sizes and DPR.
  for (const dpr of [1, 1.25, 2]) for (const radius of [0, 28, 80]) {
    cases.push({ width: 320, height: 740, radius, dpr, appearance: "dark", bezelProfile: "lip", specular: .4, edgeHighlight: .2, fresnel: 1, distortion: .15 });
  }
  for (const [width, height] of [[46, 26], [50, 30], [54.317, 27.613], [57.839, 25.579], [30, 54], [102.375, 61.281]]) {
    cases.push({ width, height, radius: "capsule", dpr: 2, bezelProfile: "convex", bezelWidth: 6, zRadius: 6 });
  }
  let bytes = 0, changed = 0, maxError = 0;
  for (const geometry of cases) {
    const [expected] = await original([geometry]);
    const { pixels } = await renderer.render(geometry);
    assert.equal(pixels.length, expected.length);
    for (let i = 0; i < pixels.length; i++) {
      const error = Math.abs(pixels[i] - expected[i]);
      maxError = Math.max(maxError, error);
      if (error) changed++;
    }
    bytes += pixels.length;
  }
  assert.equal(changed, 0, `Map regression: ${changed} bytes differ, max error ${maxError}`);
  console.log(JSON.stringify({ comparison: { geometries: cases.length, bytes, changed, maxError } }));
  if (!benchmark) {
    for (const [name, batch] of [
      ["controls", cases.slice(0, 12)],
      ["submenus-and-tabs", [
        { width: 320, height: 740, radius: 28, dpr: 1, appearance: "dark" },
        ...cases.slice(-6),
        { width: 300, height: 690, radius: 28, dpr: 1, appearance: "light", distortion: .15 },
      ]],
    ]) {
      const expected = await original(batch);
      const actual = await Promise.all(batch.map((g) => renderer.render(g)));
      for (let i = 0; i < batch.length; i++) assert.deepEqual(actual[i].pixels, expected[i]);
      console.log(JSON.stringify({ batchedComparison: { name, geometries: batch.length, changed: 0 } }));
    }
  } else for (const [name, geometries] of [
    ["slider", [cases[10]]],
    ["switch", [cases[11]]],
    ["large-surface", [{ width: 960, height: 540, radius: 40, dpr: 2, appearance: "dark" }]],
    ["tab-selection", [{ width: 54.317, height: 27.613, radius: "capsule", dpr: 2, bezelProfile: "convex", bezelWidth: 6, zRadius: 6 }]],
    ["configuration-submenu", [{ width: 320, height: 740, radius: 28, dpr: 2, appearance: "dark" }]],
    ["control-batch", cases.slice(0, 12)],
  ]) {
    const before = [], after = [], beforeWall = [], afterWall = [];
    // Interleave measurements and omit warm-up to avoid compilation bias.
    for (let i = 0; i < 14; i++) {
      const old = await timed(() => original(geometries));
      const next = await timed(() => Promise.all(geometries.map((g) => renderer.render(g))));
      if (i === 0) for (let j = 0; j < geometries.length; j++) assert.deepEqual(next.result[j].pixels, old.result[j]);
      if (i < 4) continue;
      before.push(old.gpu); after.push(next.gpu); beforeWall.push(old.wall); afterWall.push(next.wall);
    }
    console.log(JSON.stringify({ workload: name, samples: before.length,
      gpuMs: { before: median(before), after: median(after), reduction: 1 - median(after) / median(before) },
      readbackMs: { before: median(beforeWall), after: median(afterWall) } }));
  }
} finally {
  renderer.dispose();
}
