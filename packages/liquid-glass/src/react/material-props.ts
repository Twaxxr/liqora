import type { MaterialOptions } from "../core/materials.js";

// Remove optical props before spreading the remaining props onto semantic DOM.
const keys = ["refractionLevel", "blur", "blurAmount", "saturationAdjustment", "specularSaturation", "specular", "edgeHighlight", "fresnel", "chromAberration", "distortion", "cornerRadius", "zRadius", "bezelWidth", "bezelProfile", "bevelMode", "opacity", "brightness", "tintStrength", "shadowOpacity", "shadowSpread", "shadowOffsetY", "floating", "button"] as const;
type ExtraMaterial = Pick<MaterialOptions, typeof keys[number]>;
export function splitMaterialProps<T extends ExtraMaterial>(input: T): [ExtraMaterial, Omit<T, keyof ExtraMaterial>] {
  const optics: Record<string, unknown> = {}, rest: Record<string, unknown> = { ...input };
  for (const key of keys) {
    if (input[key] !== undefined) optics[key] = input[key];
    delete rest[key];
  }
  return [optics as ExtraMaterial, rest as Omit<T, keyof ExtraMaterial>];
}
