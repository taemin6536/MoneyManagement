import type { EquityCurvePoint, Portfolio } from "@/lib/api";
import { krw, pct, usd, usdPlain } from "@/lib/format";

import { EquityHeroChart } from "./EquityHeroChart";

type Props = {
  portfolio: Portfolio;
  equity: EquityCurvePoint[];
};

export function PortfolioHero({ portfolio, equity }: Props) {
  const totalUsd = Number(portfolio.total_eval_usd) +
    Number(portfolio.cash_usd_available ?? 0);
  const totalKrw = portfolio.total_assets_krw ? Number(portfolio.total_assets_krw) : null;
  const fxRate = portfolio.fx_rate ? Number(portfolio.fx_rate) : null;

  const plUsd = Number(portfolio.total_pl_usd);
  const plPct =
    Number(portfolio.total_eval_usd) > 0
      ? (plUsd / Number(portfolio.total_eval_usd)) * 100
      : 0;
  const plColor =
    plUsd > 0 ? "text-mm-up" : plUsd < 0 ? "text-mm-down" : "text-mm-text-dim";

  // Today change: from portfolio API (yfinance previous_close per holding).
  const todayUsd =
    portfolio.today_change_usd !== null ? Number(portfolio.today_change_usd) : null;
  const todayPct =
    portfolio.today_change_pct !== null ? Number(portfolio.today_change_pct) : null;
  const todayKrw = todayUsd !== null && fxRate ? todayUsd * fxRate : null;
  const todayColor =
    todayUsd === null
      ? "text-mm-text-dim"
      : todayUsd > 0
      ? "text-mm-up"
      : todayUsd < 0
      ? "text-mm-down"
      : "text-mm-text-dim";

  return (
    <article className="rounded-card border border-mm-border bg-mm-surface p-[22px]">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-6">
        <div className="flex flex-col gap-5">
          <div>
            <div className="mm-eyebrow">Portfolio Value</div>
            <div className="font-mono text-[40px] font-medium tabular-nums leading-none tracking-[-1px] mt-1">
              {usd(totalUsd)}
            </div>
            <div className="text-[12px] text-mm-text-dim mt-2">
              {totalKrw !== null ? `≈ ${krw(totalKrw)}` : "—"}
              {fxRate !== null && ` @ ₩${fxRate.toFixed(2)}`}
            </div>
          </div>

          <div className="border-t border-mm-border-soft pt-[18px] grid grid-cols-2 gap-4">
            <div>
              <div className="mm-eyebrow">Unrealized P/L</div>
              <div className={`font-mono text-[22px] tabular-nums mt-1 ${plColor}`}>
                {usd(plUsd)}
              </div>
              <div className="mt-1">
                <span
                  className={`text-[11px] px-2 py-[2px] rounded-chip ${
                    plUsd >= 0 ? "bg-mm-up/15 text-mm-up" : "bg-mm-down/15 text-mm-down"
                  }`}
                >
                  {plUsd >= 0 ? "▲" : "▼"} {pct(plPct)}
                </span>
              </div>
            </div>
            <div>
              <div className="mm-eyebrow">Today</div>
              <div
                className={`font-mono text-[22px] tabular-nums mt-1 ${todayColor}`}
              >
                {todayUsd === null
                  ? "—"
                  : `${todayUsd >= 0 ? "+" : "-"}$${usdPlain(Math.abs(todayUsd))}`}
              </div>
              <div className="mt-1">
                <span
                  className={`text-[11px] px-2 py-[2px] rounded-chip ${
                    todayUsd === null
                      ? "bg-mm-bg-sub text-mm-text-dim"
                      : todayUsd >= 0
                      ? "bg-mm-up/15 text-mm-up"
                      : "bg-mm-down/15 text-mm-down"
                  }`}
                >
                  {todayPct === null ? "—" : `${todayPct >= 0 ? "▲" : "▼"} ${Math.abs(todayPct).toFixed(2)}%`}
                </span>
              </div>
              {todayKrw !== null && (
                <div className={`text-[11px] mt-1 tabular-nums ${todayColor}`}>
                  {todayKrw >= 0 ? "+" : "-"}{krw(Math.abs(todayKrw))}
                </div>
              )}
            </div>
          </div>
        </div>

        <EquityHeroChart points={equity} />
      </div>
    </article>
  );
}
