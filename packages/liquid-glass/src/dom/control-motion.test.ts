import { expect, test } from "bun:test";
import { attachNativeControlMotion, updateControlMotion } from "./control-motion.js";

test("optical sampling sees the spring position before paint, once per frame", () => {
  const observer = globalThis.MutationObserver;
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  } as unknown as typeof MutationObserver;
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0, layoutX = 100;
  const style = {
    translate: "",
    setProperty() {},
    removeProperty() {},
  };
  const view = {
    requestAnimationFrame: (callback: FrameRequestCallback) => { callbacks.set(++id, callback); return id; },
    cancelAnimationFrame: (key: number) => { callbacks.delete(key); },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
  };
  const element = {
    ownerDocument: { defaultView: view, addEventListener() {}, removeEventListener() {} },
    classList: { contains: (name: string) => name === "lg-switch-thumb" },
    dataset: { pressPhase: "idle" },
    parentElement: null,
    style,
    getBoundingClientRect: () => ({ left: layoutX + (parseFloat(style.translate) || 0), width: 0 }),
  } as unknown as HTMLElement;
  const root = { contains: (candidate: HTMLElement) => candidate === element } as HTMLElement;
  let dispose: (() => void) | undefined;
  try {
    dispose = attachNativeControlMotion(element, "full", true);
    updateControlMotion(root, 100);
    layoutX = 118; // React commits the other side before the next scene frame.
    updateControlMotion(root, 116.667);
    const sampledX = element.getBoundingClientRect().left;
    expect(sampledX).toBeGreaterThan(100);
    expect(sampledX).toBeLessThan(102);
    // The scene's scheduled callback must not advance the thumb again after sampling.
    updateControlMotion(root, 116.667);
    expect(element.getBoundingClientRect().left).toBe(sampledX);
    expect(callbacks.size).toBe(1);
    const [key, callback] = [...callbacks][0]!;
    callbacks.delete(key);
    callback(133.334);
    const nextX = element.getBoundingClientRect().left;
    updateControlMotion(root, 133.334);
    expect(element.getBoundingClientRect().left).toBe(nextX);
    expect(nextX).toBeGreaterThan(sampledX);
    dispose(); dispose = undefined;
    expect(callbacks.size).toBe(0);
  } finally {
    dispose?.();
    globalThis.MutationObserver = observer;
  }
});

test("stationary controls do not rewrite styles and offscreen controls cancel their frame work", () => {
  const savedObserver = globalThis.MutationObserver, savedIntersection = globalThis.IntersectionObserver;
  globalThis.MutationObserver = class { observe() {} disconnect() {} } as unknown as typeof MutationObserver;
  let intersect: IntersectionObserverCallback = () => {};
  globalThis.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {} disconnect() {}
  } as unknown as typeof IntersectionObserver;
  const callbacks = new Map<number, FrameRequestCallback>();
  let id = 0, writes = 0;
  const view = {
    requestAnimationFrame: (callback: FrameRequestCallback) => { callbacks.set(++id, callback); return id; },
    cancelAnimationFrame: (key: number) => callbacks.delete(key),
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    addEventListener() {}, removeEventListener() {},
  };
  const document = Object.assign(new EventTarget(), { defaultView: view, visibilityState: "visible" });
  const style = new Proxy({ translate: "", scale: "", setProperty: () => { writes++; }, removeProperty: () => { writes++; } }, {
    set(target, key, value) { writes++; return Reflect.set(target, key, value); },
  });
  const dataset = new Proxy({ pressPhase: "idle" }, { set(target, key, value) { writes++; return Reflect.set(target, key, value); } });
  const element = { ownerDocument: document, style, dataset, classList: { contains: () => true }, parentElement: null,
    getBoundingClientRect: () => ({ left: 100, width: 30 }) } as unknown as HTMLElement;
  const root = { contains: (candidate: HTMLElement) => candidate === element } as HTMLElement;
  let dispose: (() => void) | undefined;
  try {
    dispose = attachNativeControlMotion(element, "full", true);
    const start = performance.now();
    updateControlMotion(root, start);
    const initial = writes;
    for (let i = 1; i < 30; i++) updateControlMotion(root, start + i * 1000 / 60);
    expect(writes).toBe(initial);
    intersect([{ target: element, isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    expect(callbacks.size).toBe(0);
    updateControlMotion(root, start + 600);
    expect(writes).toBe(initial);
    intersect([{ target: element, isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    expect(callbacks.size).toBe(1);
    updateControlMotion(root, start + 650);
    expect(writes).toBe(initial);
    document.visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(callbacks.size).toBe(0);
  } finally {
    dispose?.(); globalThis.MutationObserver = savedObserver; globalThis.IntersectionObserver = savedIntersection;
  }
});
