# MoneyManagement

개인 TQQQ / QLD 레버리지 ETF 전략 자동 모니터링·알림·회고 시스템.

QQQ drawdown 기반 분할매수 / ATH 회복 시 QLD 전환 / 과열 신호 비중 축소 — 매뉴얼대로 시장을 감시하다 트리거 도달 시 **Slack 또는 Telegram 봇으로 매수·매도 알람**을 보낸다. KIS Open API로 USD/KRW 예수금·보유종목·당일 체결·매매 내역까지 자동 동기화되고, yfinance·CNN FGI·환율 데이터로 시세·신호를 폴링한다. Claude(Haiku)가 매일 시장 상황과 매크로 뉴스를 한국어로 풀어서 브리핑한다.

> 감정은 줄이고, 기준은 명확하게.

---

## 주요 기능

### 전략 룰 & 알림
- **3단계 매수 룰** — QQQ가 ATH 대비 -15% / -20% / -25% 도달 시 USD 예수금의 10% / 25% / 30% 매수 권장
- **2번째 매도 룰** — QQQ가 ATH 회복 시 TQQQ 전량 매도 → QLD 전환
- **3번째 과열 룰** — 20일 채널 돌파 / RSI ≥ 80 / 공포탐욕지수 ≥ 75 중 2개 이상 충족 시 QLD 비중 축소
- **환율 알람** — USD/KRW 절대 임계 + 30일 이평 대비 편차 (환전 타이밍)
- **다중 알림 채널** — Slack incoming webhook · Telegram Bot API (둘 다 옵션, 동시 사용 가능)
- **24시간 dedup** — 같은 단계 알림 중복 차단

### 매매 일지 & 회고
- **자동 한투 동기화** — KIS `해외주식 기간별주문체결내역` 매일 KST 08:00 / 수동 트리거 가능
- **체결 시점 시장 스냅샷** — 거래마다 그 시점 QQQ price/ATH/낙폭·TQQQ·QLD·VIX·USD/KRW를 prices_history·fx_history에서 best-effort로 복원
- **메모·트리거 룰 태그** — 어떤 룰로 산 건지, 그날 왜 그렇게 판단했는지 회고용 자유 메모 저장

### AI 브리핑 (Claude Haiku)
- **일일 브리핑** — 매일 KST 06:30 텔레그램 리포트 상단에 자동 한국어 요약. 현재 낙폭·다음 트리거 거리·과열 상태·환율을 평이한 문장으로
- **매크로 뉴스 요약** — 공식 RSS(Yahoo Finance / MarketWatch Market Pulse / CNBC Markets / Fed / BLS)에서 30분마다 수집 → 24h 헤드라인을 Claude가 한국어 단락 2~3개로 종합. 나스닥/S&P 500과의 연관 메커니즘·시장 참여자 시각·역사적 패턴까지 풀어 전달
- **가드레일** — 매매 권유·가격 예측·미래 수익 보장은 시스템 프롬프트로 금지
- **`/news` 페이지** — RSS 타임라인 + 소스 칩 필터 + 30초 auto-refresh + "AI 요약 보기" 버튼

### 자동화 & 데이터
- **잔고 동기화** — KIS API로 USD/KRW 예수금, 보유 종목, 총자산, 당일 매수 수량까지
- **일일 리포트** — KST 06:30 발송 — AI 브리핑 + 매크로 뉴스 요약 + QQQ drawdown / VIX / FGI / RSI / 환율 / 보유·현금
- **백테스트** — 2015~현재 QQQ/TQQQ/KRW=X 일봉으로 Pure DCA vs 70/30 매뉴얼 전략 비교 (CAGR / MDD / Equity curve)
- **분할매수 계산기** — 현재가·현금 입력 시 단계별 매수 USD·예상 TQQQ 주수
- **30초 auto-refresh** — 대시보드 / 알림 페이지 (탭 비활성 시 자동 일시정지)

### UI
- **모바일 반응형** — 사이드바 햄버거 drawer, 컬럼 자동 축약, 본문 폰트 스케일
- **한국식 P/L 컬러** — 수익 빨강 / 손실 파랑 (대시보드·매매일지·차트 일관)
- **마크다운 렌더링** — AI 출력의 `**굵게**` / 단락 구분이 진짜 굵게/단락으로 보임

