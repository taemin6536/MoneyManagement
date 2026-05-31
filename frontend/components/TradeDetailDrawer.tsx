"use client";

import { useEffect, useState } from "react";

import { patchTrade, type Trade } from "@/lib/api";

const RULE_OPTIONS = [
  { value: "", label: "(미지정)" },
  { value: "drawdown_-15", label: "분할매수 1단계 (-15%)" },
  { value: "drawdown_-20", label: "분할매수 2단계 (-20%)" },
  { value: "drawdown_-25", label: "분할매수 3단계 (-25%)" },
  { value: "ath_recovery", label: "전고점 회복 → QLD 전환" },
  { value: "overheated", label: "과열 신호 → QLD 축소" },
  { value: "fx_dca", label: "환율 DCA (저점 환전)" },
  { value: "manual", label: "수동 판단 (룰 외)" },
];

export function TradeDetailDrawer({
  trade,
  onClose,
  onSaved,
}: {
  trade: Trade | null;
  onClose: () => void;
  onSaved: (updated: Trade) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [rule, setRule] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!trade) return;
    setOpen(true);
    setNote(trade.note ?? "");
    setRule(trade.rule_level ?? "");
  }, [trade?.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!trade) return null;

  async function save() {
    if (!trade) return;
    setSaving(true);
    try {
      const updated = await patchTrade(trade.id, {
        note: note || null,
        rule_level: rule || null,
      });
      onSaved(updated);
    } catch {
      // Silent fail — user can retry
    } finally {
      setSaving(false);
    }
  }

  const snap = trade.snapshot ?? {};
  const dt = new Date(trade.executed_at);
  const sideColor = trade.side === "buy" ? "text-mm-up" : "text-mm-down";
  const sideBg = trade.side === "buy" ? "bg-mm-up/15" : "bg-mm-down/15";

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/55 backdrop-blur-[2px] z-[100] transition-opacity duration-150 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        className={`fixed top-0 right-0 bottom-0 w-full sm:w-[480px] max-w-[100vw] z-[101]
          bg-mm-surface border-l border-mm-border shadow-[-20px_0_60px_rgba(0,0,0,.35)]
          transition-transform duration-200 ease-out
          ${open ? "translate-x-0 opacity-100" : "translate-x-5 opacity-0"}`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-center justify-between px-[26px] py-[22px] border-b border-mm-border-soft">
          <div className="flex items-center gap-3">
            <span
              className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold uppercase ${sideBg} ${sideColor}`}
            >
              {trade.side}
            </span>
            <div>
              <div className="font-semibold text-lg">{trade.symbol}</div>
              <div className="text-mm-text-dim text-xs font-mono">
                {dt.toLocaleString("ko-KR")}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded border border-mm-border-soft text-mm-text-dim hover:bg-mm-surface-2"
            aria-label="close"
          >
            ✕
          </button>
        </header>

        <div className="overflow-y-auto h-[calc(100%-72px)] px-[26px] py-5 space-y-5">
          {/* Execution detail */}
          <div className="rounded-card bg-mm-bg-sub border border-mm-border-soft p-4 grid grid-cols-2 gap-3 text-sm">
            <KV label="수량" value={`${Number(trade.quantity).toFixed(4).replace(/\.?0+$/, "")} 주`} />
            <KV label="체결가" value={`$${Number(trade.price_usd).toFixed(2)}`} />
            <KV label="총액" value={`$${Number(trade.total_usd).toFixed(2)}`} highlight />
            <KV label="소스" value={trade.source === "kis_sync" ? "한투 자동" : "수동"} />
          </div>

          {/* Market snapshot */}
          <div>
            <div className="mm-eyebrow mb-2">체결 시점 시장 상태</div>
            <div className="rounded-card bg-mm-bg-sub border border-mm-border-soft p-4 grid grid-cols-2 gap-3 text-sm">
              <KV label="QQQ 가격" value={snap.qqq_price !== undefined ? `$${snap.qqq_price.toFixed(2)}` : "—"} />
              <KV
                label="QQQ ATH"
                value={snap.qqq_ath !== undefined ? `$${snap.qqq_ath.toFixed(2)}` : "—"}
              />
              <KV
                label="ATH 대비 낙폭"
                value={
                  snap.drawdown_pct !== undefined ? `${snap.drawdown_pct.toFixed(2)}%` : "—"
                }
                highlight
              />
              <KV
                label="USD/KRW"
                value={snap.usd_krw !== undefined ? `₩${snap.usd_krw.toFixed(2)}` : "—"}
              />
              <KV
                label="TQQQ"
                value={snap.tqqq_price !== undefined ? `$${snap.tqqq_price.toFixed(2)}` : "—"}
              />
              <KV
                label="QLD"
                value={snap.qld_price !== undefined ? `$${snap.qld_price.toFixed(2)}` : "—"}
              />
              <KV label="VIX" value={snap.vix !== undefined ? snap.vix.toFixed(2) : "—"} />
            </div>
            <div className="text-[10px] text-mm-text-mute mt-1">
              RSI·FGI·채널 상태는 과거 시점 데이터가 없어 표시되지 않습니다.
            </div>
          </div>

          {/* Editable */}
          <div>
            <div className="mm-eyebrow mb-2">트리거 룰</div>
            <select
              value={rule}
              onChange={(e) => setRule(e.target.value)}
              className="w-full rounded border border-mm-border-soft bg-mm-bg-sub px-3 py-2 text-[13px] outline-none"
            >
              {RULE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mm-eyebrow mb-2">메모</div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              placeholder="왜 이때 샀는지, 무슨 생각이었는지 자유롭게 적어둬요."
              className="w-full rounded border border-mm-border-soft bg-mm-bg-sub px-3 py-2 text-[13px] outline-none leading-relaxed"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={onClose}
              className="rounded border border-mm-border-soft px-4 py-2 text-[12px] text-mm-text-dim hover:bg-mm-surface-2"
            >
              닫기
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="rounded border border-mm-accent/40 bg-mm-accent/10 px-4 py-2 text-[12px] font-medium text-mm-accent hover:bg-mm-accent/20 disabled:opacity-50"
            >
              {saving ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function KV({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-mm-text-mute">{label}</div>
      <div
        className={`font-mono tabular-nums ${
          highlight ? "font-semibold" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
