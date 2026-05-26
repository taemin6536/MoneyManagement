import { sparkArea, sparkPath } from "@/lib/format";

type Props = {
  values: number[];
  width?: number;
  height?: number;
  /** "auto" colors by net change sign; or pass an explicit CSS color. */
  color?: "auto" | string;
};

export function Sparkline({ values, width = 90, height = 28, color = "auto" }: Props) {
  if (!values || values.length < 2) {
    return <div style={{ width, height }} aria-hidden />;
  }
  const positive = values[values.length - 1] >= values[0];
  const stroke = color === "auto" ? (positive ? "var(--mm-green)" : "var(--mm-red)") : color;
  const lineD = sparkPath(values, width, height, 2);
  const areaD = sparkArea(values, width, height, 2);
  const gradId = `spark-${positive ? "up" : "dn"}-${Math.random().toString(36).slice(2, 7)}`;

  return (
    <svg width={width} height={height} className="block">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#${gradId})`} />
      <path
        d={lineD}
        fill="none"
        stroke={stroke}
        strokeWidth={1.25}
        style={{ vectorEffect: "non-scaling-stroke" }}
      />
    </svg>
  );
}
