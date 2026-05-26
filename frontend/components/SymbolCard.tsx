import type { SymbolSummary } from "@/lib/api";

function fmtPrice(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function fmtPct(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

import { fmtKst } from "@/lib/format";

function fmtTs(value: string | null): string {
  return fmtKst(value);
}

function drawdownColor(value: string | null): string {
  if (value === null) return "text-neutral-500";
  const n = Number(value);
  if (n <= -25) return "text-red-700 dark:text-red-400";
  if (n <= -15) return "text-red-600 dark:text-red-400";
  if (n <= -5) return "text-amber-600 dark:text-amber-400";
  return "text-neutral-700 dark:text-neutral-300";
}

export function SymbolCard({ data }: { data: SymbolSummary }) {
  const stepLine =
    data.current_step_threshold && data.current_step_cash_pct
      ? `매수 단계: ${data.current_step_threshold}% 도달 → 현금의 ${data.current_step_cash_pct}%`
      : null;

  return (
    <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">{data.symbol}</h3>
        <span className="text-xs text-neutral-500">{fmtTs(data.last_ts)}</span>
      </header>

      <div>
        <div className="text-2xl font-semibold tabular-nums">{fmtPrice(data.last_price)}</div>
        <div className="text-sm text-neutral-500">
          ATH {fmtPrice(data.ath_price)}{data.ath_date ? ` (${data.ath_date.slice(0, 10)})` : ""}
        </div>
      </div>

      <div className={`text-sm ${drawdownColor(data.drawdown_pct)}`}>
        Drawdown: <span className="tabular-nums font-medium">{fmtPct(data.drawdown_pct)}</span>
      </div>

      {stepLine && (
        <div className="text-xs px-2 py-1 rounded bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-200">
          {stepLine}
        </div>
      )}
    </article>
  );
}
