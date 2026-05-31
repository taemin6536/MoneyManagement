"""한국투자증권 (KIS) Open API client.

Scope (v1):
- OAuth: POST /oauth2/tokenP — issues a 24h access token. Cached in-process
  and lazily refreshed when expired.
- 해외주식 잔고: GET /uapi/overseas-stock/v1/trading/inquire-balance
- 해외주식 현재가: GET /uapi/overseas-price/v1/quotations/price

Paper-trading uses different host + tr_id codes:
- Real base:  https://openapi.koreainvestment.com:9443
- Paper base: https://openapivts.koreainvestment.com:29443
- Balance tr_id: TTTS3012R (real) / VTTS3012R (paper)
- Price   tr_id: HHDFS00000300 (real only; paper endpoint not supported)

This module purposely returns plain dataclasses, not pydantic models — keeping
KIS-specific concerns isolated from the rest of the app.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from threading import Lock
import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


REAL_BASE = "https://openapi.koreainvestment.com:9443"
PAPER_BASE = "https://openapivts.koreainvestment.com:29443"


def base_url(paper: bool) -> str:
    return PAPER_BASE if paper else REAL_BASE


def balance_tr_id(paper: bool) -> str:
    return "VTTS3012R" if paper else "TTTS3012R"


# Excg codes per KIS spec
EXCHANGE_NASDAQ = "NASD"  # also covers QQQ/TQQQ/QLD which list on Nasdaq
TR_CRCY_USD = "USD"


class KisError(Exception):
    pass


class KisCredentialsMissing(KisError):
    pass


@dataclass(slots=True)
class _CachedToken:
    access_token: str
    expires_at: datetime


@dataclass(slots=True)
class OverseasHolding:
    symbol: str           # 종목코드 (ovrs_pdno)
    name: str             # 종목명
    quantity: Decimal     # 보유수량 (ovrs_cblc_qty)
    avg_price: Decimal    # 평균단가 USD (pchs_avg_pric)
    current_price: Decimal  # 현재가 USD (now_pric2)
    eval_amount_usd: Decimal  # 평가금액 USD (ovrs_stck_evlu_amt)
    profit_loss_usd: Decimal  # 평가손익 USD (frcr_evlu_pfls_amt)
    profit_rate_pct: Decimal  # 등락률 (evlu_pfls_rt)
    today_buy_qty: Decimal = Decimal(0)        # 당일 매수 체결 수량 (thdt_buy_ccld_qty1)
    today_buy_amount_usd: Decimal = Decimal(0)  # 당일 매수 외화 금액 (thdt_buy_ccld_frcr_amt)
    today_sell_qty: Decimal = Decimal(0)       # 당일 매도 체결 수량 (thdt_sll_ccld_qty1)
    today_sell_amount_usd: Decimal = Decimal(0) # 당일 매도 외화 금액 (thdt_sll_ccld_frcr_amt)


@dataclass(slots=True)
class OverseasBalance:
    holdings: list[OverseasHolding] = field(default_factory=list)
    total_eval_usd: Decimal = Decimal(0)
    total_profit_usd: Decimal = Decimal(0)
    fetched_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass(slots=True)
class CashBalances:
    """Brokerage cash balances pulled live from KIS present-balance.

    USD cash here IS the tactical reserve — money already converted and
    sitting available to deploy on the next drawdown trigger.
    """
    usd_cash: Decimal           # frcr_dncl_amt_2 for USD row
    usd_withdrawable: Decimal   # frcr_drwg_psbl_amt_1
    krw_cash: Decimal           # tot_dncl_amt
    krw_withdrawable: Decimal   # wdrw_psbl_tot_amt
    total_assets_krw: Decimal   # tot_asst_amt
    base_fx_rate: Decimal       # first 통화-row's frst_bltn_exrt (basis rate KIS used)
    fetched_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


_TOKEN_LOCK = Lock()
_TOKEN_CACHE: _CachedToken | None = None

# Short caches to soften KIS per-second rate limits (EGW00201) when several
# downstream callers (portfolio API + scheduler + orchestrator) hit the same
# endpoint within a second. 3 seconds is short enough that the UI feels live.
_PRESENT_BALANCE_LOCK = Lock()
_PRESENT_BALANCE_CACHE: tuple[datetime, dict] | None = None
_PRESENT_BALANCE_TTL = timedelta(seconds=3)

_OVERSEAS_BALANCE_LOCK = Lock()
_OVERSEAS_BALANCE_CACHE: tuple[datetime, "OverseasBalance"] | None = None
_OVERSEAS_BALANCE_TTL = timedelta(seconds=3)


def _require_creds() -> tuple[str, str, str, str, bool]:
    s = get_settings()
    if not (s.kis_app_key and s.kis_app_secret and s.kis_account_number):
        raise KisCredentialsMissing(
            "KIS_APP_KEY / KIS_APP_SECRET / KIS_ACCOUNT_NUMBER must be set"
        )
    return s.kis_app_key, s.kis_app_secret, s.kis_account_number, s.kis_account_product_code, s.kis_paper_mode


def get_access_token(force_refresh: bool = False) -> str:
    """Fetch an OAuth access token. Cached for ~23h to stay under the 24h TTL."""
    global _TOKEN_CACHE
    with _TOKEN_LOCK:
        if not force_refresh and _TOKEN_CACHE is not None and _TOKEN_CACHE.expires_at > datetime.now(timezone.utc):
            return _TOKEN_CACHE.access_token

        app_key, app_secret, _, _, paper = _require_creds()
        url = f"{base_url(paper)}/oauth2/tokenP"
        payload = {"grant_type": "client_credentials", "appkey": app_key, "appsecret": app_secret}
        resp = httpx.post(url, json=payload, timeout=15.0)
        if resp.status_code != 200:
            raise KisError(f"token request failed: {resp.status_code} {resp.text[:200]}")
        data = resp.json()
        token = data.get("access_token")
        expires_in = int(data.get("expires_in", 60 * 60 * 23))
        if not token:
            raise KisError(f"token response missing access_token: {data}")
        _TOKEN_CACHE = _CachedToken(
            access_token=token,
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=expires_in - 60),
        )
        logger.info("KIS access token issued; expires_in=%ss", expires_in)
        return token


def _auth_headers(tr_id: str) -> dict[str, str]:
    app_key, app_secret, _, _, _ = _require_creds()
    return {
        "content-type": "application/json; charset=utf-8",
        "authorization": f"Bearer {get_access_token()}",
        "appkey": app_key,
        "appsecret": app_secret,
        "tr_id": tr_id,
        "custtype": "P",  # personal
    }


def _to_decimal(value, default: Decimal = Decimal(0)) -> Decimal:
    if value is None or value == "":
        return default
    try:
        return Decimal(str(value))
    except Exception:
        return default


def fetch_overseas_balance(exchange: str = EXCHANGE_NASDAQ) -> OverseasBalance:
    global _OVERSEAS_BALANCE_CACHE
    now = datetime.now(timezone.utc)
    with _OVERSEAS_BALANCE_LOCK:
        cached = _OVERSEAS_BALANCE_CACHE
        if cached is not None and (now - cached[0]) < _OVERSEAS_BALANCE_TTL:
            return cached[1]
    result = _fetch_overseas_balance_uncached(exchange)
    with _OVERSEAS_BALANCE_LOCK:
        _OVERSEAS_BALANCE_CACHE = (now, result)
    return result


def _fetch_overseas_balance_uncached(exchange: str = EXCHANGE_NASDAQ) -> OverseasBalance:
    """Fetch overseas stock balance for the configured account.

    Note: the API supports CTX_AREA_FK200 / CTX_AREA_NK200 pagination tokens;
    for personal portfolios with <100 holdings we ignore pagination.
    """
    _, _, account_number, product_code, paper = _require_creds()
    url = f"{base_url(paper)}/uapi/overseas-stock/v1/trading/inquire-balance"
    headers = _auth_headers(balance_tr_id(paper))
    params = {
        "CANO": account_number,
        "ACNT_PRDT_CD": product_code,
        "OVRS_EXCG_CD": exchange,
        "TR_CRCY_CD": TR_CRCY_USD,
        "CTX_AREA_FK200": "",
        "CTX_AREA_NK200": "",
    }
    resp = httpx.get(url, headers=headers, params=params, timeout=15.0)
    if resp.status_code != 200:
        raise KisError(f"balance request failed: {resp.status_code} {resp.text[:200]}")
    data = resp.json()
    rt_cd = data.get("rt_cd")
    if rt_cd != "0":
        raise KisError(f"balance API error: rt_cd={rt_cd} msg={data.get('msg1')!r}")

    holdings: list[OverseasHolding] = []
    for row in data.get("output1") or []:
        qty = _to_decimal(row.get("ovrs_cblc_qty"))
        if qty <= 0:
            continue
        holdings.append(
            OverseasHolding(
                symbol=str(row.get("ovrs_pdno", "")).strip().upper(),
                name=str(row.get("ovrs_item_name", "")).strip(),
                quantity=qty,
                avg_price=_to_decimal(row.get("pchs_avg_pric")),
                current_price=_to_decimal(row.get("now_pric2")),
                eval_amount_usd=_to_decimal(row.get("ovrs_stck_evlu_amt")),
                profit_loss_usd=_to_decimal(row.get("frcr_evlu_pfls_amt")),
                profit_rate_pct=_to_decimal(row.get("evlu_pfls_rt")),
            )
        )

    output2 = data.get("output2") or {}
    total_eval = _to_decimal(output2.get("tot_evlu_pfls_amt")) or sum(
        (h.eval_amount_usd for h in holdings), Decimal(0)
    )
    total_pl = _to_decimal(output2.get("ovrs_tot_pfls"))

    return OverseasBalance(
        holdings=holdings,
        total_eval_usd=sum((h.eval_amount_usd for h in holdings), Decimal(0)),
        total_profit_usd=total_pl,
    )


@dataclass(slots=True)
class TodayActivity:
    """Per-symbol today-buy / today-sell counts from inquire-present-balance.

    Used to separate overnight holdings from same-day purchases when computing
    today's P/L (the latter shouldn't be marked vs yesterday's close).
    """

    today_buy_qty: Decimal = Decimal(0)
    today_buy_amount_usd: Decimal = Decimal(0)
    today_sell_qty: Decimal = Decimal(0)
    today_sell_amount_usd: Decimal = Decimal(0)


def fetch_today_activity() -> dict[str, TodayActivity]:
    """Return today's buy/sell totals indexed by symbol."""
    data = fetch_present_balance_raw()
    output1 = data.get("output1") or []
    out: dict[str, TodayActivity] = {}
    for row in output1:
        symbol = str(row.get("pdno", "")).strip().upper()
        if not symbol:
            continue
        out[symbol] = TodayActivity(
            today_buy_qty=_to_decimal(row.get("thdt_buy_ccld_qty1")),
            today_buy_amount_usd=_to_decimal(row.get("thdt_buy_ccld_frcr_amt")),
            today_sell_qty=_to_decimal(row.get("thdt_sll_ccld_qty1")),
            today_sell_amount_usd=_to_decimal(row.get("thdt_sll_ccld_frcr_amt")),
        )
    return out


