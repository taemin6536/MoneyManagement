/* Numeric + timestamp formatters.
 * Convention: negative dollar amounts render as "-$x.xx", not "$-x.xx".
 */

const KST = "Asia/Seoul";

type Num = string | number | null | undefined;

function toNumber(value: Num): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  return Number.isNaN(n) ? null : n;
}

export function usd(value: Num, digits = 2): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  return `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function usdPlain(value: Num, digits = 2): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function krw(value: Num): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}₩${Math.abs(n).toLocaleString("ko-KR", { maximumFractionDigits: 0 })}`;
}

export function pct(value: Num, digits = 2, withSign = true): string {
  const n = toNumber(value);
  if (n === null) return "—";
  const sign = withSign && n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function num(value: Num, digits = 2): string {
  const n = toNumber(value);
  if (n === null) return "—";
  return n.toFixed(digits);
}

export function fmtKst(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("ko-KR", { hour12: false, timeZone: KST });
}

export function fmtKstDate(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("ko-KR", { timeZone: KST });
}

/** Short timestamp for compact UI corners — e.g. "05/27 14:30" */
export function tsShort(value: string | Date | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

/** Path commands for an SVG sparkline (line only). */
export function sparkPath(values: number[], w: number, h: number, padding = 2): string {
  if (!values || values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - padding * 2) / Math.max(values.length - 1, 1);
  return values
    .map((v, i) => {
      const x = padding + i * stepX;
      const y = padding + (h - padding * 2) * (1 - (v - min) / range);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/** Closed-polygon (area) variant of sparkPath. */
export function sparkArea(values: number[], w: number, h: number, padding = 2): string {
  if (!values || values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - padding * 2) / Math.max(values.length - 1, 1);
  const pts = values.map((v, i) => {
    const x = padding + i * stepX;
    const y = padding + (h - padding * 2) * (1 - (v - min) / range);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `M${padding},${h - padding} L${pts.join(" L")} L${w - padding},${h - padding} Z`;
}
