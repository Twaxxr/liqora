import type { MaterialOptions } from "../core/materials.js";

const presets: Record<"slider" | "switch", MaterialOptions> = {
  slider: {
    material: "clear", refraction: 24, refractionLevel: 0.45, blur: 0,
    bezelProfile: "convex", bezelWidth: 6, zRadius: 6,
    specularOpacity: 0.4, specularSaturation: 7, chromAberration: 0.05,
  },
  switch: {
    material: "clear", refraction: 20, refractionLevel: 0.45, blur: 0.2,
    bezelProfile: "lip", bezelWidth: 10, zRadius: 10,
    specularOpacity: 0.5, specularSaturation: 6, chromAberration: 0.05,
  },
};

/** Keep the pressed optical response consistent across native value controls. */
export function controlThumbMaterial(kind: "slider" | "switch", options: MaterialOptions): MaterialOptions {
  const result = { ...presets[kind], ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) };
  // A supplied normalized blur must override the preset's pixel value.
  if (options.blurAmount !== undefined && options.blur === undefined) delete result.blur;
  return result;
}
