# MoneyManagement

개인 TQQQ / QLD 레버리지 ETF 전략 자동 모니터링·알림 시스템.

QQQ drawdown 기반 분할매수 / ATH 회복 시 QLD 전환 / 과열 신호 비중 축소 — 매뉴얼대로 시장을 감시하다 트리거 도달 시 **Slack 또는 Telegram 봇으로 매수·매도 알람**을 보낸다. KIS Open API로 USD/KRW 예수금·보유종목·당일 체결까지 자동 동기화되고, yfinance·CNN FGI·환율 데이터로 시세·신호를 폴링한다.

> 감정은 줄이고, 기준은 명확하게.

---

## 주요 기능

- **3단계 매수 룰** — QQQ가 ATH 대비 -15% / -20% / -25% 도달 시 USD 예수금의 10% / 25% / 30% 매수 권장
- **2번째 매도 룰** — QQQ가 ATH 회복 시 TQQQ 전량 매도 → QLD 전환
- **3번째 과열 룰** — 20일 채널 돌파 / RSI ≥ 80 / 공포탐욕지수 ≥ 75 중 2개 이상 충족 시 QLD 비중 축소
- **환율 알람** — USD/KRW 절대 임계 + 30일 이평 대비 편차 (환전 타이밍)
- **백테스트** — 2015~현재 QQQ/TQQQ/KRW=X 일봉으로 Pure DCA vs 70/30 매뉴얼 전략 비교 (CAGR / MDD / Equity curve)
- **분할매수 계산기** — 현재가·현금 입력 시 단계별 매수 USD·예상 TQQQ 주수
- **자동 잔고 동기화** — KIS API로 USD/KRW 예수금, 보유 종목, 총자산, 당일 매수 수량까지 실시간
- **일일 리포트** — 평일 KST 06:30 (미국장 마감 후) QQQ drawdown / VIX / FGI / RSI / 환율 요약 발송
- **상세 알림 메시지** — 매수 권장 USD·KRW 환산·예상 주수·다음 트리거·액션 체크리스트까지 한 번에
- **다중 알림 채널** — Slack / Telegram 봇 (둘 다 옵션, 동시 사용 가능)
- **24시간 dedup** — 같은 단계 알림 중복 차단
- **한국식 P/L 컬러** — 수익 빨강 / 손실 파랑 (대시보드 일관)
- **Today P/L 정확 계산** — 당일 매수분(`thdt_buy_ccld_*`)과 전일 보유분 분리, 종가 기준 변동만 반영

---

## 스택

| 영역 | 기술 |
|---|---|
| Backend | Python 3.13 · FastAPI · SQLAlchemy · APScheduler · Alembic |
| Frontend | Next.js 15 (App Router) · TypeScript · Tailwind · recharts |
| Database | PostgreSQL 17 |
| 외부 데이터 | KIS Open API · yfinance · CNN Fear-Greed Index |
| 알림 | Slack incoming webhook · Telegram Bot API |
| 배포 | docker compose (로컬) · Railway / Fly.io (예정) |

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
```

#### 외부 서비스 신청

- **KIS Developers**: <https://apiportal.koreainvestment.com> → 앱 등록 → APP_KEY / APP_SECRET 발급
- **Slack** (선택): <https://api.slack.com/apps> → Incoming Webhooks 활성화
- **Telegram 봇** (선택):
  1. Telegram에서 [@BotFather](https://t.me/BotFather)와 대화 → `/newbot` → 토큰 받음
  2. 생성된 봇 채팅창에서 메시지 한 번 전송
  3. `https://api.telegram.org/bot<TOKEN>/getUpdates` 에서 `chat.id` 확인

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

---

## 디렉토리 구조

