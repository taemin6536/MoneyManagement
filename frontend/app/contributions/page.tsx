import {
  fetchContributionDefaults,
  fetchContributions,
  fetchFx,
  fetchKrwCash,
  fetchKrwCashHistory,
  fetchTacticalBalance,
  fetchTacticalBuys,
  fetchTacticalDeposits,
} from "@/lib/api";
import { ContributionsClient } from "./ContributionsClient";

export const dynamic = "force-dynamic";

export default async function ContributionsPage() {
  const [defaults, contributions, balance, fx, buys, deposits, krwCash, krwHistory] =
    await Promise.all([
      fetchContributionDefaults(),
      fetchContributions(),
      fetchTacticalBalance(),
      fetchFx().catch(() => null),
      fetchTacticalBuys(),
      fetchTacticalDeposits(),
      fetchKrwCash(),
      fetchKrwCashHistory(),
    ]);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Contributions & Tactical Reserve</h1>
        <p className="text-sm text-neutral-500">
          USD/KRW 예수금은 KIS API에서 자동 추적됩니다. 아래 수동 입력 폼은 KIS 연동이 끊겼을 때나 추가 메모용 fallback.
        </p>
      </header>
      <ContributionsClient
        defaults={defaults}
        contributions={contributions}
        balance={balance}
        fxRate={fx?.rate ?? null}
        buys={buys}
        deposits={deposits}
        krwCash={krwCash}
        krwHistory={krwHistory}
      />
    </section>
  );
}
