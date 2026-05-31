import Link from "next/link";

import type { EconomicEventList } from "@/lib/api";

function dDay(isoUtc: string): { dLabel: string; dt: Date } {
  const dt = new Date(isoUtc);
  const ms = dt.getTime() - Date.now();
  const hours = ms / (1000 * 60 * 60);
  if (hours < 0) return { dLabel: "지남", dt };
  if (hours < 24) return { dLabel: "D-day", dt };
  const days = Math.floor(hours / 24);
  return { dLabel: `D-${days}`, dt };
}

function fmtKst(dt: Date): string {
  return dt.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function NextEventCard({ data }: { data: EconomicEventList | null }) {
  const high = data?.items.find((e) => e.importance === "high");
  if (!high) {
    return (
      <article className="rounded-card border border-dashed border-mm-border p-4 text-sm text-mm-text-mute">
        예정된 매크로 이벤트 없음
      </article>
    );
  }
  const { dLabel, dt } = dDay(high.event_at);
  const others = (data?.items ?? [])
    .filter((e) => e.id !== high.id && e.importance === "high")
    .slice(0, 2);

  return (
    <article className="rounded-card border border-mm-border bg-mm-surface p-4 md:p-[18px] space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="font-semibold text-[14px]">📅 다음 매크로 이벤트</h3>
        <Link
          href="/calendar"
          className="text-[11px] text-mm-accent hover:underline"
        >
          더 보기 →
        </Link>
      </header>

      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] text-mm-text-mute">
            [{high.country}] {high.category}
          </div>
          <div className="font-semibold text-[15px] leading-snug truncate">
            {high.name}
          </div>
          <div className="text-[11px] text-mm-text-dim mt-1 font-mono">
            {fmtKst(dt)} KST
          </div>
        </div>
        <div
          className={`shrink-0 rounded-pill px-3 py-1 text-[12px] font-semibold tabular-nums ${
            dLabel === "D-day"
              ? "bg-mm-amber/15 text-mm-amber"
              : "bg-mm-accent/15 text-mm-accent"
          }`}
        >
          {dLabel}
        </div>
      </div>

      {others.length > 0 && (
        <ul className="space-y-1 text-[11px] text-mm-text-mute border-t border-mm-border-soft pt-2">
          {others.map((ev) => {
            const { dLabel: d2, dt: dt2 } = dDay(ev.event_at);
            return (
              <li key={ev.id} className="flex justify-between gap-3">
                <span className="truncate">
                  [{ev.country}] {ev.name}
                </span>
                <span className="font-mono tabular-nums shrink-0">
                  {d2} · {fmtKst(dt2)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
