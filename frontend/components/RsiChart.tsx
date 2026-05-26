type Props = {
  values: number[];
  width?: number;
  height?: number;
};

export function RsiChart({ values, width = 280, height = 80 }: Props) {
  if (!values || values.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-mm-text-mute text-xs"
        style={{ width, height }}
      >
        no data
      </div>
    );
  }
  const stepX = width / Math.max(values.length - 1, 1);
  const ptY = (v: number) => height - (v / 100) * height;
  const linePath = values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(2)},${ptY(v).toFixed(2)}`)
    .join(" ");

  return (
    <svg width={width} height={height} className="block">
      <defs>
        <linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--mm-red)" stopOpacity={0.12} />
          <stop offset="40%" stopColor="transparent" />
          <stop offset="60%" stopColor="transparent" />
          <stop offset="100%" stopColor="var(--mm-green)" stopOpacity={0.12} />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={width} height={height} fill="url(#rsiGrad)" />
      {[30, 50, 70].map((t) => (
        <line
          key={t}
          x1={0}
          x2={width}
          y1={ptY(t)}
          y2={ptY(t)}
          stroke={t === 30 ? "var(--mm-green)" : t === 70 ? "var(--mm-red)" : "var(--mm-border-soft)"}
          strokeDasharray="3 3"
          strokeWidth={1}
          opacity={t === 50 ? 1 : 0.5}
        />
      ))}
      <path
        d={linePath}
        fill="none"
        stroke="var(--mm-accent)"
        strokeWidth={1.5}
        style={{ vectorEffect: "non-scaling-stroke" }}
      />
    </svg>
  );
}
