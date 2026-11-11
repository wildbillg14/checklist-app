import { useEffect, useRef, useState } from "react";
import * as api from "../shared/api";
import { useStore } from "../shared/store";
import type { ItemWithContext } from "../shared/types";

/** Ctrl+F search across all non-template lists. Enter / click jumps to the item. */
export default function SearchBar() {
  const open = useStore((s) => s.searchOpen);
  return open ? <SearchPanel /> : null;
}

function SearchPanel() {
  const setOpen = useStore((s) => s.setSearchOpen);
  const jumpToItem = useStore((s) => s.jumpToItem);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemWithContext[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      api
        .search(query)
        .then((r) => {
          if (!cancelled) {
            setResults(r);
            setActive(0);
          }
        })
        .catch(() => undefined);
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      jumpToItem(results[active]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/30 pt-24"
      onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="w-[34rem] max-w-[90vw] overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-zinc-900">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Search all lists…"
          aria-label="Search all lists"
          className="w-full border-b border-black/10 bg-transparent px-4 py-3 text-base outline-none dark:border-white/10"
        />
        <ul className="max-h-96 overflow-y-auto py-1" role="listbox">
          {query.trim() && results.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-zinc-500">No matching tasks</li>
          )}
          {results.map((r, i) => (
            <li
              key={r.id}
              role="option"
              aria-selected={i === active}
              data-search-result={r.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => jumpToItem(r)}
              className={`flex cursor-pointer items-center gap-3 px-4 py-2 text-sm ${
                i === active ? "bg-sky-50 dark:bg-sky-950/60" : ""
              }`}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color ?? r.listAccent ?? "#a1a1aa" }} />
              <span className={`flex-1 truncate ${r.completedAt !== null ? "text-zinc-400 line-through" : ""}`}>
                {r.title}
              </span>
              <span className="shrink-0 truncate text-xs text-zinc-500 dark:text-zinc-400">
                {r.listName}
                {r.parentTitle ? ` › ${r.parentTitle}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