def fetch_cash_balances() -> CashBalances:
    """Return USD/KRW cash on the account using inquire-present-balance."""
    data = fetch_present_balance_raw()
    output2 = data.get("output2") or []
    output3 = data.get("output3") or {}

    usd_cash = Decimal(0)
    usd_withdrawable = Decimal(0)
    base_fx = Decimal(0)
    for row in output2:
        if (row.get("crcy_cd") or "").upper() == "USD":
            usd_cash = _to_decimal(row.get("frcr_dncl_amt_2"))
            usd_withdrawable = _to_decimal(row.get("frcr_drwg_psbl_amt_1"))
            base_fx = _to_decimal(row.get("frst_bltn_exrt"))
            break

    krw_cash = _to_decimal(output3.get("tot_dncl_amt"))
    krw_withdrawable = _to_decimal(output3.get("wdrw_psbl_tot_amt"))
    total_assets_krw = _to_decimal(output3.get("tot_asst_amt"))

    return CashBalances(
        usd_cash=usd_cash,
        usd_withdrawable=usd_withdrawable,
        krw_cash=krw_cash,
        krw_withdrawable=krw_withdrawable,
        total_assets_krw=total_assets_krw,
        base_fx_rate=base_fx,
    )


def fetch_present_balance_raw() -> dict:
    """Returns raw inquire-present-balance response (with TTL cache + retry).

    KIS enforces a per-second rate limit (EGW00201). A short cache deduplicates
    near-simultaneous callers; on a cache miss we also do one retry-with-backoff.
    """
    global _PRESENT_BALANCE_CACHE
    now = datetime.now(timezone.utc)
    with _PRESENT_BALANCE_LOCK:
        cached = _PRESENT_BALANCE_CACHE
        if cached is not None and (now - cached[0]) < _PRESENT_BALANCE_TTL:
            return cached[1]
    data = _fetch_present_balance_uncached()
    with _PRESENT_BALANCE_LOCK:
        _PRESENT_BALANCE_CACHE = (now, data)
    return data


