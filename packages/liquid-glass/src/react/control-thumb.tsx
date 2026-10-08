import { GlassShape } from "./shape.js";
import { useCallback, useEffect, useState } from "react";
import type { HTMLAttributes, Ref } from "react";
import { useRender } from "@base-ui/react/use-render";
import { attachNativeControlMotion } from "../dom/control-motion.js";
import type { ControlMotionOptions } from "../dom/control-motion.js";
import { GlassSurface, useGlassMotion } from "./index.js";
import type { MaterialOptions } from "../core/materials.js";

type Phase = "idle" | "pressed" | "settling";
/** Keep optics mounted until the measured release envelope finishes. */
function usePressPhase(pressed: boolean): Phase {
  const [retained, setRetained] = useState(pressed);
  useEffect(() => {
    const finish = setTimeout(() => setRetained(pressed), pressed ? 0 : 320);
    return () => clearTimeout(finish);
  }, [pressed]);
  return pressed ? "pressed" : retained ? "settling" : "idle";
}
interface ControlThumbProps extends HTMLAttributes<HTMLElement>, ControlMotionOptions {
  pressed: boolean;
  options: MaterialOptions;
  tag?: "div" | "span";
  ref?: Ref<HTMLElement>;
}
export function ControlThumb({ pressed, options, tag = "div", ref, children, motion, interactive = true, ...props }: ControlThumbProps) {
  const animatedPhase = usePressPhase(pressed);
  const phase = motion === "none" ? (pressed ? "pressed" : "idle") : animatedPhase;
  const resolvedMotion = useGlassMotion(motion);
  const isSwitch = props.className?.includes("lg-switch-thumb");
  const motionRef = useCallback((element: HTMLElement | null) => {
    if (element) return attachNativeControlMotion(element, resolvedMotion, interactive);
  }, [resolvedMotion, interactive]);
  return useRender({ defaultTagName: tag, ref: [motionRef, ref ?? null], props: {
    ...props,
    className: `lg-control-thumb ${props.className ?? ""}`,
    "data-press-phase": phase,
    children: <>
      {children}
      {phase !== "idle" && <GlassSurface {...options} material={options.material ?? "clear"}
        refraction={options.refraction ?? (isSwitch ? 20 : 24)}
        bezelProfile={options.bezelProfile ?? (isSwitch ? "lip" : "convex")}
        bezelWidth={options.bezelWidth ?? (isSwitch ? 10 : 6)}
        zRadius={options.zRadius ?? (isSwitch ? 10 : 6)}
        specularOpacity={options.specularOpacity ?? (isSwitch ? 0.5 : 0.4)}
        specularSaturation={options.specularSaturation ?? (isSwitch ? 6 : 7)}
        chromAberration={options.chromAberration ?? 0.05}
        blurAmount={options.blurAmount ?? (isSwitch ? 0.2 / 24 : 0)}
        radius={options.radius ?? "capsule"} render={<span />} className="lg-control-lens" aria-hidden="true" />}
      <GlassShape radius={options.radius ?? "capsule"} render={<span />} className="lg-control-face" aria-hidden="true" />
    </>,
  } });
}
