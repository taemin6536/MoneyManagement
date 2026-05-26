"use client";

import { useEffect, useState } from "react";

import { fetchSparkline, type Holding, type Sparkline as SparklineData } from "@/lib/api";
import { krw, pct, usd } from "@/lib/format";

import { Sparkline } from "./Sparkline";

const TILE_BG: Record<string, string> = {
  TQQQ: "var(--mm-accent)",
  QLD: "var(--mm-violet)",
  QQQ: "var(--mm-green)",
};

type Props = {
  holding: Holding | null;
  fxRate: number | null;
  onClose: () => void;
};

export function HoldingDrawer({ holding, fxRate, onClose }: Props) {
  const [series, setSeries] = useState<SparklineData | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!holding) return;
    setOpen(true);
    setSeries(null);
    fetchSparkline(holding.symbol, 30)
      .then(setSeries)
      .catch(() => setSeries(null));
  }, [holding?.symbol]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!holding) return null;

  const plUsd = Number(holding.pl_usd);
  const plKrw = fxRate ? plUsd * fxRate : null;
  const evalKrw = fxRate ? Number(holding.eval_usd) * fxRate : null;
  const plColor =
    plUsd > 0 ? "text-mm-up" : plUsd < 0 ? "text-mm-down" : "text-mm-text-dim";

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/55 backdrop-blur-[2px] z-[100] transition-opacity duration-150 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        className={`fixed top-0 right-0 bottom-0 w-[480px] max-w-[100vw] z-[101]
          bg-mm-surface border-l border-mm-border shadow-[-20px_0_60px_rgba(0,0,0,.35)]
          transition-transform duration-200 ease-out
          ${open ? "translate-x-0 opacity-100" : "translate-x-5 opacity-0"}`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between px-[26px] py-[22px] border-b border-mm-border-soft">
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 rounded-lg flex items-center justify-center font-mono text-[13px] font-semibold text-black"
              style={{ background: TILE_BG[holding.symbol] ?? "var(--mm-accent)" }}
            >
              {holding.symbol.slice(0, 2)}
            </span>
            <div>
              <div className="font-semibold text-lg">{holding.symbol}</div>
              <div className="text-mm-text-dim text-xs">{holding.name}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded border border-mm-border-soft text-mm-text-dim hover:bg-mm-surface-2"
            aria-label="close"
          >
            ✕
          </button>
        </header>

        <div className="overflow-y-auto h-[calc(100%-72px)] px-[26px] py-5 space-y-5">
          <div className="flex justify-between items-start gap-4">
            <div>
              <div className="mm-eyebrow">Last price</div>
              <div className="font-mono text-[28px] font-medium tabular-nums">
                {usd(holding.current_price)}
              </div>
            </div>
            <div className="text-right">
              <div className="mm-eyebrow">Position</div>
              <div className="font-mono text-[16px] tabular-nums">
                {Number(holding.quantity).toFixed(4).replace(/\.?0+$/, "")} 주
              </div>
            </div>
          </div>

          <div>
            <div className="mm-eyebrow mb-2">30-day price</div>
            <div className="rounded bg-mm-bg-sub border border-mm-border-soft p-2">
              <Sparkline values={series?.closes ?? []} width={420} height={80} />
            </div>
          </div>

          <div className="rounded-card bg-mm-bg-sub border border-mm-border-soft p-4 grid grid-cols-2 gap-3 text-sm">
            <KV label="평단" value={usd(holding.avg_price)} />
            <KV label="현재가" value={usd(holding.current_price)} />
            <KV label="총 매수금" value={usd(Number(holding.avg_price) * Number(holding.quantity))} />
            <KV label="평가금" value={usd(holding.eval_usd)} highlight />
            <KV
              label="평가금 (KRW)"
              value={evalKrw === null ? "—" : krw(evalKrw)}
              span2
            />
            <KV label="평가손익 USD" value={usd(holding.pl_usd)} color={plColor} />
            <KV
              label="평가손익 KRW"
              value={plKrw === null ? "—" : krw(plKrw)}
              color={plColor}
            />
            <KV label="수익률" value={pct(holding.pl_pct)} color={plColor} />
            <KV label="비중" value={pct(holding.weight_pct)} />
          </div>
        </div>
      </aside>
    </>
  );
}

function KV({
  label,
  value,
  color,
  highlight = false,
  span2 = false,
}: {
  label: string;
  value: string;
  color?: string;
  highlight?: boolean;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? "col-span-2" : ""}>
      <div className="text-[11px] text-mm-text-mute">{label}</div>
      <div
        className={`font-mono tabular-nums ${highlight ? "font-semibold" : ""} ${
          color ?? ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
