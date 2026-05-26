"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  deleteContribution,
  deleteKrwCash,
  deleteTacticalDeposit,
  postContribution,
  postKrwCash,
  postTacticalBuy,
  postTacticalDeposit,
  type Contribution,
  type ContributionDefaults,
  type KrwCash,
  type KrwSnapshot,
  type TacticalBalance,
  type TacticalBuy,
  type TacticalDeposit,
} from "@/lib/api";
import { krw, usd } from "@/lib/format";

type Props = {
  defaults: ContributionDefaults;
  contributions: Contribution[];
  balance: TacticalBalance;
  fxRate: string | null;
  buys: TacticalBuy[];
  deposits: TacticalDeposit[];
  krwCash: KrwCash;
  krwHistory: KrwSnapshot[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ContributionsClient({
  defaults,
  contributions,
  balance,
  fxRate,
  buys,
  deposits,
  krwCash,
  krwHistory,
}: Props) {
  const router = useRouter();
  const [date, setDate] = useState(todayIso());
  const [amountStr, setAmountStr] = useState(defaults.amount_krw);
  const [coreStr, setCoreStr] = useState(defaults.core_pct);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = Math.max(0, Number(amountStr) || 0);
  const corePct = Math.max(0, Math.min(100, Number(coreStr) || 0));
  const corePreview = Math.round((amount * corePct) / 100);
  const tacticalPreview = amount - corePreview;
  const fx = fxRate ? Number(fxRate) : null;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await postContribution({
        contribution_date: date,
        amount_krw: String(amount),
        core_pct: String(corePct),
        note: note || undefined,
      });
      setNote("");
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("이 납입 기록을 삭제할까요? Tactical 잔액이 그만큼 줄어듭니다.")) return;
    try {
      await deleteContribution(id);
      router.refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="space-y-8">
      <CashSummary tactical={balance} krwCash={krwCash} />

      <details className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5">
        <summary className="cursor-pointer text-sm text-neutral-500">
          수동 입력 폼 (KIS 미설정 / 보조용) — 펼치기
        </summary>
        <div className="mt-4 space-y-6">
          <KrwCashForm krwCash={krwCash} onSaved={() => router.refresh()} />
          <KrwCashHistory history={krwHistory} onDeleted={() => router.refresh()} />
          <UsdDepositForm fxRate={fx} onSaved={() => router.refresh()} />
          <UsdDepositHistory deposits={deposits} onDeleted={() => router.refresh()} />
        </div>
      </details>

      <details className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5">
        <summary className="cursor-pointer text-sm text-neutral-500">
          KRW 자동 분배 방식 (Core 70% / Tactical 30%) — 펼쳐서 보기
        </summary>
        <div className="mt-4 space-y-6">
      <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
        <h3 className="font-semibold">이번 납입 기록</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <label className="block">
            <span className="text-xs text-neutral-500">날짜</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">금액 (KRW)</span>
            <input
              type="number"
              inputMode="numeric"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 tabular-nums"
              step={10000}
              min={0}
            />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">Core %</span>
            <input
              type="number"
              inputMode="decimal"
              value={coreStr}
              onChange={(e) => setCoreStr(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 tabular-nums"
              step={5}
              min={0}
              max={100}
            />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">메모 (선택)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예: 5월 급여"
              className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm pt-2 border-t border-neutral-100 dark:border-neutral-900">
          <div>
            <div className="text-xs text-neutral-500">→ Core (QQQ 즉시 매수)</div>
            <div className="tabular-nums font-medium">
              {krw(corePreview)}
              {fx && corePreview > 0 && (
                <span className="text-neutral-500 ml-2">≈ {usd(corePreview / fx)}</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">→ Tactical (예수금 적립)</div>
            <div className="tabular-nums font-medium">
              {krw(tacticalPreview)}
              {fx && tacticalPreview > 0 && (
                <span className="text-neutral-500 ml-2">≈ {usd(tacticalPreview / fx)}</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">참고 환율</div>
            <div className="tabular-nums">{fx ? `₩${fx.toFixed(2)}` : "—"}</div>
          </div>
        </div>

        {error && <div className="text-sm text-red-600">{error}</div>}

        <div>
          <button
            onClick={submit}
            disabled={submitting || amount <= 0}
            className="rounded bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white px-4 py-2 text-sm"
          >
            {submitting ? "기록 중…" : "기록하기"}
          </button>
        </div>
      </article>

      <ContributionHistory contributions={contributions} onDelete={remove} />
        </div>
      </details>

      <TacticalBuyForm balance={balance} fxRate={fx} onSaved={() => router.refresh()} />

      <TacticalBuyHistory buys={buys} />
    </div>
  );
}

function UsdDepositForm({
  fxRate,
  onSaved,
}: {
  fxRate: number | null;
  onSaved: () => void;
}) {
  const [depositDate, setDepositDate] = useState(todayIso());
  const [amountStr, setAmountStr] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = Math.max(0, Number(amountStr) || 0);
  const krwEquiv = fxRate && amount > 0 ? amount * fxRate : null;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await postTacticalDeposit({
        deposit_date: depositDate,
        amount_usd: String(amount),
        note: note || undefined,
      });
      setAmountStr("");
      setNote("");
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
      <header>
        <h3 className="font-semibold">USD 직접 입금 (Tactical 적립)</h3>
        <p className="text-xs text-neutral-500">
          이미 환전된 USD 잔액을 입력하면 그대로 Tactical Reserve로 들어갑니다. 환율은 자동 기록.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="block">
          <span className="text-xs text-neutral-500">입금일</span>
          <input
            type="date"
            value={depositDate}
            onChange={(e) => setDepositDate(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">금액 (USD)</span>
          <input
            type="number"
            inputMode="decimal"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            min={0}
            step={10}
            placeholder="예: 1300"
            className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">메모 (선택)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 5월 환전분"
            className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          />
        </label>
      </div>
      <div className="text-xs text-neutral-500 flex gap-4">
        <span>예상 KRW 환산: {krwEquiv ? krw(krwEquiv) : "—"}</span>
        <span>참고 환율: {fxRate ? `₩${fxRate.toFixed(2)}` : "—"}</span>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <button
        onClick={submit}
        disabled={submitting || amount <= 0}
        className="rounded bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white px-4 py-2 text-sm"
      >
        {submitting ? "기록 중…" : "입금 기록"}
      </button>
    </article>
  );
}

function UsdDepositHistory({
  deposits,
  onDeleted,
}: {
  deposits: TacticalDeposit[];
  onDeleted: () => void;
}) {
  async function remove(id: number) {
    if (!confirm("이 입금 기록을 삭제할까요? Tactical 잔액이 그만큼 줄어듭니다.")) return;
    try {
      await deleteTacticalDeposit(id);
      onDeleted();
    } catch (e) {
      alert(String(e));
    }
  }

  if (deposits.length === 0) return null;

  return (
    <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <header className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-900">
        <h3 className="font-semibold">USD 입금 이력</h3>
      </header>
      <table className="w-full text-sm">
        <thead className="text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-900">
          <tr>
            <th className="text-left px-4 py-2">입금일</th>
            <th className="text-right px-4 py-2">USD</th>
            <th className="text-right px-4 py-2">KRW 환산</th>
            <th className="text-right px-4 py-2">환율</th>
            <th className="text-left px-4 py-2">메모</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {deposits.map((d) => (
            <tr key={d.id} className="border-t border-neutral-100 dark:border-neutral-900 tabular-nums">
              <td className="px-4 py-2">{d.deposit_date}</td>
              <td className="px-4 py-2 text-right font-medium">{usd(d.amount_usd)}</td>
              <td className="px-4 py-2 text-right">{d.amount_krw ? krw(d.amount_krw) : "—"}</td>
              <td className="px-4 py-2 text-right">{d.fx_rate ? Number(d.fx_rate).toFixed(2) : "—"}</td>
              <td className="px-4 py-2 text-left text-neutral-600 dark:text-neutral-400">{d.note ?? ""}</td>
              <td className="px-4 py-2 text-right">
                <button onClick={() => remove(d.id)} className="text-xs text-red-600 hover:underline">
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function CashSummary({
  tactical,
  krwCash,
}: {
  tactical: TacticalBalance;
  krwCash: KrwCash;
}) {
  const reserveUsd = tactical.usd ? Number(tactical.usd) : null;
  const reserveKrwEquiv = Number(tactical.krw);
  const krwAmount = Number(krwCash.amount_krw);
  const krwUsdEquiv = krwCash.amount_usd_equiv ? Number(krwCash.amount_usd_equiv) : null;
  const totalUsdView =
    reserveUsd !== null && krwUsdEquiv !== null ? reserveUsd + krwUsdEquiv : null;
  const totalKrwView = reserveKrwEquiv + krwAmount;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">통장 잔고 한눈에</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
          <div className="text-xs text-neutral-500">USD 잔고 (Tactical = TQQQ 매수 가능)</div>
          <div className="text-xl font-semibold tabular-nums mt-1">
            {reserveUsd === null ? "—" : usd(reserveUsd)}
          </div>
          <div className="text-xs text-neutral-500 mt-1">≈ {krw(reserveKrwEquiv)}</div>
        </div>
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
          <div className="text-xs text-neutral-500">KRW 잔고 (예수금, 미환전)</div>
          <div className="text-xl font-semibold tabular-nums mt-1">{krw(krwAmount)}</div>
          <div className="text-xs text-neutral-500 mt-1">
            ≈ {krwUsdEquiv === null ? "—" : usd(krwUsdEquiv)}
            {krwCash.as_of_date && (
              <span className="ml-2">· 기준일 {krwCash.as_of_date}</span>
            )}
          </div>
        </div>
        <div className="rounded-lg border border-mm-accent/40 bg-mm-accent/10 p-4">
          <div className="text-xs text-mm-accent">총 가용 현금</div>
          <div className="text-xl font-semibold tabular-nums mt-1">
            {totalUsdView === null ? "—" : usd(totalUsdView)}
          </div>
          <div className="text-xs text-neutral-500 mt-1">≈ {krw(totalKrwView)}</div>
        </div>
      </div>
      <p className="text-xs text-neutral-500">
        매수 알람 권장액은 <b>USD 잔고(Tactical)</b> 만으로 계산합니다. KRW 잔고는 정보용 — 환전 후
        USD 직접 입금 폼에 추가하면 Tactical에 반영됩니다.
      </p>
    </div>
  );
}

function KrwCashForm({
  krwCash,
  onSaved,
}: {
  krwCash: KrwCash;
  onSaved: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [amountStr, setAmountStr] = useState(String(krwCash.amount_krw ?? ""));
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = Math.max(0, Number(amountStr) || 0);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await postKrwCash({
        as_of_date: date,
        amount_krw: String(amount),
        note: note || undefined,
      });
      setNote("");
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
      <header>
        <h3 className="font-semibold">KRW 잔고 갱신 (예수금)</h3>
        <p className="text-xs text-neutral-500">
          통장에 남은 원화 금액을 입력하면 그 시점의 스냅샷으로 저장됩니다. 가장 최근 입력이 "현재
          잔고"가 됩니다. 환전 / 입출금 있을 때마다 업데이트하세요.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <label className="block">
          <span className="text-xs text-neutral-500">기준일</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">현재 잔액 (KRW)</span>
          <input
            type="number"
            inputMode="numeric"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            min={0}
            step={10000}
            className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">메모 (선택)</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 환전 후 잔액 / 급여 입금"
            className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          />
        </label>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <button
        onClick={submit}
        disabled={submitting}
        className="rounded bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white px-4 py-2 text-sm"
      >
        {submitting ? "저장 중…" : "잔고 저장"}
      </button>
    </article>
  );
}

function KrwCashHistory({
  history,
  onDeleted,
}: {
  history: KrwSnapshot[];
  onDeleted: () => void;
}) {
  async function remove(id: number) {
    if (!confirm("이 KRW 잔고 스냅샷을 삭제할까요? 이전 스냅샷이 현재 잔고가 됩니다.")) return;
    try {
      await deleteKrwCash(id);
      onDeleted();
    } catch (e) {
      alert(String(e));
    }
  }

  if (history.length === 0) return null;
  return (
    <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <header className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-900">
        <h3 className="font-semibold">KRW 잔고 이력</h3>
      </header>
      <table className="w-full text-sm">
        <thead className="text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-900">
          <tr>
            <th className="text-left px-4 py-2">기준일</th>
            <th className="text-right px-4 py-2">잔액</th>
            <th className="text-left px-4 py-2">메모</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {history.map((h) => (
            <tr key={h.id} className="border-t border-neutral-100 dark:border-neutral-900 tabular-nums">
              <td className="px-4 py-2">{h.as_of_date}</td>
              <td className="px-4 py-2 text-right font-medium">{krw(h.amount_krw)}</td>
              <td className="px-4 py-2 text-left text-neutral-600 dark:text-neutral-400">{h.note ?? ""}</td>
              <td className="px-4 py-2 text-right">
                <button onClick={() => remove(h.id)} className="text-xs text-red-600 hover:underline">
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function Stat({ label, value, big = false }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`tabular-nums ${big ? "text-xl font-semibold" : "text-base"} mt-1`}>{value}</div>
    </div>
  );
}

function ContributionHistory({
  contributions,
  onDelete,
}: {
  contributions: Contribution[];
  onDelete: (id: number) => void;
}) {
  if (contributions.length === 0) {
    return (
      <p className="text-sm text-neutral-500">아직 기록된 납입이 없습니다.</p>
    );
  }
  return (
    <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <header className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-900">
        <h3 className="font-semibold">납입 이력</h3>
      </header>
      <table className="w-full text-sm">
        <thead className="text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-900">
          <tr>
            <th className="text-left px-4 py-2">날짜</th>
            <th className="text-right px-4 py-2">금액</th>
            <th className="text-right px-4 py-2">Core %</th>
            <th className="text-right px-4 py-2">Core</th>
            <th className="text-right px-4 py-2">Tactical</th>
            <th className="text-right px-4 py-2">환율</th>
            <th className="text-left px-4 py-2">메모</th>
            <th className="px-4 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {contributions.map((c) => (
            <tr key={c.id} className="border-t border-neutral-100 dark:border-neutral-900 tabular-nums">
              <td className="px-4 py-2">{c.contribution_date}</td>
              <td className="px-4 py-2 text-right">{krw(c.amount_krw)}</td>
              <td className="px-4 py-2 text-right">{Number(c.core_pct).toFixed(0)}%</td>
              <td className="px-4 py-2 text-right">{krw(c.core_krw)}</td>
              <td className="px-4 py-2 text-right">{krw(c.tactical_krw)}</td>
              <td className="px-4 py-2 text-right">{c.fx_rate ? Number(c.fx_rate).toFixed(2) : "—"}</td>
              <td className="px-4 py-2 text-left text-neutral-600 dark:text-neutral-400">{c.note ?? ""}</td>
              <td className="px-4 py-2 text-right">
                <button
                  onClick={() => onDelete(c.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  삭제
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

function TacticalBuyForm({
  balance,
  fxRate,
  onSaved,
}: {
  balance: TacticalBalance;
  fxRate: number | null;
  onSaved: () => void;
}) {
  const [buyDate, setBuyDate] = useState(todayIso());
  const [symbol, setSymbol] = useState("TQQQ");
  const [amountKrwStr, setAmountKrwStr] = useState("");
  const [ruleLevel, setRuleLevel] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountKrw = Math.max(0, Number(amountKrwStr) || 0);
  const reserveKrw = Number(balance.krw);
  const tooMuch = amountKrw > reserveKrw;
  const estUsd = fxRate && amountKrw > 0 ? amountKrw / fxRate : null;

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await postTacticalBuy({
        buy_date: buyDate,
        symbol,
        amount_krw: String(amountKrw),
        rule_level: ruleLevel || undefined,
        note: note || undefined,
      });
      setAmountKrwStr("");
      setRuleLevel("");
      setNote("");
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
      <header>
        <h3 className="font-semibold">Tactical 매수 기록</h3>
        <p className="text-xs text-neutral-500">
          알람 받고 실제로 TQQQ/QLD 매수했을 때, 사용한 원화 금액을 여기에 기록하세요. Tactical 잔액에서 차감됩니다.
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <label className="block">
          <span className="text-xs text-neutral-500">매수일</span>
          <input
            type="date"
            value={buyDate}
            onChange={(e) => setBuyDate(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">종목</span>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          >
            <option value="TQQQ">TQQQ</option>
            <option value="QLD">QLD</option>
            <option value="QQQ">QQQ</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">사용 금액 (KRW)</span>
          <input
            type="number"
            value={amountKrwStr}
            onChange={(e) => setAmountKrwStr(e.target.value)}
            min={0}
            step={10000}
            className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">트리거 단계 (선택)</span>
          <input
            type="text"
            value={ruleLevel}
            onChange={(e) => setRuleLevel(e.target.value)}
            placeholder="예: drawdown_-15"
            className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs text-neutral-500">메모</span>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
          />
        </label>
      </div>
      <div className="text-xs text-neutral-500 space-x-4">
        <span>예상 USD: {estUsd === null ? "—" : usd(estUsd)}</span>
        <span>잔액 대비: {reserveKrw > 0 ? ((amountKrw / reserveKrw) * 100).toFixed(1) : "0"}%</span>
      </div>
      {tooMuch && (
        <div className="text-sm text-amber-700 dark:text-amber-300">
          ⚠ 잔액({krw(reserveKrw)})보다 많은 금액입니다. 실제 잔액과 어긋날 수 있어요.
        </div>
      )}
      {error && <div className="text-sm text-red-600">{error}</div>}
      <button
        onClick={submit}
        disabled={submitting || amountKrw <= 0}
        className="rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-400 text-white px-4 py-2 text-sm"
      >
        {submitting ? "기록 중…" : "매수 기록"}
      </button>
    </article>
  );
}

function TacticalBuyHistory({ buys }: { buys: TacticalBuy[] }) {
  if (buys.length === 0) return null;
  return (
    <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 overflow-hidden">
      <header className="px-4 py-3 border-b border-neutral-100 dark:border-neutral-900">
        <h3 className="font-semibold">Tactical 매수 이력</h3>
      </header>
      <table className="w-full text-sm">
        <thead className="text-xs text-neutral-500 bg-neutral-50 dark:bg-neutral-900">
          <tr>
            <th className="text-left px-4 py-2">매수일</th>
            <th className="text-left px-4 py-2">종목</th>
            <th className="text-right px-4 py-2">KRW</th>
            <th className="text-right px-4 py-2">USD</th>
            <th className="text-left px-4 py-2">트리거</th>
            <th className="text-left px-4 py-2">메모</th>
          </tr>
        </thead>
        <tbody>
          {buys.map((b) => (
            <tr key={b.id} className="border-t border-neutral-100 dark:border-neutral-900 tabular-nums">
              <td className="px-4 py-2">{b.buy_date}</td>
              <td className="px-4 py-2 font-medium">{b.symbol}</td>
              <td className="px-4 py-2 text-right">{krw(b.amount_krw)}</td>
              <td className="px-4 py-2 text-right">{b.amount_usd ? usd(b.amount_usd) : "—"}</td>
              <td className="px-4 py-2 text-left font-mono text-xs">{b.rule_level ?? ""}</td>
              <td className="px-4 py-2 text-left text-neutral-600 dark:text-neutral-400">{b.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
