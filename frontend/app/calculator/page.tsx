import { PageHeader } from "@/components/PageHeader";
import { fetchRules, fetchSymbolSummary } from "@/lib/api";

import { CalculatorClient } from "./CalculatorClient";

export const dynamic = "force-dynamic";

export default async function CalculatorPage() {
  const [rules, qqq] = await Promise.all([
    fetchRules().catch(() => null),
    fetchSymbolSummary("QQQ").catch(() => null),
  ]);

  return (
    <section className="space-y-[18px]">
      <PageHeader
        title="Split-buy Calculator"
        subtitle="QQQ 다음 매수 임계가에서 매수해야 할 USD 금액과 예상 TQQQ 주수를 미리 계산"
        timestamp={qqq?.last_ts}
      />

      {!rules || !qqq?.ath_price ? (
        <p className="text-mm-red text-sm">룰 또는 QQQ ATH 데이터를 불러올 수 없습니다.</p>
      ) : (
        <CalculatorClient
          steps={rules.buy_drawdown_steps}
          qqqAth={Number(qqq.ath_price)}
          qqqLast={qqq.last_price ? Number(qqq.last_price) : null}
          athDate={qqq.ath_date ?? null}
          drawdownPct={qqq.drawdown_pct ? Number(qqq.drawdown_pct) : null}
        />
      )}
    </section>
  );
}
