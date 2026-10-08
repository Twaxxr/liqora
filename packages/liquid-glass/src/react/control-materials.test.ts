import { expect, test } from "bun:test";
import { materialBlur, materialDispersion, materialRefraction } from "../core/materials.js";
import { controlThumbMaterial } from "./control-materials.js";

test("pressed controls use the reference's independent specular, refraction and pixel blur values", () => {
  const slider = controlThumbMaterial("slider", {}), toggle = controlThumbMaterial("switch", {});
  expect(slider.specularOpacity).toBe(0.4);
  expect(slider.specularSaturation).toBe(7);
  expect(slider.refractionLevel).toBe(0.45);
  expect(materialBlur(slider)).toBe(0);
  expect(slider.bezelProfile).toBe("convex");
  expect(toggle.specularOpacity).toBe(0.5);
  expect(toggle.specularSaturation).toBe(6);
  expect(toggle.refractionLevel).toBe(0.45);
  expect(materialBlur(toggle)).toBe(0.2);
  expect(toggle.bezelProfile).toBe("lip");
});

test("caller zeroes, normalized blur and pixel overrides take precedence over control presets", () => {
  for (const kind of ["slider", "switch"] as const) {
    const off = controlThumbMaterial(kind, { refractionLevel: 0, specularOpacity: 0, chromaticAberration: 0, blurAmount: 0 });
    expect(materialRefraction(off)).toBe(0);
    expect(materialDispersion(off)).toBe(0);
    expect(off.specularOpacity).toBe(0);
    expect(materialBlur(off)).toBe(0);
    expect(materialBlur(controlThumbMaterial(kind, { blurAmount: 0.25 }))).toBe(6);
    expect(materialBlur(controlThumbMaterial(kind, { blur: 0.1, blurAmount: 1 }))).toBe(0.1);
    expect(controlThumbMaterial(kind, { specularOpacity: undefined }).specularOpacity).toBeGreaterThan(0);
  }
});
