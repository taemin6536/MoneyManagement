"use client";

import { useMemo, useState } from "react";

import {
  createEvent,
  deleteEvent,
  type EconomicEvent,
  type EconomicEventList,
} from "@/lib/api";

function fmtKst(iso: string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...opts,
  });
}

function dDay(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const hours = ms / (1000 * 60 * 60);
  if (hours < 0) return "—";
  if (hours < 24) return "D-day";
  return `D-${Math.floor(hours / 24)}`;
}

function importanceBadge(importance: string): {
  bg: string;
  text: string;
} {
  switch (importance) {
    case "high":
      return { bg: "bg-mm-amber/15", text: "text-mm-amber" };
    case "low":
      return { bg: "bg-mm-bg-sub", text: "text-mm-text-mute" };
    default:
      return { bg: "bg-mm-accent/15", text: "text-mm-accent" };
  }
}

export function CalendarTimeline({ initial }: { initial: EconomicEventList }) {
  const [items, setItems] = useState<EconomicEvent[]>(initial.items);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"all" | "high" | "med" | "low">("all");

  const filtered = useMemo(
    () =>
      filter === "all"
        ? items
        : items.filter((e) => e.importance === filter),
    [items, filter],
  );

  // Group by KST date (YYYY-MM-DD) for visual sectioning.
  const grouped = useMemo(() => {
    const map = new Map<string, EconomicEvent[]>();
    for (const ev of filtered) {
      const key = new Date(ev.event_at).toLocaleDateString("en-CA", {
        timeZone: "Asia/Seoul",
      }); // YYYY-MM-DD
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return Array.from(map.entries()); // [[dateKey, items]]
  }, [filtered]);

  async function onAdd(payload: Parameters<typeof createEvent>[0]) {
    const ev = await createEvent(payload);
    setItems((prev) => [...prev, ev].sort((a, b) =>
      a.event_at < b.event_at ? -1 : 1,
    ));
    setShowAdd(false);
  }

  async function onDelete(id: number) {
    if (!confirm("정말 삭제할까요?")) return;
    try {
      await deleteEvent(id);
      setItems((prev) => prev.filter((e) => e.id !== id));
    } catch {
      alert("삭제 실패");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "high", "med", "low"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-pill px-3 py-1 text-[11px] border transition-colors ${
                filter === f
                  ? "bg-mm-accent/15 border-mm-accent/40 text-mm-accent"
                  : "bg-mm-bg-sub border-mm-border-soft text-mm-text-dim hover:border-mm-border"
              }`}
            >
              {f === "all" ? "전체" : f}
              <span className="font-mono tabular-nums opacity-70 ml-1">
                ({f === "all"
                  ? items.length
                  : items.filter((e) => e.importance === f).length})
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded border border-mm-accent/40 bg-mm-accent/10 px-3 py-1.5 text-[12px] font-medium text-mm-accent hover:bg-mm-accent/20"
        >
          {showAdd ? "취소" : "+ 이벤트 추가"}
        </button>
      </div>

      {showAdd && <AddForm onSubmit={onAdd} onCancel={() => setShowAdd(false)} />}

      {grouped.length === 0 ? (
        <div className="rounded-card border border-dashed border-mm-border p-8 text-center text-mm-text-mute">
          예정된 이벤트가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([dateKey, evs]) => (
            <section key={dateKey}>
              <div className="text-[11px] font-mono text-mm-text-mute mb-2 uppercase tracking-[0.6px]">
                {dateKey} · {new Date(dateKey + "T00:00:00+09:00").toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", weekday: "long" })}
              </div>
              <ul className="space-y-2">
                {evs.map((ev) => {
                  const b = importanceBadge(ev.importance);
                  return (
                    <li
                      key={ev.id}
                      className="rounded-card border border-mm-border bg-mm-surface p-4 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase ${b.bg} ${b.text}`}
                          >
                            {ev.importance}
                          </span>
                          <span className="font-mono text-[11px] text-mm-text-mute">
                            [{ev.country}] {ev.category}
                          </span>
                          <span className="font-mono text-[11px] text-mm-text-mute">
                            {dDay(ev.event_at)}
                          </span>
                        </div>
                        <div className="font-semibold text-[14px] mt-1">
                          {ev.name}
                        </div>
                        {ev.description && (
                          <div className="text-[12px] text-mm-text-dim mt-1">
                            {ev.description}
                          </div>
                        )}
                        <div className="text-[11px] text-mm-text-mute font-mono mt-1">
                          {fmtKst(ev.event_at)} KST
                        </div>
                      </div>
                      <button
                        onClick={() => onDelete(ev.id)}
                        className="shrink-0 text-[11px] text-mm-text-mute hover:text-mm-amber"
                        aria-label="delete"
                      >
                        삭제
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function AddForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (payload: Parameters<typeof createEvent>[0]) => Promise<void>;
  onCancel: () => void;
}) {
  const [date, setDate] = useState("");          // YYYY-MM-DD
  const [time, setTime] = useState("");          // HH:MM
  const [tz, setTz] = useState<"KST" | "ET" | "UTC">("KST");
  const [country, setCountry] = useState("US");
  const [category, setCategory] = useState("FOMC");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [importance, setImportance] = useState<"high" | "med" | "low">("high");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || !time || !name) return;
    let isoLocal: string;
    if (tz === "KST") isoLocal = `${date}T${time}:00+09:00`;
    else if (tz === "ET") isoLocal = `${date}T${time}:00-04:00`; // EDT — caller's responsibility around DST
    else isoLocal = `${date}T${time}:00Z`;
    const event_at = new Date(isoLocal).toISOString();
    setSubmitting(true);
    try {
      await onSubmit({
        event_at,
        country,
        category,
        name,
        description: description || null,
        importance,
      });
    } catch {
      alert("추가 실패");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-card border border-mm-border bg-mm-surface p-4 space-y-3"
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="날짜">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full rounded border border-mm-border-soft bg-mm-bg-sub px-2 py-1.5 text-[13px]"
          />
        </Field>
        <Field label="시각">
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className="w-full rounded border border-mm-border-soft bg-mm-bg-sub px-2 py-1.5 text-[13px]"
          />
        </Field>
        <Field label="시간대">
          <select
            value={tz}
            onChange={(e) => setTz(e.target.value as "KST" | "ET" | "UTC")}
            className="w-full rounded border border-mm-border-soft bg-mm-bg-sub px-2 py-1.5 text-[13px]"
          >
            <option value="KST">KST (한국)</option>
            <option value="ET">ET (미동부 — 여름 EDT 가정)</option>
            <option value="UTC">UTC</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="국가">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded border border-mm-border-soft bg-mm-bg-sub px-2 py-1.5 text-[13px]"
          >
            <option value="US">US</option>
            <option value="KR">KR</option>
            <option value="EU">EU</option>
            <option value="JP">JP</option>
            <option value="CN">CN</option>
          </select>
        </Field>
        <Field label="카테고리">
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="FOMC / CPI / NFP / PCE / BOK_RATE / EARNINGS …"
            className="w-full rounded border border-mm-border-soft bg-mm-bg-sub px-2 py-1.5 text-[13px] font-mono"
          />
        </Field>
        <Field label="중요도">
          <select
            value={importance}
            onChange={(e) =>
              setImportance(e.target.value as "high" | "med" | "low")
            }
            className="w-full rounded border border-mm-border-soft bg-mm-bg-sub px-2 py-1.5 text-[13px]"
          >
            <option value="high">high</option>
            <option value="med">med</option>
            <option value="low">low</option>
          </select>
        </Field>
      </div>
      <Field label="이름">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="FOMC 금리 결정"
          className="w-full rounded border border-mm-border-soft bg-mm-bg-sub px-2 py-1.5 text-[13px]"
        />
      </Field>
      <Field label="설명 (선택)">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded border border-mm-border-soft bg-mm-bg-sub px-2 py-1.5 text-[13px]"
        />
      </Field>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-mm-border-soft px-4 py-2 text-[12px] text-mm-text-dim hover:bg-mm-surface-2"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="rounded border border-mm-accent/40 bg-mm-accent/10 px-4 py-2 text-[12px] font-medium text-mm-accent hover:bg-mm-accent/20 disabled:opacity-50"
        >
          {submitting ? "추가 중…" : "추가"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-[0.6px] text-mm-text-mute">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
