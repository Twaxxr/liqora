import { expect, test } from "bun:test";
import { foregroundFilter, overlaps, comparePaintOrder } from "./foreground.js";
import type { ForegroundLens } from "./foreground.js";
import type { MaterialMaps } from "./maps.js";

test("foreground optics use local coordinates and preserve transparent input outside the upper lens", () => {
  const target = { x: 100, y: 200, w: 200, h: 100 } as ForegroundLens;
  const overlay = { x: 150, y: 220, w: 80, h: 60, opacity: .5,
    options: { material: "regular", refraction: 8 },
    maps: { mask: "mask.png", displacement: "map.png" } as MaterialMaps,
  } as ForegroundLens;
  const filter = foregroundFilter("test", target, [overlay]);
  expect(filter).toContain('x="0.24" y="0.18"');
  expect(filter).toContain('scale="0.08"');
  expect(filter).toContain('slope="0.5"');
  expect(filter).toContain('in="SourceGraphic" in2="f0mask" operator="out"');
  expect(filter).not.toContain("feTile");
  expect(filter).not.toContain("outline");
  expect(filter).not.toContain("tableValues");
  expect(overlaps(target, overlay)).toBe(true);
  expect(overlaps(target, { x: 300, y: 200, w: 10, h: 10 })).toBe(false);
});

test("upper lenses process the result of preceding foreground passes", () => {
  const target = { x: 0, y: 0, w: 200, h: 100 } as ForegroundLens;
  const overlay = { ...target, opacity: 1, options: { material: "clear", blur: 2 }, maps: { mask: "mask", displacement: "map" } } as ForegroundLens;
  expect(foregroundFilter("test", target, [overlay, overlay])).toContain('<feGaussianBlur in="f0result"');
});

test("foreground track receives independent RGB travel and specular saturation", () => {
  const target = { x: 0, y: 0, w: 200, h: 72 } as ForegroundLens;
  const overlay = { x: 56, y: 6, w: 88, h: 60, opacity: 1,
    options: { refraction: 24, refractionLevel: 0.5, chromAberration: 0.05, blurAmount: 0, specularOpacity: 0.4, specularSaturation: 7 },
    maps: { mask: "mask", displacement: "map", highlight: "light" },
  } as ForegroundLens;
  const filter = foregroundFilter("track", target, [overlay]);
  expect(filter).toContain('scale="0.126"');
  expect(filter).toContain('scale="0.12"');
  expect(filter).toContain('scale="0.114"');
  expect(filter).not.toContain('feGaussianBlur');
  expect(filter).toContain('type="saturate" values="7"');
  expect(filter).toContain('slope="0.4"');
  expect(filter).toContain('in="SourceGraphic" in2="f0mask" operator="out"');
});

test("a pill between tab labels refracts the shared text layer only inside its capsule", () => {
  const target = { x: 103, y: 203, w: 152, h: 26 } as ForegroundLens;
  const pill = { x: 129, y: 203, w: 50, h: 26, opacity: 1,
    options: { material: "clear", refraction: 12, refractionLevel: 1, blurAmount: 0, chromAberration: 0.04 },
    maps: { mask: "mask", displacement: "map" },
  } as ForegroundLens;
  const first = foregroundFilter("tabs", target, [pill]);
  expect(first).toContain(`x="${24 / 152}" y="${-2 / 26}"`);
  expect(first).toContain(`scale="${2 * 12 / 152}"`);
  expect(first).toContain('in="SourceGraphic" in2="f0mask" operator="out"');
  expect(first).toContain('in="f0refracted" in2="f0mask" operator="in"');
  const second = foregroundFilter("tabs", target, [{ ...pill, x: 143 }]);
  expect(second).toContain(`x="${38 / 152}"`);
  expect(second).not.toEqual(first);
  const off = foregroundFilter("tabs", target, [{ ...pill, options: { ...pill.options, refractionLevel: 0 } }]);
  expect(off).toContain('scale="0"');
  expect(off).not.toContain('redShift');
  expect(first).not.toContain('feTile');
});

