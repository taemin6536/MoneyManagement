"use client";

import { useId, useMemo, useState } from "react";

import type { EquityCurvePoint } from "@/lib/api";
import { usd, usdPlain } from "@/lib/format";

const PERIODS = [
  { id: "1W", days: 7 },
  { id: "1M", days: 30 },
  { id: "3M", days: 90 },
  { id: "6M", days: 180 },
  { id: "1Y", days: 365 },
] as const;

type Period = (typeof PERIODS)[number]["id"];

type Props = {
  points: EquityCurvePoint[];
};

const W = 600;
const H = 180;
const PAD_L = 36;
const PAD_R = 12;
const PAD_T = 14;
const PAD_B = 22;
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;

export function EquityHeroChart({ points }: Props) {
  const reactId = useId();
  const [period, setPeriod] = useState<Period>("3M");
  const [hover, setHover] = useState<{ x: number; y: number; value: number; date: string } | null>(null);

  const sliced = useMemo(() => {
    const def = PERIODS.find((p) => p.id === period) ?? PERIODS[2];
    return points.slice(-def.days);
  }, [period, points]);

  if (sliced.length < 2) {
    return (
      <div className="flex flex-col gap-2">
        <div className="mm-eyebrow">Equity Curve</div>
        <div className="h-[180px] flex flex-col items-center justify-center text-center gap-2 px-6">
          <div className="text-mm-text-dim text-sm">데이터 누적 중</div>
          <div className="text-mm-text-mute text-xs">
            매일 KST 09:00에 portfolio snapshot이 저장됩니다.<br />
            며칠 지나면 자산 추이선이 그려져요.
          </div>
        </div>
      </div>
    );
  }

  const values = sliced.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = INNER_W / Math.max(values.length - 1, 1);
  const ptX = (i: number) => PAD_L + i * stepX;
  const ptY = (v: number) => PAD_T + INNER_H * (1 - (v - min) / range);

  const start = values[0];
  const end = values[values.length - 1];
  const change = end - start;
  const changePct = (change / start) * 100;
  const positive = change >= 0;
  const lineColor = positive ? "var(--mm-up)" : "var(--mm-down)";
  const gradId = `eqGrad${reactId.replace(/:/g, "")}`;

  const linePath = values.map((v, i) => `${i === 0 ? "M" : "L"}${ptX(i).toFixed(2)},${ptY(v).toFixed(2)}`).join(" ");
  const areaPath = `M${PAD_L},${PAD_T + INNER_H} L${values
    .map((v, i) => `${ptX(i).toFixed(2)},${ptY(v).toFixed(2)}`)
    .join(" L")} L${PAD_L + INNER_W},${PAD_T + INNER_H} Z`;

  // 3 y-axis gridlines (25/50/75%)
  const ySteps = [0.25, 0.5, 0.75];

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const xRel = ((e.clientX - rect.left) / rect.width) * W;
    if (xRel < PAD_L || xRel > PAD_L + INNER_W) {
      setHover(null);
      return;
    }
    const idx = Math.max(0, Math.min(values.length - 1, Math.round((xRel - PAD_L) / stepX)));
    setHover({ x: ptX(idx), y: ptY(values[idx]), value: values[idx], date: sliced[idx].date });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mm-eyebrow">
            Equity Curve <span className="normal-case tracking-normal text-mm-text-mute">· {sliced.length}일</span>
          </div>
          <div className="mt-1 flex items-baseline gap-[10px]">
            <span className="font-mono text-[20px] font-medium tabular-nums">${usdPlain(end)}</span>
            <span className={`font-mono text-[13px] ${positive ? "text-mm-up" : "text-mm-down"}`}>
              {positive ? "+" : "-"}${usdPlain(Math.abs(change))}
            </span>
            <span
              className={`text-[12px] px-2 py-[2px] rounded-chip ${
                positive
                  ? "bg-mm-up/15 text-mm-up"
                  : "bg-mm-down/15 text-mm-down"
              }`}
            >
              {positive ? "▲" : "▼"} {changePct.toFixed(2)}%
            </span>
          </div>
        </div>
        <div className="flex gap-1 p-[3px] bg-mm-bg-sub border border-mm-border rounded-[8px]">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-[3px] rounded-[5px] font-mono text-[11px] cursor-pointer ${
                period === p.id
                  ? "bg-mm-surface text-mm-text font-semibold shadow-[0_1px_2px_rgba(0,0,0,.2),0_0_0_1px_var(--mm-border)]"
                  : "text-mm-text-dim"
              }`}
            >
              {p.id}
            </button>
          ))}
        </div>
      </div>
      <svg
        width="100%"
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block cursor-crosshair"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {ySteps.map((t) => {
          const y = PAD_T + INNER_H * t;
          const v = max - range * t;
          return (
            <g key={t}>
              <line
                x1={PAD_L}
                x2={PAD_L + INNER_W}
                y1={y}
                y2={y}
                stroke="var(--mm-border-soft)"
                strokeDasharray="3 3"
                strokeWidth={1}
              />
              <text
                x={PAD_L - 4}
                y={y + 3}
                textAnchor="end"
                fontSize={9}
                fill="var(--mm-text-mute)"
                fontFamily="JetBrains Mono, monospace"
              >
                ${(v / 1000).toFixed(1)}k
              </text>
            </g>
          );
        })}

        <path d={areaPath} fill={`url(#${gradId})`} />
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          style={{ vectorEffect: "non-scaling-stroke" }}
        />

        {[0, Math.floor(values.length / 2), values.length - 1].map((i) => {
          const d = new Date(sliced[i].date);
          return (
            <text
              key={i}
              x={ptX(i)}
              y={H - 6}
              textAnchor={i === 0 ? "start" : i === values.length - 1 ? "end" : "middle"}
              fontSize={9}
              fill="var(--mm-text-mute)"
              fontFamily="JetBrains Mono, monospace"
            >
              {d.getMonth() + 1}/{d.getDate()}
            </text>
          );
        })}

        {hover && (
          <g>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD_T}
              y2={PAD_T + INNER_H}
              stroke="var(--mm-text-dim)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <circle cx={hover.x} cy={hover.y} r={4} fill={lineColor} />
          </g>
        )}
      </svg>
      {hover && (
        <div className="font-mono text-[11px] text-mm-text-dim tabular-nums">
          {new Date(hover.date).toLocaleDateString("ko-KR")} · ${usdPlain(hover.value)}
        </div>
      )}
    </div>
  );
}
