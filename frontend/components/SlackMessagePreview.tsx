import { fmtKst } from "@/lib/format";

type Props = {
  ruleId: string;
  level: string;
  payload: Record<string, unknown>;
  firedAt: string;
};

const RULE_COLOR: Record<string, string> = {
  rule_buy_drawdown: "var(--mm-green)",
  rule_sell_recovery: "var(--mm-red)",
  rule_overheated: "var(--mm-amber)",
  rule_fx_threshold: "var(--mm-violet)",
  rule_fx_dca_timing: "var(--mm-violet)",
};

function ruleLabel(ruleId: string): string {
  return ruleId.replace(/^rule_/, "");
}

function emoji(ruleId: string): string {
  if (ruleId === "rule_buy_drawdown") return "📉";
  if (ruleId === "rule_sell_recovery") return "🚀";
  if (ruleId === "rule_overheated") return "🔥";
  if (ruleId.startsWith("rule_fx")) return "💱";
  return "🔔";
}

function bodyLines(ruleId: string, level: string, payload: Record<string, unknown>): string[] {
  if (ruleId === "rule_buy_drawdown") {
    const pl = payload as Record<string, string | number | null>;
    const lines = [
      `*QQQ ${pl.threshold_pct ?? ""}% 도달 — TQQQ 분할 매수 (${pl.cash_pct ?? ""}%)*`,
      `Drawdown ${pl.drawdown_pct ?? ""}% (price ${pl.qqq_price ?? ""} / ATH ${pl.qqq_ath ?? ""})`,
    ];
    if (pl.cash_usd) {
      lines.push(`현재 현금 $${pl.cash_usd} 기준 권장 매수액: USD`);
    }
    return lines;
  }
  if (ruleId === "rule_sell_recovery") {
    return ["*QQQ 전고점 회복 — TQQQ 전량 매도 → QLD 전환*", "지정 임계 갭 이내 진입"];
  }
  if (ruleId === "rule_overheated") {
    return ["*QQQ 과열 신호 — QLD 비중 축소 검토*", `level: ${level}`];
  }
  if (ruleId.startsWith("rule_fx")) {
    return [`*USD/KRW ${level}*`, `payload keys: ${Object.keys(payload).join(", ")}`];
  }
  return [`level: ${level}`];
}

export function SlackMessagePreview({ ruleId, level, payload, firedAt }: Props) {
  const color = RULE_COLOR[ruleId] ?? "var(--mm-text-dim)";

  return (
    <div className="rounded-card border border-mm-border-soft overflow-hidden bg-white dark:bg-[#1d1f23]">
      <div className="flex">
        <span className="w-1 shrink-0" style={{ background: color }} />
        <div className="p-3 flex-1 text-[12px]">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-bold text-black"
              style={{ background: "var(--mm-accent)" }}
            >
              MM
            </span>
            <span className="font-semibold text-mm-text">MoneyManagement</span>
            <span className="text-[9px] px-1 py-[1px] rounded bg-mm-border-soft text-mm-text-mute font-mono">
              APP
            </span>
            <span className="text-[10px] text-mm-text-mute">{fmtKst(firedAt)}</span>
          </div>
          <div className="space-y-[2px] text-mm-text">
            <div className="text-[13px]">{emoji(ruleId)} {ruleLabel(ruleId)}</div>
            {bodyLines(ruleId, level, payload).map((line, i) => (
              <div key={i} className="text-[12px] text-mm-text-dim">
                {line}
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-2 text-[11px]">
            <a href="/" className="text-mm-accent hover:underline">
              View dashboard ↗
            </a>
            <a
              href="https://m.tradingview.com/"
              target="_blank"
              rel="noopener"
              className="text-mm-accent hover:underline"
            >
              Open chart ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
