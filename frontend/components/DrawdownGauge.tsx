type Props = {
  /** Drawdown percent. Negative or zero. -30 means 30% below ATH. */
  value: number;
};

const TICKS = [0, -5, -10, -15, -20, -25, -30];

function severityColor(v: number): string {
  if (v <= -20) return "var(--mm-red)";
  if (v <= -10) return "#ff8a5b";
  if (v <= -5) return "var(--mm-amber)";
  return "var(--mm-text-dim)";
}

export function DrawdownGauge({ value }: Props) {
  const clamped = Math.max(-30, Math.min(0, value));
  const fillPct = (-clamped / 30) * 100;
  const color = severityColor(clamped);

  return (
    <div>
      <div className="relative h-2 rounded bg-mm-border-soft overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-l"
          style={{ width: `${fillPct}%`, background: color }}
        />
        {[5, 10, 15, 20, 25].map((p) => (
          <div
            key={p}
            className="absolute inset-y-0 w-px bg-mm-border"
            style={{ left: `${(p / 30) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex justify-between mt-1 font-mono text-[10px] text-mm-text-mute tabular-nums">
        {TICKS.map((t) => (
          <span key={t}>{t === 0 ? "0%" : `${t}`}</span>
        ))}
      </div>
    </div>
  );
}
