import { useEffect, useState } from "react";
import type { Theme } from "./types";

const media = window.matchMedia("(prefers-color-scheme: dark)");

/** Applies the `dark` class to <html> for the chosen theme; returns whether dark is active. */
export function useTheme(theme: Theme): boolean {
  const [systemDark, setSystemDark] = useState(media.matches);

  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const dark = theme === "dark" || (theme === "system" && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [dark]);

  return dark;
}
