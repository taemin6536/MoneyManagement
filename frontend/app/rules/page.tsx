import { PageHeader } from "@/components/PageHeader";
import { fetchAlerts, fetchRules, fetchSymbolSummary, type AlertRow, type RulesConfig } from "@/lib/api";
import { krw, pct, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

const RULES_YML = `# rules.yml — defined in app/rules (read-only)

rule_buy_drawdown:
  description: "QQQ drawdown 도달 시 TQQQ 분할 매수 알림"
  steps:
    - threshold: -15%   cash: 10%
    - threshold: -20%   cash: 25%
    - threshold: -25%   cash: 30%
  dedup: 24h per (rule, level)

rule_sell_recovery:
  description: "QQQ ATH 회복 → TQQQ 전량 매도 → QLD 전환"
  recovery_gap_pct: ≤ 0.5%

rule_overheated:
  description: "QLD 비중 축소 검토 — 2 of 3 신호 충족 시 발동"
  signals:
    - channel_breakout: 20-day high
    - rsi_overbought: RSI(14) ≥ 80
    - fgi_extreme_greed: FGI ≥ 75
`;

export default async function RulesPage() {
  const [rules, qqq, alerts] = await Promise.all([
    fetchRules().catch(() => null),
    fetchSymbolSummary("QQQ").catch(() => null),
    fetchAlerts(200).catch(() => [] as AlertRow[]),
  ]);

  if (!rules || !qqq) {
    return (
      <section className="space-y-[18px]">
        <PageHeader title="Rules" />
        <p className="text-mm-red">룰 또는 QQQ 데이터를 불러올 수 없습니다.</p>
      </section>
    );
  }

  const qqqPrice = qqq.last_price ? Number(qqq.last_price) : null;
  const qqqAth = qqq.ath_price ? Number(qqq.ath_price) : null;
  const drawdown = qqq.drawdown_pct ? Number(qqq.drawdown_pct) : null;
  const recoveryGap = Number(rules.sell_recovery_gap_pct);
  const triggerPrice = qqqAth ? qqqAth * (1 - recoveryGap / 100) : null;

  return (
    <section className="space-y-[18px]">
      <PageHeader
        title="Rules"
        subtitle="현재 적용 중인 매수·매도·과열 임계치 — read-only, 코드로 정의됨"
        timestamp={qqq.last_ts}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr_1fr] gap-[18px]">
        <BuyDcaCard rules={rules} alerts={alerts} qqqPrice={qqqPrice} qqqAth={qqqAth} drawdown={drawdown} />
        <SellSwitchCard
          recoveryGap={recoveryGap}
          qqqAth={qqqAth}
          qqqPrice={qqqPrice}
          triggerPrice={triggerPrice}
        />
        <OverheatedCard rules={rules} alerts={alerts} />
      </div>

      <DecisionFlow />

      <article className="rounded-card border border-mm-border bg-mm-surface overflow-hidden">
        <header className="px-[18px] py-[14px] border-b border-mm-border-soft flex items-baseline justify-between">
          <div>
            <h3 className="font-semibold">rules.yml</h3>
            <div className="text-[11px] text-mm-text-mute">defined in app/rules · read-only</div>
          </div>
          <span className="font-mono text-[11px] text-mm-text-mute">backend/app/rules/*.py</span>
        </header>
        <pre className="px-[18px] py-[18px] text-[12px] font-mono text-mm-text-dim bg-mm-bg-sub leading-[1.6] overflow-x-auto">
{RULES_YML}
        </pre>
      </article>
    </section>
  );
}

function RuleBadge({ children, color }: { children: string; color: string }) {
  return (
    <span
      className="w-7 h-7 rounded-md inline-flex items-center justify-center text-[14px] font-semibold"
      style={{
        background: `color-mix(in srgb, ${color} 33%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 55%, transparent)`,
        color,
      }}
    >
      {children}
    </span>
  );
}

function BuyDcaCard({
  rules,
  alerts,
  qqqPrice,
  qqqAth,
  drawdown,
}: {
  rules: RulesConfig;
  alerts: AlertRow[];
  qqqPrice: number | null;
  qqqAth: number | null;
  drawdown: number | null;
}) {
  // Latest hit per step from alerts
  const stepHits = new Map<string, AlertRow>();
  for (const a of alerts) {
    if (a.rule_id === "rule_buy_drawdown" && a.status === "sent") {
      if (!stepHits.has(a.level)) stepHits.set(a.level, a);
    }
  }

  // Next trigger
  const sortedSteps = [...rules.buy_drawdown_steps].sort(
    (a, b) => Number(b.threshold_pct) - Number(a.threshold_pct),
  );
  const nextStep =
    drawdown !== null
      ? sortedSteps.find((s) => drawdown > Number(s.threshold_pct))
      : null;
  const nextTriggerPrice =
    nextStep && qqqAth ? qqqAth * (1 + Number(nextStep.threshold_pct) / 100) : null;

  return (
    <article className="rounded-card border border-mm-border bg-mm-surface p-[18px] space-y-3">
      <header className="flex items-center gap-3">
        <RuleBadge color="var(--mm-accent)">①</RuleBadge>
        <div>
          <div className="font-semibold">Buy DCA</div>
          <div className="text-[11px] text-mm-text-mute">QQQ drawdown → TQQQ 분할 매수</div>
        </div>
      </header>
      <p className="text-[12px] text-mm-text-dim leading-[1.55]">
        QQQ가 ATH 대비 임계 단계 도달 시 보유 USD 현금의 일정 비율로 TQQQ 매수 권장. 24h dedup.
      </p>

      <div className="space-y-2">
        {rules.buy_drawdown_steps.map((s) => {
          const hit = stepHits.get(`drawdown_${Number(s.threshold_pct)}`);
          const cashWidth = Math.min(100, Number(s.cash_pct) * 2);
          return (
            <div
              key={s.threshold_pct}
              className="grid grid-cols-[60px_1fr_50px_120px] items-center gap-3 text-[12px]"
            >
              <span className="font-mono text-mm-amber tabular-nums">
                {Number(s.threshold_pct).toFixed(0)}%
              </span>
              <div className="h-[6px] rounded-full bg-mm-border-soft overflow-hidden">
                <div
                  className="h-full bg-mm-accent"
                  style={{ width: `${cashWidth}%` }}
                />
              </div>
              <span className="font-mono text-right tabular-nums">{Number(s.cash_pct).toFixed(0)}%</span>
              <span className="text-[11px] text-mm-text-dim text-right">
                {hit ? (
                  <span className="text-mm-green">✓ Hit {hit.fired_at.slice(5, 10)}</span>
                ) : (
                  "Pending"
                )}
              </span>
            </div>
          );
        })}
      </div>

      {nextStep && nextTriggerPrice !== null && (
        <div className="rounded bg-mm-amber/10 text-mm-amber text-[12px] px-3 py-2">
          현재 QQQ {drawdown !== null ? pct(drawdown) : "—"} · 다음 트리거 {Number(nextStep.threshold_pct).toFixed(0)}% (≈ {usd(nextTriggerPrice)})
        </div>
      )}
    </article>
  );
}

function SellSwitchCard({
  recoveryGap,
  qqqAth,
  qqqPrice,
  triggerPrice,
}: {
  recoveryGap: number;
  qqqAth: number | null;
  qqqPrice: number | null;
  triggerPrice: number | null;
}) {
  // current gap pct (positive = below ATH)
  const gapPct =
    qqqPrice !== null && qqqAth !== null && qqqAth > 0
      ? ((qqqAth - qqqPrice) / qqqAth) * 100
      : null;
  const within = gapPct !== null && gapPct <= recoveryGap;
  // RecoveryBar: full = 5% below ATH, fill = remaining gap toward 0.
  const filled =
    gapPct !== null ? Math.max(0, Math.min(100, ((5 - gapPct) / 5) * 100)) : 0;

  return (
    <article className="rounded-card border border-mm-border bg-mm-surface p-[18px] space-y-3">
      <header className="flex items-center gap-3">
        <RuleBadge color="var(--mm-red)">②</RuleBadge>
        <div>
          <div className="font-semibold">Sell Switch</div>
          <div className="text-[11px] text-mm-text-mute">ATH 회복 → TQQQ→QLD</div>
        </div>
      </header>
      <p className="text-[12px] text-mm-text-dim leading-[1.55]">
        QQQ가 ATH의 {recoveryGap}% 이내로 회복하면 TQQQ 전량 매도 → QLD 전환 알림.
      </p>
      <dl className="text-[12px] space-y-1">
        <KvRow label="Recovery gap" value={`≤ ${recoveryGap.toFixed(2)}%`} />
        <KvRow label="QQQ ATH" value={qqqAth ? usd(qqqAth) : "—"} />
        <KvRow
          label="Trigger price"
          value={triggerPrice ? usd(triggerPrice) : "—"}
          highlight
        />
      </dl>
      <div>
        <div className="text-[11px] text-mm-text-mute mb-1">현재 갭</div>
        <div className="h-2 rounded-full bg-mm-border-soft overflow-hidden">
          <div
            className={`h-full ${within ? "bg-mm-green" : "bg-mm-accent"}`}
            style={{ width: `${filled}%` }}
          />
        </div>
        <div className="text-[11px] text-mm-text-dim mt-1 tabular-nums">
          {gapPct === null ? "—" : `${gapPct.toFixed(2)}% gap`}
        </div>
      </div>
    </article>
  );
}

function OverheatedCard({
  rules,
  alerts,
}: {
  rules: RulesConfig;
  alerts: AlertRow[];
}) {
  const recent = alerts.find((a) => a.rule_id === "rule_overheated");
  return (
    <article className="rounded-card border border-mm-border bg-mm-surface p-[18px] space-y-3">
      <header className="flex items-center gap-3">
        <RuleBadge color="var(--mm-amber)">③</RuleBadge>
        <div>
          <div className="font-semibold">Overheated</div>
          <div className="text-[11px] text-mm-text-mute">2 of 3 신호 → QLD 축소</div>
        </div>
      </header>
      <p className="text-[12px] text-mm-text-dim leading-[1.55]">
        신고가 랠리 중 RSI / FGI / 채널 돌파 3개 신호 중 2개 이상 발동 시 비중 축소 알림.
      </p>
      <dl className="text-[12px] space-y-1">
        <KvRow label="RSI threshold" value={`≥ ${Number(rules.overheated_rsi_threshold).toFixed(0)}`} />
        <KvRow label="FGI threshold" value={`≥ ${rules.overheated_fgi_threshold}`} />
        <KvRow
          label="Channel window"
          value={`${rules.overheated_channel_window}D 고가 돌파`}
        />
      </dl>
      <div
        className={`text-[12px] rounded px-3 py-2 ${
          recent
            ? "bg-mm-red/10 text-mm-red"
            : "bg-mm-bg-sub text-mm-text-dim"
        }`}
      >
        {recent
          ? `최근 발동: ${recent.fired_at.slice(0, 10)}`
          : "최근 발동 이력 없음 — Safe"}
      </div>
    </article>
  );
}

function KvRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-mm-text-mute">{label}</dt>
      <dd
        className={`font-mono tabular-nums ${
          highlight ? "text-mm-accent font-semibold" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function DecisionFlow() {
  const nodes = [
    { label: "Source", detail: "yfinance · KIS · FGI" },
    { label: "Match", detail: "rules/*.py" },
    { label: "Dedup", detail: "24h window" },
    { label: "Alert", detail: "AlertEvent", highlight: true },
    { label: "Sink", detail: "Slack webhook", highlight: true },
  ];
  return (
    <article className="rounded-card border border-mm-border bg-mm-surface p-[18px]">
      <header className="mb-3">
        <h3 className="font-semibold">Decision flow</h3>
        <div className="text-[11px] text-mm-text-mute">시세/잔고 → 룰 → dedup → 알람 발송</div>
      </header>
      <div className="flex items-stretch gap-3 overflow-x-auto">
        {nodes.map((n, i) => (
          <div key={n.label} className="flex items-center gap-3">
            <div
              className={`min-w-[120px] px-3 py-2 rounded border ${
                n.highlight
                  ? "border-mm-accent/55 bg-mm-accent/10"
                  : "border-mm-border-soft bg-mm-bg-sub"
              }`}
            >
              <div className="mm-eyebrow">{n.label}</div>
              <div
                className={`text-[12px] mt-1 font-mono ${
                  n.highlight ? "text-mm-accent" : "text-mm-text-dim"
                }`}
              >
                {n.detail}
              </div>
            </div>
            {i < nodes.length - 1 && (
              <span className="text-mm-text-mute">→</span>
            )}
          </div>
        ))}
      </div>
    </article>
  );
}
