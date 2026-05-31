import Link from "next/link";

import type { TradeList } from "@/lib/api";

function formatDt(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TradesCard({ data }: { data: TradeList | null }) {
  if (!data || data.items.length === 0) {
    return (
      <article className="rounded-card border border-dashed border-mm-border p-4 text-sm text-mm-text-mute">
        매매 기록 없음 (한투 동기화 후 표시됩니다)
      </article>
    );
  }
  return (
    <article className="rounded-card border border-mm-border bg-mm-surface p-4 md:p-[18px] space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="font-semibold text-[14px]">📒 최근 매매</h3>
        <Link
          href="/trades"
          className="text-[11px] text-mm-accent hover:underline"
        >
          더 보기 →
        </Link>
      </header>
      <ul className="space-y-2">
        {data.items.slice(0, 3).map((t) => {
          const sideColor =
            t.side === "buy" ? "text-mm-up" : "text-mm-down";
          return (
            <li
              key={t.id}
              className="flex items-center justify-between gap-3 border-t border-mm-border-soft pt-2 first:border-t-0 first:pt-0"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`shrink-0 inline-block rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    t.side === "buy"
                      ? "bg-mm-up/15 text-mm-up"
                      : "bg-mm-down/15 text-mm-down"
                  }`}
                >
                  {t.side}
                </span>
                <span className="font-semibold text-[13px]">{t.symbol}</span>
                <span className="text-[11px] text-mm-text-mute font-mono tabular-nums truncate">
                  {Number(t.quantity).toFixed(2)} @ $
                  {Number(t.price_usd).toFixed(2)}
                </span>
              </div>
              <span
                className={`shrink-0 text-[11px] text-mm-text-mute font-mono tabular-nums`}
              >
                {formatDt(t.executed_at)}
              </span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
