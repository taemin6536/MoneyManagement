# AI 일일 브리핑 — 설계 스펙

작성일: 2026-05-27

## 목적

일일 리포트(텔레그램/Slack)와 대시보드에서, 시스템이 이미 계산하는 raw 숫자
(QQQ drawdown, 다음 매수 트리거, RSI/FGI/VIX, 환율 30D 편차, 보유·현금)를
**초보자 눈높이의 한국어 브리핑**으로 변환해 "지금 어떤 상태인지" 쉽게 설명한다.

핵심 원칙: 이 시스템은 *감정 빼고 규칙대로* 운용하기 위한 도구다. 따라서 AI는
**현재 상태와 결정론적 룰 단계만 설명**하며, **"사라/팔라"·가격 예측·투자조언을
하지 않는다.**

## 결정 사항

| 항목 | 결정 |
|---|---|
| LLM | Claude (Anthropic SDK), 모델은 `ANTHROPIC_MODEL` env (기본 Haiku) |
| 배치 | 리포트 상단 "🤖 오늘의 브리핑" 내러티브 + 아래 기존 raw 숫자 유지 |
| 노출 | ① 일일 리포트(텔레그램/Slack) ② 대시보드 "지금 상태 설명" 버튼 |
| 폴백 | 키 없음·API 장애·타임아웃 → None → 기존 raw 리포트만, 버튼은 안내 |
| 시크릿 | `ANTHROPIC_API_KEY` (Fly secret + 로컬 .env, KIS 키와 동급, 커밋 금지) |

## 컴포넌트

### `backend/app/integrations/anthropic_client.py` (신규)
- `generate_briefing(context: dict) -> str | None`
- Anthropic SDK 사용. 시스템 프롬프트에 가드레일:
  - 한국어, 초보자 눈높이, 3~5문장
  - 현재 상태 + 결정론적 룰 단계만 설명
  - 투자조언/매수·매도 권유/가격 예측 금지
  - prompt caching: 정적 시스템 프롬프트 블록에 `cache_control` (대시보드 연타 시 캐시 히트)
- 키 미설정 → `None`. 예외/타임아웃(30s) → 로그 + `None`.

### `backend/app/services/daily_report.py` (리팩터)
- `gather_context(db) -> dict` 추출: 현재 build_report 내부의 데이터 계산을 분리.
  - 포함: qqq close/ath/ath_date, drawdown, next_trigger_price, tqqq/qld close,
    rsi_14, channel_breakout, fgi score/rating, vix, usd_krw, fx sma_30/deviation,
    holdings(symbol/qty/price/eval/pl), cash_usd/cash_krw/tactical
- `render_raw_markdown(context) -> list[str]`: 기존 라인 렌더 로직.
- `build_report(db)`: context → `generate_briefing` → 내러티브 있으면 상단 prepend,
  None이면 생략 → raw 마크다운. (title, body) 반환은 그대로.

### `backend/app/api/briefing.py` (신규) — `GET /api/briefing`
- `gather_context(db)` 재사용 → `generate_briefing` →
  `{ briefing: str|null, generated_at: iso, model: str, available: bool }`
- 키 없으면 `available:false`, briefing null.
- 60초 in-memory 캐시로 버튼 연타 시 LLM 재호출 방지.
- main.py에 라우터 등록.

### `backend/app/config.py`
- `anthropic_api_key: str = ""`
- `anthropic_model: str = "<haiku 기본값>"`

### `backend/pyproject.toml`
- `anthropic>=0.40.0` 의존성 추가.

### `frontend/components/BriefingCard.tsx` (신규, client)
- "지금 상태 설명" 버튼 → `/api/briefing` fetch → 로딩 → 내러티브 카드.
- `available:false`면 "ANTHROPIC_API_KEY 미설정" 안내.
- `frontend/lib/api.ts`에 `fetchBriefing()` 추가, `app/page.tsx` 상단에 배치.

## 데이터 흐름

```
gather_context(db) ──┬─→ render_raw_markdown()  ─┐
                     │                            ├─→ 일일 리포트 body (내러티브 + raw)
                     └─→ generate_briefing() ─────┘
GET /api/briefing → gather_context → generate_briefing → JSON → 대시보드 버튼
```
숫자 계산은 `gather_context` 한 곳 → 리포트와 버튼이 항상 동일 데이터.

## 에러 처리

- 키 미설정 / API 에러 / 타임아웃 → `generate_briefing` None → raw 리포트 폴백.
- 대시보드: `available:false` 또는 fetch 실패 시 안내 메시지, 앱 동작 영향 없음.

## 검증

- 유닛: `gather_context` 모양(필드 존재), `generate_briefing`(키없음→None / 예외→None /
  정상→텍스트, Anthropic mock), `build_report`(내러티브 있을 때 상단 포함 / None일 때 생략).
- 수동: 로컬 `/api/briefing` 200, 리포트 수동 트리거 → 텔레그램 도달, 대시보드 버튼 동작.

## 범위 밖 (다음 단계)

- 뉴스 요약 (RSS/공식 API 별도 단계)
- 멀티유저 / BYO 한투키
- 관심종목 Watchlist 탭
