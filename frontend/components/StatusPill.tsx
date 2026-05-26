type Props = { status: string };

const STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  sent: { bg: "bg-mm-green/15", text: "text-mm-green", dot: "bg-mm-green", label: "Sent" },
  skipped: {
    bg: "bg-mm-border-soft",
    text: "text-mm-text-dim",
    dot: "bg-mm-text-dim",
    label: "Skipped",
  },
  failed: { bg: "bg-mm-red/15", text: "text-mm-red", dot: "bg-mm-red", label: "Failed" },
};

export function StatusPill({ status }: Props) {
  const s = STYLES[status] ?? STYLES.skipped;
  return (
    <span
      className={`inline-flex items-center gap-[6px] px-2 py-[2px] rounded-pill text-[11px] ${s.bg} ${s.text}`}
    >
      <span className={`w-[6px] h-[6px] rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
