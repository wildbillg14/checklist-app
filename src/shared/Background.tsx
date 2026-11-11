import { convertFileSrc } from "@tauri-apps/api/core";
import { gradientCss } from "./colors";
import type { Background as Bg } from "./types";

interface Props {
  background: Bg;
  /** 0–80: overlay strength (white in light mode, black in dark mode). */
  dim: number;
  /** 0–20 px. */
  blur: number;
  dark: boolean;
  /** Extra overlay for the widget so text stays readable at small sizes. */
  subtle?: boolean;
  /** 0–1 multiplier for the whole layer (widget opacity). */
  opacity?: number;
}

/** Full-window background layer: color/gradient/image + blur + dim overlay. */
export default function Background({ background, dim, blur, dark, subtle = false, opacity = 1 }: Props) {
  const style: React.CSSProperties = {};
  if (background.kind === "solid") style.background = background.color;
  else if (background.kind === "gradient") style.background = gradientCss(background.id);
  else {
    style.backgroundImage = `url("${convertFileSrc(background.path)}")`;
    style.backgroundSize = "cover";
    style.backgroundPosition = "center";
  }
  if (blur > 0) {
    style.filter = `blur(${blur}px)`;
    // Scale up a touch so blurred edges don't show the transparent border.
    style.transform = `scale(${1 + blur / 100})`;
  }

  const overlayAlpha = Math.min(0.92, (subtle ? Math.max(dim, 55) : dim) / 100);
  const overlay = dark ? `rgba(9, 9, 11, ${overlayAlpha})` : `rgba(255, 255, 255, ${overlayAlpha})`;

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ opacity }} aria-hidden>
      <div data-bg-layer className="absolute inset-0" style={style} />
      <div className="absolute inset-0" style={{ background: overlay }} />
    </div>
  );
}
