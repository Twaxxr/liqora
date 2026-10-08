import { expect, test } from "bun:test";
import { attachSelectionLens } from "./selection.js";
import type { GlassMotion } from "./interaction.js";

function events() {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    addEventListener(type: string, listener: EventListener) {
      const set = listeners.get(type) ?? new Set(); set.add(listener); listeners.set(type, set);
    },
    removeEventListener(type: string, listener: EventListener) { listeners.get(type)?.delete(listener); },
    send(type: string, props: object) {
      let prevented = false;
      const event = { type, button: 0, pointerId: 1, cancelable: true, preventDefault() { prevented = true; }, stopPropagation() {}, ...props } as unknown as Event;
      for (const listener of listeners.get(type) ?? []) listener(event);
      return prevented;
    },
    count: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

function fixture({ vertical = false, rtl = false, motion = "full", interactive = true, scale = 1 }: {
  vertical?: boolean; rtl?: boolean; motion?: GlassMotion; interactive?: boolean; scale?: number;
} = {}) {
  const view = events(), input = events();
  const list = { ...input, offsetWidth: vertical ? 32 : 158, offsetHeight: vertical ? 158 : 32,
    getAttribute: (key: string) => key === "aria-orientation" ? vertical ? "vertical" : "horizontal" : null,
    dataset: {}, getBoundingClientRect: () => ({ left: 100, top: 50, width: (vertical ? 32 : 158) * scale, height: (vertical ? 158 : 32) * scale }),
    querySelectorAll: () => tabs,
    contains: (node: object) => tabs.some((tab) => tab === node),
  } as unknown as HTMLElement;
  const layer = { parentElement: list };
  let selected = 0, forceActive = false, time = 0;
  const tabs = [46, 54, 52].map((length, i, lengths) => {
    const previous = lengths.slice(0, i).reduce((sum, size) => sum + size, 0);
    const pos = rtl ? 155 - previous - length : 3 + previous;
    return { parentElement: layer, offsetLeft: vertical ? 0 : pos - 3, offsetTop: vertical ? pos - 3 : 0,
      offsetWidth: vertical ? 26 : length, offsetHeight: vertical ? length : 26, disabled: false, clicks: 0,
      getBoundingClientRect: () => ({ left: 100 + (vertical ? 3 : pos) * scale, top: 50 + (vertical ? pos : 3) * scale,
        width: (vertical ? 26 : length) * scale, height: (vertical ? length : 26) * scale }),
      matches() { return this.disabled; },
      closest: (selector: string) => selector === '[role="tablist"]' ? list : tabs[i],
      getAttribute: (key: string) => key === "aria-selected" ? String(selected === i) : null,
      click() { selected = i; this.clicks++; },
    };
  });
  const style = { left: "", top: "", width: "", height: "", scale: "" };
  const dataset: Record<string, string> = {};
  const indicator = { style, dataset, parentElement: list, ownerDocument: { defaultView: view },
    hasAttribute: () => forceActive,
  } as unknown as HTMLElement;
  const animator = attachSelectionLens(indicator, () => motion, interactive);
  const frames = (count = 1) => { let busy: boolean | void; for (let i = 0; i < count; i++) busy = animator.frame(time += 1000 / 60); return busy; };
  frames();
  return { input, view, tabs, animator, style, dataset, frames,
    force: (value: boolean) => { forceActive = value; },
    select: (value: number) => { selected = value; }, selected: () => selected,
    pointer: (at: number, target = tabs[0]) => ({ target, clientX: 100 + (vertical ? 16 : at) * scale, clientY: 50 + (vertical ? at : 16) * scale }),
  };
}

test("the lifted capsule keeps its center and stays inside the bar without selecting", () => {
  const f = fixture();
  try {
    f.force(true); expect(f.frames(100)).toBe(false);
    expect(parseFloat(f.style.left)).toBe(1);
    expect(parseFloat(f.style.width)).toBe(50);
    expect(parseFloat(f.style.top)).toBe(1);
    expect(parseFloat(f.style.height)).toBe(30);
    expect(f.selected()).toBe(0);
    expect(f.dataset.glassLifted).toBe("");
    f.force(false); f.frames(100);
    expect(parseFloat(f.style.left)).toBe(3);
    expect(parseFloat(f.style.width)).toBe(46);
    expect(f.dataset.glassLifted).toBeUndefined();
    f.select(2);
    for (let i = 0; i < 100; i++) {
      f.frames();
      expect(parseFloat(f.style.left)).toBeGreaterThanOrEqual(1);
      expect(parseFloat(f.style.left) + parseFloat(f.style.width)).toBeLessThanOrEqual(157.001);
    }
    expect(parseFloat(f.style.left)).toBe(103);
  } finally { f.animator.dispose(); }
  expect(f.style.width).toBe("");
  expect(f.input.count() + f.view.count()).toBe(0);
});

test("nested label layers preserve lens position and drag in scaled, reduced-motion, RTL and vertical lists", () => {
  for (const options of [{}, { scale: 1.25 }, { motion: "reduced" as const }, { rtl: true }, { vertical: true }]) {
    const f = fixture(options);
    try {
      f.tabs[1]!.disabled = true;
      const start = options.rtl ? 132 : 26, end = options.rtl ? 29 : 129;
      f.input.send("pointerdown", f.pointer(start));
      f.input.send("focusout", { relatedTarget: f.tabs[2] });
      expect(f.view.send("pointermove", f.pointer(end))).toBe(true);
      f.frames(40);
      f.view.send("pointerup", f.pointer(end));
      expect(f.selected()).toBe(2);
      expect(f.tabs[2]!.clicks).toBe(1);
      expect(f.tabs[1]!.clicks).toBe(0);
      expect(f.input.send("click", { isTrusted: true })).toBe(true);
      expect(f.tabs[2]!.clicks).toBe(1);
    } finally { f.animator.dispose(); }
  }
});

test("keyboard lift releases on focus loss and disabled or noninteractive tabs do not lift", () => {
  const f = fixture({ motion: "reduced" });
  try {
    f.input.send("keydown", { target: f.tabs[0], key: " ", repeat: false }); f.frames();
    expect(parseFloat(f.style.height)).toBe(30);
    expect(f.selected()).toBe(0);
    f.input.send("focusout", {}); f.frames();
    expect(parseFloat(f.style.height)).toBe(26);
    f.tabs[0]!.disabled = true;
    f.input.send("pointerdown", f.pointer(26)); f.frames();
    expect(f.dataset.glassLifted).toBeUndefined();
  } finally { f.animator.dispose(); }
  const inert = fixture({ interactive: false });
  try {
    inert.input.send("pointerdown", inert.pointer(26)); inert.frames(30);
    expect(inert.dataset.glassLifted).toBeUndefined();
  } finally { inert.animator.dispose(); }
});
