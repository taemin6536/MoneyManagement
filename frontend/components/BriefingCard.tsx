"use client";

import { useState } from "react";

import { fetchBriefing, type Briefing } from "@/lib/api";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; data: Briefing }
  | { kind: "error" };

export function BriefingCard() {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function run() {
    setState({ kind: "loading" });
    try {
      const data = await fetchBriefing();
      setState({ kind: "done", data });
    } catch {
      setState({ kind: "error" });
    }
  }

  const loading = state.kind === "loading";
  const hasResult = state.kind === "done" && state.data.available && !!state.data.briefing;

  return (
    <article className="rounded-card border border-mm-border bg-mm-surface p-4 md:p-[18px] space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[15px]">🤖</span>
          <h3 className="font-semibold text-[14px]">AI 브리핑</h3>
          <span className="text-[11px] text-mm-text-mute">지금 상태를 쉽게 설명</span>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="shrink-0 rounded border border-mm-accent/40 bg-mm-accent/10 px-3 py-1.5 text-[12px] font-medium text-mm-accent hover:bg-mm-accent/20 disabled:opacity-50"
        >
          {loading ? "생성 중…" : hasResult ? "다시 생성" : "지금 상태 설명"}
        </button>
      </header>

      {state.kind === "idle" && (
        <p className="text-[12px] text-mm-text-mute">
          버튼을 누르면 현재 낙폭·RSI·환율·보유 상태를 AI가 한국어로 풀어서 설명해줍니다.
        </p>
      )}

      {loading && (
        <p className="text-[13px] text-mm-text-dim animate-pulse">
          데이터를 읽고 브리핑을 작성하고 있어요…
        </p>
      )}

      {state.kind === "error" && (
        <p className="text-[12px] text-mm-amber">
          브리핑 생성에 실패했어요. 잠시 후 다시 시도해주세요.
        </p>
      )}

      {state.kind === "done" && !state.data.available && (
        <p className="text-[12px] text-mm-text-mute">
          AI 브리핑이 설정되지 않았습니다. <code>ANTHROPIC_API_KEY</code>를 추가하면 활성화됩니다.
        </p>
      )}

      {state.kind === "done" && state.data.available && !state.data.briefing && (
        <p className="text-[12px] text-mm-amber">
          브리핑을 생성하지 못했어요. 잠시 후 다시 시도해주세요.
        </p>
      )}

      {hasResult && state.kind === "done" && (
        <>
          <p className="text-[13.5px] leading-relaxed whitespace-pre-line">
            {state.data.briefing}
          </p>
          <div className="text-[10px] text-mm-text-mute">
            {state.data.model} · {new Date(state.data.generated_at).toLocaleTimeString("ko-KR")}
          </div>
        </>
      )}
    </article>
  );
}
