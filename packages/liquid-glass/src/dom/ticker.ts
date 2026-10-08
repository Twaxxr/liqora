/** A frame loop that runs only while something can change. Glass scenes used
 * to sample every surface on every frame for the life of the page; a ticker
 * wakes on the signals that precede a geometry change (input, scroll,
 * resize, DOM mutation, CSS transitions and animations) and sleeps once a few
 * consecutive frames found nothing to do. A slow heartbeat catches movement
 * no signal announces.
 *
 * Every ticker of a window shares one animation frame, split into a read
 * phase and a write phase: each step measures and returns the writes it
 * wants, and the writes run once every step has measured. A page of many
 * scenes then forces layout at most once per frame instead of once per scene. */
export interface Ticker {
  /** Run on the next frame, if not already scheduled. */
  wake(): void;
  /** Wake when this element's size changes. */
  observe(element: Element): void;
  unobserve(element: Element): void;
  dispose(): void;
}
export interface TickerOptions {
  /** Where mutations, input, and animation events are listened for. */
  root: Node;
  /** Mutations in these nodes are the ticker's own output and never wake it. */
  ignore?: (target: Node) => boolean;
  /** Called for mutations that are not ignored, before the next frame. */
  onMutation?: () => void;
  /** Milliseconds between heartbeats while idle. */
  heartbeat?: number;
}
/** What a step found: whether it needs the next frame, and the writes to
 * apply after every ticker has measured. A bare boolean is "active". */
export type StepResult = boolean | { active: boolean; write?: () => void };
const inputEvents = ["pointerdown", "pointerup", "pointercancel", "pointermove", "pointerenter", "pointerleave", "keydown", "keyup", "focusin", "focusout"];
const motionEvents = ["transitionrun", "transitionstart", "transitionend", "transitioncancel", "animationstart", "animationiteration", "animationend", "animationcancel"];
interface Entry { step: (now: number) => StepResult; idle: number; disposed: boolean; suspended: boolean }
/** One frame per window for every ticker in it. */
class Driver {
  private raf = 0;
  private readonly pending = new Set<Entry>();
  constructor(private readonly view: Window) {}
  schedule(entry: Entry) {
    if (entry.disposed || entry.suspended) return;
    this.pending.add(entry);
    if (!this.raf) this.raf = this.view.requestAnimationFrame((now) => this.frame(now));
  }
  private frame(now: number) {
    this.raf = 0;
    const entries = [...this.pending];
    this.pending.clear();
    const writes: (() => void)[] = [];
    for (const entry of entries) {
      if (entry.disposed || entry.suspended) continue;
      let result: StepResult;
      try { result = entry.step(now); } catch (error) { queueMicrotask(() => { throw error; }); continue; }
      const active = typeof result === "boolean" ? result : result.active;
      if (typeof result !== "boolean" && result.write) writes.push(result.write);
      // A couple of quiet frames let late layout settle before sleeping.
      entry.idle = active ? 0 : entry.idle + 1;
      if (entry.idle < 3) this.schedule(entry);
    }
    for (const write of writes) {
      try { write(); } catch (error) { queueMicrotask(() => { throw error; }); }
    }
  }
}
const drivers = new WeakMap<Window, Driver>();
export function createTicker(step: (now: number) => StepResult, options: TickerOptions): Ticker {
  const { root, ignore, onMutation } = options;
  const view = (root.ownerDocument ?? (root as Document)).defaultView ?? window;
  const driver = drivers.get(view) ?? (() => { const d = new Driver(view); drivers.set(view, d); return d; })();
  const entry: Entry = { step, idle: 0, disposed: false, suspended: view.document.visibilityState === "hidden" };
  const wake = () => driver.schedule(entry);
  let visible = true;
  const visibleElements = new Set<Element>();
  const visibility = () => {
    entry.suspended = !visible || view.document.visibilityState === "hidden";
    if (!entry.suspended) { entry.idle = 0; wake(); }
  };
  // Keep retained glass intact while its scene is outside the viewport. The
  // margin prepares it before scrolling it into view, at its original quality.
  const intersection = typeof IntersectionObserver === "function" && root.nodeType === 1
    ? new IntersectionObserver((records) => {
      for (const record of records) {
        if (record.isIntersecting) visibleElements.add(record.target);
        else visibleElements.delete(record.target);
      }
      visible = visibleElements.size > 0;
      visibility();
    }, { rootMargin: "128px" }) : undefined;
  if (intersection) { visibleElements.add(root as Element); intersection.observe(root as Element); }
  const sizes = typeof ResizeObserver === "function" ? new ResizeObserver(wake) : undefined;
  const mutations = typeof MutationObserver === "function"
    ? new MutationObserver((records) => {
      if (ignore && !records.some((record) => !ignore(record.target))) return;
      onMutation?.();
      wake();
    })
    : undefined;
  mutations?.observe(root, { subtree: true, attributes: true, childList: true, characterData: false });
  const target = root as unknown as EventTarget;
  for (const type of [...inputEvents, ...motionEvents]) target.addEventListener(type, wake, { capture: true, passive: true });
  view.addEventListener("scroll", wake, { capture: true, passive: true });
  view.addEventListener("resize", wake, { passive: true });
  view.document.addEventListener("visibilitychange", visibility);
  const heartbeat = view.setInterval(wake, options.heartbeat ?? 1000);
  wake();
  return {
    wake,
    observe(element) {
      sizes?.observe(element);
      // A fixed or positioned lens may remain visible beyond its scene box.
      if (intersection) {
        visibleElements.add(element); visible = true;
        intersection.observe(element); visibility();
      }
    },
    unobserve(element) {
      sizes?.unobserve(element);
      if (intersection && element !== root) {
        intersection.unobserve(element); visibleElements.delete(element);
        visible = visibleElements.size > 0; visibility();
      }
    },
    dispose() {
      entry.disposed = true;
      sizes?.disconnect();
      mutations?.disconnect();
      intersection?.disconnect();
      for (const type of [...inputEvents, ...motionEvents]) target.removeEventListener(type, wake, { capture: true });
      view.removeEventListener("scroll", wake, { capture: true });
      view.removeEventListener("resize", wake);
      view.document.removeEventListener("visibilitychange", visibility);
      view.clearInterval(heartbeat);
    },
  };
}
