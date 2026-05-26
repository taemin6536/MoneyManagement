"use client";

import { useState } from "react";

import type { Holding, Portfolio } from "@/lib/api";
import { krw, pct, usd } from "@/lib/format";

import { HoldingDrawer } from "./HoldingDrawer";
import { Sparkline } from "./Sparkline";

const TILE_BG: Record<string, string> = {
  TQQQ: "var(--mm-accent)",
  QLD: "var(--mm-violet)",
  QQQ: "var(--mm-green)",
};

function tileLabel(symbol: string): string {
  if (symbol === "TQQQ") return "T3";
  if (symbol === "QLD") return "Q2";
  return symbol.slice(0, 2);
}

type Props = {
  data: Portfolio;
  /** Map of symbol → 30-day close history. */
  sparklines: Record<string, number[]>;
};

export function HoldingsTable({ data, sparklines }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const cashUsd = data.cash_usd_available ? Number(data.cash_usd_available) : 0;
  const totalUsd = Number(data.total_eval_usd) + cashUsd;

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-[0.6px] text-mm-text-dim">
            <tr>
              <th className="text-left py-2">Symbol</th>
              <th className="text-right py-2 hidden sm:table-cell">Qty</th>
              <th className="text-right py-2 hidden md:table-cell">Avg · Last</th>
              <th className="text-right py-2">Market Value</th>
              <th className="text-right py-2">P/L</th>
              <th className="text-right py-2 hidden lg:table-cell">30D</th>
            </tr>
          </thead>
          <tbody>
            {data.holdings.map((h) => {
              const fxRate = data.fx_rate ? Number(data.fx_rate) : null;
              const evalKrw = fxRate ? Number(h.eval_usd) * fxRate : null;
              const plKrw = fxRate ? Number(h.pl_usd) * fxRate : null;
              const weightOfBook = totalUsd > 0 ? (Number(h.eval_usd) / totalUsd) * 100 : 0;
              const plColor =
                Number(h.pl_usd) > 0
                  ? "text-mm-up"
                  : Number(h.pl_usd) < 0
                  ? "text-mm-down"
                  : "text-mm-text-dim";
              return (
                <tr
                  key={h.symbol}
                  onClick={() => setSelected(h.symbol)}
                  className="border-t border-mm-border-soft hover:bg-white/[0.04] dark:hover:bg-white/[0.02] cursor-pointer"
                >
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-8 h-8 rounded-md flex items-center justify-center font-mono text-[11px] font-semibold text-black"
                        style={{ background: TILE_BG[h.symbol] ?? "var(--mm-accent)" }}
                      >
                        {tileLabel(h.symbol)}
                      </span>
                      <div>
                        <div className="font-semibold">{h.symbol}</div>
                        <div className="text-[11px] text-mm-text-mute">{h.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums hidden sm:table-cell">
                    {Number(h.quantity).toFixed(4).replace(/\.?0+$/, "")}
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums hidden md:table-cell">
                    <div className="text-mm-text-dim text-[12px]">{usd(h.avg_price)}</div>
                    <div className="font-semibold">{usd(h.current_price)}</div>
                  </td>
                  <td className="py-3 text-right font-mono tabular-nums">
                    <div className="font-semibold">{usd(h.eval_usd)}</div>
                    <div className="text-[11px] text-mm-text-mute">
                      {evalKrw === null ? "—" : krw(evalKrw)} · {weightOfBook.toFixed(1)}%
                    </div>
                  </td>
                  <td className={`py-3 text-right font-mono tabular-nums ${plColor}`}>
                    <div className="font-semibold">{usd(h.pl_usd)}</div>
                    <div className="text-[11px]">{pct(h.pl_pct)}</div>
                    {plKrw !== null && (
                      <div className="text-[11px]">{krw(plKrw)}</div>
                    )}
                  </td>
                  <td className="py-3 text-right hidden lg:table-cell">
                    <div className="inline-block">
                      <Sparkline values={sparklines[h.symbol] ?? []} width={90} height={28} />
                    </div>
                  </td>
                </tr>
              );
            })}
            {cashUsd > 0 && (
              <tr className="border-t border-mm-border-soft">
                <td className="py-3 text-mm-text-dim">Cash (USD)</td>
                <td className="py-3 text-right font-mono text-mm-text-mute hidden sm:table-cell">—</td>
                <td className="py-3 text-right font-mono text-mm-text-mute hidden md:table-cell">—</td>
                <td className="py-3 text-right font-mono tabular-nums font-semibold">
                  {usd(cashUsd)}
                </td>
                <td className="py-3 text-right font-mono text-mm-text-mute">—</td>
                <td className="py-3 text-right text-[11px] text-mm-text-mute hidden lg:table-cell">
                  {totalUsd > 0 ? ((cashUsd / totalUsd) * 100).toFixed(1) + "% of total" : "—"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <HoldingDrawer
          holding={data.holdings.find((h) => h.symbol === selected) ?? null}
          fxRate={data.fx_rate ? Number(data.fx_rate) : null}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