### 보안 (Phase 1)
- **단일 비밀번호 + 세션 쿠키** — Next.js middleware가 HMAC-SHA256 서명 세션 검증, 미인증 시 `/login` 강제
- **BFF 프록시** — 브라우저는 백엔드 URL에 직접 접근 못 함. 모든 `/api/*` 호출은 Next.js 동일 출처 프록시 (`/api/be/...`) 통과 → 백엔드는 `X-Internal-Token`이 있는 요청만 수락
- **시크릿 미설정 시 자동 bypass** — 로컬 docker는 설정 0으로 그대로 부팅됨

---

## 스택

| 영역 | 기술 |
|---|---|
| Backend | Python 3.13 · FastAPI · SQLAlchemy · APScheduler · Alembic |
| Frontend | Next.js 15 (App Router, Edge middleware) · TypeScript · Tailwind · recharts · react-markdown |
| Database | PostgreSQL 17 (로컬 docker / 프로덕션 Neon) |
| LLM | Anthropic Claude API (기본 `claude-haiku-4-5`) |
| 외부 데이터 | KIS Open API · yfinance · CNN Fear-Greed Index · 공식 RSS(Yahoo/MarketWatch/CNBC/Fed/BLS) |
| 알림 | Slack incoming webhook · Telegram Bot API |
| 배포 | docker compose (로컬) · **Fly.io + Neon Postgres** (프로덕션) |

---

## 빠른 시작

### 1. clone 후 환경 변수 설정

```bash
git clone git@github.com:taemin6536/MoneyManagement.git
cd MoneyManagement
cp .env.example .env
```

`.env` 편집 — 필수 항목:

```dotenv
# 한국투자증권 KIS Developers 발급
KIS_APP_KEY=...
KIS_APP_SECRET=...
KIS_ACCOUNT_NUMBER=12345678        # 계좌번호 앞 8자리
KIS_ACCOUNT_PRODUCT_CODE=01         # 뒤 2자리
KIS_PAPER_MODE=false                # 실전 / 모의 (true)

# 알림 채널 — Slack / Telegram 중 하나 또는 둘 다
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
TELEGRAM_BOT_TOKEN=1234567890:AAEx...
TELEGRAM_CHAT_ID=123456789

# AI 브리핑·뉴스 요약 (선택 — 없으면 raw 리포트로 자동 폴백)
ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_MODEL=claude-haiku-4-5  # 기본값

# 로컬 dev: 인증 셋은 비워둬도 됨. middleware가 bypass 모드로 부팅.
# SESSION_SECRET=
# SINGLE_USER_PASSWORD=
# BACKEND_INTERNAL_TOKEN=
```

#### 외부 서비스 신청

