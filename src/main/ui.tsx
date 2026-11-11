/** Small shared buttons for the main window. */

export function IconButton({
  children,
  title,
  onClick,
  active = false,
  className = "",
}: {
  children: React.ReactNode;
  title: string;
  onClick: (e: React.MouseEvent) => void;
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className={`rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-black/10 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/15 dark:hover:text-zinc-50 ${
        active ? "bg-black/10 text-zinc-900 dark:bg-white/15 dark:text-zinc-50" : ""
      } ${className}`}
    >
      {children}
    </button>
  );
}

export function ToolbarButton({
  children,
  onClick,
  disabled = false,
  title,
  active = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-black/5 disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-300 dark:hover:bg-white/10 ${
        active ? "bg-black/10 dark:bg-white/15" : ""
      }`}
    >
      {children}
    </button>
  );
}
