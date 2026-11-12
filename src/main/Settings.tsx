import { useEffect, useRef, useState } from "react";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open } from "@tauri-apps/plugin-dialog";
import { toastError } from "../shared/toast";
import * as api from "../shared/api";
import { DEFAULT_SOLID, GRADIENTS } from "../shared/colors";
import { useStore } from "../shared/store";
import type { HotkeyInfo, Theme } from "../shared/types";

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
          <HotkeyField />
        </Section>

        <p className="mt-6 text-xs text-zinc-500 dark:text-zinc-400">
          Shortcuts: {settings.toggleHotkey} mini view · Enter add task · Ctrl+N new list · Ctrl+F search · Delete remove
          selected · Esc cancel
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

/** KeyboardEvent.code → key name the Rust side accepts (letter, digit, F1–F24, Space). */
function keyName(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (code === "Space") return "Space";
  return null;
}

function modifiersOf(e: React.KeyboardEvent): string[] {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push("Ctrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Win");
  return mods;
}

/** "Mini view hotkey": click Change, press a combo; re-registered immediately. */
function HotkeyField() {
  const [info, setInfo] = useState<HotkeyInfo | null>(null);
  const [recording, setRecording] = useState(false);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef(false);
  const boxRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    api.getHotkey().then(setInfo).catch(() => undefined);
    // If Settings closes mid-recording, put the current hotkey back.
    return () => {
      if (recordingRef.current) void api.pauseHotkey(false);
    };
  }, []);

  const start = async () => {
    setError(null);
    setPreview("");
    recordingRef.current = true;
    setRecording(true);
    setInfo(await api.pauseHotkey(true));
    boxRef.current?.focus();
  };

  const stop = async () => {
    recordingRef.current = false;
    setRecording(false);
    setPreview("");
    setInfo(await api.pauseHotkey(false));
  };

  const onKeyDown = async (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    const mods = modifiersOf(e);
    if (e.key === "Escape" && mods.length === 0) return void stop();
    const key = keyName(e.code);
    if (!key) {
      // Only modifiers so far (or an unsupported key): show progress.
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) setPreview(mods.join("+") + "+…");
      else setError("Use a letter, digit, F1–F24 or Space, with Ctrl, Alt or Win.");
      return;
    }
    if (!mods.some((m) => m !== "Shift")) {
      setPreview("");
      setError("Include Ctrl, Alt or Win so normal typing isn't captured.");
      return;
    }
    const combo = [...mods, key].join("+");
    recordingRef.current = false;
    setRecording(false);
    setPreview("");
    const result = await api.trySetHotkey(combo);
    if (result.ok) {
      setInfo(result.info);
      setError(null);
    } else {
      setError(result.error);
      setInfo(await api.getHotkey());
    }
  };

  return (
    <div className="mt-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span>
          Mini view hotkey
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">Shows or hides the mini view from any app.</span>
        </span>
        <div className="flex items-center gap-2">
          <button
            ref={boxRef}
            type="button"
            data-hotkey-field
            aria-label="Mini view hotkey"
            onClick={() => void (recording ? stop() : start())}
            onKeyDown={(e) => void onKeyDown(e)}
            onBlur={() => recording && void stop()}
            className={`min-w-28 rounded-md border px-2.5 py-1 text-center font-mono text-xs ${
              recording
                ? "border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                : "border-black/15 bg-white dark:border-white/15 dark:bg-zinc-800"
            }`}
          >
            {recording ? preview || "Press keys…" : (info?.combo ?? "…")}
          </button>
          {!recording && (
            <button
              type="button"
              data-hotkey-change
              onClick={() => void start()}
              className="rounded px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950"
            >
              Change
            </button>
          )}
        </div>
      </div>
      {recording && (
        <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">Press the new combo, or Esc to cancel.</p>
      )}
      {error && (
        <p data-hotkey-error className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/60 dark:text-red-300">
          {error}
        </p>
      )}
      {info?.error && (
        <p
          data-hotkey-warning
          className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
        >
          ⚠ {info.error}
        </p>
      )}
    </div>
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
