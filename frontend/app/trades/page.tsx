import { PageHeader } from "@/components/PageHeader";
import { TradesTable } from "@/components/TradesTable";
import { fetchTrades, type TradeList } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function TradesPage() {
  let data: TradeList | null = null;
  try {
    data = await fetchTrades({ limit: 500, days: 365 });
  } catch {
    data = null;
  }

  return (
    <section className="space-y-[18px]">
      <PageHeader
        title="Trades"
        subtitle="한투 자동 동기화 + 수동 메모. 행 클릭으로 체결 시점 시장 상태와 메모를 봅니다."
      />

      {!data ? (
        <div className="rounded-card border border-dashed border-mm-border p-8 text-center text-mm-text-mute">
          거래 목록을 불러오는 데 실패했어요.
        </div>
      ) : (
        <TradesTable initial={data} />
      )}
    </section>
  );
}
