import { expect, test } from "bun:test";
import { createTicker } from "./ticker.js";

function environment() {
  let id = 0, now = 0, heartbeat = () => {};
  const frames = new Map<number, FrameRequestCallback>();
  const document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  const view = Object.assign(new EventTarget(), {
    document,
    requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; },
    setInterval: (callback: () => void) => { heartbeat = callback; return 1; },
    clearInterval: () => { heartbeat = () => {}; },
  });
  const root = Object.assign(new EventTarget(), { nodeType: 1, ownerDocument: { defaultView: view } }) as unknown as Element;
  return { root, document, view, frames, heartbeat: () => heartbeat(),
    frame() {
      const pending = [...frames]; frames.clear();
      now += 1000 / 60;
      for (const [, callback] of pending) callback(now);
    },
  };
}

test("offscreen and hidden scenes stop sampling and resume with their retained output", () => {
  const saved = globalThis.IntersectionObserver;
  let intersect: IntersectionObserverCallback = () => {};
  let disconnected = false;
  globalThis.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; }
    observe() {} unobserve() {}
    disconnect() { disconnected = true; }
  } as unknown as typeof IntersectionObserver;
  const e = environment();
  const calls: string[] = [];
  const ticker = createTicker(() => { calls.push("read"); return { active: true, write: () => calls.push("write") }; }, { root: e.root });
  const visibility = (visible: boolean) => intersect([{ target: e.root, isIntersecting: visible }] as IntersectionObserverEntry[], {} as IntersectionObserver);
  try {
    e.frame(); expect(calls).toEqual(["read", "write"]);
    visibility(false); e.frame();
    e.heartbeat(); ticker.wake();
    e.view.dispatchEvent(new Event("scroll"));
    e.root.dispatchEvent(new Event("pointermove"));
    e.frame();
    expect(calls).toHaveLength(2);
    expect(e.frames.size).toBe(0);
    e.document.visibilityState = "hidden";
    visibility(true);
    e.document.dispatchEvent(new Event("visibilitychange")); e.frame();
    expect(calls).toHaveLength(2);
    e.document.visibilityState = "visible";
    e.document.dispatchEvent(new Event("visibilitychange")); e.frame();
    expect(calls).toEqual(["read", "write", "read", "write"]);
    // Portaled or fixed-position glass can remain visible past its scene box.
    const overlay = {} as Element;
    ticker.observe(overlay);
    visibility(false);
    intersect([{ target: overlay, isIntersecting: true }] as IntersectionObserverEntry[], {} as IntersectionObserver);
    e.frame(); expect(calls).toHaveLength(6);
    ticker.unobserve(overlay); e.frame();
    expect(calls).toHaveLength(6);
    ticker.dispose(); e.frame();
    expect(calls).toHaveLength(6);
    expect(disconnected).toBe(true);
  } finally { ticker.dispose(); globalThis.IntersectionObserver = saved; }
});

test("scenes share a read phase, sleep after settling, and wake on input", () => {
  const e = environment(), calls: string[] = [];
  const secondRoot = Object.assign(new EventTarget(), { ownerDocument: { defaultView: e.view } }) as unknown as Node;
  const first = createTicker(() => { calls.push("read-a"); return { active: false, write: () => calls.push("write-a") }; }, { root: e.root });
  const second = createTicker(() => { calls.push("read-b"); return { active: false, write: () => calls.push("write-b") }; }, { root: secondRoot });
  try {
    expect(e.frames.size).toBe(1);
    e.frame(); expect(calls).toEqual(["read-a", "read-b", "write-a", "write-b"]);
    e.frame(); e.frame();
    expect(e.frames.size).toBe(0);
    e.root.dispatchEvent(new Event("pointerdown")); e.frame();
    expect(calls.slice(-2)).toEqual(["read-a", "write-a"]);
  } finally { first.dispose(); second.dispose(); }
});
