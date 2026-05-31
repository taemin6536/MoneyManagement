"use client";

import { useState } from "react";

import { fetchNewsSummary, type NewsSummary } from "@/lib/api";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; data: NewsSummary }
  | { kind: "error" };

export function NewsSummaryPanel() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function run() {
    setState({ kind: "loading" });
    try {
      const data = await fetchNewsSummary();
      setState({ kind: "done", data });
    } catch {
      setState({ kind: "error" });
    }
  }

  const loading = state.kind === "loading";
  const hasResult = state.kind === "done" && state.data.available && !!state.data.summary;

  return (
    <article className="rounded-card border border-mm-border bg-mm-surface p-4 md:p-[18px] space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[15px]">🤖</span>
          <h3 className="font-semibold text-[14px]">AI 뉴스 요약</h3>
          <span className="text-[11px] text-mm-text-mute">최근 24시간 헤드라인</span>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="shrink-0 rounded border border-mm-accent/40 bg-mm-accent/10 px-3 py-1.5 text-[12px] font-medium text-mm-accent hover:bg-mm-accent/20 disabled:opacity-50"
        >
          {loading ? "생성 중…" : hasResult ? "다시 생성" : "AI 요약 보기"}
        </button>
      </header>

      {state.kind === "idle" && (
        <p className="text-[12px] text-mm-text-mute">
          최근 24시간 매크로 헤드라인을 한국어로 종합 요약합니다. 원문 인용 없이 AI가
          새로 쓴 요약 + 아래 원문 링크를 함께 보여드려요.
        </p>
      )}

      {loading && (
        <p className="text-[13px] text-mm-text-dim animate-pulse">
          헤드라인을 읽고 요약을 작성하는 중…
        </p>
      )}

      {state.kind === "error" && (
        <p className="text-[12px] text-mm-amber">
          요약 생성에 실패했어요. 잠시 후 다시 시도해주세요.
        </p>
      )}

      {state.kind === "done" && !state.data.available && (
        <p className="text-[12px] text-mm-text-mute">
          AI 요약이 설정되지 않았습니다. <code>ANTHROPIC_API_KEY</code>가 필요해요.
        </p>
      )}

      {state.kind === "done" && state.data.available && !state.data.summary && (
        <p className="text-[12px] text-mm-amber">
          요약을 생성하지 못했어요. 잠시 후 다시 시도해주세요.
        </p>
      )}

      {hasResult && state.kind === "done" && (
        <>
          <p className="text-[13.5px] leading-relaxed whitespace-pre-line">
            {state.data.summary}
          </p>
          {state.data.items.length > 0 && (
            <div className="border-t border-mm-border-soft pt-3">
              <div className="text-[10px] uppercase tracking-[0.6px] text-mm-text-mute mb-2">
                요약에 사용된 원문
              </div>
              <ul className="space-y-1 text-[12px]">
                {state.data.items.map((it) => (
                  <li key={it.id}>
                    <a
                      href={it.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-mm-text-dim hover:text-mm-accent hover:underline"
                    >
                      ({it.source}) {it.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="text-[10px] text-mm-text-mute">
            {state.data.model} · {new Date(state.data.generated_at).toLocaleTimeString("ko-KR")}
          </div>
        </>
      )}
    </article>
  );
}
