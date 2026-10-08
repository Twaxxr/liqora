import type { SurfaceAnimator } from "./interaction.js";

/** Drag the live surface without taking input away from nested controls. */
export function attachFloating(element: HTMLElement): SurfaceAnimator {
  const view = element.ownerDocument.defaultView!;
  const saved = { transform: element.style.transform, touchAction: element.style.touchAction };
  let x = 0, y = 0;
  let moved = false, suppressClick = false;
  let drag: { id: number; clientX: number; clientY: number; x: number; y: number } | undefined;
  element.style.touchAction = "none";
  const down = (event: PointerEvent) => {
    if (event.defaultPrevented || event.button !== 0 || element.matches(":disabled, [aria-disabled='true']")) return;
    const control = (event.target as Element).closest("input, select, textarea, a, button, [role='slider'], [role='switch']");
    if (control && control !== element) return;
    moved = false;
    suppressClick = false;
    drag = { id: event.pointerId, clientX: event.clientX, clientY: event.clientY, x, y };
    element.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return;
    x = drag.x + event.clientX - drag.clientX;
    y = drag.y + event.clientY - drag.clientY;
    moved ||= Math.hypot(x - drag.x, y - drag.y) > 3;
    element.style.transform = `translate(${x}px, ${y}px) ${saved.transform}`.trim();
  };
  const release = () => { if (drag) suppressClick = moved; drag = undefined; };
  const click = (event: MouseEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  element.addEventListener("pointerdown", down);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", release);
  element.addEventListener("pointercancel", release);
  element.addEventListener("lostpointercapture", release);
  view.addEventListener("blur", release);
  element.addEventListener("click", click, true);
  return {
    frame: () => Boolean(drag),
    dispose() {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", release);
      element.removeEventListener("pointercancel", release);
      element.removeEventListener("lostpointercapture", release);
      view.removeEventListener("blur", release);
      element.removeEventListener("click", click, true);
      element.style.transform = saved.transform;
      element.style.touchAction = saved.touchAction;
    },
  };
}
