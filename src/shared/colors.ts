/** 8 preset task/list colors. */
export const SWATCHES: readonly { name: string; hex: string }[] = [
  { name: "Red", hex: "#ef4444" },
  { name: "Orange", hex: "#f97316" },
  { name: "Yellow", hex: "#eab308" },
  { name: "Green", hex: "#22c55e" },
  { name: "Teal", hex: "#14b8a6" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Purple", hex: "#8b5cf6" },
  { name: "Pink", hex: "#ec4899" },
];

/** Preset background gradients. */
export const GRADIENTS: readonly { id: string; name: string; css: string }[] = [
  { id: "dawn", name: "Dawn", css: "linear-gradient(135deg, #fde68a 0%, #fca5a5 45%, #c4b5fd 100%)" },
  { id: "ocean", name: "Ocean", css: "linear-gradient(135deg, #22d3ee 0%, #3b82f6 50%, #6366f1 100%)" },
  { id: "forest", name: "Forest", css: "linear-gradient(135deg, #bbf7d0 0%, #34d399 45%, #0f766e 100%)" },
  { id: "dusk", name: "Dusk", css: "linear-gradient(135deg, #1e1b4b 0%, #7c3aed 55%, #f472b6 100%)" },
  { id: "peach", name: "Peach", css: "linear-gradient(135deg, #fff7ed 0%, #fed7aa 50%, #fda4af 100%)" },
  { id: "slate", name: "Slate", css: "linear-gradient(135deg, #e2e8f0 0%, #94a3b8 50%, #334155 100%)" },
];

export const DEFAULT_SOLID = "#e4e4e7";

export function gradientCss(id: string): string {
  return (GRADIENTS.find((g) => g.id === id) ?? GRADIENTS[0]).css;
}

/** "#rrggbb" + alpha (0–1) → "rgba(r, g, b, a)". */
export function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
