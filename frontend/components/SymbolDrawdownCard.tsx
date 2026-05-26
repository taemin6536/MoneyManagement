import type { SymbolSummary } from "@/lib/api";
import { tsShort, usd } from "@/lib/format";

import { DrawdownGauge } from "./DrawdownGauge";

type Props = {
  data: SymbolSummary;
  /** "Reference" for QQQ (not held), "Holding" for TQQQ/QLD (held). */
  role: "Reference" | "Holding";
};

function ddColor(value: number): string {
  if (value <= -20) return "text-mm-red";
  if (value <= -10) return "text-mm-red";
  if (value <= -5) return "text-mm-amber";
  return "text-mm-text-dim";
}

export function SymbolDrawdownCard({ data, role }: Props) {
  const last = data.last_price ? Number(data.last_price) : null;
  const ath = data.ath_price ? Number(data.ath_price) : null;
  const dd = data.drawdown_pct ? Number(data.drawdown_pct) : null;

  return (
    <article className="rounded-card border border-mm-border bg-mm-surface p-[18px] space-y-3">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-[14px]">{data.symbol}</span>
          <span className="text-[11px] text-mm-text-mute">{role}</span>
        </div>
        <span className="font-mono text-[11px] text-mm-text-mute tabular-nums">
          {tsShort(data.last_ts)}
        </span>
      </header>

      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[24px] font-semibold tabular-nums leading-none">
            {last === null ? "—" : usd(last)}
          </div>
          {ath !== null && (
            <div className="text-[11px] text-mm-text-dim mt-1">
              ATH {usd(ath)}
              {data.ath_date && ` · ${data.ath_date.slice(0, 10)}`}
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="mm-eyebrow">Drawdown</div>
          <div
            className={`font-mono text-[20px] font-semibold tabular-nums ${
              dd === null ? "text-mm-text-dim" : ddColor(dd)
            }`}
          >
            {dd === null ? "—" : `${dd > 0 ? "+" : ""}${dd.toFixed(2)}%`}
          </div>
        </div>
      </div>

      <DrawdownGauge value={dd ?? 0} />

      {data.current_step_threshold && data.current_step_cash_pct && (
        <div className="rounded bg-mm-amber/10 text-mm-amber text-[12px] px-3 py-2">
          Buy step {Number(data.current_step_threshold).toFixed(0)}% reached → 현금의{" "}
          {Number(data.current_step_cash_pct).toFixed(0)}%
        </div>
      )}
    </article>
  );
}
