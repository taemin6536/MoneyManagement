type Props = {
  label: string;
  value: string | number;
  color?: "default" | "green" | "red" | "dim";
  hint?: string;
};

const COLOR_CLASSES: Record<NonNullable<Props["color"]>, string> = {
  default: "text-mm-text",
  green: "text-mm-green",
  red: "text-mm-red",
  dim: "text-mm-text-dim",
};

export function Kpi({ label, value, color = "default", hint }: Props) {
  return (
    <article className="rounded-card border border-mm-border bg-mm-surface p-[18px]">
      <div className="mm-eyebrow">{label}</div>
      <div
        className={`font-mono text-[32px] tabular-nums font-medium mt-2 leading-none ${COLOR_CLASSES[color]}`}
      >
        {value}
      </div>
      {hint && <div className="text-[11px] text-mm-text-mute mt-2">{hint}</div>}
    </article>
  );
}
