"use client";

import { useEffect, useState } from "react";

import { deleteEvent, type EconomicEvent } from "@/lib/api";
import { getEventInfo } from "@/lib/event-info";

import { MarkdownText } from "./MarkdownText";

function fmtKst(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function dDayLabel(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const hours = ms / (1000 * 60 * 60);
  if (hours < 0) return "지남";
  if (hours < 24) return "D-day";
  return `D-${Math.floor(hours / 24)}`;
}

function importanceBadge(importance: string): { bg: string; text: string; label: string } {
  switch (importance) {
    case "high":
      return { bg: "bg-mm-amber/15", text: "text-mm-amber", label: "HIGH" };
    case "low":
      return { bg: "bg-mm-bg-sub", text: "text-mm-text-mute", label: "LOW" };
    default:
      return { bg: "bg-mm-accent/15", text: "text-mm-accent", label: "MED" };
  }
}

export function EventDetailDrawer({
  event,
  onClose,
  onDeleted,
}: {
  event: EconomicEvent | null;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (event) setOpen(true);
  }, [event?.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!event) return null;

  const info = getEventInfo(event.category);
  const dt = event.event_at;
  const badge = importanceBadge(event.importance);

  async function onDelete() {
    if (!event) return;
    if (!confirm(`"${event.name}" 삭제할까요?`)) return;
    setDeleting(true);
    try {
      await deleteEvent(event.id);
      onDeleted(event.id);
    } catch {
      alert("삭제 실패");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 bg-black/55 backdrop-blur-[2px] z-[100] transition-opacity duration-150 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        className={`fixed top-0 right-0 bottom-0 w-full sm:w-[520px] max-w-[100vw] z-[101]
          bg-mm-surface border-l border-mm-border shadow-[-20px_0_60px_rgba(0,0,0,.35)]
          transition-transform duration-200 ease-out
          ${open ? "translate-x-0 opacity-100" : "translate-x-5 opacity-0"}`}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between px-[26px] py-[22px] border-b border-mm-border-soft gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span
                className={`rounded-pill px-2 py-0.5 text-[10px] font-semibold uppercase ${badge.bg} ${badge.text}`}
              >
                {badge.label}
              </span>
              <span className="font-mono text-[11px] text-mm-text-mute">
                [{event.country}] {event.category}
              </span>
              <span className="font-mono text-[11px] text-mm-text-mute">
                {dDayLabel(dt)}
              </span>
            </div>
            <div className="font-semibold text-[16px] leading-snug">
              {event.name}
            </div>
            <div className="text-[12px] text-mm-text-dim font-mono mt-1">
              {fmtKst(dt)} KST
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 shrink-0 rounded border border-mm-border-soft text-mm-text-dim hover:bg-mm-surface-2"
            aria-label="close"
          >
            ✕
          </button>
        </header>

        <div className="overflow-y-auto h-[calc(100%-110px)] px-[26px] py-5 space-y-5">
          {event.description && (
            <div className="rounded-card bg-mm-bg-sub border border-mm-border-soft p-3 text-[12.5px] text-mm-text-dim">
              {event.description}
            </div>
          )}

          {info ? (
            <div className="text-mm-text">
              <MarkdownText>{info}</MarkdownText>
            </div>
          ) : (
            <p className="text-[12px] text-mm-text-mute">
              이 카테고리(<code>{event.category}</code>)에 대한 상세 설명이 아직 없어요.
              일반 매크로 이벤트로 다뤄지며, 발표 직후 변동성에 유의하세요.
            </p>
          )}

          {event.source_url && (
            <div>
              <a
                href={event.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] text-mm-accent hover:underline"
              >
                공식 자료 →
              </a>
            </div>
          )}

          <div className="flex justify-end pt-3 border-t border-mm-border-soft">
            <button
              onClick={onDelete}
              disabled={deleting}
              className="rounded border border-mm-amber/40 bg-mm-amber/10 px-3 py-1.5 text-[12px] font-medium text-mm-amber hover:bg-mm-amber/20 disabled:opacity-50"
            >
              {deleting ? "삭제 중…" : "이 이벤트 삭제"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
