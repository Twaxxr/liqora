import type { GlassRadius } from "./shape.js";
export type GlassMaterial = "clear" | "regular";
export type GlassAppearance = "light" | "dark";
export type GlassBezelProfile = "native" | "convex" | "lip";
export interface MaterialOptions {
  material?: GlassMaterial;
  appearance?: GlassAppearance;
  radius?: GlassRadius;
  /** Follow the nearest shape container; radius controls independent corners. */
  concentric?: boolean | { inset?: number };
  refraction?: number;
  /** Multiplier for optical travel; 1 keeps refraction at its configured strength. */
  refractionLevel?: number;
  /** Blur standard deviation in CSS pixels. Takes precedence over blurAmount. */
  blur?: number;
  /** Normalized blur, 0–1 (0–24 CSS pixels). Omit for the material's blur. */
  blurAmount?: number;
  /** Saturation multiplier. When omitted, the material's tuned saturation is used. */
  saturation?: number;
  /** Relative saturation adjustment, -1–1. saturation takes precedence. */
  saturationAdjustment?: number;
  /** Multiplier for the specular highlight alpha, from 0 to 1. */
  specularOpacity?: number;
  /** Saturation of the transmitted color in the specular rim, independent of the body. */
  specularSaturation?: number;
  /** Additional directional specular intensity, 0–1. */
  specular?: number;
  /** Additional perimeter lighting intensity, 0–1. */
  edgeHighlight?: number;
  /** Grazing-angle reflection intensity, 0–1. */
  fresnel?: number;
  /** Maximum extra red/blue displacement in CSS pixels. Defaults to 0 (off). */
  chromaticAberration?: number;
  /** Normalized red/blue separation, 0–1, relative to optical travel. */
  chromAberration?: number;
  /** Stable small-scale surface distortion, 0–1. */
  distortion?: number;
  /** Numeric alias for radius. radius takes precedence. */
  cornerRadius?: number;
  /** Cross-section radius in CSS pixels. Default: 20. */
  zRadius?: number;
  /** Width of the refracting bezel in CSS pixels. */
  bezelWidth?: number;
  /** Native response, convex lens, or convex outer lip with a concave inner bezel. */
  bezelProfile?: GlassBezelProfile;
  /** 0: biconvex; 1: dome/plano-convex. */
  bevelMode?: 0 | 1;
  /** Material opacity, 0–1; leaves semantic foreground content readable. */
  opacity?: number;
  /** Additive transmitted brightness, -0.5–0.5. */
  brightness?: number;
  /** Cool blue tint strength, 0–1. */
  tintStrength?: number;
  /** Shadow opacity, 0–1. Default: 0. */
  shadowOpacity?: number;
  /** Shadow blur diameter in CSS pixels. Default: 10. */
  shadowSpread?: number;
  /** Shadow vertical offset in CSS pixels. Default: 1. */
  shadowOffsetY?: number;
  /** Enable pointer dragging on this surface. */
  floating?: boolean;
  /** Enable button feedback and flatten optical travel while pressed. */
  button?: boolean;
  /** Optional six-digit hex color, e.g. "#007aff". Omit for untinted glass. */
  tint?: string;
}

export function materialBlur(options: MaterialOptions): number {
  return options.blur ?? (options.blurAmount === undefined ? materials[options.material ?? "clear"].blur : options.blurAmount * 24);
}
export function materialRefraction(options: MaterialOptions, fallback: number = materials[options.material ?? "clear"].refraction): number {
  return (options.refraction ?? fallback) * (options.refractionLevel ?? 1);
}
export function materialDispersion(options: MaterialOptions, travel = materialRefraction(options)): number {
  return options.chromaticAberration ?? (options.chromAberration ?? 0) * travel;
}
export function materialSaturation(options: MaterialOptions, fallback = 1): number {
  return options.saturation ?? (options.saturationAdjustment === undefined ? fallback : 1 + options.saturationAdjustment);
}
export const materialMapKeys = ["zRadius", "bezelWidth", "bezelProfile", "bevelMode", "edgeHighlight", "specular", "fresnel", "distortion"] as const;
export function materialMapOptions(options: MaterialOptions): Pick<MaterialOptions, typeof materialMapKeys[number]> {
  return Object.fromEntries(materialMapKeys.map((key) => [key, options[key]]));
}
/** Reject invalid optical inputs before queuing GPU work or interpolating SVG attributes. */
export function validateMaterial(options: MaterialOptions): void {
  const nonnegative = ["refraction", "refractionLevel", "blur", "saturation", "specularSaturation", "chromaticAberration", "cornerRadius", "shadowSpread"] as const;
  const normalized = ["blurAmount", "specularOpacity", "specular", "edgeHighlight", "fresnel", "chromAberration", "distortion", "opacity", "tintStrength", "shadowOpacity"] as const;
  for (const key of nonnegative) {
    const value = options[key];
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new RangeError(`${key} must be finite and nonnegative.`);
  }
  for (const key of normalized) {
    const value = options[key];
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) throw new RangeError(`${key} must be between 0 and 1.`);
  }
  for (const key of ["zRadius", "bezelWidth"] as const) {
    const value = options[key];
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) throw new RangeError(`${key} must be finite and positive.`);
  }
  for (const [key, limit] of [["brightness", 0.5], ["saturationAdjustment", 1]] as const) {
    const value = options[key];
    if (value !== undefined && (!Number.isFinite(value) || Math.abs(value) > limit)) throw new RangeError(`${key} must be between ${-limit} and ${limit}.`);
  }
  if (options.shadowOffsetY !== undefined && !Number.isFinite(options.shadowOffsetY)) throw new RangeError("shadowOffsetY must be finite.");
  if (options.bevelMode !== undefined && options.bevelMode !== 0 && options.bevelMode !== 1) throw new RangeError("bevelMode must be 0 or 1.");
  if (options.bezelProfile !== undefined && !["native", "convex", "lip"].includes(options.bezelProfile)) throw new RangeError("Unknown bezelProfile.");
}
export const materials = {
  clear: {
    blur: 0,
    refraction: 60,
    // Selective shadow lift / highlight rolloff; preserve the middle tones.
    light: { shadowLift: 0.18, highlightRolloff: 0 },
    dark: { shadowLift: 0.15, highlightRolloff: 0.20 },
  },
  regular: {
    blur: 7.33,
    refraction: 60,
    light: {
      fillSigma: 23,
      fillOpacity: 0.34,
      tone: [0.36, 0.67, -0.1113, 1.1031],
    },
    dark: {
      fillSigma: 21.8,
      fillOpacity: 0.65,
      tone: [0.105, 0.83, -0.2091, 1.0648],
    },
  },
} as const;
