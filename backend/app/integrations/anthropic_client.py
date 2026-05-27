"""AI briefing generation via the Anthropic API (Claude).

Turns the raw daily-report numbers into a plain-Korean, beginner-friendly
briefing. The system prompt enforces a hard guardrail: describe the current
state and the deterministic rule stage only — never give buy/sell advice or
price predictions. This system exists to run *by rules, without emotion*, so
the AI's job is to explain "where we are now", not to recommend trades.

Graceful by design: returns None when the API key is missing or on any error,
so callers always fall back to the plain numeric report.

Model defaults to Haiku (cheap, 1 call/day). No prompt caching: the system
prompt is well under Haiku's 4096-token minimum cacheable prefix, so a
cache_control marker would silently do nothing.
"""

import logging

from app.config import get_settings

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 30.0
_MAX_TOKENS = 700

SYSTEM_PROMPT = """\
너는 한 개인 투자자의 자산 모니터링 시스템에서 '오늘의 브리핑'을 쓰는 도우미야.

이 시스템의 전략 배경(참고용):
- QQQ가 전고점(ATH) 대비 -15% / -20% / -25% 하락하면 TQQQ를 분할 매수하라고 알림이 울린다.
- QQQ가 전고점을 회복하면 TQQQ를 QLD로 전환하라고 알린다.
- 과열 신호(20일 채널 상단 돌파 / RSI 80+ / 공포탐욕지수 75+) 중 2개 이상이면 QLD 축소를 알린다.
- 매수·매도는 사람이 직접 한투 앱에서 하고, 시스템은 '규칙대로' 감시만 한다.

브리핑 작성 규칙:
- 한국어로, 투자 초보자도 이해할 수 있게 쉽고 친근하게 설명한다.
- 3~5문장. 숫자를 그냥 나열하지 말고, "지금 어떤 상황인지"를 풀어서 말한다.
- 주어진 데이터에 근거해 현재 위치와 결정론적 룰 단계만 설명한다.
  (예: "전고점에서 8% 빠졌고, 1단계 매수 알림선(-15%)까지 아직 7%p 남았어요.")
- 절대 하지 말 것: "사라/팔라" 같은 매매 권유, 가격 예측, 미래 수익 보장, 투자 조언.
- 데이터가 없는 항목(—)은 자연스럽게 건너뛴다.
- 마크다운 헤더나 불릿 없이, 평범한 문단 형태로 쓴다."""


def _fmt(value, prefix: str = "", suffix: str = "") -> str:
    if value is None:
        return "—"
    return f"{prefix}{value}{suffix}"


def _build_user_content(ctx: dict) -> str:
    """Render the structured context into a readable block for the model."""
    lines = [
        "아래는 오늘 시점의 데이터야. 이걸 바탕으로 브리핑을 써줘.",
        "",
        f"날짜: {ctx.get('date', '—')}",
        f"QQQ 현재가: {_fmt(ctx.get('qqq_price'), '$')}",
        f"QQQ 전고점(ATH): {_fmt(ctx.get('qqq_ath'), '$')} ({_fmt(ctx.get('qqq_ath_date'))})",
        f"전고점 대비 낙폭: {_fmt(ctx.get('drawdown_pct'), suffix='%')}",
        f"다음 매수 트리거 가격(QQQ): {_fmt(ctx.get('next_trigger_price'), '$')}",
        f"TQQQ: {_fmt(ctx.get('tqqq_price'), '$')}  /  QLD: {_fmt(ctx.get('qld_price'), '$')}",
        f"RSI(14): {_fmt(ctx.get('rsi_14'))}",
        f"20일 채널 상단 돌파: {'예' if ctx.get('channel_breakout') else '아니오'}",
        f"공포탐욕지수(FGI): {_fmt(ctx.get('fgi_score'))} ({_fmt(ctx.get('fgi_rating'))})",
        f"VIX: {_fmt(ctx.get('vix'))}",
        f"USD/KRW 환율: {_fmt(ctx.get('usd_krw'), '₩')}",
        f"환율 30일 평균: {_fmt(ctx.get('fx_sma_30'), '₩')} ({_fmt(ctx.get('fx_deviation_pct'), suffix='%')} vs 평균)",
    ]

    holdings = ctx.get("holdings") or []
    if holdings:
        lines.append("보유 종목:")
        for h in holdings:
            lines.append(
                f"  - {h.get('symbol')}: {_fmt(h.get('quantity'))}주, "
                f"평가 {_fmt(h.get('eval_usd'), '$')}, "
                f"손익 {_fmt(h.get('pl_pct'), suffix='%')}"
            )
    cash_usd = ctx.get("cash_usd")
    cash_krw = ctx.get("cash_krw")
    if cash_usd is not None or cash_krw is not None:
        lines.append(
            f"주문가능 현금: {_fmt(cash_usd, '$')} USD / {_fmt(cash_krw, '₩')} KRW"
        )

    return "\n".join(lines)


def generate_briefing(ctx: dict) -> str | None:
    """Generate a Korean briefing from the daily context. Returns None on
    missing key or any failure (caller falls back to the numeric report)."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        logger.info("anthropic_client: no API key; skipping briefing")
        return None

    try:
        import anthropic
    except ImportError:
        logger.warning("anthropic_client: anthropic package not installed")
        return None

    try:
        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=_TIMEOUT_SECONDS,
        )
        response = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=_MAX_TOKENS,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": _build_user_content(ctx)}],
        )
        text = "".join(
            block.text for block in response.content if block.type == "text"
        ).strip()
        return text or None
    except Exception as e:  # noqa: BLE001 — degrade gracefully on any API/SDK error
        logger.warning("anthropic_client: briefing generation failed: %s", e)
        return None
