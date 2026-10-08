import { splitMaterialProps } from "./material-props.js";
import { validateMaterial } from "../core/materials.js";
import { useGlassForeground } from "./index.js";
import { useMergedRef } from "./merged-ref.js";
import { GlassShape } from "./shape.js";
import { useEffect, useRef, useState } from "react";
import type { ComponentPropsWithRef, CSSProperties } from "react";
import { Slider } from "@base-ui/react/slider";
import { Switch } from "@base-ui/react/switch";
import { switchDragState } from "./value-control-motion.js";
import { ControlThumb } from "./control-thumb.js";
import type { ControlMotionOptions } from "../dom/control-motion.js";
import type { MaterialOptions } from "../core/materials.js";

export interface GlassSliderProps extends Omit<Slider.Root.Props<number>, "className" | "style" | "children" | "disabled">, MaterialOptions, ControlMotionOptions {
  className?: string;
  style?: CSSProperties;
  /** Visible marks at each step. Limited to 101 marks. */
  ticks?: boolean;
  /** Keep the pressed glass visible without changing the value. */
  forceActive?: boolean;
  /** Props and accessible name forwarded to the slider input. */
  thumbProps?: Omit<ComponentPropsWithRef<typeof Slider.Thumb>, "render" | "children" | "disabled">;
}
/** Single-value slider; use a small numeric step for continuous pointer travel. */
export function GlassSlider({
  material, appearance, tint, refraction, saturation, specularOpacity, chromaticAberration, radius, motion, interactive = true,
  className = "", style, ticks = false, min = 0, max = 100, step = 0.1,
  thumbProps, forceActive = false, "aria-label": ariaLabel, "aria-labelledby": labelledBy, ...rest
}: GlassSliderProps) {
  const [optics, props] = splitMaterialProps(rest);
  validateMaterial({ ...optics, refraction, saturation, specularOpacity, chromaticAberration });
  radius ??= optics.cornerRadius ?? "capsule";
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(max - min) || !Number.isFinite(step) || step <= 0)
    throw new RangeError("GlassSlider requires finite min < max and a positive finite step.");
  const intervals = (max - min) / step;
  if (ticks && (intervals < 1 || intervals > 100 || Math.abs(intervals - Math.round(intervals)) > 1e-7))
    throw new RangeError("Ticked sliders require 1–100 evenly divided intervals.");
  const foregroundRef = useGlassForeground();
  const trackRef = useGlassForeground();
  const mergedRef = useMergedRef(props.ref, foregroundRef);
  const { className: thumbClass = "", ...inputProps } = thumbProps ?? {};
  const [sliderPressed, setSliderPressed] = useState(false);
  useEffect(() => {
    if (!sliderPressed) return;
    const release = () => setSliderPressed(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [sliderPressed]);
  return <Slider.Root<number>
    defaultValue={min} {...props} ref={mergedRef} min={min} max={max} step={step}
    className={`lg-slider ${className}`} style={{ "--lg-accent": tint ?? "#0377f7", ...style } as CSSProperties}
    data-ticks={ticks ? "" : undefined}>
    <Slider.Control className="lg-slider-control"
      onPointerDownCapture={(event) => { if (!event.defaultPrevented && event.button === 0) setSliderPressed(true); }}
      onPointerUp={() => setSliderPressed(false)} onPointerCancel={() => setSliderPressed(false)}
      onLostPointerCapture={() => setSliderPressed(false)}>
      <div ref={trackRef} className="lg-value-track-layer" aria-hidden="true">
        <GlassShape radius="capsule" render={<Slider.Track />} className="lg-slider-track"><GlassShape radius="capsule" render={<Slider.Indicator />} className="lg-slider-fill" /></GlassShape>
      </div>
      {ticks && <div className="lg-slider-ticks" aria-hidden="true">
        {Array.from({ length: Math.round(intervals) + 1 }, (_, i) => <span key={i} />)}
      </div>}
      <Slider.Thumb aria-label={ariaLabel} aria-labelledby={labelledBy} {...inputProps}
        render={(rootProps, state) => <ControlThumb {...rootProps}
          motion={motion} interactive={interactive}
          pressed={forceActive || sliderPressed || state.dragging} options={{ ...optics, material, appearance, radius, refraction, saturation, specularOpacity, chromaticAberration }}
          className={`lg-slider-thumb ${typeof thumbClass === "function" ? thumbClass(state) : thumbClass}`} />}
      />
    </Slider.Control>
  </Slider.Root>;
}
export interface GlassSwitchProps extends Omit<ComponentPropsWithRef<typeof Switch.Root>, "className" | "style" | "children" | "render" | "nativeButton" | "disabled">, MaterialOptions, ControlMotionOptions {
  className?: string;
  style?: CSSProperties;
  /** Keep the pressed glass visible without changing checked state. */
  forceActive?: boolean;
}
export function GlassSwitch({ material, appearance, tint, refraction, saturation, specularOpacity, chromaticAberration, radius, motion, interactive = true, className = "", style, forceActive = false, ...rest }: GlassSwitchProps) {
  const [optics, props] = splitMaterialProps(rest);
  validateMaterial({ ...optics, refraction, saturation, specularOpacity, chromaticAberration });
  radius ??= optics.cornerRadius ?? "capsule";
  const foregroundRef = useGlassForeground();
  const trackRef = useGlassForeground();
  const mergedRef = useMergedRef(props.ref, foregroundRef);
  const [pressed, setPressed] = useState(false);
  const [position, setPosition] = useState<number | null>(null);
  const pointer = useRef<{ id: number; x: number; start: number; current: number; left: number; width: number; rtl: boolean; oppositeHalf: boolean; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  return <Switch.Root {...props} ref={mergedRef} nativeButton={false} className={`lg-switch ${className}`}
    style={{ "--lg-accent": tint ?? "#3bbf4e", ...style } as CSSProperties}
    render={(rootProps, state) => <span {...rootProps} role="switch" aria-checked={state.checked} tabIndex={rootProps.tabIndex ?? 0}
      style={{ ...rootProps.style, "--lg-switch-position": position ?? (state.checked ? 1 : 0) } as CSSProperties}
      data-presentation-checked={position === null ? undefined : position === 1 ? "true" : "false"}
      onPointerDown={(event) => {
        rootProps.onPointerDown?.(event);
        if (event.defaultPrevented || props.readOnly || event.button !== 0) return;
        suppressClick.current = false;
        const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
        const start = state.checked ? 1 : 0;
        const rect = event.currentTarget.getBoundingClientRect();
        const initialHalf = (event.clientX >= rect.left + rect.width / 2) !== rtl;
        pointer.current = { id: event.pointerId, x: event.clientX, start, current: start,
          left: rect.left, width: rect.width, rtl, oppositeHalf: initialHalf !== state.checked, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        setPosition(start);
        setPressed(true);
      }}
      onPointerMove={(event) => {
        rootProps.onPointerMove?.(event);
        const drag = pointer.current;
        if (!drag || drag.id !== event.pointerId || event.defaultPrevented) return;
        const delta = event.clientX - drag.x;
        drag.moved ||= Math.abs(delta) > 3;
        drag.current = Number(switchDragState(drag, event.clientX));
        if (drag.moved) setPosition(drag.current);
      }}
      onPointerUp={(event) => {
        rootProps.onPointerUp?.(event);
        const drag = pointer.current;
        if (!drag || drag.id !== event.pointerId) return;
        pointer.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (drag.moved) {
          if (!event.defaultPrevented && (drag.current >= 0.5) !== state.checked) event.currentTarget.click();
          // The following browser click must not toggle a committed drag a second time.
          suppressClick.current = true;
        }
        setPosition(null);
        setPressed(false);
      }}
      onPointerCancel={(event) => {
        rootProps.onPointerCancel?.(event);
        pointer.current = null;
        suppressClick.current = true;
        setPosition(null);
        setPressed(false);
      }}
      onLostPointerCapture={(event) => {
        rootProps.onLostPointerCapture?.(event);
        if (!pointer.current) return;
        pointer.current = null;
        suppressClick.current = true;
        setPosition(null);
        setPressed(false);
      }}
      onClickCapture={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        rootProps.onClickCapture?.(event);
      }}
      onKeyDown={(event) => {
        rootProps.onKeyDown?.(event);
        suppressClick.current = false;
        if (!event.defaultPrevented && !props.readOnly && (event.key === " " || event.key === "Enter")) setPressed(true);
      }}
      onKeyUp={(event) => { rootProps.onKeyUp?.(event); setPressed(false); }}
      onBlur={(event) => { rootProps.onBlur?.(event); setPressed(false); }}
    />}
  >
    <span ref={trackRef} className="lg-value-track-layer" aria-hidden="true">
      <GlassShape radius="capsule" render={<span />} className="lg-switch-track" />
    </span>
    <Switch.Thumb render={(rootProps) => <ControlThumb {...rootProps} tag="span" pressed={forceActive || pressed} motion={motion} interactive={interactive}
      options={{ ...optics, material, appearance, radius, refraction, saturation, specularOpacity, chromaticAberration }} className="lg-switch-thumb" />} />
  </Switch.Root>;
}
