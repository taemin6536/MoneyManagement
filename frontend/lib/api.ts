const BASE_URL =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

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
  const res = await fetch(`${BASE_URL}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
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
  const BASE_URL =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:8000";
  const res = await fetch(`${BASE_URL}/api/contributions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST /api/contributions ${res.status}`);
  return res.json() as Promise<Contribution>;
}

export async function deleteContribution(id: number) {
  const BASE_URL =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:8000";
  const res = await fetch(`${BASE_URL}/api/contributions/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/contributions/${id} ${res.status}`);
  return res.json();
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
  const BASE_URL =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:8000";
  const res = await fetch(`${BASE_URL}/api/krw-cash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST /api/krw-cash ${res.status}`);
  return res.json() as Promise<KrwSnapshot>;
}

export async function deleteKrwCash(id: number) {
  const BASE_URL =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:8000";
  const res = await fetch(`${BASE_URL}/api/krw-cash/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/krw-cash/${id} ${res.status}`);
  return res.json();
}

export async function postTacticalDeposit(payload: {
  deposit_date: string;
  amount_usd: string;
  fx_rate?: string;
  note?: string;
}) {
  const BASE_URL =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:8000";
  const res = await fetch(`${BASE_URL}/api/tactical/deposits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST /api/tactical/deposits ${res.status}`);
  return res.json() as Promise<TacticalDeposit>;
}

export async function deleteTacticalDeposit(id: number) {
  const BASE_URL =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:8000";
  const res = await fetch(`${BASE_URL}/api/tactical/deposits/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE /api/tactical/deposits/${id} ${res.status}`);
  return res.json();
}

export async function postTacticalBuy(payload: {
  buy_date: string;
  symbol: string;
  amount_krw: string;
  rule_level?: string;
  note?: string;
}) {
  const BASE_URL =
    process.env.INTERNAL_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "http://localhost:8000";
  const res = await fetch(`${BASE_URL}/api/tactical/buys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST /api/tactical/buys ${res.status}`);
  return res.json() as Promise<TacticalBuy>;
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
