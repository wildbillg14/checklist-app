import { useEffect, useRef, useState } from "react";

interface Props {
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  className?: string;
  placeholder?: string;
}

/** Text input that saves on Enter/blur and cancels on Esc. */
export default function InlineEdit({ value, onSave, onCancel, className = "", placeholder }: Props) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const v = draft.trim();
    if (save && v && v !== value) onSave(v);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      onBlur={() => finish(true)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className={`min-w-0 rounded-md border border-sky-400 bg-white px-1.5 py-0.5 text-inherit outline-none dark:bg-zinc-800 ${className}`}
    />
  );
}
