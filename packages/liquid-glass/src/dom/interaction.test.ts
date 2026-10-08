import { expect, test } from "bun:test";
import { attachInteraction } from "./interaction.js";

test("a settled hover keeps its light without continuous frames or style mutations", () => {
  const input = new EventTarget();
  const view = Object.assign(new EventTarget(), { matchMedia: () => ({ matches: true }) });
  let writes = 0;
  const values = new Map<string, string>();
  const style = { translate: "", scale: "", setProperty: (key: string, value: string) => { writes++; values.set(key, value); },
    removeProperty: (key: string) => { writes++; values.delete(key); } };
  const element = Object.assign(input, { style, dataset: {}, ownerDocument: { defaultView: view }, offsetWidth: 100, offsetHeight: 60,
    matches: () => false, getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 60 }) }) as unknown as HTMLElement;
  const animator = attachInteraction(element, () => "full");
  let time = 0;
  const frame = () => animator.frame(time += 1000 / 60);
  const send = (type: string, x = 20) => element.dispatchEvent(Object.assign(new Event(type), { pointerType: "mouse", clientX: x, clientY: 30 }));
  try {
    send("pointerenter");
    for (let i = 0; i < 120; i++) frame();
    expect(frame()).toBe(false);
    expect(values.get("--lg-glow")).toBe("0.3500");
    const settled = writes;
    for (let i = 0; i < 30; i++) expect(frame()).toBe(false);
    expect(writes).toBe(settled);
    send("pointermove", 75); frame();
    expect(values.get("--lg-glow-x")).toBe("75.00px");
    expect(values.get("--lg-glow")).toBe("0.3500");
    send("pointerleave");
    for (let i = 0; i < 120; i++) frame();
    expect(frame()).toBe(false);
    expect(values.size).toBe(0);
  } finally { animator.dispose(); }
});
