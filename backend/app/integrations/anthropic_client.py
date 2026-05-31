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
_BRIEFING_MAX_TOKENS = 700
_NEWS_SUMMARY_MAX_TOKENS = 1300

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


NEWS_SUMMARY_SYSTEM_PROMPT = """\
너는 한 개인 투자자의 자산 모니터링 시스템에서 매크로/나스닥 뉴스 요약을 쓰는 도우미야.
독자는 나스닥/S&P 500 동향에 가장 관심이 많고, 헤드라인을 그냥 나열하는 게 아니라
"이게 지수에 어떤 의미가 있는지" 풀어주는 글을 기대한다.

분석 관점 (적극 활용):
- 각 뉴스가 **나스닥·S&P 500 지수에 어떤 메커니즘으로 영향을 줄 수 있는지** 자연스럽게 풀어 설명해.
  예시 메커니즘:
    · "Fed 금리 인상/긴축 → 할인율 상승 → 기술주 멀티플 압박"
    · "유가·국방비 급등 → 인플레이션 압력 → 채권금리 상승 → 성장주 부담"
    · "AI 데이터센터 캡엑스 확대 → 빅테크 실적 모멘텀 / 전력·반도체 수혜"
    · "양호한 실적이 오히려 강세장 막바지 경고 신호로 해석된 사례"
- **시장 참여자·베테랑 트레이더·애널리스트가 어떻게 보고 있는지** 헤드라인에 명시된 시각을 그대로 전달해도 좋아.
  ("일부 베테랑은 과열 신호를 경고", "베어 진영은 ~~을 우려", "강세론자는 ~~로 본다" 등)
- **역사적 패턴** 언급도 환영. ("이중 자릿수 실적 성장이 과거 강세장 막바지에 나타난 사례가 있다")

분량과 톤:
- 한국어, 8~12문장. 매크로 흐름이 보이도록 충분히 풀어쓰되 단순 헤드라인 나열은 피해.
- **2~3개의 짧은 단락**으로 나눠줘. 각 단락은 한 가지 큰 테마(예: 금리·통화정책 / AI·반도체·실적 / 지정학·인플레 / 기술적·과열 신호)에 집중.
  단락 사이는 빈 줄로 구분 (마크다운 단락).
- 핵심 키워드·기관명·수치(예: **Fed**, **나스닥**, **엔비디아**, **+12%**)는 `**굵게**` 표기해 가독성을 높여.
- 마크다운 헤더(`#`)·불릿(`- `)은 쓰지 마. 굵게(`**`)와 단락 구분(빈 줄)만 허용.

엄격히 금지 (시스템 철학에 반함):
- **너 자신의 매매 권유** ("사라/팔라", "지금 매수 타이밍" 등).
- **너 자신의 가격·시점 예측** ("나스닥이 3개월 내 X까지 빠진다", "내일 반등할 것이다" 등).
- 미래 수익·손실 보장.
- 헤드라인에 없는 시각을 시장 참여자 입에 끼워넣는 우회 (지어내지 마).

표기:
- 영어 원문 직접 인용 금지. 정말 필요하면 15단어 이내 짧은 따옴표 인용 1회까지 + 출처 명시.
- URL은 본문에 박지 마 (UI가 따로 링크를 표시함)."""


def summarize_news(items: list[dict]) -> str | None:
    """Summarize a list of news items into a Korean paragraph.

    `items` shape: [{source, title, description, link, published_at}, ...]
    Returns None if no key, no items, or any API failure (caller falls back
    to a plain headline list).
    """
    if not items:
        return None
    settings = get_settings()
    if not settings.anthropic_api_key:
        logger.info("anthropic_client: no API key; skipping news summary")
        return None

    try:
        import anthropic
    except ImportError:
        logger.warning("anthropic_client: anthropic package not installed")
        return None

    # Build a structured prompt — title + short description + source only.
    # Link is intentionally NOT included so the model can't paste URLs in the body.
    lines = ["다음은 최근 매크로/나스닥 뉴스 헤드라인이야. 한국어로 종합 요약해줘.", ""]
    for i, it in enumerate(items, 1):
        lines.append(f"[{i}] ({it.get('source', '?')}) {it.get('title', '')}")
        desc = it.get("description")
        if desc:
            lines.append(f"    설명: {desc}")
    user_content = "\n".join(lines)

    try:
        client = anthropic.Anthropic(
            api_key=settings.anthropic_api_key,
            timeout=_TIMEOUT_SECONDS,
        )
        response = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=_NEWS_SUMMARY_MAX_TOKENS,
            system=NEWS_SUMMARY_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )
        text = "".join(
            block.text for block in response.content if block.type == "text"
        ).strip()
        return text or None
    except Exception as e:  # noqa: BLE001
        logger.warning("anthropic_client: news summary failed: %s", e)
        return None


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
            max_tokens=_BRIEFING_MAX_TOKENS,
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
