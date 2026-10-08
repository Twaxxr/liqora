import type { MaterialOptions } from "../core/materials.js";

/** All transmitted DOM layers use the same signed field and RGB separation. */
export function refractMarkup(input: string, map: string, prefix: string, travel: number, dispersion: number, unit = 1): string {
  const displacement = (channel: string, amount: number) => `<feDisplacementMap in="${input}" in2="${map}" scale="${2 * amount / unit}" xChannelSelector="R" yChannelSelector="G" result="${prefix}${channel}"/>`;
  if (dispersion === 0) return displacement("refracted", travel);
  const isolate = (channel: string, index: number) => {
    const values = Array.from({ length: 20 }, () => 0);
    values[index] = 1;
    values[18] = 1;
    return `<feColorMatrix in="${prefix}${channel}Shift" type="matrix" values="${values.join(" ")}" result="${prefix}${channel}Only"/>`;
  };
  return displacement("redShift", travel + dispersion) + displacement("greenShift", travel) + displacement("blueShift", Math.max(0, travel - dispersion))
    + isolate("red", 0) + isolate("green", 6) + isolate("blue", 12)
    + `<feBlend in="${prefix}redOnly" in2="${prefix}greenOnly" mode="screen" result="${prefix}redGreen"/><feBlend in="${prefix}redGreen" in2="${prefix}blueOnly" mode="screen" result="${prefix}refracted"/>`;
}

export function transmittedAdjustments(input: string, prefix: string, options: MaterialOptions): { markup: string; result: string } {
  let markup = "", result = input;
  if (options.brightness !== undefined && options.brightness !== 0) {
    const next = `${prefix}brightness`;
    markup += `<feComponentTransfer in="${result}" result="${next}">${["R", "G", "B"].map((c) => `<feFunc${c} type="linear" slope="1" intercept="${options.brightness}"/>`).join("")}</feComponentTransfer>`;
    result = next;
  }
  if (options.tintStrength) {
    const strength = options.tintStrength, slope = 1 - strength;
    const next = `${prefix}coolTint`;
    markup += `<feColorMatrix in="${result}" type="matrix" values="${slope} 0 0 0 ${0.48 * strength} 0 ${slope} 0 0 ${0.65 * strength} 0 0 ${slope} 0 ${strength} 0 0 0 1 0" result="${next}"/>`;
    result = next;
  }
  return { markup, result };
}

/** Screen a saturated copy of the actual transmitted content into the GPU rim. */
export function specularColorMarkup(input: string, highlight: string, prefix: string, options: MaterialOptions): { markup: string; result: string } {
  if (options.specularSaturation === undefined || options.specularOpacity === 0) return { markup: "", result: input };
  const p = `${prefix}rim`;
  return { result: `${p}color`, markup:
    `<feColorMatrix in="${input}" type="saturate" values="${options.specularSaturation}" result="${p}saturated"/>`
    + `<feComposite in="${p}saturated" in2="${highlight}" operator="in" result="${p}masked"/>`
    + `<feComponentTransfer in="${p}masked" result="${p}faded"><feFuncA type="linear" slope="${options.specularOpacity ?? 1}"/></feComponentTransfer>`
    + `<feBlend in="${input}" in2="${p}faded" mode="screen" result="${p}color"/>` };
}
