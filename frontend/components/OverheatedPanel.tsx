import type { OverheatedSignals } from "@/lib/api";

function pill(active: boolean): string {
  return active
    ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
    : "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400";
}

function fmt(value: string | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toFixed(digits);
}

export function OverheatedPanel({ data }: { data: OverheatedSignals }) {
  const alertReady = data.hits >= 2;

  return (
    <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
      <header className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">Rule ③ — 과열 신호</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded ${
            alertReady
              ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"
              : "bg-neutral-100 text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400"
          }`}
        >
          {data.hits} / 3 충족 {alertReady && "(알림 발동)"}
        </span>
      </header>

      <ul className="space-y-2 text-sm">
        <li className="flex items-center justify-between">
          <div>
            <span className={`px-2 py-0.5 rounded text-xs mr-2 ${pill(data.channel_breakout)}`}>
              {data.channel_breakout ? "✓" : "·"}
            </span>
            상승채널 상단 돌파 (20D)
          </div>
          <span className="text-neutral-500 tabular-nums text-xs">
            high {fmt(data.last_high)} / ch {fmt(data.channel_high_20)}
          </span>
        </li>
        <li className="flex items-center justify-between">
          <div>
            <span className={`px-2 py-0.5 rounded text-xs mr-2 ${pill(data.rsi_overbought)}`}>
              {data.rsi_overbought ? "✓" : "·"}
            </span>
            RSI ≥ {data.rsi_threshold}
          </div>
          <span className="text-neutral-500 tabular-nums text-xs">RSI {fmt(data.rsi_14)}</span>
        </li>
        <li className="flex items-center justify-between">
          <div>
            <span className={`px-2 py-0.5 rounded text-xs mr-2 ${pill(data.fgi_extreme_greed)}`}>
              {data.fgi_extreme_greed ? "✓" : "·"}
            </span>
            공포탐욕지수 극단탐욕 (≥{data.fgi_threshold})
          </div>
          <span className="text-neutral-500 tabular-nums text-xs">
            FGI {data.fgi_score === null ? "—" : data.fgi_score.toFixed(1)}{" "}
            {data.fgi_rating && `(${data.fgi_rating})`}
          </span>
        </li>
      </ul>
    </article>
  );
}
