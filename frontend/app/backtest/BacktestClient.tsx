"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fetchBacktest, type BacktestResult, type BacktestStats } from "@/lib/api";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function usd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function pct(n: number): string {
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function BacktestClient() {
  const [start, setStart] = useState("2015-01-01");
  const [end, setEnd] = useState(todayIso());
  const [monthly, setMonthly] = useState("2000000");
  const [corePct, setCorePct] = useState("70");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchBacktest({
        start,
        end,
        monthly_krw: Number(monthly) || 0,
        core_pct: Number(corePct) || 0,
      });
      setResult(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <label className="block">
            <span className="text-xs text-neutral-500">시작일</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">종료일</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">월 납입 (KRW)</span>
            <input
              type="number"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              step={100000}
              className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 tabular-nums"
            />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">Core %</span>
            <input
              type="number"
              value={corePct}
              onChange={(e) => setCorePct(e.target.value)}
              step={5}
              min={0}
              max={100}
              className="mt-1 w-full rounded border border-neutral-300 dark:border-neutral-700 bg-transparent px-3 py-2 tabular-nums"
            />
          </label>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="rounded bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-400 text-white px-4 py-2 text-sm"
        >
          {loading ? "시뮬레이션 중… (10~30초)" : "실행"}
        </button>
        {error && <div className="text-sm text-red-600">{error}</div>}
      </article>

      {result && <Results result={result} />}
    </div>
  );
}

function Results({ result }: { result: BacktestResult }) {
  const diff = result.manual.final_value_usd - result.pure_dca.final_value_usd;
  const diffPct = (diff / result.pure_dca.final_value_usd) * 100;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatsCard title="Pure DCA (100% QQQ)" color="text-blue-700 dark:text-blue-400" stats={result.pure_dca} />
        <StatsCard title="Manual 70/30" color="text-emerald-700 dark:text-emerald-400" stats={result.manual} />
      </div>

      <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5">
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="font-semibold">Equity curve</h3>
          <div className={`text-sm tabular-nums ${diff >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
            Manual − Pure DCA: {diff >= 0 ? "+" : ""}{usd(diff)} ({pct(diffPct)})
          </div>
        </div>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={result.curve} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#88888822" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={48} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
              <Tooltip
                formatter={(value) => [usd(Number(value)), ""]}
                labelStyle={{ color: "#666" }}
                contentStyle={{ background: "rgba(0,0,0,0.85)", border: "none", color: "#fff" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="pure_dca_usd"
                name="Pure DCA"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="manual_usd"
                name="Manual 70/30"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="text-xs text-neutral-500 mt-3">
          기간: {result.start} ~ {result.end} ({result.months}개월) · 월납입 ₩{result.monthly_krw.toLocaleString()} · Core {result.core_pct}%
        </div>
      </article>
    </div>
  );
}

function StatsCard({
  title,
  color,
  stats,
}: {
  title: string;
  color: string;
  stats: BacktestStats;
}) {
  const totalReturn = (stats.final_value_usd / stats.total_contributed_usd - 1) * 100;
  return (
    <article className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-5 space-y-3">
      <h3 className={`font-semibold ${color}`}>{title}</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Stat label="누적 납입" value={usd(stats.total_contributed_usd)} />
        <Stat label="최종 평가" value={usd(stats.final_value_usd)} big />
        <Stat label="CAGR" value={pct(stats.cagr_pct)} />
        <Stat label="MDD" value={pct(stats.max_drawdown_pct)} negative />
        <Stat label="총 수익률" value={pct(totalReturn)} className="col-span-2" />
      </div>
    </article>
  );
}

function Stat({
  label,
  value,
  big = false,
  negative = false,
  className = "",
}: {
  label: string;
  value: string;
  big?: boolean;
  negative?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-xs text-neutral-500">{label}</div>
      <div
        className={`tabular-nums ${big ? "text-xl font-semibold" : ""} ${
          negative ? "text-red-700 dark:text-red-400" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
