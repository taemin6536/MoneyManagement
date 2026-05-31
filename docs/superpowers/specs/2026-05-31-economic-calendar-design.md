# 경제 캘린더 — 설계 스펙

작성일: 2026-05-31

## 목적

FOMC·CPI·NFP·PCE 등 매크로 이벤트가 언제인지 한 곳에서 보고, 일일
리포트에서 "다가오는 매크로 이벤트"를 자동으로 미리 알려준다. 채널 돌파나
드로우다운 같은 *시장 반응*은 이미 잡고 있으니, 이번엔 *시장을 흔드는 이벤트*
자체를 가시화한다.

## 결정 사항

| 항목 | 결정 |
|---|---|
| 데이터 소스 | 하드코드 시드 (Alembic) + 수동 추가/편집 UI |
| 커버리지 (v1) | FOMC, CPI, NFP, PCE (US 매크로) + BOK 금리 결정 (KR) |
| 알람 | 일일 리포트에 "다가오는 7일 매크로 이벤트" 섹션 prepend (별도 T-24h cron은 v2) |
| 시간 저장 | UTC `timestamptz`, UI는 KST 표기 |
| 외부 API | 없음 (시크릿·의존성 추가 0) |

## 스키마 (Alembic migration)

```
economic_events
  id           PK
  event_at     TIMESTAMPTZ              -- 발표 시각 (UTC)
  country      VARCHAR(8)               -- 'US' | 'KR' | ...
  category     VARCHAR(32)              -- 'FOMC' | 'CPI' | 'NFP' | 'PCE' | 'BOK_RATE' | ...
  name         VARCHAR(256)             -- 표시 이름 ("FOMC 금리 결정")
  description  VARCHAR(1000) NULL       -- 부연 설명 (선택)
  importance   VARCHAR(8)               -- 'high' | 'med' | 'low'
  source_url   VARCHAR(512) NULL
  created_at   TIMESTAMPTZ DEFAULT now()

  UNIQUE (country, category, event_at)
  INDEX (event_at)
  INDEX (importance, event_at)
```

마이그레이션 안에서 2026년 5월~말 시드 INSERT (이미 지난 건 제외).

## 백엔드

- `db/models.py`: `EconomicEvent` ORM
- `alembic/.../*_economic_events.py`: 테이블 생성 + 2026년 잔여 매크로 일정
  시드 (FOMC × 5, CPI × 7, NFP × 7, PCE × 7, BOK × ~5 — best-effort, UI에서
  수정 가능)
- `services/calendar.py`:
  - `list_upcoming(db, days=90, country=None, importance=None)`
  - `list_in_window(db, hours_from=0, hours_to=168)` — 일일 리포트용 (7일)
  - `next_high(db)` — 다음 high-importance 1건 (대시보드 카운트다운)
  - `create_event` / `update_event` / `delete_event`
- `api/calendar.py`:
  - `GET /api/calendar?days=&country=&importance=`
  - `POST /api/calendar` (수동 추가)
  - `PATCH /api/calendar/{id}`
  - `DELETE /api/calendar/{id}`
- `services/daily_report.py`: `gather_context`에 `upcoming_events` 추가 →
  build_report에 "*📅 다가오는 매크로 이벤트 (7일)*" 섹션 prepend (브리핑
  아래 / 뉴스 위)

## 프론트엔드

- `lib/api.ts`: `EconomicEvent` 타입 + `fetchCalendar`, `createEvent`,
  `patchEvent`, `deleteEvent`
- `components/NextEventCard.tsx` (서버): 대시보드 미니 카드. "다음 이벤트:
  FOMC · D-8 · 7월 29일 (수) 03:00 KST"
- `app/calendar/page.tsx` (서버): 향후 90일 타임라인. 일/주 단위 그룹.
  중요도 칩 필터. 행 클릭 → 편집/삭제, 상단에 "이벤트 추가" 폼.
- `components/CalendarTimeline.tsx` (클라이언트): 추가/편집/삭제 상태 관리
- `components/EventEditForm.tsx` (클라이언트): 폼 (날짜·시각·국가·카테고리·중요도)
- `components/Sidebar.tsx`: `/calendar` 메뉴 항목 추가

## 시드 데이터 가이드라인

- FOMC 발표 시각: 2:00 PM ET (DST 따라 18:00 또는 19:00 UTC)
- BLS 발표 (NFP/CPI/PCE): 8:30 AM ET → 12:30 또는 13:30 UTC
- BOK 금리 결정: 보통 10:00 KST = 01:00 UTC
- 시드 날짜는 best-effort. UI에서 누구나 수정 가능 — 잘못된 날짜는 수정하라는
  코멘트를 시드 마이그레이션에 박는다.

## 검증

- 유닛: `list_upcoming` 필터 동작, `next_high` 기준점, daily_report 통합
- 수동: docker → 마이그레이션 → `/api/calendar` 200 + 시드 데이터 보임 →
  `/calendar` 페이지 렌더 → 이벤트 추가/편집/삭제 round-trip → 일일 리포트
  수동 트리거 시 섹션 포함

## 범위 밖 (다음 라운드)

- T-24h 개별 알람 (별도 cron) — 우선은 일일 리포트로 커버
- 글로벌 확장 (ECB, BOJ, ONS, etc.)
- 외부 API 동기화 (Trading Economics, Forex Factory 등) — 라이선스·키 필요
- 실적 발표 (어닝)
