"use client";

import { useEffect, useMemo, useState } from "react";

import type { BuyStep } from "@/lib/api";
import { krw, pct, usd, usdPlain } from "@/lib/format";

type Props = {
  steps: BuyStep[];
  qqqAth: number;
  qqqLast: number | null;
  athDate?: string | null;
  drawdownPct?: number | null;
};

const STORAGE_KEY = "mm.calc";

export function CalculatorClient({ steps, qqqAth, qqqLast, athDate, drawdownPct }: Props) {
  const [cashStr, setCashStr] = useState("10000");
  const [tqqqPriceStr, setTqqqPriceStr] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.cash) setCashStr(String(parsed.cash));
        if (parsed.tqqqPrice) setTqqqPriceStr(String(parsed.tqqqPrice));
      }
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ cash: cashStr, tqqqPrice: tqqqPriceStr }));
    } catch {
      /* ignore */
    }
  }, [cashStr, tqqqPriceStr]);

  const cash = Math.max(0, Number(cashStr) || 0);
  const tqqqPrice = Number(tqqqPriceStr);

  const { rows, totalBuy, maxBuy } = useMemo(() => {
    let remaining = cash;
    const out = steps.map((s) => {
      const thresholdPct = Number(s.threshold_pct);
      const cashPct = Number(s.cash_pct);
      const triggerQqq = qqqAth * (1 + thresholdPct / 100);
      const buyUsd = (remaining * cashPct) / 100;
      const shares = tqqqPrice > 0 ? buyUsd / tqqqPrice : null;
      remaining = Math.max(0, remaining - buyUsd);
      const reached = qqqLast !== null && qqqLast <= triggerQqq;
      return { thresholdPct, cashPct, triggerQqq, buyUsd, shares, remaining, reached };
    });
    const totalBuy = out.reduce((acc, r) => acc + r.buyUsd, 0);
    const maxBuy = Math.max(0, ...out.map((r) => r.buyUsd));
    return { rows: out, totalBuy, maxBuy };
  }, [cash, steps, qqqAth, qqqLast, tqqqPrice]);

  const remainsAfter = Math.max(0, cash - totalBuy);
  const totalPctOfCash = cash > 0 ? (totalBuy / cash) * 100 : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-[18px]">
      <div className="space-y-[14px]">
        <article className="rounded-card border border-mm-border bg-mm-surface p-[18px] space-y-3">
          <header className="flex items-baseline justify-between">
            <h3 className="font-semibold text-[14px]">Inputs</h3>
            <span className="text-[11px] text-mm-text-mute">실시간 재계산</span>
          </header>
          <InputField
            label="Cash pool"
            prefix="$"
            value={cashStr}
            onChange={setCashStr}
            step={100}
          />
          <InputField
            label="TQQQ price"
            prefix="$"
            value={tqqqPriceStr}
            onChange={setTqqqPriceStr}
            step={0.01}
            hint="비워두면 주수 환산 생략"
          />
        </article>

        <article className="rounded-card border border-mm-border bg-mm-surface p-[18px] space-y-3">
          <h3 className="font-semibold text-[14px]">Reference</h3>
          <dl className="text-[12px] space-y-2">
            <Kv label="QQQ ATH" value={usd(qqqAth)} />
            <Kv label="QQQ last" value={qqqLast === null ? "—" : usd(qqqLast)} />
            <Kv label="ATH date" value={athDate ? athDate.slice(0, 10) : "—"} />
            <Kv
              label="Drawdown now"
              value={drawdownPct === null || drawdownPct === undefined ? "—" : pct(drawdownPct)}
              highlight
            />
          </dl>
        </article>

        <article
          className="rounded-card p-[18px] space-y-2"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--mm-accent) 10%, transparent) 0%, color-mix(in srgb, var(--mm-violet) 10%, transparent) 100%)",
            border: "1px solid color-mix(in srgb, var(--mm-accent) 35%, transparent)",
          }}
        >
          <div className="mm-eyebrow">Total deploy</div>
          <div className="font-mono text-[28px] font-semibold tabular-nums text-mm-accent leading-none">
            {usd(totalBuy)}
          </div>
          <div className="text-[11px] text-mm-text-dim">
            {totalPctOfCash.toFixed(1)}% of initial cash · {usd(remainsAfter)} remains
          </div>
        </article>
      </div>

      <article className="rounded-card border border-mm-border bg-mm-surface overflow-hidden">
        <header className="px-[18px] py-[14px] border-b border-mm-border-soft">
          <h3 className="font-semibold">Split-buy ladder</h3>
          <div className="text-[11px] text-mm-text-mute mt-1">
            각 단계는 그 시점의 남은 현금 기준으로 비율 적용
          </div>
        </header>
        <table className="w-full text-[13px]">
          <thead className="text-[11px] uppercase tracking-[0.6px] text-mm-text-dim bg-mm-bg-sub">
            <tr>
              <th className="text-left px-[18px] py-2">Step</th>
              <th className="text-right px-[18px] py-2">QQQ trigger</th>
              <th className="text-right px-[18px] py-2">% Cash</th>
              <th className="text-right px-[18px] py-2">Buy USD</th>
              <th className="text-right px-[18px] py-2">TQQQ shares</th>
              <th className="text-right px-[18px] py-2">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const widthPct = maxBuy > 0 ? (r.buyUsd / maxBuy) * 100 : 0;
              return (
                <tr
                  key={r.thresholdPct}
                  className="border-t border-mm-border-soft"
                >
                  <td className="px-[18px] py-3">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`w-[10px] h-[10px] rounded-full ${
                          r.reached
                            ? "bg-mm-green shadow-[0_0_8px_var(--mm-green)]"
                            : "border border-mm-border-soft"
                        }`}
                      />
                      <span className="font-mono tabular-nums font-semibold">{r.thresholdPct}%</span>
                    </span>
                  </td>
                  <td className="px-[18px] py-3 text-right font-mono tabular-nums">
                    {usd(r.triggerQqq)}
                  </td>
                  <td className="px-[18px] py-3 text-right font-mono text-mm-text-dim tabular-nums">
                    {r.cashPct}%
                  </td>
                  <td className="px-[18px] py-3 text-right">
                    <div className="inline-flex items-center gap-2 justify-end">
                      <span className="font-mono font-semibold tabular-nums text-mm-accent">
                        {usd(r.buyUsd)}
                      </span>
                      <span className="w-[60px] h-1 rounded bg-mm-border-soft overflow-hidden">
                        <span
                          className="block h-full bg-mm-accent"
                          style={{ width: `${widthPct}%` }}
                        />
                      </span>
                    </div>
                  </td>
                  <td className="px-[18px] py-3 text-right">
                    {r.shares === null ? (
                      <span className="text-mm-text-mute">—</span>
                    ) : (
                      <div className="font-mono tabular-nums">
                        {r.shares.toFixed(2)}
                        <div className="text-[10px] text-mm-text-mute">shares</div>
                      </div>
                    )}
                  </td>
                  <td className="px-[18px] py-3 text-right font-mono text-mm-text-dim tabular-nums">
                    {usd(r.remaining)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-mm-border bg-mm-bg-sub">
              <td className="px-[18px] py-3 font-semibold" colSpan={3}>
                Total deployed
              </td>
              <td className="px-[18px] py-3 text-right font-mono font-semibold tabular-nums">
                {usd(totalBuy)}
              </td>
              <td className="px-[18px] py-3 text-right text-[11px] text-mm-text-mute" colSpan={2}>
                {totalPctOfCash.toFixed(1)}% deployed
              </td>
            </tr>
          </tfoot>
        </table>
      </article>
    </div>
  );
}

function InputField({
  label,
  prefix,
  value,
  onChange,
  step,
  hint,
}: {
  label: string;
  prefix?: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-mm-text-mute uppercase tracking-[0.6px]">{label}</span>
      <div className="mt-1 flex items-center rounded border border-mm-border-soft bg-mm-bg-sub px-3 py-2">
        {prefix && (
          <span className="font-mono text-[14px] text-mm-text-mute mr-1">{prefix}</span>
        )}
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          step={step}
          min={0}
          className="bg-transparent flex-1 font-mono tabular-nums text-[18px] outline-none"
        />
      </div>
      {hint && <span className="text-[10px] italic text-mm-text-mute">{hint}</span>}
    </label>
  );
}

function Kv({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-mm-text-mute">{label}</dt>
      <dd
        className={`font-mono tabular-nums ${
          highlight ? "text-mm-accent font-semibold" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