test("resting selection lenses leave foreground glyphs untouched without changing other optics", () => {
  const labels = { x: 0, y: 0, w: 152, h: 26 } as ForegroundLens;
  const pill = { x: 0, y: 0, w: 46, h: 26, opacity: 1, foregroundOpacity: 0,
    options: { refraction: 12, chromAberration: 0.04, specularOpacity: 0.65, specularSaturation: 2 },
    maps: { mask: "mask", displacement: "map", highlight: "light" },
  } as ForegroundLens;
  const still = foregroundFilter("labels", labels, [pill]);
  expect(still).not.toContain("feDisplacementMap");
  expect(still).not.toContain("feColorMatrix");
  expect(still).not.toContain("feGaussianBlur");
  const moving = foregroundFilter("labels", labels, [{ ...pill, foregroundOpacity: 1 }]);
  expect(moving).toContain("feDisplacementMap");
  expect(moving).toContain('type="saturate" values="2"');
  const otherLens = foregroundFilter("labels", labels, [pill, { ...pill, foregroundOpacity: undefined }]);
  expect(otherLens).toContain('in="SourceGraphic"');
  expect(otherLens).toContain('result="f1result"');
  expect(otherLens).not.toContain('result="f0result"');
});

test("paint order respects positioner stacking before DOM order", () => {
  const originalStyle = globalThis.getComputedStyle;
  const originalNode = globalThis.Node;
  const root = { parentElement: null };
  const a = { parentElement: root, style: { position: "absolute", zIndex: "20" }, compareDocumentPosition: () => 4 };
  const b = { parentElement: root, style: { position: "relative", zIndex: "auto" }, compareDocumentPosition: () => 2 };
  try {
    globalThis.Node = { DOCUMENT_POSITION_FOLLOWING: 4 } as typeof Node;
    globalThis.getComputedStyle = ((node: typeof a) => node.style) as unknown as typeof getComputedStyle;
    expect(comparePaintOrder(a as unknown as HTMLElement, b as unknown as HTMLElement)).toBeGreaterThan(0);
    a.style.zIndex = "0";
    expect(comparePaintOrder(a as unknown as HTMLElement, b as unknown as HTMLElement)).toBeLessThan(0);
  } finally {
    globalThis.getComputedStyle = originalStyle;
    globalThis.Node = originalNode;
  }
});

test("foreground optical buffers cover RGB and blur sampling without processing the full target", () => {
  const target = { x: 0, y: 0, w: 1920, h: 1080 } as ForegroundLens;
  const overlay = { x: 800, y: 500, w: 90, h: 60, opacity: 1,
    options: { refraction: 24, chromAberration: .05, blur: .2, specularSaturation: 7, specularOpacity: .4 },
    maps: { mask: "mask", displacement: "map", highlight: "highlight" },
  } as ForegroundLens;
  const markup = foregroundFilter("large", target, [overlay]);
  const tag = /<feGaussianBlur\b[^>]*>/.exec(markup)![0];
  const value = (name: string) => Number(new RegExp(`\\b${name}="([^"]+)"`).exec(tag)![1]);
  const left = value("x") * target.w, top = value("y") * target.h;
  const width = value("width") * target.w, height = value("height") * target.h;
  expect(left).toBeLessThan(overlay.x - 24 * 1.05 - .6);
  expect(top).toBeLessThan(overlay.y - 24 * 1.05 - .6);
  expect(left + width).toBeGreaterThan(overlay.x + overlay.w + 24 * 1.05 + .6);
  expect(top + height).toBeGreaterThan(overlay.y + overlay.h + 24 * 1.05 + .6);
  expect(width * height).toBeLessThan(target.w * target.h * .02);
  // The original foreground outside the mask retains its full filter region.
  expect(markup).toContain('<feComposite in="SourceGraphic" in2="f0mask" operator="out" result="f0outside"/>');
});
