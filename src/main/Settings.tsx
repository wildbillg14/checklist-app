import { useEffect, useRef, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import { toastError } from "../shared/toast";
import * as api from "../shared/api";
import { DEFAULT_SOLID, GRADIENTS } from "../shared/colors";
import { useStore } from "../shared/store";
import type { Theme } from "../shared/types";

export default function Settings({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSetting);
  const panelRef = useRef<HTMLDivElement>(null);
  const bg = settings.background;

  useEffect(() => panelRef.current?.focus(), []);

  const pickImage = async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      title: "Choose a background image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }],
    });
    if (typeof picked !== "string") return;
    const path = await api.importBackground(picked);
    await update("background", { kind: "image", path });
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-16"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-label="Settings"
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") onClose();
        }}
        className="max-h-[80vh] w-[30rem] max-w-[92vw] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl outline-none dark:bg-zinc-900"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="rounded px-2 py-1 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <Section title="Theme">
          <div className="inline-flex rounded-lg bg-black/5 p-1 dark:bg-white/10">
            {(["light", "dark", "system"] as Theme[]).map((t) => (
              <button
                key={t}
                type="button"
                data-theme-option={t}
                onClick={() => void update("theme", t)}
                className={`rounded-md px-3 py-1 text-sm capitalize ${
                  settings.theme === t ? "bg-white font-medium shadow dark:bg-zinc-700" : "text-zinc-600 dark:text-zinc-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Background">
          <div className="grid grid-cols-4 gap-2">
            <label
              title="Solid color"
              className={`relative flex h-14 cursor-pointer items-end overflow-hidden rounded-lg p-1 text-[11px] font-medium ${
                bg.kind === "solid" ? "ring-2 ring-sky-500" : "ring-1 ring-black/10 dark:ring-white/10"
              }`}
              style={{ background: bg.kind === "solid" ? bg.color : DEFAULT_SOLID }}
            >
              <span className="rounded bg-white/80 px-1 text-zinc-800">Solid</span>
              <input
                type="color"
                aria-label="Solid background color"
                value={bg.kind === "solid" ? bg.color : DEFAULT_SOLID}
                onChange={(e) => void update("background", { kind: "solid", color: e.target.value })}
                onClick={() => bg.kind !== "solid" && void update("background", { kind: "solid", color: DEFAULT_SOLID })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
            </label>
            {GRADIENTS.map((g) => (
              <button
                key={g.id}
                type="button"
                data-gradient={g.id}
                title={g.name}
                onClick={() => void update("background", { kind: "gradient", id: g.id })}
                className={`flex h-14 items-end rounded-lg p-1 text-[11px] font-medium ${
                  bg.kind === "gradient" && bg.id === g.id ? "ring-2 ring-sky-500" : "ring-1 ring-black/10 dark:ring-white/10"
                }`}
                style={{ background: g.css }}
              >
                <span className="rounded bg-white/80 px-1 text-zinc-800">{g.name}</span>
              </button>
            ))}
            <button
              type="button"
              data-pick-image
              onClick={() => void pickImage()}
              className={`flex h-14 items-center justify-center rounded-lg border border-dashed border-black/20 text-xs font-medium dark:border-white/20 ${
                bg.kind === "image" ? "ring-2 ring-sky-500" : ""
              }`}
            >
              {bg.kind === "image" ? "Change image…" : "My image…"}
            </button>
          </div>
        </Section>

        <Section title={`Dim · ${settings.bgDim}%`}>
          <input
            type="range"
            min={0}
            max={80}
            value={settings.bgDim}
            aria-label="Background dim"
            onChange={(e) => void update("bgDim", Number(e.target.value))}
            className="w-full accent-sky-500"
          />
        </Section>

        <Section title={`Blur · ${settings.bgBlur}px`}>
          <input
            type="range"
            min={0}
            max={20}
            value={settings.bgBlur}
            aria-label="Background blur"
            onChange={(e) => void update("bgBlur", Number(e.target.value))}
            className="w-full accent-sky-500"
          />
        </Section>

        <Section title="System">
          <AutostartToggle />
        </Section>

        <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
          Shortcuts: Enter add task · Ctrl+N new list · Ctrl+F search · Delete remove selected · Esc cancel
        </p>
      </div>
    </div>
  );
}

/** "Launch on Windows startup" — the app starts hidden in the tray (--minimized). */
function AutostartToggle() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    isEnabled()
      .then(setEnabled)
      .catch(() => setEnabled(false));
  }, []);

  const toggle = async (on: boolean) => {
    try {
      if (on) await enable();
      else await disable();
      setEnabled(await isEnabled());
    } catch (e) {
      toastError(`Couldn't change startup setting: ${String(e)}`);
    }
  };

  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
      <span>
        Launch on Windows startup
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">Starts hidden in the tray so reminders keep working.</span>
      </span>
      <input
        type="checkbox"
        data-autostart
        checked={enabled ?? false}
        disabled={enabled === null}
        onChange={(e) => void toggle(e.target.checked)}
        className="h-5 w-5 accent-sky-500"
      />
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</h3>
      {children}
    </section>
  );
}
