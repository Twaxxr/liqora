export function edgeDisplacement(
  distance: number,
  amount: number,
  inverseHeight: number,
): number {
  const depth = Math.max(0, Math.min(1, -distance * inverseHeight));
  return (
    amount * (1 - Math.max(0, Math.min(1, Math.sqrt((2 - depth) * depth))))
  );
}

/** CPU reference for the GPU's signed bezel displacement. */
export function bezelTravel(depth: number, width: number, zRadius: number, profile: "native" | "convex" | "lip", mode: 0 | 1 = 0): number {
  const t = Math.max(0, Math.min(1, depth / width));
  const facing = Math.sqrt(t * (2 - t));
  if (profile === "native") return (1 - facing) * (mode === 1 ? 0.5 + 0.5 * t : 1);
  const eta = 1 / 1.5, tangent = 1 - t;
  const normalZ = Math.sqrt(1 - tangent * tangent);
  const k = Math.sqrt(1 - eta * eta * tangent * tangent) - eta * normalZ;
  const travel = tangent * k / (eta + k * normalZ) / (Math.sqrt(1 - eta * eta) / eta);
  const convex = travel * (mode === 1 ? 0.5 + 0.5 * normalZ : 1) * Math.max(0.25, Math.min(2, zRadius / width));
  return profile === "lip" ? Math.max(-1, Math.min(1, convex - 0.32 * Math.sin(Math.PI * t) ** 2)) : Math.min(1, convex);
}
