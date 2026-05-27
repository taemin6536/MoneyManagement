import { AllocationDonut } from "@/components/AllocationDonut";
import { AutoRefresh } from "@/components/AutoRefresh";
import { BriefingCard } from "@/components/BriefingCard";
import { HoldingsTable } from "@/components/HoldingsTable";
import { OverheatedSignalsCard } from "@/components/OverheatedSignalsCard";
import { PageHeader } from "@/components/PageHeader";
import { PortfolioHero } from "@/components/PortfolioHero";
import { RsiChart } from "@/components/RsiChart";
import { SymbolDrawdownCard } from "@/components/SymbolDrawdownCard";
import { TacticalCard } from "@/components/TacticalCard";
import {
  fetchEquityCurve,
  fetchOverheatedSignals,
  fetchPortfolio,
  fetchRsiHistory,
  fetchSparkline,
  fetchSymbolSummary,
  fetchTacticalBalance,
  type EquityCurve,
  type OverheatedSignals,
  type Portfolio,
  type RsiHistory,
  type Sparkline,
  type SymbolSummary,
  type TacticalBalance,
} from "@/lib/api";

export const dynamic = "force-dynamic";

const SYMBOLS = ["QQQ", "TQQQ", "QLD"] as const;

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  // Round 1 — portfolio first so we know which symbols to spark-line.
  const portfolio = await safe<Portfolio>(fetchPortfolio);

  // Strategy-reference symbols are always shown; holdings (any ad-hoc symbols
  // the user bought) get spark-lines added dynamically.
  const symbolsToSpark = Array.from(
    new Set<string>([
      ...SYMBOLS,
      ...(portfolio?.holdings.map((h) => h.symbol.toUpperCase()) ?? []),
    ]),
  );

  // Round 2 — everything else in parallel.
  const [equity, tactical, signals, rsi, qqq, tqqq, qld, ...sparkResults] =
    await Promise.all([
      safe<EquityCurve>(() => fetchEquityCurve(365, "USD")),
      safe<TacticalBalance>(fetchTacticalBalance),
      safe<OverheatedSignals>(fetchOverheatedSignals),
      safe<RsiHistory>(() => fetchRsiHistory(30, "QQQ")),
      safe<SymbolSummary>(() => fetchSymbolSummary("QQQ")),
      safe<SymbolSummary>(() => fetchSymbolSummary("TQQQ")),
      safe<SymbolSummary>(() => fetchSymbolSummary("QLD")),
      ...symbolsToSpark.map((s) => safe<Sparkline>(() => fetchSparkline(s, 30))),
    ]);

  const sparklines: Record<string, number[]> = Object.fromEntries(
    symbolsToSpark.map((s, i) => [s, sparkResults[i]?.closes ?? []]),
  );

  const symbolData: Record<string, SymbolSummary | null> = {
    QQQ: qqq,
    TQQQ: tqqq,
    QLD: qld,
  };

  return (
    <section className="space-y-[18px]">
      <AutoRefresh intervalSec={30} />
      <PageHeader
        title="Dashboard"
        subtitle="QQQ drawdown 기반 매수 단계 추적 · TQQQ/QLD 보유 · 30초 auto-refresh"
        timestamp={portfolio?.fetched_at}
      />

      <BriefingCard />

      {portfolio && portfolio.configured && equity ? (
        <PortfolioHero portfolio={portfolio} equity={equity.points} />
      ) : (
        <div className="rounded-card border border-dashed border-mm-border p-8 text-center text-mm-text-dim">
          {portfolio?.configured === false
            ? "KIS API 자격증명이 없어 포트폴리오를 표시할 수 없습니다."
            : "포트폴리오 데이터를 불러오는 중…"}
        </div>
      )}

      {portfolio && portfolio.configured && (
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-[18px]">
          <article className="rounded-card border border-mm-border bg-mm-surface p-[18px]">
            <header className="flex items-baseline justify-between mb-3">
              <h3 className="font-semibold">Holdings</h3>
              <span className="font-mono text-[11px] text-mm-text-mute tabular-nums">
                Updated {portfolio.fetched_at.slice(5, 16).replace("T", " ")}
              </span>
            </header>
            <HoldingsTable data={portfolio} sparklines={sparklines} />
          </article>
          <article className="rounded-card border border-mm-border bg-mm-surface p-[18px]">
            <header className="mb-3">
              <h3 className="font-semibold">Allocation</h3>
              <div className="text-[11px] text-mm-text-mute">By position weight</div>
            </header>
            <AllocationDonut holdings={portfolio.holdings} />
          </article>
        </div>
      )}

      <TacticalCard
        cashUsdAvailable={
          portfolio?.cash_usd_available ? Number(portfolio.cash_usd_available) : null
        }
        cashUsdTotal={portfolio?.cash_usd ? Number(portfolio.cash_usd) : null}
        cashKrw={portfolio?.cash_krw ? Number(portfolio.cash_krw) : null}
        fxRate={portfolio?.fx_rate ? Number(portfolio.fx_rate) : null}
        manualUsd={tactical?.usd ? Number(tactical.usd) : null}
        qqqAth={qqq?.ath_price ? Number(qqq.ath_price) : null}
        qqqPrice={qqq?.last_price ? Number(qqq.last_price) : null}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[18px]">
        {SYMBOLS.map((s) => {
          const d = symbolData[s];
          if (!d) {
            return (
              <article
                key={s}
                className="rounded-card border border-dashed border-mm-border p-4 text-mm-text-mute text-sm"
              >
                {s} 데이터 없음
              </article>
            );
          }
          return (
            <SymbolDrawdownCard
              key={s}
              data={d}
              role={s === "QQQ" ? "Reference" : "Holding"}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-[18px]">
        {signals ? (
          <OverheatedSignalsCard data={signals} />
        ) : (
          <div className="rounded-card border border-dashed border-mm-border p-6 text-mm-text-mute text-sm">
            과열 신호 데이터 로드 실패
          </div>
        )}
        <article className="rounded-card border border-mm-border bg-mm-surface p-[18px] space-y-3">
          <header className="flex items-baseline justify-between">
            <div>
              <div className="mm-eyebrow">RSI · QQQ · 14-day · 30d window</div>
            </div>
            <span className="font-mono text-[11px] text-mm-text-mute tabular-nums">
              Now {rsi && rsi.values.length > 0 ? rsi.values[rsi.values.length - 1].toFixed(1) : "—"}
            </span>
          </header>
          <RsiChart values={rsi?.values ?? []} />
          <div className="flex items-center gap-4 text-[11px] text-mm-text-mute">
            <span className="inline-flex items-center gap-1">
              <span className="w-[6px] h-[6px] rounded-full bg-mm-green" />
              30 oversold
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-[6px] h-[6px] rounded-full bg-mm-border" />
              50 neutral
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-[6px] h-[6px] rounded-full bg-mm-red" />
              70 overbought
            </span>
          </div>
        </article>
      </div>
    </section>
  );
}