def _fetch_present_balance_uncached() -> dict:
    _, _, account_number, product_code, paper = _require_creds()
    url = f"{base_url(paper)}/uapi/overseas-stock/v1/trading/inquire-present-balance"
    tr_id = "VTRP6504R" if paper else "CTRP6504R"
    headers = _auth_headers(tr_id)
    params = {
        "CANO": account_number,
        "ACNT_PRDT_CD": product_code,
        "WCRC_FRCR_DVSN_CD": "02",
        "NATN_CD": "840",
        "TR_MKET_CD": "00",
        "INQR_DVSN_CD": "00",
    }
    last_err: str = ""
    for attempt in range(2):
        resp = httpx.get(url, headers=headers, params=params, timeout=15.0)
        if resp.status_code == 200:
            data = resp.json()
            if data.get("rt_cd") in (None, "0"):
                return data
            last_err = f"rt_cd={data.get('rt_cd')} msg={data.get('msg1')!r}"
        else:
            text = resp.text[:300]
            last_err = f"HTTP {resp.status_code}: {text}"
        if "EGW00201" in last_err or "초당 거래건수" in last_err:
            import time
            time.sleep(0.5)
            continue
        break
    raise KisError(f"present-balance: {last_err}")


def reset_token_cache() -> None:
    global _TOKEN_CACHE
    with _TOKEN_LOCK:
        _TOKEN_CACHE = None