- **KIS Developers**: <https://apiportal.koreainvestment.com> → 앱 등록 → APP_KEY / APP_SECRET 발급
- **Slack** (선택): <https://api.slack.com/apps> → Incoming Webhooks 활성화
- **Telegram 봇** (선택):
  1. Telegram에서 [@BotFather](https://t.me/BotFather)와 대화 → `/newbot` → 토큰 받음
  2. 생성된 봇 채팅창에서 메시지 한 번 전송
  3. `https://api.telegram.org/bot<TOKEN>/getUpdates` 에서 `chat.id` 확인
- **Anthropic API** (선택): <https://console.anthropic.com> → API Keys → 발급. 사용량/한도 설정 권장.

### 2. 부팅

```bash
docker compose up --build
```

- Backend: <http://localhost:8000> (헬스 `/health`, OpenAPI docs `/docs`)
- Frontend: <http://localhost:3000>
- Postgres: localhost:5432

### 3. 마이그레이션 적용

```bash
docker compose exec backend alembic upgrade head
```

### 4. 초기 매매 일지 백필 (선택)

KIS 키가 설정돼 있으면 지난 1년치 거래를 한 번에 가져옵니다:

```bash
curl -X POST "http://localhost:8000/api/dev/trades-sync?days_back=365"
```

---

## 디렉토리 구조

```
MoneyManagement/
├── backend/
│   ├── app/
│   │   ├── api/             # FastAPI 라우터 (health, market, portfolio, contributions,
│   │   │                    #   backtest, briefing, news, trades)
│   │   ├── db/              # SQLAlchemy 모델 (prices, ath, alerts, portfolio_snapshots,
│   │   │                    #   contributions, tactical_*, krw_balance, news_items, trades)
│   │   ├── integrations/    # KIS, yfinance, Slack, Telegram, FGI, Anthropic, RSS
│   │   ├── rules/           # 매수/매도/과열/환율 룰 엔진
│   │   ├── services/        # 도메인 로직 (market_data, portfolio, alerts, equity_curve,
│   │   │                    #   backtest, contributions, news, daily_report, trades)
│   │   ├── scheduler.py     # APScheduler — 1분 polling, 일일 리포트, 잔고 스냅샷,
│   │   │                    #   30분 RSS, 일일 매매 동기화
│   │   ├── main.py          # FastAPI + X-Internal-Token 미들웨어
│   │   └── config.py
│   ├── alembic/             # DB 마이그레이션
│   ├── tests/               # pytest (룰·신호·RSS·요약·매매 단위 테스트)
│   ├── Dockerfile           # 로컬 dev
│   ├── Dockerfile.prod      # Fly 프로덕션
│   ├── fly.toml
│   └── pyproject.toml
├── frontend/
│   ├── app/
│   │   ├── page.tsx              # Dashboard (히어로 + 보유 + 뉴스/매매 미리보기 + 과열)
│   │   ├── news/page.tsx         # RSS 타임라인 + AI 요약 패널
│   │   ├── trades/page.tsx       # 매매 일지 (필터 + 동기화 버튼 + 상세 drawer)
│   │   ├── contributions/        # 납입·USD 직접 입금·KRW 잔고
│   │   ├── backtest/             # 전략 백테스트
│   │   ├── rules/                # 룰 임계치 표시
│   │   ├── alerts/               # 알림 이력
│   │   ├── calculator/           # 분할매수 계산기
│   │   ├── login/                # 인증 (Phase 1)
│   │   └── api/
│   │       ├── login/route.ts    # 로그인 POST
│   │       ├── logout/route.ts   # 로그아웃
│   │       └── be/[...slug]/     # BFF 프록시 (X-Internal-Token 부착)
│   ├── components/          # Sidebar · PortfolioHero · BriefingCard · NewsCard ·
│   │                        #   NewsSummaryPanel · TradesCard · TradeDetailDrawer · ...
│   ├── lib/
│   │   ├── api.ts           # 백엔드 API 클라이언트 — 서버=직접·클라=프록시 자동 분기
│   │   ├── session.ts       # 세션 쿠키 HMAC sign/verify (Web Crypto)
│   │   ├── public-url.ts    # x-forwarded-host 기반 redirect URL 빌더
│   │   └── format.ts        # 통화·시각 헬퍼
│   ├── middleware.ts        # 세션 가드 + /login 리디렉트
│   ├── Dockerfile.prod      # standalone 빌드
│   └── fly.toml
├── docs/superpowers/specs/  # 기능별 설계 스펙 문서
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 룰 개요

| ID | 트리거 | 액션 |
|---|---|---|
| `rule_buy_drawdown` | QQQ가 ATH 대비 −15% / −20% / −25% 도달 | TQQQ를 사용 가능 USD의 10% / 25% / 30%로 매수 (단계별 누적, 잔액 기준) |
| `rule_sell_recovery` | QQQ가 ATH 대비 0.5% 이내로 회복 | TQQQ 전량 매도 → QLD 전환 |
| `rule_overheated` | 20일 채널 돌파 + RSI(14) ≥ 80 + FGI ≥ 75 중 2 이상 | QLD 비중 축소 |
| `rule_fx_threshold` | USD/KRW ≤ ₩1300 또는 ≥ ₩1400 | 환전 / 노출 경고 |
| `rule_fx_dca_timing` | USD/KRW가 30일 이평 대비 1% 이상 하락 | 정기 환전 타이밍 |

dedup: 같은 `(rule, level)` 조합은 24h 1회만 발송. `alerts_log` 테이블에 모든 시도 기록.

---

## API 개요

| Method · Path | 설명 |
|---|---|
| `GET  /health` | Backend / DB / Slack(env) / Telegram(env) / KIS(env) 상태 |
| `GET  /api/portfolio` | KIS 잔고 + USD 주문가능 + KRW 예수금 + 총자산 + Today P/L (당일 매수 분리 계산) |
| `GET  /api/portfolio/equity` | 365일 equity curve (실제 snapshots + 라이브 anchor) |
| `GET  /api/symbols/{sym}/summary` | 심볼 ATH · drawdown · 다음 트리거 단계 |
| `GET  /api/symbols/{sym}/sparkline` | 일봉 close 시리즈 |
| `GET  /api/signals/overheated` | 과열 3 신호 현재 상태 |
| `GET  /api/signals/rsi-history` | 일별 RSI(14) 시리즈 |
| `GET  /api/fx` | USD/KRW + 밴드 + 30일 SMA 편차 |
| `GET  /api/rules` | 룰 임계 설정 |
| `GET  /api/alerts` | 알림 발송 이력 |
| `GET  /api/backtest` | Pure DCA vs Manual 70/30 시뮬레이션 |
| `GET  /api/briefing` | 현재 시점 AI 한국어 브리핑 (60s 캐시) |
| `GET  /api/news` | RSS 타임라인 (필터: source, days, limit) |
| `GET  /api/news/summary` | 24h 헤드라인 Claude 한국어 종합 요약 |
| `GET  /api/trades` | 매매 일지 (필터: symbol, side, days) |
| `POST /api/trades` | 수동 매매 등록 |
| `PATCH /api/trades/{id}` | 메모·트리거 룰 수정 |
| `POST /api/dev/trades-sync` | KIS 매매 백필/델타 (`days_back` 파라미터) |
| `POST /api/dev/news-poll` | RSS 수동 폴 |

프론트엔드 브라우저 호출은 동일 출처 `/api/be/<path>` 프록시 경유. 백엔드 직접 호출은 `X-Internal-Token` 필수.

상세: 부팅 후 <http://localhost:8000/docs>

---

## 인증 (Phase 1)

**로컬 dev (시크릿 미설정)**: middleware가 자동 bypass — `docker compose up`만으로 즉시 사용 가능.

**프로덕션 활성화**: 세 가지 시크릿을 양쪽 Fly 앱에 등록.

```bash
SESSION_SECRET=$(openssl rand -hex 32)
BACKEND_INTERNAL_TOKEN=$(openssl rand -hex 32)
read -rs "SINGLE_USER_PASSWORD?Password: "; echo   # zsh
# bash이면: read -rs -p "Password: " SINGLE_USER_PASSWORD; echo

fly secrets set BACKEND_INTERNAL_TOKEN="$BACKEND_INTERNAL_TOKEN" -a moneymangement-api
fly secrets set \
  SESSION_SECRET="$SESSION_SECRET" \
  SINGLE_USER_PASSWORD="$SINGLE_USER_PASSWORD" \
  BACKEND_INTERNAL_TOKEN="$BACKEND_INTERNAL_TOKEN" \
  -a moneymangement-web

unset SESSION_SECRET BACKEND_INTERNAL_TOKEN SINGLE_USER_PASSWORD
```

`BACKEND_INTERNAL_TOKEN`은 양쪽 앱에 **똑같은 값**이 들어가야 매칭. `fly secrets set`은 자동으로 머신을 재시작해 즉시 적용.

확인:
- `curl -sI https://<web>/` → `Location: /login`
- `curl -s -o /dev/null -w "%{http_code}" https://<api>/api/portfolio` → `401`

---

## 핵심 설계 결정

- **Tactical Reserve = KIS USD 주문가능액**. 환전된 USD 자체가 다음 트리거에서 쏠 총알. 별도 수동 ledger 불필요.
- **Today P/L** — `thdt_buy_ccld_qty1`로 당일 매수분과 전일까지 보유분을 분리 계산. 오늘 산 포지션은 매수가 대비, 어제까지 보유한 포지션은 어제 종가 대비.
- **P/L 컬러** — 한국 증권 관례 (상승=빨강 `--mm-up`, 하락=파랑 `--mm-down`).
- **AI 가드레일** — 시스템 프롬프트에 *매매 권유·가격 예측·미래 수익 보장 금지* 박힘. 시장 참여자 시각·역사적 패턴·메커니즘 설명만 허용.
- **뉴스 round-robin** — 단순 시간순이면 빈도 큰 피드(MarketWatch)가 LLM 입력을 독점. 소스당 5개씩 최대 20개로 균형.
- **저작권 안전** — RSS 발행자가 신디케이션 허용하는 헤드라인+요약+링크만 저장. 원문 전체 저장·표시 금지.
- **KIS API rate-limit** — 3초 in-memory 캐시 + 1회 재시도로 EGW00201 회피.
- **Pre-market 데이터** — yfinance `prepost=True`로 미국 정규장 외 시간에도 1분봉 수신.
- **24h alert dedup** — 동일 단계 중복 방지, 가격이 일시적으로 임계 근처에서 흔들려도 알람 한 번만.
- **BFF 프록시** — 브라우저가 백엔드 URL에 직접 접근 불가. CORS 신경 안 써도 되고 모든 dev 엔드포인트가 자동으로 인증 뒤로 들어감.

---

## 테스트

```bash
docker compose exec backend python -m pytest tests/ -v
```

룰 엔진·RSS 파싱·AI 요약(fake)·매매 KIS 응답 파싱·시그널 계산까지 단위 테스트 47건.

---

## 보안

- `.env`는 `.gitignore` 처리. **절대 커밋 금지.**
- KIS APP_SECRET / Slack webhook URL / Telegram BOT_TOKEN / ANTHROPIC_API_KEY / DATABASE_URL은 **비밀번호 동급**. 공개·캡쳐·외부 공유 시 즉시 폐기·재발급 권장. 채팅·이슈·로그에도 붙여넣지 말 것.
- 시스템은 **시세 조회·잔고 조회·알림 발송**만 한다. **자동 주문은 하지 않는다.** 모든 매수·매도는 사용자가 한투 앱에서 수동.
- 단일 사용자 가정. 멀티유저 인증 미구현. (Phase 2에서 Cloudflare Access 등 검토 예정)

---

## 운용 사이클 (사용자 워크플로)

1. KRW 입금 → 한투 앱에서 USD 환전 → KIS API가 자동으로 USD 예수금 갱신
2. KST 06:30 텔레그램 일일 리포트로 시장 상황(AI 브리핑) + 매크로 뉴스 요약 종합 확인
3. 분할매수 트리거 발동 시 Slack/Telegram 매수 알람 수신 — 메시지에 매수 USD·KRW 환산·예상 TQQQ 주수·다음 트리거·액션 체크리스트까지 포함
4. 한투 앱에서 권장액만큼 TQQQ 시장가 매수 → KIS가 잔고 자동 동기화
5. 매일 KST 08:00 매매 일지 자동 동기화 → `/trades`에서 행 클릭해 트리거 룰 태그·메모 추가 (회고용)
6. QQQ ATH 회복 시 매도 알람 → TQQQ 전량 매도 → 동일 USD로 QLD 매수
7. 과열 신호 발동 시 QLD 일부 매도 → USD 예수금으로 복귀

---

## 로드맵

- **다음** — B. 경제 캘린더 (FOMC / CPI / NFP / PCE / BOK 발표 일정 + T-24h 알람)
- **Phase 2 (AI)** — 뉴스 임베딩 + 벡터 검색 (pgvector) → 자연어 질의 챗봇
- **인증 Phase 2** — Cloudflare Access (Google OAuth 통합), 커스텀 도메인
- **품질** — 세금 시뮬레이션(한국 양도세) / 룰 웹 편집 UI / 손익 분석 페이지

---

## 라이선스

개인 학습·운용 목적의 작업물. 외부 공개 라이선스 미설정.
