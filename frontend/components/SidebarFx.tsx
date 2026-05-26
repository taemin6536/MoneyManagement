import type { FxState } from "@/lib/api";

function bandTextStyle(band: FxState["band"]): string {
  switch (band) {
    case "below_low":
      return "text-mm-green";
    case "above_high":
      return "text-mm-red";
    default:
      return "text-mm-text-dim";
  }
}

function bandLabel(band: FxState["band"], low: string, high: string): string | null {
  switch (band) {
    case "below_low":
      return `≤ ₩${low}`;
    case "above_high":
      return `≥ ₩${high} 약세`;
    default:
      return null;
  }
}

export function SidebarFx({ data }: { data: FxState | null }) {
  if (!data || data.rate === null) {
    return (
      <div className="px-2 mb-3">
        <div className="text-[10px] text-mm-text-mute mb-[2px]">USD / KRW</div>
        <div className="text-[11px] text-mm-text-mute">—</div>
      </div>
    );
  }
  const rate = Number(data.rate);
  const dev = data.deviation_pct ? Number(data.deviation_pct) : null;
  const devColor =
    dev === null
      ? "text-mm-text-mute"
      : dev <= -1
      ? "text-mm-green"
      : dev >= 1
      ? "text-mm-red"
      : "text-mm-text-dim";
  const label = bandLabel(data.band, data.threshold_low, data.threshold_high);

  return (
    <div className="px-2 mb-3">
      <div className="text-[10px] text-mm-text-mute mb-[2px]">USD / KRW</div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[13px] font-semibold tabular-nums">
          ₩{rate.toFixed(2)}
        </span>
        {dev !== null && (
          <span className={`font-mono text-[10px] tabular-nums ${devColor}`}>
            {dev > 0 ? "+" : ""}
            {dev.toFixed(2)}%
          </span>
        )}
      </div>
      {label && (
        <div className={`text-[10px] mt-[2px] ${bandTextStyle(data.band)}`}>{label}</div>
      )}
      {data.in_dca_buy_zone && (
        <div className="text-[10px] mt-[2px] text-mm-green">✓ DCA 환전 유리</div>
      )}
    </div>
  );
}
