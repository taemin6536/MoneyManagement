"use client";

import { useMemo, useState } from "react";

import type { NewsItem, NewsList } from "@/lib/api";

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NewsTimeline({ data }: { data: NewsList }) {
  const [source, setSource] = useState<string | null>(null);
  const filtered = useMemo<NewsItem[]>(
    () => (source ? data.items.filter((n) => n.source === source) : data.items),
    [data.items, source],
  );

  return (
    <div className="space-y-4">
      {/* Source filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          label="전체"
          active={source === null}
          onClick={() => setSource(null)}
          count={data.items.length}
        />
        {data.sources.map((s) => {
          const count = data.items.filter((n) => n.source === s).length;
          if (count === 0) return null;
          return (
            <FilterChip
              key={s}
              label={s}
              active={source === s}
              onClick={() => setSource(s)}
              count={count}
            />
          );
        })}
      </div>

      {/* Timeline list */}
      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-mm-border p-8 text-center text-sm text-mm-text-mute">
          해당 소스의 뉴스가 없어요.
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((n) => (
            <li
              key={n.id}
              className="rounded-card border border-mm-border bg-mm-surface p-4 hover:border-mm-border-soft"
            >
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <div className="flex items-baseline justify-between gap-3 text-[11px] text-mm-text-mute mb-1">
                  <span className="font-mono">{n.source}</span>
                  <span className="font-mono tabular-nums">
                    {formatTime(n.published_at)}
                  </span>
                </div>
                <div className="text-[14px] font-semibold leading-snug group-hover:text-mm-accent">
                  {n.title}
                </div>
                {n.description && (
                  <p className="text-[12.5px] text-mm-text-dim leading-relaxed mt-1.5 line-clamp-3">
                    {n.description}
                  </p>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
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
      {label} <span className="font-mono tabular-nums opacity-70">({count})</span>
    </button>
  );
}
