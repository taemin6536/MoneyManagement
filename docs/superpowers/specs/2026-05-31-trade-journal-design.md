# 매매 일지 (Trade Journal) — 설계 스펙

작성일: 2026-05-31

## 목적

이 시스템 철학("감정 빼고 규칙대로")의 회고 루프를 완성한다. 매매 이벤트와 그
시점의 시장 스냅샷·트리거 룰·사용자 메모를 한곳에 묶어, 나중에 본인이 진짜
규칙대로 했는지 검증·반성할 수 있게 한다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 1차 데이터 소스 | KIS `해외주식 기간별주문체결내역` (TR_ID `TTTS3035R`/`VTTS3035R`) |
| 보완 입력 | 수동 등록 폼 (KIS 외 거래·증여 등) |
| 동기화 잡 | 매일 KST 08:00 + 수동 "지금 동기화" 버튼 |
| 백필 | 최초 1회 지난 1년치 |
| 중복 방지 | `kis_order_id` UNIQUE |
| 시장 스냅샷 | 체결 시각 기준 best-effort (오늘=실시간, 과거=`prices_history` 일봉) |

## 스키마 (Alembic migration)

```
trades
  id            PK
  executed_at   TIMESTAMPTZ              -- 체결 시각
  symbol        VARCHAR(16)
  side          VARCHAR(8)               -- 'buy' | 'sell'
  quantity      NUMERIC(18, 4)
  price_usd     NUMERIC(18, 6)
  total_usd     NUMERIC(18, 2)           -- quantity × price_usd
  snapshot      JSON                     -- {qqq_price, qqq_ath, drawdown_pct, tqqq, qld, rsi, fgi, vix, usd_krw, fx_dev}
  rule_level    VARCHAR(64) NULL         -- 'drawdown_-15' / 'ath_recovery' / 'overheated' / 'manual' / ...
  note          VARCHAR(1000) NULL       -- 사용자 메모
  source        VARCHAR(16)              -- 'kis_sync' | 'manual'
  kis_order_id  VARCHAR(64) UNIQUE NULL  -- KIS 체결 ID (dedup key)
  created_at    TIMESTAMPTZ DEFAULT now()

  INDEX (executed_at DESC)
  INDEX (symbol)
```

## 백엔드

### 신규/수정 파일

- `integrations/kis.py`:
  - `fetch_trade_history(start_date, end_date) -> list[KisTrade]` — 새 함수
  - 페이지네이션(KIS는 100건/페이지) 처리, 환경(`kis_paper_mode`)에 맞게 TR_ID 분기
  - 데이터 클래스 `KisTrade(order_id, executed_at, symbol, side, quantity, price_usd, total_usd)`
- `db/models.py`: `Trade` ORM 추가
- `alembic/versions/<rev>_trades.py`: 새 마이그레이션
- `services/trades.py`:
  - `sync_from_kis(days_back: int = 365) -> dict` — 백필/델타 동기화
  - `attach_snapshot(trade)` — 체결 시각 기반 스냅샷 구성
  - `list_recent(db, limit, symbol=None, side=None)` — 필터 + 페이지
  - `create_manual(db, payload)` — 수동 등록
  - `update_note(db, trade_id, note, rule_level)` — 메모 편집
- `api/trades.py`:
  - `GET /api/trades?limit=&symbol=&side=&days=`
  - `POST /api/trades` — 수동 등록
  - `PATCH /api/trades/{id}` — `note`, `rule_level` 편집
  - `POST /api/dev/trades-sync` — 수동 트리거 (admin/dev)
- `scheduler.py`: 일일 KST 08:00 = UTC 23:00 잡 추가 — `_safe_trades_sync`

### 스냅샷 구성 로직 (`attach_snapshot`)

- **오늘 체결**: 현재 폴링 캐시 사용 (gather_context와 동일 소스 — RSI/FGI/환율 등 라이브)
- **과거 체결**: 그날의 `prices_history` 일봉 close 기반 QQQ/TQQQ/QLD + 그날의 ATH/drawdown 계산
- 누락 필드는 그냥 null (불완전 스냅샷도 OK — 회고용)

## 프론트

- `lib/api.ts`: `Trade` 타입 + `fetchTrades()`, `patchTrade(id, payload)`, `createManualTrade(payload)`, `syncTradesFromKis()`
- `components/TradesCard.tsx` (대시보드): 최근 3건 미리보기 + "더 보기 →" /trades
- `app/trades/page.tsx` (서버): 초기 fetch + `<TradesTable />` 마운트
- `components/TradesTable.tsx` (클라이언트): 필터 칩(symbol/side/days), 행 클릭 → 상세 drawer
- `components/TradeDetailDrawer.tsx` (클라이언트): 스냅샷 카드(QQQ/RSI/FGI/환율 등) + 메모·룰 편집 + 저장
- `components/Sidebar.tsx`: `/trades` 메뉴 추가

## 검증

- 유닛: KIS 응답 fixture → `KisTrade` 파싱 / dedup(`on_conflict_do_nothing`) / `attach_snapshot` 분기(오늘 vs 과거)
- 수동: 로컬 docker → `POST /api/dev/trades-sync` → `GET /api/trades` 응답 확인 → `/trades` 페이지 렌더 → 행 상세 → 메모 저장 round-trip

## 보안·운영

- 추가 시크릿 0 (KIS 키 재사용)
- LLM 호출 0
- DB 증가: 거래 1건 ~1KB. 연 ~수백 건이라 무시할 수준

## 범위 밖 (다음)

- 경제 캘린더 (별도 스펙)
- 거래별 손익 자동 계산 (FIFO 매칭) — 회계 복잡, v2
- 양도세 시뮬레이션 — v2
