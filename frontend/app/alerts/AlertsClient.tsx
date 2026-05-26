"use client";

import { useMemo, useState } from "react";

import { SlackMessagePreview } from "@/components/SlackMessagePreview";
import { StatusPill } from "@/components/StatusPill";
import type { AlertRow } from "@/lib/api";
import { tsShort } from "@/lib/format";

type Filter = "all" | "rule_buy_drawdown" | "rule_sell_recovery" | "rule_overheated" | "rule_fx";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "rule_buy_drawdown", label: "Buy DCA" },
  { id: "rule_sell_recovery", label: "Sell" },
  { id: "rule_overheated", label: "Overheat" },
  { id: "rule_fx", label: "FX" },
];

function rulePill(ruleId: string): string {
  return ruleId.replace(/^rule_/, "");
}

export function AlertsClient({ alerts }: { alerts: AlertRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return alerts;
    if (filter === "rule_fx") return alerts.filter((a) => a.rule_id.startsWith("rule_fx"));
    return alerts.filter((a) => a.rule_id === filter);
  }, [alerts, filter]);

  return (
    <article className="rounded-card border border-mm-border bg-mm-surface overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-[18px] py-[14px] border-b border-mm-border-soft flex-wrap">
        <div className="flex items-baseline gap-3">
          <h3 className="font-semibold">Alert log</h3>
          <span className="text-[11px] text-mm-text-mute">{filtered.length} entries</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1 rounded-pill text-[11px] border ${
                  active
                    ? "border-mm-accent bg-mm-accent/15 text-mm-accent"
                    : "border-mm-border-soft text-mm-text-dim hover:bg-mm-surface-2"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </header>

      {filtered.length === 0 ? (
        <p className="p-6 text-sm text-mm-text-mute">조건에 맞는 알림이 없습니다.</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead className="text-[11px] uppercase tracking-[0.6px] text-mm-text-dim bg-mm-bg-sub">
            <tr>
              <th className="text-left px-[18px] py-2">#</th>
              <th className="text-left px-[18px] py-2">Fired</th>
              <th className="text-left px-[18px] py-2">Rule</th>
              <th className="text-left px-[18px] py-2">Level</th>
              <th className="text-left px-[18px] py-2">Payload</th>
              <th className="text-right px-[18px] py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => {
              const isOpen = expanded === a.id;
              return (
                <FragmentRow
                  key={a.id}
                  alert={a}
                  open={isOpen}
                  onToggle={() => setExpanded(isOpen ? null : a.id)}
                />
              );
            })}
          </tbody>
        </table>
      )}
    </article>
  );
}

function FragmentRow({
  alert,
  open,
  onToggle,
}: {
  alert: AlertRow;
  open: boolean;
  onToggle: () => void;
}) {
  const payloadString = JSON.stringify(alert.payload);
  return (
    <>
      <tr
        onClick={onToggle}
        className="border-t border-mm-border-soft hover:bg-white/[0.03] dark:hover:bg-white/[0.02] cursor-pointer"
      >
        <td className="px-[18px] py-3">
          <span className="text-mm-text-mute mr-1">{open ? "▾" : "▸"}</span>
          <span className="font-mono text-[11px] text-mm-text-dim tabular-nums">#{String(alert.id).padStart(3, "0")}</span>
        </td>
        <td className="px-[18px] py-3 font-mono text-[12px] tabular-nums">{tsShort(alert.fired_at)}</td>
        <td className="px-[18px] py-3">
          <span className="px-2 py-[2px] rounded-chip text-[11px] bg-mm-accent/15 text-mm-accent">
            {rulePill(alert.rule_id)}
          </span>
        </td>
        <td className="px-[18px] py-3 font-mono text-[12px] text-mm-violet">{alert.level}</td>
        <td className="px-[18px] py-3 font-mono text-[11px] text-mm-text-mute max-w-[280px] truncate">
          {payloadString === "{}" ? "—" : payloadString}
        </td>
        <td className="px-[18px] py-3 text-right">
          <StatusPill status={alert.status} />
        </td>
      </tr>
      {open && (
        <tr className="bg-mm-bg-sub">
          <td colSpan={6} className="px-[18px] py-5">
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
              <div>
                <div className="mm-eyebrow mb-2">Slack delivery · #mm-alerts</div>
                <SlackMessagePreview
                  ruleId={alert.rule_id}
                  level={alert.level}
                  payload={alert.payload}
                  firedAt={alert.fired_at}
                />
              </div>
              <div>
                <div className="mm-eyebrow mb-2">Metadata · Payload</div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px] mb-3">
                  <dt className="text-mm-text-mute">id</dt>
                  <dd className="font-mono">#{String(alert.id).padStart(3, "0")}</dd>
                  <dt className="text-mm-text-mute">fired_at</dt>
                  <dd className="font-mono">{tsShort(alert.fired_at)}</dd>
                  <dt className="text-mm-text-mute">level</dt>
                  <dd className="font-mono text-mm-violet">{alert.level}</dd>
                  <dt className="text-mm-text-mute">status</dt>
                  <dd>
                    <StatusPill status={alert.status} />
                  </dd>
                </dl>
                <pre className="text-[11px] font-mono text-mm-text-dim bg-mm-surface border border-mm-border-soft rounded p-3 max-h-48 overflow-auto">
                  {JSON.stringify(alert.payload, null, 2)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
