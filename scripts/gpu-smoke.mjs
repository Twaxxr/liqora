import { insetShape, concentricOutline, bezelTravel } from "../packages/liquid-glass/dist/core.js";
import { init } from "../packages/liquid-glass/node_modules/vgpu/dist/node.js";
import { MaterialRenderer } from "../packages/liquid-glass/dist/gpu.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
const gpu = await init();
const renderer = new MaterialRenderer(gpu);
try {
  const map = await renderer.render({
    width: 100,
    height: 60,
    radius: 30,
    dpr: 1,
  });
  const pixel = (plane, x, y) => [
    ...map.pixels.slice(
      ((plane * map.height + y) * map.width + x) * 4,
      ((plane * map.height + y) * map.width + x) * 4 + 4,
    ),
  ];
  console.log({
    size: [map.width, map.height],
    time: map.duration,
    center: pixel(1, 52, 32),
    corner: pixel(1, 0, 0),
    leftDisplacement: pixel(0, 3, 32),
    rightDisplacement: pixel(0, 100, 32),
  });
  if (
    pixel(1, 52, 32)[3] !== 255 ||
    pixel(1, 0, 0)[3] !== 0 ||
    pixel(0, 3, 32)[0] <= 128 ||
    pixel(0, 100, 32)[0] >= 128
  )
    throw new Error("GPU map invariant failed");
  // Capsules must leave their side arcs to the outline, rather than wrapping
  // the bright top/bottom band around the full perimeter.
  for (const dpr of [1, 2]) {
    const capsule = await renderer.render({ width: 284, height: 112, radius: 56, dpr });
    let highlight = 0, sideHighlight = 0, outline = 0;
    for (let y = 0; y < capsule.height; y++) {
      for (let x = 0; x < capsule.width; x++) {
        const alpha = capsule.pixels[((2 * capsule.height + y) * capsule.width + x) * 4 + 3];
        highlight += alpha;
        // The corner transition shares light and outline; the middle of each
        // side remains free of the top/bottom highlight.
        if (y / dpr >= 40 && y / dpr <= 76) sideHighlight += alpha;
        outline += capsule.pixels[((3 * capsule.height + y) * capsule.width + x) * 4 + 3];
      }
    }
    console.log({ dpr, highlight, sideHighlight, outline });
    if (highlight === 0 || outline === 0 || sideHighlight / highlight > 0.01)
      throw new Error("Capsule highlight overlaps the side outline");
  }
  // Fixed end caps plus a stretched straight middle must reproduce the GPU
  // fields of the actual narrow/wide tabs, for all four optical planes.
  for (const dpr of [1, 2]) {
    const baked = await renderer.render({ width: 90, height: 30, radius: "capsule", dpr });
    const cap = 32 * dpr;
    for (const width of [75, 100, 118]) {
      const actual = await renderer.render({ width, height: 30, radius: "capsule", dpr });
      let maxError = 0;
      for (let plane = 0; plane < 4; plane++) for (let y = 0; y < actual.height; y++) for (let x = 0; x < actual.width; x++) {
        const sx = x < cap ? x : x >= actual.width - cap ? baked.width - (actual.width - x) :
          cap + Math.floor((x - cap + 0.5) * (baked.width - 2 * cap) / (actual.width - 2 * cap));
        for (let channel = 0; channel < 4; channel++) {
          const a = actual.pixels[((plane * actual.height + y) * actual.width + x) * 4 + channel];
          const b = baked.pixels[((plane * baked.height + y) * baked.width + sx) * 4 + channel];
          maxError = Math.max(maxError, Math.abs(a - b));
        }
      }
      console.log({ capsuleWidth: width, dpr, slicedMapMaxError: maxError });
      // Odd physical widths shift fragment derivative pairs at the right edge;
      // allow their small AA difference at 1x. At 2x these fields match exactly.
      if (maxError > (dpr === 1 ? 10 : 1)) throw new Error("Sliced capsule differs from its exact GPU field");
    }
  }
  // Verify Lisse's fixed, zero-radius, circular and vertical capsule masks on
  // the actual GPU. Symmetry catches quadrant clipping and normal-sign errors.
  for (const geometry of [
    { width: 80, height: 60, radius: 0 },
    { width: 80, height: 60, radius: 14 },
    { width: 32, height: 32, radius: "circle" },
    { width: 32, height: 100, radius: "capsule" },
  ]) {
    const map = await renderer.render(geometry);
    const alpha = (x, y) => map.pixels[((map.height + y) * map.width + x) * 4 + 3];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (Math.abs(alpha(x,y)-alpha(map.width-1-x,y)) > 2 ||
            Math.abs(alpha(x,y)-alpha(x,map.height-1-y)) > 2)
          throw new Error(`Asymmetric Lisse mask: ${JSON.stringify(geometry)}`);
      }
    }
    if (alpha(Math.floor(map.width/2), Math.floor(map.height/2)) !== 255 || alpha(0,0) !== 0)
      throw new Error("Lisse mask has invalid interior or exterior coverage");
    console.log({ geometry, mask: "symmetric; interior and exterior coverage correct" });
  }
  const inherited = concentricOutline(insetShape({width:176,height:190,radius:40},4),{x:4,y:4,width:168,height:28},8);
  for (const dpr of [1,2]) {
    const map = await renderer.render({width:168,height:28,radius:8,outline:inherited,dpr});
    let checked=0;
    for(let y=0;y<map.height;y++) for(let x=0;x<map.width;x++) {
      const px=(x+0.5)/dpr-2,py=(y+0.5)/dpr-2;
      let inside=false, distance=Infinity;
      for(let i=0;i<inherited.length;i++) {
        const a=inherited[i],b=inherited[(i+1)%inherited.length];
        if((a[1]>py)!==(b[1]>py) && px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0]) inside=!inside;
        const dx=b[0]-a[0],dy=b[1]-a[1],len=dx*dx+dy*dy;
        if(len<1e-10) continue;
        const t=Math.max(0,Math.min(1,((px-a[0])*dx+(py-a[1])*dy)/len));
        distance=Math.min(distance,Math.hypot(px-a[0]-t*dx,py-a[1]-t*dy));
      }
      if(distance<2) continue;
      const alpha=map.pixels[((map.height+y)*map.width+x)*4+3];
      if(alpha!==(inside?255:0)) throw new Error(`Concentric GPU coverage disagrees with contour at ${px},${py}`);
      checked++;
    }
    console.log({dpr,concentricPixelsChecked:checked,mask:"asymmetric inherited contour matches CPU"});
  }
  // Concurrent readbacks must retain their own geometry and shader parameters.
  const geometries = Array.from({ length: 12 }, (_, i) => ({
    width: 46 + i * 3, height: 26 + i % 3,
    radius: i % 2 ? "capsule" : 8, dpr: i % 2 + 1,
    appearance: i % 3 ? "light" : "dark",
    bezelProfile: ["native", "convex", "lip"][i % 3],
    zRadius: 10 + i, bezelWidth: 8 + i, bevelMode: i % 2,
    specular: i / 12, edgeHighlight: i / 24, fresnel: i / 12, distortion: i / 24,
  }));
  const expected = [];
  for (const geometry of geometries) expected.push(await renderer.render(geometry));
  const concurrent = await Promise.all(geometries.map((geometry) => renderer.render(geometry)));
  concurrent.forEach((map, i) => {
    if (map.pixels.length !== expected[i].pixels.length ||
      map.pixels.some((value, offset) => value !== expected[i].pixels[offset]))
      throw new Error(`Concurrent map ${i} differs from its sequential pixels`);
  });
  console.log({ concurrentMaps: concurrent.length, pixels: "identical to sequential rendering" });

  // Read the signed top-bezel travel from the actual production shader and
  // compare with the CPU Snell reference. A lip must reverse the inner field;
  // the convex field must stay positive and reach zero at the bezel's end.
  let profileMaxError = 0, reversedLip = false;
  const profileMaps = [];
  for (const profile of ["native", "convex", "lip"]) for (const bevelMode of [0, 1]) {
    const map = await renderer.render({ width: 88, height: 60, radius: "capsule", dpr: 1,
      bezelProfile: profile, bezelWidth: 10, zRadius: 10, bevelMode });
    profileMaps.push(map);
    for (const depth of [0.5, 2.5, 4.5, 6.5, 8.5, 10.5]) {
      const y = depth + 1.5, x = 46;
      const actual = map.pixels[(y * map.width + x) * 4 + 1] / 255 * 2 - 1;
      const expected = bezelTravel(depth, 10, 10, profile, bevelMode);
      const error = Math.abs(actual - expected);
      profileMaxError = Math.max(profileMaxError, error);
      if (error > 2 / 255) throw new Error(`${profile}/${bevelMode} bezel disagrees with CPU at depth ${depth}: ${actual} vs ${expected}`);
      if (profile === "lip" && actual < -0.05) reversedLip = true;
    }
  }
  if (!reversedLip) throw new Error("The switch lip does not reverse inner refraction");
  console.log({ profiles: 6, profileMaxError, tolerance: 2 / 255, reversedLip });

  // A sharp centered track must be sampled again in the bezel, with a clear
  // gap between that image and the unshifted center. Check both control sizes.
  for (const [width, height, refraction, bezel, trackHeight] of [[25, 20, 24, 6, 6], [88, 60, 60, 20, 14]]) {
    const map = await renderer.render({ width, height, radius: "capsule", bezelProfile: "convex", bezelWidth: bezel, zRadius: bezel });
    const x = Math.floor(map.width / 2);
    let repeatedRows = 0, clearRows = 0;
    for (let y = 2; y < height / 2 - trackHeight / 2; y++) {
      const offset = (y * map.width + x) * 4;
      const travel = (map.pixels[offset + 1] / 255 * 2 - 1) * refraction;
      const sampleY = y + 0.5 - 2 - height / 2 + travel;
      if (Math.abs(sampleY) < trackHeight / 2) repeatedRows++;
      else if (repeatedRows) clearRows++;
    }
    if (repeatedRows < 2 || clearRows < 1) throw new Error(`No separated track image in ${width}x${height} bezel: ${repeatedRows} repeated, ${clearRows} clear`);
    console.log({ controlSize: [width, height], repeatedRows, clearRows });
  }
  // Compact tab bezels must bend only the edge, keeping a flat center behind
  // the labels. Check both resting layers and the lifted selection at 1x/2x
  // in each appearance, using the production WGSL and real GPU readbacks.
  let tabReadbacks = 0, tabGlyphChecks = 0;
  for (const dpr of [1, 2]) for (const appearance of ["light", "dark"]) {
    const layers = [
      { width: 158, height: 32, bezelProfile: "lip", bezelWidth: 8, zRadius: 8, edgeHighlight: 0.02, fresnel: 0.1 },
      { width: 46, height: 26, bezelProfile: "convex", bezelWidth: 6, zRadius: 6, edgeHighlight: 0.04, fresnel: 0.15 },
      { width: 50, height: 30, bezelProfile: "convex", bezelWidth: 6, zRadius: 6, edgeHighlight: 0.04, fresnel: 0.15 },
    ];
    const maps = await Promise.all(layers.map((geometry) => renderer.render({ ...geometry, radius: "capsule", dpr, appearance })));
    maps.forEach((map, i) => {
      const read = (plane, x, y, channel) => map.pixels[((plane * map.height + y) * map.width + x) * 4 + channel];
      const cx = Math.floor(map.width / 2), cy = Math.floor(map.height / 2);
      if (read(1, cx, cy, 3) !== 255 || read(1, 0, 0, 3) !== 0 ||
          Math.abs(read(0, cx, cy, 0) - 127.5) > 0.5 || Math.abs(read(0, cx, cy, 1) - 127.5) > 0.5 ||
          read(2, cx, cy, 3) !== 0)
        throw new Error(`Tab layer ${i} distorts or illuminates its flat center (${appearance}, ${dpr}x)`);
      let edgeBends = false, lipReverses = false, rimLights = false;
      for (let y = 2 * dpr; y < cy; y++) {
        const travel = read(0, cx, y, 1) / 255 * 2 - 1;
        edgeBends ||= travel > 0.1;
        lipReverses ||= travel < -0.03;
        rimLights ||= read(2, cx, y, 3) > 0;
      }
      if (!edgeBends || !rimLights || layers[i].bezelProfile === "lip" && !lipReverses)
        throw new Error(`Tab layer ${i} has no refracting/lit bezel (${appearance}, ${dpr}x)`);
      tabReadbacks++;
    });
    // Model a sharp vertical glyph stroke in the live label layer using the
    // SVG displacement equation and the GPU's actual capsule field. A fold
    // samples that stroke twice inside the pill, separated by a clear gap.
    // This is an optical readback check, not a DOM/browser screenshot.
    const pill = maps[1], cy = Math.floor(pill.height / 2);
    const strokes = (level) => {
      let runs = 0, previous = false;
      for (let x = 2 * dpr; x < pill.width / 2; x++) {
        const index = (cy * pill.width + x) * 4;
        const sourceX = (x + 0.5) / dpr - 2 + (pill.pixels[index] / 255 * 2 - 1) * 12 * level;
        const inside = pill.pixels[(pill.height * pill.width * 4) + index + 3] > 0;
        const lit = inside && sourceX >= 6 && sourceX < 8;
        if (lit && !previous) runs++;
        previous = lit;
      }
      return runs;
    };
    const bent = strokes(1), flat = strokes(0);
    if (bent < 2 || flat !== 1) throw new Error(`Tab pill does not repeat a label stroke inside its bezel: ${bent} bent, ${flat} flat (${appearance}, ${dpr}x)`);
    tabGlyphChecks++;
  }
  console.log({ tabReadbacks, tabGlyphChecks, tabBezel: "refracting rim, clear center, repeated label stroke inside the pill; level 0 removes the repeat" });
  if (process.env.LIQORA_GPU_ARTIFACT_DIR) {
    const directory = process.env.LIQORA_GPU_ARTIFACT_DIR;
    mkdirSync(directory, { recursive: true });
    const first = profileMaps[0];
    const png = new PNG({ width: first.width * 6, height: first.height * 4 });
    profileMaps.forEach((map, index) => {
      for (let y = 0; y < map.height * 4; y++) {
        const from = y * map.width * 4, to = (y * png.width + index * map.width) * 4;
        png.data.set(map.pixels.subarray(from, from + map.width * 4), to);
      }
    });
    writeFileSync(join(directory, "bezel-fields.png"), PNG.sync.write(png));
    writeFileSync(join(directory, "bezel-readback.json"), JSON.stringify({ profileMaxError, tolerance: 2 / 255, reversedLip }, null, 2));
  }
} finally {
  renderer.dispose();
}
