import { expect, test } from "bun:test";
import { observeConcentricShape } from "./shape-layout.js";

test("shape layout follows its own visible scene without waking other examples", () => {
  const previousDocument = globalThis.document, previousIntersection = globalThis.IntersectionObserver;
  const frames = new Map<number, FrameRequestCallback>();
  const intersections = new Map<object, IntersectionObserverCallback>();
  let serial = 0, now = 0;
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const view = Object.assign(new EventTarget(), { document,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++serial, callback); return serial; },
    setInterval: () => 1, clearInterval() {},
  });
  const roots = [0, 1].map(() => Object.assign(new EventTarget(), { nodeType: 1, ownerDocument: { defaultView: view } }));
  const elements = roots.map((root) => {
    const attributes = new Map<string, string>();
    return { nodeType: 1, isConnected: false, ownerDocument: { defaultView: view },
      style: { clipPath: "", paddingLeft: "", paddingRight: "" }, closest: () => root,
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => attributes.set(name, value),
      removeAttribute: (name: string) => attributes.delete(name),
    } as unknown as HTMLElement;
  });
  globalThis.document = document as unknown as Document;
  globalThis.IntersectionObserver = class {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(element: Element) { intersections.set(element, this.callback); }
    unobserve(element: Element) { intersections.delete(element); }
    disconnect() { for (const [element, callback] of intersections) if (callback === this.callback) intersections.delete(element); }
  } as unknown as typeof IntersectionObserver;
  const calls = [0, 0];
  const stops = elements.map((element, index) => observeConcentricShape(element, {}, () => {
    calls[index] = calls[index]! + 1;
    // Scheduling is isolated from contour geometry, covered by core tests.
    return roots[index] as unknown as HTMLElement;
  }));
  const step = () => {
    const pending = [...frames.values()]; frames.clear(); now += 1000 / 60;
    for (const callback of pending) callback(now);
  };
  try {
    step(); step(); step();
    expect(calls).toEqual([3, 3]);
    roots[0]!.dispatchEvent(new Event("pointermove"));
    document.dispatchEvent(new Event("pointermove"));
    step(); step(); step();
    expect(calls[0]).toBeGreaterThan(3);
    expect(calls[1]).toBe(3);
    const awake = calls[0]!;
    const callback = intersections.get(roots[0]!)!;
    callback([{ target: roots[0], isIntersecting: false }, { target: elements[0], isIntersecting: false }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    roots[0]!.dispatchEvent(new Event("pointermove"));
    step(); expect(calls).toEqual([awake, 3]);
    callback([{ target: roots[0], isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    step(); expect(calls).toEqual([awake + 1, 3]);
  } finally {
    for (const stop of stops) stop();
    globalThis.document = previousDocument;
    globalThis.IntersectionObserver = previousIntersection;
  }
});