```
MoneyManagement/
├── backend/
│   ├── app/
│   │   ├── api/             # FastAPI 라우터 (health, market, portfolio, contributions, backtest)
│   │   ├── db/              # SQLAlchemy 모델
│   │   ├── integrations/    # KIS, yfinance, Slack, FGI 외부 클라이언트
│   │   ├── rules/           # 매수/매도/과열/환율 룰 엔진 (각각 평가 함수)
│   │   ├── services/        # 도메인 로직 (market_data, portfolio, alerts, backtest 등)
│   │   ├── scheduler.py     # APScheduler — 1분 polling, 일일 리포트, 잔고 스냅샷
│   │   ├── main.py
│   │   └── config.py
│   ├── alembic/             # DB 마이그레이션
│   ├── tests/               # pytest (룰·신호 단위 테스트)
│   └── pyproject.toml
├── frontend/
│   ├── app/                 # Next.js App Router 페이지
│   │   ├── page.tsx              # Dashboard
│   │   ├── contributions/        # 납입·USD 직접 입금·KRW 잔고
│   │   ├── backtest/             # 전략 백테스트
│   │   ├── rules/                # 룰 임계치 표시
│   │   ├── alerts/               # 알림 이력 (Slack preview 확장)
│   │   └── calculator/           # 분할매수 계산기
│   ├── components/          # Sidebar · PortfolioHero · EquityHeroChart · HoldingsTable · ...
│   └── lib/
│       ├── api.ts           # 백엔드 API 클라이언트 + 타입
│       └── format.ts        # 통화·시각·sparkline 헬퍼
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
| `GET  /health` | Backend / DB / Slack(env) / KIS(env) 상태 |
| `GET  /api/portfolio` | KIS 잔고 + USD 주문가능 + KRW 예수금 + 총자산 + Today P/L (당일 매수 분리 계산) |
| `GET  /api/portfolio/equity` | 365일 equity curve (yfinance QQQ proxy + 실제 snapshots overlay) |
| `GET  /api/symbols/{sym}/summary` | 심볼 ATH · drawdown · 다음 트리거 단계 |
| `GET  /api/symbols/{sym}/sparkline` | 일봉 close 시리즈 |
| `GET  /api/signals/overheated` | 과열 3 신호 현재 상태 |
| `GET  /api/signals/rsi-history` | 일별 RSI(14) 시리즈 |
| `GET  /api/fx` | USD/KRW + 밴드 + 30일 SMA 편차 |
| `GET  /api/rules` | 룰 임계 설정 |
| `GET  /api/alerts` | 알림 발송 이력 |
| `GET  /api/backtest` | Pure DCA vs Manual 70/30 시뮬레이션 |
| `POST /api/dev/poll-now` | 수동 폴 트리거 (개발용) |
| `POST /api/dev/daily-report` | 일일 리포트 수동 발송 |

상세: 부팅 후 <http://localhost:8000/docs>

---

## 핵심 설계 결정

- **Tactical Reserve = KIS USD 주문가능액**. 환전된 USD 자체가 다음 트리거에서 쏠 총알. 별도 수동 ledger 불필요.
- **Today P/L** — `thdt_buy_ccld_qty1`로 당일 매수분과 전일까지 보유분을 분리 계산. 오늘 산 포지션은 매수가 대비, 어제까지 보유한 포지션은 어제 종가 대비.
- **P/L 컬러** — 한국 증권 관례 (상승=빨강 `--mm-up`, 하락=파랑 `--mm-down`).
- **KIS API rate-limit** — 3초 in-memory 캐시 + 1회 재시도로 EGW00201 회피.
- **Pre-market 데이터** — yfinance `prepost=True`로 미국 정규장 외 시간에도 1분봉 수신.
- **24h alert dedup** — 동일 단계 중복 방지, 가격이 일시적으로 임계 근처에서 흔들려도 알람 한 번만.

---

## 테스트

```bash
docker compose exec backend python -m pytest tests/ -v
```

룰 엔진·RSI·채널 계산은 단위 테스트로 검증.

---

## 보안

- `.env`는 `.gitignore` 처리. **절대 커밋 금지.**
- KIS APP_SECRET / Slack webhook URL / Telegram BOT_TOKEN은 비밀번호 동급. 공개·캡쳐·외부 공유 시 즉시 재발급 권장.
- 시스템은 **시세 조회·잔고 조회·알림 발송**만 한다. **자동 주문은 하지 않는다.** 모든 매수·매도는 사용자가 한투 앱에서 수동.
- 단일 사용자 가정. 멀티유저 인증 미구현.

---

## 운용 사이클 (사용자 워크플로)

1. KRW 입금 → 한투 앱에서 USD 환전 → KIS API가 자동으로 USD 예수금 갱신
2. Slack/Telegram 매수 알람 수신 — 메시지에 매수 USD·KRW 환산·예상 TQQQ 주수·다음 트리거·액션 체크리스트까지 포함
3. 한투 앱에서 권장액만큼 TQQQ 시장가 매수 → KIS가 잔고 자동 동기화
4. QQQ ATH 회복 시 매도 알람 → TQQQ 전량 매도 → 동일 USD로 QLD 매수
5. 과열 신호 발동 시 QLD 일부 매도 → USD 예수금으로 복귀
6. 매일 KST 06:30 일일 리포트로 시장 상태 종합 확인

---

## 라이선스

개인 학습·운용 목적의 작업물. 외부 공개 라이선스 미설정.
