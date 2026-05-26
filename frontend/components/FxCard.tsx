import type { FxState } from "@/lib/api";
import { fmtKst } from "@/lib/format";

function bandStyle(band: FxState["band"]): string {
  switch (band) {
    case "below_low":
      return "text-green-700 dark:text-green-400";
    case "above_high":
      return "text-red-700 dark:text-red-400";
    case "neutral":
      return "text-neutral-700 dark:text-neutral-300";
    default:
      return "text-neutral-500";
  }
}

function bandLabel(band: FxState["band"], low: string, high: string): string {
  switch (band) {
    case "below_low":
      return `≤ ₩${low} — USD 매입 검토`;
    case "above_high":
      return `≥ ₩${high} — 원화 약세 주의`;
    case "neutral":
      return `중립 (₩${low}–₩${high})`;
    default:
      return "데이터 없음";
  }
}

export function FxCard({ data }: { data: FxState }) {
  const rate = data.rate ? Number(data.rate) : null;
  const sma = data.sma_30 ? Number(data.sma_30) : null;
  const dev = data.deviation_pct ? Number(data.deviation_pct) : null;
  return (
    <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
      <header className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">USD / KRW</h3>
        <span className="text-xs text-neutral-500">{fmtKst(data.ts)}</span>
      </header>
      <div className="text-2xl font-semibold tabular-nums">
        {rate === null ? "—" : `₩${rate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`}
      </div>
      <div className={`text-sm ${bandStyle(data.band)}`}>
        {bandLabel(data.band, data.threshold_low, data.threshold_high)}
      </div>
      {sma !== null && dev !== null && (
        <div className="border-t border-neutral-100 dark:border-neutral-900 pt-3 text-sm">
          <div className="flex justify-between text-xs text-neutral-500">
            <span>30D 평균</span>
            <span className="tabular-nums">₩{sma.toFixed(2)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-neutral-500">평균 대비</span>
            <span className={`tabular-nums text-sm ${dev <= -1 ? "text-green-700 dark:text-green-400" : dev >= 1 ? "text-red-700 dark:text-red-400" : ""}`}>
              {dev > 0 ? "+" : ""}{dev.toFixed(2)}%
            </span>
          </div>
          {data.in_dca_buy_zone && (
            <div className="mt-2 text-xs rounded bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200 px-2 py-1">
              ✓ Tactical 환전 / USD 매입 유리 구간
            </div>
          )}
        </div>
      )}
    </article>
  );
}
