import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GlassScene, GlassTabs, GlassTabsRoot, GlassTabsList, GlassTabsIndicator, GlassTabsTrigger, GlassTabsContent } from "./index.js";
import { tabBarMaterial, tabSelectionMaterial } from "./tab-materials.js";
import { materialBlur, materialDispersion, materialSaturation } from "../core/materials.js";

test("a regular tab bar keeps a clear selection and inherits only supplied optics", () => {
  const bar = tabBarMaterial({ material: "regular", appearance: "dark" });
  const selection = tabSelectionMaterial({ material: "regular", appearance: "dark" }, {});
  expect(selection.material).toBe("clear");
  expect(selection.appearance).toBe("dark");
  expect(materialBlur(bar)).toBeGreaterThan(materialBlur(selection));
  expect(selection.refraction).toBeLessThan(bar.refraction!);
  const custom = tabSelectionMaterial({ material: "regular", refractionLevel: 0, specularSaturation: 7, tint: "#007aff", radius: 10, floating: true }, {});
  expect(custom.refractionLevel).toBe(0);
  expect(custom.specularSaturation).toBe(7);
  expect(custom.tint).toBe("#007aff");
  expect(custom.radius).toBeUndefined();
  expect(custom.floating).toBeUndefined();
});

test("selection overrides, including zero and normalized aliases, win over inherited optics", () => {
  const options = tabSelectionMaterial({ appearance: "dark", blur: 8, saturation: 2, chromaticAberration: 3, specularOpacity: 0.8 },
    { material: "regular", appearance: "light", blurAmount: 0, saturationAdjustment: -1, chromAberration: 0, specularOpacity: 0 });
  expect(options.material).toBe("regular");
  expect(options.appearance).toBe("light");
  expect(materialBlur(options)).toBe(0);
  expect(materialSaturation(options)).toBe(0);
  expect(materialDispersion(options)).toBe(0);
  expect(options.specularOpacity).toBe(0);
});

test("forceActive and indicator props preserve controlled tabs and stay out of semantic DOM", () => {
  const html = renderToStaticMarkup(<GlassScene appearance="dark" material="regular">
    <GlassTabs value="library" forceActive indicatorProps={{ renderBeforeHydration: true, className: "selection", appearance: "light", refractionLevel: 0, blurAmount: 0 }}
      aria-label="Music" items={[{ value: "listen", label: "Listen", disabled: true }, { value: "library", label: "Library" }]} />
  </GlassScene>);
  expect(html).toMatch(/data-glass-material="clear"[^>]+data-glass-appearance="light"[^>]+lg-tab-indicator selection/);
  expect(html).toContain('data-glass-force-active=""');
  expect(html).toContain('role="tablist"');
  expect(html).toContain('aria-label="Music"');
  expect(html).toMatch(/<button[^>]+disabled=""[^>]*>.*Listen/);
  expect(html).toMatch(/<button[^>]+aria-selected="true"[^>]*>.*Library/);
  for (const key of ["forceActive", "indicatorProps", "refractionLevel", "blurAmount"]) expect(html.toLowerCase()).not.toContain(`${key.toLowerCase()}=`);
});

test("composable tabs retain their panels, orientation and explicit selection material", () => {
  const html = renderToStaticMarkup(<GlassScene><GlassTabsRoot orientation="vertical" defaultValue="listen">
    <GlassTabsList material="clear" forceActive aria-label="Music">
      <GlassTabsIndicator material="regular" forceActive={false} renderBeforeHydration />
      <GlassTabsTrigger value="listen">Listen</GlassTabsTrigger>
      <GlassTabsTrigger value="library">Library</GlassTabsTrigger>
    </GlassTabsList>
    <GlassTabsContent value="listen">Listen panel</GlassTabsContent>
    <GlassTabsContent value="library">Library panel</GlassTabsContent>
  </GlassTabsRoot></GlassScene>);
  expect(html).toContain('aria-orientation="vertical"');
  expect(html).toMatch(/data-glass-material="regular"[^>]+lg-tab-indicator/);
  expect(html).not.toContain("data-glass-force-active");
  expect(html).toContain('role="tabpanel"');
  expect(html).toContain("Listen panel");
});
