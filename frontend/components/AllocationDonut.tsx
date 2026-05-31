import type { Portfolio } from "@/lib/api";

const STOCK_COLORS = [
  "var(--mm-accent)",
  "var(--mm-violet)",
  "var(--mm-amber)",
  "var(--mm-green)",
];
const CASH_USD_COLOR = "var(--mm-text-dim)";
const CASH_KRW_COLOR = "var(--mm-text-mute)";

type DonutItem = {
  key: string;
  label: string;
  valueUsd: number;
  color: string;
};

/**
 * Allocation by USD-equivalent value. Stocks come from holdings, plus two
 * optional cash slices (USD 주문가능, KRW 예수금 converted via fx_rate).
 * If fx_rate is missing we skip KRW so the donut stays consistent (the
 * sidebar already surfaces the raw KRW figure).
 */
function buildItems(p: Portfolio): DonutItem[] {
  const items: DonutItem[] = [];
  let colorIdx = 0;

  for (const h of p.holdings) {
    const v = Number(h.eval_usd);
    if (!Number.isFinite(v) || v <= 0) continue;
    items.push({
      key: h.symbol,
      label: h.symbol,
      valueUsd: v,
      color: STOCK_COLORS[colorIdx % STOCK_COLORS.length],
    });
    colorIdx += 1;
  }

  const cashUsd = p.cash_usd_available ? Number(p.cash_usd_available) : 0;
  if (cashUsd > 0) {
    items.push({
      key: "cash_usd",
      label: "USD 예수금",
      valueUsd: cashUsd,
      color: CASH_USD_COLOR,
    });
  }

  const cashKrw = p.cash_krw ? Number(p.cash_krw) : 0;
  const fx = p.fx_rate ? Number(p.fx_rate) : 0;
  if (cashKrw > 0 && fx > 0) {
    items.push({
      key: "cash_krw",
      label: "KRW 예수금",
      valueUsd: cashKrw / fx,
      color: CASH_KRW_COLOR,
    });
  }

  return items;
}

export function AllocationDonut({ portfolio }: { portfolio: Portfolio }) {
  const items = buildItems(portfolio);
  const total = items.reduce((s, it) => s + it.valueUsd, 0) || 1;
  const r = 38;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <svg
        width={100}
        height={100}
        viewBox="0 0 100 100"
        className="shrink-0"
      >
        <circle
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke="var(--mm-border-soft)"
          strokeWidth={10}
        />
        {items.map((it) => {
          const frac = it.valueUsd / total;
          const len = c * frac;
          const dashOffset = -(offset / total) * c;
          const el = (
            <circle
              key={it.key}
              cx={50}
              cy={50}
              r={r}
              fill="none"
              stroke={it.color}
              strokeWidth={10}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 50 50)"
              strokeLinecap="butt"
            />
          );
          offset += it.valueUsd;
          return el;
        })}
      </svg>
      <ul className="text-sm space-y-1 flex-1">
        {items.map((it) => {
          const pct = (it.valueUsd / total) * 100;
          return (
            <li
              key={it.key}
              className="flex items-center justify-between gap-2"
            >
              <span className="inline-flex items-center gap-2">
                <span
                  className="w-[10px] h-[10px] rounded-sm"
                  style={{ background: it.color }}
                />
                <span className="font-medium">{it.label}</span>
              </span>
              <span className="font-mono tabular-nums text-mm-text-dim">
                {pct.toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
