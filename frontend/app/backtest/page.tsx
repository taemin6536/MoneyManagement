import { BacktestClient } from "./BacktestClient";

export const dynamic = "force-dynamic";

export default function BacktestPage() {
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Backtest — Pure DCA vs Manual</h1>
        <p className="text-sm text-neutral-500">
          과거 데이터로 두 전략의 성과를 비교합니다. 매수 규칙 ①만 적용 (Rule ② 전환 / Rule ③ 과열 축소는 v1 백테스트 미포함).
        </p>
      </header>
      <BacktestClient />
    </section>
  );
}
