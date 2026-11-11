import { SWATCHES } from "../shared/colors";

interface Props {
  value: string | null;
  onChange: (color: string | null) => void;
  /** Label for the "no color" option. */
  noneLabel?: string;
}

/** 8 preset swatches + "none" + a custom color picker. */
export default function ColorPicker({ value, onChange, noneLabel = "No color" }: Props) {
  const isCustom = value !== null && !SWATCHES.some((s) => s.hex === value);
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup">
      <button
        type="button"
        role="radio"
        aria-checked={value === null}
        title={noneLabel}
        aria-label={noneLabel}
        onClick={() => onChange(null)}
        className={`relative h-6 w-6 rounded-full border border-black/20 bg-white dark:border-white/30 dark:bg-zinc-800 ${
          value === null ? "ring-2 ring-sky-500 ring-offset-1 dark:ring-offset-zinc-900" : ""
        }`}
      >
        <span className="absolute left-1/2 top-1/2 h-[1.5px] w-5 -translate-x-1/2 -translate-y-1/2 -rotate-45 bg-red-500" />
      </button>
      {SWATCHES.map((s) => (
        <button
          key={s.hex}
          type="button"
          role="radio"
          aria-checked={value === s.hex}
          title={s.name}
          aria-label={s.name}
          data-swatch={s.hex}
          onClick={() => onChange(s.hex)}
          className={`h-6 w-6 rounded-full ${value === s.hex ? "ring-2 ring-sky-500 ring-offset-1 dark:ring-offset-zinc-900" : ""}`}
          style={{ background: s.hex }}
        />
      ))}
      <label
        title="Custom color"
        className={`relative h-6 w-6 cursor-pointer overflow-hidden rounded-full ${
          isCustom ? "ring-2 ring-sky-500 ring-offset-1 dark:ring-offset-zinc-900" : ""
        }`}
        style={{ background: isCustom ? value : "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }}
      >
        <input
          type="color"
          aria-label="Custom color"
          value={value ?? "#3b82f6"}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}
