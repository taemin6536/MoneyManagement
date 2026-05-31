/**
 * API routing.
 *
 * - Server-side (Next.js page.tsx / server components): hit the backend
 *   directly at INTERNAL_API_BASE_URL with the X-Internal-Token header.
 * - Client-side (browser): use the same-origin BFF proxy at /api/be/...
 *   The session middleware gates it; the proxy forwards with the token.
 *
 * Browser never sees the backend URL or the internal token.
 */

const IS_SERVER = typeof window === "undefined";
const BACKEND_DIRECT =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

function buildUrl(path: string): string {
  if (IS_SERVER) return `${BACKEND_DIRECT}${path}`;
  // /api/foo → /api/be/foo (proxy). Non-/api paths (none in practice) pass through.
  if (path.startsWith("/api/")) return path.replace(/^\/api\//, "/api/be/");
  return path;
}

function buildHeaders(extra?: HeadersInit): Headers {
  const h = new Headers(extra);
  if (IS_SERVER && process.env.BACKEND_INTERNAL_TOKEN) {
    h.set("x-internal-token", process.env.BACKEND_INTERNAL_TOKEN);
  }
  return h;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(buildUrl(path), {
    cache: "no-store",
    ...init,
    headers: buildHeaders(init?.headers),
  });
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export type HealthResponse = {
  status: string;
  db: string;
  slack_configured?: boolean;
  kis_configured?: boolean;
};

export type SymbolSummary = {
  symbol: string;
  last_price: string | null;
  last_ts: string | null;
  ath_price: string | null;
  ath_date: string | null;
  drawdown_pct: string | null;
  current_step_threshold: string | null;
  current_step_cash_pct: string | null;
};

export type AlertRow = {
  id: number;
  rule_id: string;
  level: string;
  fired_at: string;
  payload: Record<string, unknown>;
  status: string;
};

async function get<T>(path: string): Promise<T> {
  return request<T>(path);
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patchJson<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

async function postEmpty<T>(path: string): Promise<T> {
  return request<T>(path, { method: "POST" });
}

export async function fetchHealth() {
  return get<HealthResponse>("/health");
}

export async function fetchSymbolSummary(symbol: string) {
  return get<SymbolSummary>(`/api/symbols/${encodeURIComponent(symbol)}/summary`);
}

export async function fetchAlerts(limit = 20) {
  return get<AlertRow[]>(`/api/alerts?limit=${limit}`);
}

export type OverheatedSignals = {
  rsi_14: string | null;
  rsi_threshold: string;
  rsi_overbought: boolean;
  channel_high_20: string | null;
  last_high: string | null;
  channel_breakout: boolean;
  fgi_score: number | null;
  fgi_rating: string | null;
  fgi_threshold: number;
  fgi_extreme_greed: boolean;
  hits: number;
};

export async function fetchOverheatedSignals() {
  return get<OverheatedSignals>("/api/signals/overheated");
}

export type BuyStep = { threshold_pct: string; cash_pct: string };
export type RulesConfig = {
  buy_drawdown_steps: BuyStep[];
  sell_recovery_gap_pct: string;
  overheated_rsi_threshold: string;
  overheated_fgi_threshold: number;
  overheated_channel_window: number;
};

export async function fetchRules() {
  return get<RulesConfig>("/api/rules");
}

export type FxState = {
  rate: string | null;
  ts: string | null;
  threshold_low: string;
  threshold_high: string;
  band: "below_low" | "neutral" | "above_high" | "unknown";
  sma_30: string | null;
  deviation_pct: string | null;
  sma_threshold_pct: string | null;
  in_dca_buy_zone: boolean;
};

export async function fetchFx() {
  return get<FxState>("/api/fx");
}

export type Holding = {
  symbol: string;
  name: string;
  quantity: string;
  avg_price: string;
  current_price: string;
  eval_usd: string;
  pl_usd: string;
  pl_pct: string;
  weight_pct: string;
};

export type Portfolio = {
  holdings: Holding[];
  total_eval_usd: string;
  total_pl_usd: string;
  fx_rate: string | null;
  total_eval_krw: string | null;
  cash_usd: string | null;
  cash_usd_available: string | null;
  cash_krw: string | null;
  total_assets_krw: string | null;
  today_change_usd: string | null;
  today_change_pct: string | null;
  fetched_at: string;
  source: string;
  configured: boolean;
};

export async function fetchPortfolio() {
  return get<Portfolio>("/api/portfolio");
}

export type Contribution = {
  id: number;
  contribution_date: string;
  amount_krw: string;
  core_pct: string;
  core_krw: string;
  tactical_krw: string;
  fx_rate: string | null;
  note: string | null;
  created_at: string;
};

export type TacticalBuy = {
  id: number;
  buy_date: string;
  symbol: string;
  amount_krw: string;
  amount_usd: string | null;
  fx_rate: string | null;
  rule_level: string | null;
  note: string | null;
  created_at: string;
};

export type TacticalBalance = {
  krw: string;
  usd: string | null;
  fx_rate: string | null;
  deposits_krw: string;
  deposits_usd: string;
  deployed_krw: string;
};

export type TacticalDeposit = {
  id: number;
  deposit_date: string;
  amount_usd: string;
  amount_krw: string | null;
  fx_rate: string | null;
  note: string | null;
  created_at: string;
};

export type ContributionDefaults = {
  amount_krw: string;
  core_pct: string;
};

export async function fetchContributionDefaults() {
  return get<ContributionDefaults>("/api/contributions/defaults");
}

export async function fetchContributions(limit = 36) {
  return get<Contribution[]>(`/api/contributions?limit=${limit}`);
}

export async function fetchTacticalBalance() {
  return get<TacticalBalance>("/api/tactical/balance");
}

export async function fetchTacticalBuys(limit = 50) {
  return get<TacticalBuy[]>(`/api/tactical/buys?limit=${limit}`);
}

export async function postContribution(payload: {
  contribution_date: string;
  amount_krw: string;
  core_pct?: string;
  note?: string;
}) {
  return postJson<Contribution>("/api/contributions", payload);
}

export async function deleteContribution(id: number) {
  return del<unknown>(`/api/contributions/${id}`);
}

export async function fetchTacticalDeposits(limit = 50) {
  return get<TacticalDeposit[]>(`/api/tactical/deposits?limit=${limit}`);
}

export type KrwCash = {
  amount_krw: string;
  amount_usd_equiv: string | null;
  fx_rate: string | null;
  as_of_date: string | null;
  last_updated: string | null;
  note: string | null;
};

export type KrwSnapshot = {
  id: number;
  as_of_date: string;
  amount_krw: string;
  note: string | null;
  created_at: string;
};

export async function fetchKrwCash() {
  return get<KrwCash>("/api/krw-cash");
}

export async function fetchKrwCashHistory(limit = 50) {
  return get<KrwSnapshot[]>(`/api/krw-cash/history?limit=${limit}`);
}

export async function postKrwCash(payload: { as_of_date: string; amount_krw: string; note?: string }) {
  return postJson<KrwSnapshot>("/api/krw-cash", payload);
}

export async function deleteKrwCash(id: number) {
  return del<unknown>(`/api/krw-cash/${id}`);
}

export async function postTacticalDeposit(payload: {
  deposit_date: string;
  amount_usd: string;
  fx_rate?: string;
  note?: string;
}) {
  return postJson<TacticalDeposit>("/api/tactical/deposits", payload);
}

export async function deleteTacticalDeposit(id: number) {
  return del<unknown>(`/api/tactical/deposits/${id}`);
}

export async function postTacticalBuy(payload: {
  buy_date: string;
  symbol: string;
  amount_krw: string;
  rule_level?: string;
  note?: string;
}) {
  return postJson<TacticalBuy>("/api/tactical/buys", payload);
}

export type BacktestStats = {
  final_value_usd: number;
  total_contributed_usd: number;
  cagr_pct: number;
  max_drawdown_pct: number;
};

export type EquityPoint = {
  date: string;
  pure_dca_usd: number;
  manual_usd: number;
  pure_dca_qqq_shares: number;
  manual_qqq_shares: number;
  manual_tqqq_shares: number;
  manual_cash_usd: number;
};

export type BacktestResult = {
  start: string;
  end: string;
  months: number;
  monthly_krw: number;
  core_pct: number;
  pure_dca: BacktestStats;
  manual: BacktestStats;
  curve: EquityPoint[];
};

export type EquityCurvePoint = { date: string; value: number; source: "snapshot" | "live" };
export type EquityCurve = { currency: "USD" | "KRW"; days: number; points: EquityCurvePoint[] };

export async function fetchEquityCurve(days = 365, currency: "USD" | "KRW" = "USD") {
  return get<EquityCurve>(`/api/portfolio/equity?days=${days}&currency=${currency}`);
}

export type Briefing = {
  available: boolean;
  briefing: string | null;
  model: string;
  generated_at: string;
};

export async function fetchBriefing() {
  return get<Briefing>("/api/briefing");
}

export type NewsItem = {
  id: number;
  source: string;
  title: string;
  description: string | null;
  link: string;
  published_at: string | null;
  fetched_at: string;
};

export type NewsList = {
  items: NewsItem[];
  sources: string[];
};

export async function fetchNews(opts?: { limit?: number; source?: string; days?: number }) {
  const qs = new URLSearchParams();
  if (opts?.limit) qs.set("limit", String(opts.limit));
  if (opts?.source) qs.set("source", opts.source);
  if (opts?.days) qs.set("days", String(opts.days));
  const suffix = qs.toString() ? `?${qs}` : "";
  return get<NewsList>(`/api/news${suffix}`);
}

export type NewsSummary = {
  available: boolean;
  summary: string | null;
  items: NewsItem[];
  model: string;
  generated_at: string;
};

export async function fetchNewsSummary() {
  return get<NewsSummary>("/api/news/summary");
}

export type TradeSnapshot = {
  qqq_price?: number;
  qqq_ath?: number;
  drawdown_pct?: number;
  tqqq_price?: number;
  qld_price?: number;
  vix?: number;
  usd_krw?: number;
};

export type Trade = {
  id: number;
  executed_at: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: string;
  price_usd: string;
  total_usd: string;
  snapshot: TradeSnapshot | null;
  rule_level: string | null;
  note: string | null;
  source: "kis_sync" | "manual";
  kis_order_id: string | null;
  created_at: string;
};

export type TradeList = {
  items: Trade[];
  symbols: string[];
};

export async function fetchTrades(opts?: {
  limit?: number;
  symbol?: string;
  side?: "buy" | "sell";
  days?: number;
}) {
  const qs = new URLSearchParams();
  if (opts?.limit) qs.set("limit", String(opts.limit));
  if (opts?.symbol) qs.set("symbol", opts.symbol);
  if (opts?.side) qs.set("side", opts.side);
  if (opts?.days) qs.set("days", String(opts.days));
  const suffix = qs.toString() ? `?${qs}` : "";
  return get<TradeList>(`/api/trades${suffix}`);
}

export async function patchTrade(
  id: number,
  payload: { note?: string | null; rule_level?: string | null },
) {
  return patchJson<Trade>(`/api/trades/${id}`, payload);
}

export async function syncTradesFromKis(daysBack: number = 365) {
  return postEmpty<{
    fetched: number;
    inserted: number;
    days_back: number;
    start: string;
    end: string;
  }>(`/api/dev/trades-sync?days_back=${daysBack}`);
}

export type Sparkline = { symbol: string; days: number; closes: number[] };

export async function fetchSparkline(symbol: string, days = 30) {
  return get<Sparkline>(`/api/symbols/${encodeURIComponent(symbol)}/sparkline?days=${days}`);
}

export type RsiHistory = { symbol: string; days: number; values: number[] };

export async function fetchRsiHistory(days = 30, symbol = "QQQ") {
  return get<RsiHistory>(`/api/signals/rsi-history?days=${days}&symbol=${encodeURIComponent(symbol)}`);
}

export async function fetchBacktest(params: {
  start: string;
  end: string;
  monthly_krw: number;
  core_pct: number;
}) {
  const qs = new URLSearchParams({
    start: params.start,
    end: params.end,
    monthly_krw: String(params.monthly_krw),
    core_pct: String(params.core_pct),
  });
  return get<BacktestResult>(`/api/backtest?${qs.toString()}`);
}
