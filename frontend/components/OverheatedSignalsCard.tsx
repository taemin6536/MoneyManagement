import type { OverheatedSignals } from "@/lib/api";

type SignalRow = {
  label: string;
  active: boolean;
  context: string;
};

export function OverheatedSignalsCard({ data }: { data: OverheatedSignals }) {
  const hits = data.hits;
  const alert = hits >= 2;

  const rows: SignalRow[] = [
    {
      label: "상승채널 상단 돌파 (20D)",
      active: data.channel_breakout,
      context:
        data.last_high && data.channel_high_20
          ? `high ${Number(data.last_high).toFixed(2)} / ch ${Number(data.channel_high_20).toFixed(2)}`
          : "—",
    },
    {
      label: `RSI ≥ ${Number(data.rsi_threshold).toFixed(0)}`,
      active: data.rsi_overbought,
      context: data.rsi_14 ? `Now ${Number(data.rsi_14).toFixed(2)}` : "—",
    },
    {
      label: `공포탐욕지수 ≥ ${data.fgi_threshold}`,
      active: data.fgi_extreme_greed,
      context:
        data.fgi_score !== null
          ? `FGI ${Number(data.fgi_score).toFixed(1)}${data.fgi_rating ? ` (${data.fgi_rating})` : ""}`
          : "—",
    },
  ];

  return (
    <article className="rounded-card border border-mm-border bg-mm-surface p-[18px] space-y-3">
      <header className="flex items-baseline justify-between">
        <div>
          <div className="mm-eyebrow">Overheated · Rule ③</div>
          <div className="text-[11px] text-mm-text-mute mt-1">
            2 of 3 신호 충족 시 발동
          </div>
        </div>
        <span
          className={`text-[11px] px-2 py-[2px] rounded-chip ${
            alert
              ? "bg-mm-red/15 text-mm-red"
              : "bg-mm-bg-sub text-mm-text-dim"
          }`}
        >
          {hits} / 3 hits
        </span>
      </header>

      <ul className="divide-y divide-mm-border-soft">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between py-2 text-[13px]">
            <span className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full inline-flex items-center justify-center font-bold text-[12px] ${
                  r.active
                    ? "bg-mm-amber text-mm-bg ring-2 ring-mm-amber/40"
                    : "border border-mm-border text-mm-text-mute"
                }`}
              >
                {r.active ? "✓" : ""}
              </span>
              <span className={r.active ? "font-medium text-mm-amber" : "text-mm-text-dim"}>
                {r.label}
              </span>
            </span>
            <span className="font-mono text-[11px] text-mm-text-mute tabular-nums">
              {r.context}
            </span>
          </li>
        ))}
      </ul>

      <div
        className={`text-[12px] ${
          alert ? "text-mm-amber font-medium" : "text-mm-text-dim"
        }`}
      >
        Status: {alert ? "ALERT — QLD 비중 축소 검토" : "Safe"}
      </div>
    </article>
  );
}
