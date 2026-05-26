import Link from "next/link";

import { krw, usd } from "@/lib/format";

type Props = {
  /** Live USD *available* cash from KIS (frcr_drwg_psbl_amt_1) — deployable now. */
  cashUsdAvailable: number | null;
  /** Total USD cash from KIS (includes unsettled buys). For context only. */
  cashUsdTotal: number | null;
  /** Live KRW cash from KIS (informational). */
  cashKrw: number | null;
  /** Current fx rate (₩ per $) for KRW-equivalent display. */
  fxRate: number | null;
  /** Tracking values from the manual fallback (used when KIS unavailable). */
  manualUsd?: number | null;
  qqqAth: number | null;
  qqqPrice: number | null;
};

export function TacticalCard({
  cashUsdAvailable,
  cashUsdTotal,
  cashKrw,
  fxRate,
  manualUsd,
  qqqAth,
  qqqPrice,
}: Props) {
  // Use *available* cash (net of unsettled buys) for the deployable reserve.
  const reserveUsd = cashUsdAvailable ?? manualUsd ?? 0;
  const reserveKrw = fxRate ? reserveUsd * fxRate : null;
  const totalUsd = cashUsdTotal ?? null;
  const pendingUsd =
    totalUsd !== null && cashUsdAvailable !== null ? totalUsd - cashUsdAvailable : null;

  const nextStep =
    qqqAth && qqqPrice !== null && reserveUsd > 0
      ? (() => {
          const drawdown = ((qqqPrice - qqqAth) / qqqAth) * 100;
          const thresholds: { th: number; cashPct: number }[] = [
            { th: -15, cashPct: 10 },
            { th: -20, cashPct: 25 },
            { th: -25, cashPct: 30 },
          ];
          const next = thresholds.find((t) => drawdown > t.th);
          return next
            ? {
                threshold: next.th,
                triggerPrice: qqqAth * (1 + next.th / 100),
                recommendedUsd: (reserveUsd * next.cashPct) / 100,
                cashPct: next.cashPct,
              }
            : null;
        })()
      : null;

  return (
    <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
      <header className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">Tactical Reserve</h3>
        <Link href="/contributions" className="text-xs text-blue-600 hover:underline">
          상세 →
        </Link>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-xs text-neutral-500">USD 주문가능 (사용 가능 총알)</div>
          <div className="text-xl font-semibold tabular-nums text-mm-accent">
            {usd(reserveUsd)}
          </div>
          <div className="text-xs text-neutral-500">≈ {reserveKrw === null ? "—" : krw(reserveKrw)}</div>
          {totalUsd !== null && pendingUsd !== null && pendingUsd > 0 && (
            <div className="text-xs text-neutral-500 mt-1">
              총 {usd(totalUsd)} 중 결제대기 {usd(pendingUsd)} 제외
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-neutral-500">KRW 예수금</div>
          <div className="text-base tabular-nums">{cashKrw === null ? "—" : krw(cashKrw)}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-500">소스</div>
          <div className="text-xs">
            {cashUsdAvailable !== null ? "KIS 자동" : manualUsd ? "수동 입력" : "데이터 없음"}
          </div>
        </div>
      </div>

      {nextStep ? (
        <div className="rounded bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-sm p-3">
          <div className="font-medium">
            다음 트리거: QQQ {nextStep.threshold}% (≈ {usd(nextStep.triggerPrice)})
          </div>
          <div className="text-xs mt-1">
            도달 시 잔액의 <b>{nextStep.cashPct}%</b> = {usd(nextStep.recommendedUsd)} 매수 권장
          </div>
        </div>
      ) : (
        <div className="rounded bg-neutral-50 dark:bg-neutral-900 text-neutral-600 dark:text-neutral-400 text-sm p-3">
          현재 활성 매수 트리거 단계 없음.
        </div>
      )}
    </article>
  );
}
