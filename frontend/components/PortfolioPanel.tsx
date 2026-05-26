import type { Portfolio } from "@/lib/api";
import { fmtKst } from "@/lib/format";

function usd(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function krw(value: string | null): string {
  if (value === null) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  return `₩${n.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`;
}

function pct(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n)) return value;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function plColor(value: string): string {
  const n = Number(value);
  if (Number.isNaN(n) || n === 0) return "text-mm-text-dim";
  return n > 0 ? "text-mm-up" : "text-mm-down";
}

export function PortfolioPanel({ data }: { data: Portfolio }) {
  if (!data.configured) {
    return (
      <article className="rounded-lg border border-dashed border-neutral-300 dark:border-neutral-700 p-5 text-sm text-neutral-500">
        <h3 className="text-lg font-semibold mb-2 text-neutral-700 dark:text-neutral-300">
          Portfolio
        </h3>
        한국투자증권 KIS API 자격증명이 설정되지 않았습니다. <code>.env</code>에 <code>KIS_APP_KEY</code> /{" "}
        <code>KIS_APP_SECRET</code> / <code>KIS_ACCOUNT_NUMBER</code>를 채우면 잔고가 자동으로 표시됩니다.
      </article>
    );
  }

  const totalPl = Number(data.total_pl_usd);

  return (
    <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <h3 className="text-lg font-semibold">Portfolio</h3>
        <div className="text-xs text-neutral-500">{fmtKst(data.fetched_at)}</div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-xs text-neutral-500">보유종목 평가 (USD)</div>
          <div className="text-xl font-semibold tabular-nums">{usd(data.total_eval_usd)}</div>
          <div className="text-xs text-neutral-500">≈ {krw(data.total_eval_krw)}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">평가손익</div>
          <div className={`text-xl font-semibold tabular-nums ${plColor(data.total_pl_usd)}`}>
            {usd(data.total_pl_usd)}
            {!Number.isNaN(totalPl) && data.total_eval_usd && Number(data.total_eval_usd) > 0 && (
              <span className="text-sm ml-2">
                ({pct(((totalPl / Number(data.total_eval_usd)) * 100).toString())})
              </span>
            )}
          </div>
          {data.fx_rate && (
            <div className={`text-xs ${plColor(data.total_pl_usd)} tabular-nums`}>
              {krw(totalPl * Number(data.fx_rate))}
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-neutral-500">총자산 (KIS)</div>
          <div className="text-xl font-semibold tabular-nums">{krw(data.total_assets_krw)}</div>
          {data.fx_rate && (
            <div className="text-xs text-neutral-500">@ ₩{Number(data.fx_rate).toFixed(2)}</div>
          )}
        </div>
      </div>

      {(data.cash_usd || data.cash_krw) && (
        <div className="rounded-md bg-mm-bg-sub border border-mm-border-soft p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs text-neutral-500">USD 주문가능 (Tactical)</div>
            <div className="font-medium tabular-nums text-mm-accent">
              {usd(data.cash_usd_available)}
            </div>
            <div className="text-xs text-neutral-500">
              총 {usd(data.cash_usd)} 중 결제대기 제외
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">KRW 예수금</div>
            <div className="font-medium tabular-nums">{krw(data.cash_krw)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">총자산</div>
            <div className="font-medium tabular-nums">{krw(data.total_assets_krw)}</div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">소스</div>
            <div className="text-xs text-neutral-500">KIS 자동 추적</div>
          </div>
        </div>
      )}

      {data.holdings.length === 0 ? (
        <p className="text-sm text-neutral-500">잔고에 해외주식 포지션 없음.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500">
              <tr>
                <th className="text-left py-2">종목</th>
                <th className="text-right py-2">수량</th>
                <th className="text-right py-2">평단</th>
                <th className="text-right py-2">현재가</th>
                <th className="text-right py-2">평가 USD</th>
                <th className="text-right py-2">평가 KRW</th>
                <th className="text-right py-2">손익</th>
                <th className="text-right py-2">비중</th>
              </tr>
            </thead>
            <tbody>
              {data.holdings.map((h) => {
                const evalKrw =
                  data.fx_rate && h.eval_usd
                    ? String(Number(h.eval_usd) * Number(data.fx_rate))
                    : null;
                return (
                <tr key={h.symbol} className="border-t border-neutral-100 dark:border-neutral-900 tabular-nums">
                  <td className="py-2">
                    <div className="font-medium">{h.symbol}</div>
                    <div className="text-xs text-neutral-500">{h.name}</div>
                  </td>
                  <td className="py-2 text-right">{Number(h.quantity).toFixed(4).replace(/\.?0+$/, "")}</td>
                  <td className="py-2 text-right">{usd(h.avg_price)}</td>
                  <td className="py-2 text-right">{usd(h.current_price)}</td>
                  <td className="py-2 text-right font-medium">{usd(h.eval_usd)}</td>
                  <td className="py-2 text-right">{krw(evalKrw)}</td>
                  <td className={`py-2 text-right ${plColor(h.pl_usd)}`}>
                    <div>
                      {usd(h.pl_usd)} <span className="text-xs">({pct(h.pl_pct)})</span>
                    </div>
                    {data.fx_rate && (
                      <div className="text-xs">{krw(Number(h.pl_usd) * Number(data.fx_rate))}</div>
                    )}
                  </td>
                  <td className="py-2 text-right">{pct(h.weight_pct)}</td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
