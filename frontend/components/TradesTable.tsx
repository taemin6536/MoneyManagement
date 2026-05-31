"use client";

import { useMemo, useState } from "react";

import { syncTradesFromKis, type Trade, type TradeList } from "@/lib/api";
import { TradeDetailDrawer } from "./TradeDetailDrawer";

function fmtDt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TradesTable({ initial }: { initial: TradeList }) {
  const [items, setItems] = useState<Trade[]>(initial.items);
  const [symbols] = useState<string[]>(initial.symbols);
  const [selected, setSelected] = useState<Trade | null>(null);
  const [sym, setSym] = useState<string | null>(null);
  const [side, setSide] = useState<"buy" | "sell" | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      items.filter(
        (t) =>
          (!sym || t.symbol === sym) && (!side || t.side === side),
      ),
    [items, sym, side],
  );

  async function runSync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await syncTradesFromKis(365);
      setSyncMsg(`동기화 완료 — 새 거래 ${r.inserted}건 (${r.fetched}건 조회)`);
      // Force a refresh by reloading the page (server-rendered list).
      window.location.reload();
    } catch (e) {
      setSyncMsg("동기화 실패. 한투 API 상태를 확인하세요.");
    } finally {
      setSyncing(false);
    }
  }

  function onSaved(updated: Trade) {
    setItems((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setSelected(updated);
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Chip
            label="전체"
            active={sym === null}
            onClick={() => setSym(null)}
            count={items.length}
          />
          {symbols.map((s) => {
            const c = items.filter((t) => t.symbol === s).length;
            if (c === 0) return null;
            return (
              <Chip
                key={s}
                label={s}
                active={sym === s}
                onClick={() => setSym(s)}
                count={c}
              />
            );
          })}
          <span className="text-mm-border-soft mx-2">·</span>
          <Chip
            label="all"
            active={side === null}
            onClick={() => setSide(null)}
            count={items.length}
          />
          <Chip
            label="BUY"
            active={side === "buy"}
            onClick={() => setSide("buy")}
            count={items.filter((t) => t.side === "buy").length}
          />
          <Chip
            label="SELL"
            active={side === "sell"}
            onClick={() => setSide("sell")}
            count={items.filter((t) => t.side === "sell").length}
          />
        </div>
        <div className="flex items-center gap-2">
          {syncMsg && (
            <span className="text-[11px] text-mm-text-mute">{syncMsg}</span>
          )}
          <button
            onClick={runSync}
            disabled={syncing}
            className="rounded border border-mm-accent/40 bg-mm-accent/10 px-3 py-1.5 text-[12px] font-medium text-mm-accent hover:bg-mm-accent/20 disabled:opacity-50"
          >
            {syncing ? "동기화 중…" : "한투 동기화"}
          </button>
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-mm-border p-8 text-center text-sm text-mm-text-mute">
          조건에 맞는 매매가 없어요. 우측 상단 "한투 동기화"로 가져오기.
        </div>
      ) : (
        <div className="rounded-card border border-mm-border bg-mm-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[0.6px] text-mm-text-dim bg-mm-bg-sub">
              <tr>
                <th className="text-left px-[18px] py-2">Date</th>
                <th className="text-left px-[18px] py-2">Side</th>
                <th className="text-left px-[18px] py-2">Symbol</th>
                <th className="text-right px-[18px] py-2 hidden sm:table-cell">
                  Qty
                </th>
                <th className="text-right px-[18px] py-2">Price</th>
                <th className="text-right px-[18px] py-2">Total</th>
                <th className="text-left px-[18px] py-2 hidden md:table-cell">
                  Rule
                </th>
                <th className="text-left px-[18px] py-2 hidden lg:table-cell">
                  Note
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const sideColor =
                  t.side === "buy" ? "text-mm-up" : "text-mm-down";
                const sideBg =
                  t.side === "buy" ? "bg-mm-up/15" : "bg-mm-down/15";
                return (
                  <tr
                    key={t.id}
                    onClick={() => setSelected(t)}
                    className="border-t border-mm-border-soft hover:bg-white/[0.04] dark:hover:bg-white/[0.02] cursor-pointer"
                  >
                    <td className="px-[18px] py-3 font-mono tabular-nums text-[12px]">
                      {fmtDt(t.executed_at)}
                    </td>
                    <td className="px-[18px] py-3">
                      <span
                        className={`rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase ${sideBg} ${sideColor}`}
                      >
                        {t.side}
                      </span>
                    </td>
                    <td className="px-[18px] py-3 font-semibold">{t.symbol}</td>
                    <td className="px-[18px] py-3 text-right font-mono tabular-nums hidden sm:table-cell">
                      {Number(t.quantity).toFixed(4).replace(/\.?0+$/, "")}
                    </td>
                    <td className="px-[18px] py-3 text-right font-mono tabular-nums">
                      ${Number(t.price_usd).toFixed(2)}
                    </td>
                    <td className="px-[18px] py-3 text-right font-mono font-semibold tabular-nums">
                      ${Number(t.total_usd).toFixed(2)}
                    </td>
                    <td className="px-[18px] py-3 text-mm-text-dim text-[12px] hidden md:table-cell">
                      {t.rule_level ?? "—"}
                    </td>
                    <td className="px-[18px] py-3 text-mm-text-dim text-[12px] hidden lg:table-cell max-w-[260px] truncate">
                      {t.note ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <TradeDetailDrawer
        trade={selected}
        onClose={() => setSelected(null)}
        onSaved={onSaved}
      />
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-pill px-3 py-1 text-[11px] border transition-colors ${
        active
          ? "bg-mm-accent/15 border-mm-accent/40 text-mm-accent"
          : "bg-mm-bg-sub border-mm-border-soft text-mm-text-dim hover:border-mm-border"
      }`}
    >
      {label}{" "}
      <span className="font-mono tabular-nums opacity-70">({count})</span>
    </button>
  );
}
