import Link from "next/link";

import type { NewsList } from "@/lib/api";

function formatTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NewsCard({ data }: { data: NewsList | null }) {
  if (!data || data.items.length === 0) {
    return (
      <article className="rounded-card border border-dashed border-mm-border p-4 text-sm text-mm-text-mute">
        매크로 뉴스 없음 (피드 폴링 중일 수 있어요)
      </article>
    );
  }
  return (
    <article className="rounded-card border border-mm-border bg-mm-surface p-4 md:p-[18px] space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="font-semibold text-[14px]">📰 매크로 뉴스</h3>
        <Link
          href="/news"
          className="text-[11px] text-mm-accent hover:underline"
        >
          더 보기 →
        </Link>
      </header>
      <ul className="space-y-2">
        {data.items.slice(0, 3).map((n) => (
          <li
            key={n.id}
            className="border-t border-mm-border-soft pt-2 first:border-t-0 first:pt-0"
          >
            <a
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="block hover:underline"
            >
              <div className="text-[11px] text-mm-text-mute">
                {n.source} · {formatTime(n.published_at)}
              </div>
              <div className="text-[13px] font-medium leading-snug">
                {n.title}
              </div>
            </a>
          </li>
        ))}
      </ul>
    </article>
  );
}