# ---------------------------------------------------------------------------
# Trade history (해외주식 기간별주문체결내역)
# ---------------------------------------------------------------------------

_KST = timezone(timedelta(hours=9))


def trade_history_tr_id(paper: bool) -> str:
    return "VTTS3035R" if paper else "TTTS3035R"


@dataclass(slots=True)
class KisTrade:
    """One executed overseas-stock trade returned by inquire-ccnl."""

    order_id: str            # "{ord_dt}-{odno}" — stable dedup key
    executed_at: datetime    # tz-aware UTC; from ord_dt + ord_tmd (KST → UTC)
    symbol: str
    side: str                # 'buy' | 'sell'
    quantity: Decimal
    price_usd: Decimal
    total_usd: Decimal
    raw: dict = field(default_factory=dict)


def fetch_trade_history(
    start_date: date,
    end_date: date,
    exchange: str = EXCHANGE_NASDAQ,
) -> list[KisTrade]:
    """Pull executed overseas-stock trades over [start_date, end_date].

    Endpoint: GET /uapi/overseas-stock/v1/trading/inquire-ccnl
    TR_ID:    TTTS3035R (real) / VTTS3035R (paper)

    - Filters CCLD_NCCS_DVSN=01 (체결 완료만)
    - Skips 정정·취소 rows (rvse_cncl_dvsn != '00')
    - Follows CTX_AREA_FK200/NK200 pagination (safety cap 20 pages)
    """
    _, _, account_number, product_code, paper = _require_creds()
    url = f"{base_url(paper)}/uapi/overseas-stock/v1/trading/inquire-ccnl"
    tr_id = trade_history_tr_id(paper)

    params = {
        "CANO": account_number,
        "ACNT_PRDT_CD": product_code,
        "PDNO": "%",                 # all symbols
        "ORD_STRT_DT": start_date.strftime("%Y%m%d"),
        "ORD_END_DT": end_date.strftime("%Y%m%d"),
        "SLL_BUY_DVSN": "00",        # all (buy + sell)
        "CCLD_NCCS_DVSN": "01",      # filled only
        "OVRS_EXCG_CD": exchange,
        "SORT_SQN": "DS",            # newest first
        "ORD_DT": "",
        "ORD_GNO_BRNO": "",
        "ODNO": "",
        "CTX_AREA_NK200": "",
        "CTX_AREA_FK200": "",
    }

    trades: list[KisTrade] = []

    for _ in range(20):  # safety cap on pagination
        headers = _auth_headers(tr_id)
        if params["CTX_AREA_FK200"]:
            headers["tr_cont"] = "N"  # 'next' continuation

        resp = httpx.get(url, headers=headers, params=params, timeout=15.0)
        if resp.status_code != 200:
            raise KisError(
                f"trade history request failed: {resp.status_code} {resp.text[:200]}"
            )
        data = resp.json()
        if data.get("rt_cd") != "0":
            raise KisError(
                f"trade history API error: rt_cd={data.get('rt_cd')} msg={data.get('msg1')!r}"
            )

        for row in data.get("output") or []:
            ccld_qty = _to_decimal(row.get("ft_ccld_qty"))
            if ccld_qty <= 0:
                continue
            rcv = (row.get("rvse_cncl_dvsn") or "00").strip()
            if rcv not in ("", "00"):
                continue  # skip 정정/취소

            ord_dt = (row.get("ord_dt") or "").strip()
            ord_tmd = (row.get("ord_tmd") or "000000").strip().zfill(6)
            try:
                naive = datetime.strptime(f"{ord_dt}{ord_tmd}", "%Y%m%d%H%M%S")
                executed_at = naive.replace(tzinfo=_KST).astimezone(timezone.utc)
            except (ValueError, TypeError):
                logger.warning("kis trade: bad date/time row=%s", row)
                continue

            side_code = (row.get("sll_buy_dvsn_cd") or "").strip()
            side = "buy" if side_code == "02" else "sell"

            odno = (row.get("odno") or "").strip()
            order_id = (
                f"{ord_dt}-{odno}" if odno
                else f"{ord_dt}-{row.get('pdno', '?')}-{ord_tmd}"
            )

            trades.append(
                KisTrade(
                    order_id=order_id,
                    executed_at=executed_at,
                    symbol=str(row.get("pdno", "")).strip().upper(),
                    side=side,
                    quantity=ccld_qty,
                    price_usd=_to_decimal(row.get("ft_ccld_unpr3")),
                    total_usd=_to_decimal(row.get("ft_ccld_amt3")),
                    raw=row,
                )
            )

        tr_cont = (resp.headers.get("tr_cont") or "").strip()
        if tr_cont not in ("F", "M"):
            break  # no more pages
        params["CTX_AREA_FK200"] = data.get("ctx_area_fk200", "")
        params["CTX_AREA_NK200"] = data.get("ctx_area_nk200", "")

    return trades
