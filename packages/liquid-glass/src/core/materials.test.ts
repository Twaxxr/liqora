import { expect, test } from "bun:test";
import { materialBlur, materialDispersion, materialRefraction, materialSaturation, validateMaterial } from "./materials.js";

test("explicit zero overrides material presets and normalized aliases", () => {
  expect(materialBlur({ material: "regular", blurAmount: 0 })).toBe(0);
  expect(materialBlur({ blur: 0, blurAmount: 1 })).toBe(0);
  expect(materialBlur({ blurAmount: 0.25 })).toBe(6);
  expect(materialRefraction({ refraction: 24, refractionLevel: 0 })).toBe(0);
  expect(materialRefraction({ refractionLevel: 0.5 }, 20)).toBe(10);
  expect(materialRefraction({ refraction: 24 })).toBeCloseTo(10.8);
  expect(materialRefraction({ refraction: 24, refractionLevel: 1 })).toBe(24);
  expect(materialDispersion({ refraction: 24, chromAberration: 0.05 })).toBeCloseTo(0.54);
  expect(materialDispersion({ chromaticAberration: 0, chromAberration: 1 })).toBe(0);
  expect(materialSaturation({ saturation: 0, saturationAdjustment: 1 })).toBe(0);
  expect(materialSaturation({ saturationAdjustment: -1 })).toBe(0);
});

test("invalid material values cannot reach shader bindings or SVG attributes", () => {
  for (const options of [
    { blurAmount: 1.1 }, { refractionLevel: NaN }, { chromAberration: -1 },
    { opacity: Infinity }, { specularOpacity: -1 }, { specularSaturation: -1 },
    { zRadius: 0 }, { bezelWidth: -1 }, { brightness: 0.6 },
    { saturationAdjustment: -2 }, { shadowOffsetY: Infinity }, { shadowSpread: -1 },
  ]) expect(() => validateMaterial(options)).toThrow(RangeError);
  expect(() => validateMaterial({ zRadius: 100, bezelMode: 1, brightness: -0.5, opacity: 0, shadowOffsetY: -10 })).not.toThrow();
});
