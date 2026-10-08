import type { MaterialOptions } from "../core/materials.js";

/** Short bezels keep the centers of compact navigation controls undistorted. */
const bar: MaterialOptions = {
  refraction: 24, bezelProfile: "lip", bezelWidth: 8, zRadius: 8,
  specularOpacity: 0.5, specularSaturation: 1.5, chromAberration: 0.03,
  edgeHighlight: 0.02, fresnel: 0.1,
};
const selection: MaterialOptions = {
  material: "clear", blurAmount: 0, refraction: 12,
  bezelProfile: "convex", bezelWidth: 6, zRadius: 6,
  specularOpacity: 0.65, specularSaturation: 2, chromAberration: 0.04,
  edgeHighlight: 0.04, fresnel: 0.15,
};
const defined = (options: MaterialOptions): MaterialOptions =>
  Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined));

export function tabBarMaterial(options: MaterialOptions): MaterialOptions {
  return { ...bar, ...defined(options) };
}

/** Inherit caller-supplied optics, rather than the outer bar's own defaults.
 * Geometry and interaction belong to each surface; the selection stays clear
 * unless its material is explicitly overridden. */
export function tabSelectionMaterial(inherited: MaterialOptions, options: MaterialOptions): MaterialOptions {
  const { material: _material, radius: _radius, cornerRadius: _corner, concentric: _concentric,
    floating: _floating, button: _button, ...shared } = inherited;
  const result = { ...selection, ...defined(shared), ...defined(options) };
  // A direct alias is more specific than an inherited pixel/multiplier prop.
  for (const [preferred, alias] of [["blur", "blurAmount"], ["saturation", "saturationAdjustment"],
    ["chromaticAberration", "chromAberration"]] as const)
    if (options[alias] !== undefined && options[preferred] === undefined) delete result[preferred];
  return result;
}
