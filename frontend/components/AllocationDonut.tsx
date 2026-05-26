import type { Holding } from "@/lib/api";

const COLORS = ["var(--mm-accent)", "var(--mm-violet)", "var(--mm-amber)", "var(--mm-green)"];

export function AllocationDonut({ holdings }: { holdings: Holding[] }) {
  const items = holdings.filter((h) => Number(h.weight_pct) > 0);
  const total = items.reduce((s, h) => s + Number(h.weight_pct), 0) || 1;
  const r = 38;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg width={100} height={100} viewBox="0 0 100 100" className="shrink-0">
        <circle cx={50} cy={50} r={r} fill="none" stroke="var(--mm-border-soft)" strokeWidth={10} />
        {items.map((h, i) => {
          const frac = Number(h.weight_pct) / total;
          const len = c * frac;
          const dashOffset = -(offset / total) * c;
          const el = (
            <circle
              key={h.symbol}
              cx={50}
              cy={50}
              r={r}
              fill="none"
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={10}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 50 50)"
              strokeLinecap="butt"
            />
          );
          offset += Number(h.weight_pct);
          return el;
        })}
      </svg>
      <ul className="text-sm space-y-1 flex-1">
        {items.map((h, i) => (
          <li key={h.symbol} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2">
              <span
                className="w-[10px] h-[10px] rounded-sm"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="font-medium">{h.symbol}</span>
            </span>
            <span className="font-mono tabular-nums text-mm-text-dim">
              {Number(h.weight_pct).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
