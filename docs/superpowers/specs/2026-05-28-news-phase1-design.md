# 뉴스 Phase 1 — 수집 + 페이지 + 일일 리포트 요약

작성일: 2026-05-28

## 목적

미증시·매크로 뉴스를 합법적으로 수집해 한 곳에서 보고, 일일 리포트에 한국어
요약으로 자동 포함시킨다. 이후 단계(RAG·챗봇)는 별도 라운드에서 결정.

## 범위 안 / 밖

**Phase 1 (이번)**
- RSS 폴링으로 헤드라인·설명·링크 수집
- `/news` 페이지 (타임라인 + 소스 필터)
- 대시보드 NewsCard (미리보기 3개)
- 일일 리포트 본문에 `📰 매크로 뉴스` 섹션 (Claude 한국어 요약)
- 사이드바 `/news` 메뉴

**Phase 1 밖 (다음 라운드)**
- 벡터 임베딩 / 검색 / RAG / 챗봇 (Phase 2~3)
- 유료 뉴스 API (NewsAPI/Finnhub) — 필요 시 후속 옵션
- Spring AI 사이드카 — Phase 2 진입 시점에 다시 검토

## 저작권 가드레일 (코드와 프롬프트 모두)

- 저장: title + description(RSS 제공 발췌, 통상 2~3문장) + link. 원문 전체 저장 금지.
- AI 요약: Claude가 새로 쓴 한국어. 원문 직접 인용 금지(필요 시 <15단어 한 줄 + 인용부호 + 출처).
- 표시: 항상 source + 원문 링크 동반.

## 데이터 소스 (공식 RSS, 추가 시크릿 0)

env `NEWS_RSS_FEEDS` 콤마 구분 (기본값):
- Yahoo Finance Market News
- MarketWatch Top Stories
- CNBC Markets
- Federal Reserve press releases
- BLS news releases

env로 추가·제거 자유. 피드 단위로 실패 시 그 피드만 skip, 나머지 진행.

## 백엔드

### 스키마 (Alembic migration)

```
news_items
  id            PK
  source        VARCHAR(64)         -- 피드 이름 (Yahoo Finance 등)
  title         VARCHAR(512)
  description   TEXT                 -- RSS 제공 발췌만
  link          VARCHAR(1024) UNIQUE -- dedup key
  published_at  TIMESTAMP WITH TIME ZONE
  fetched_at    TIMESTAMP WITH TIME ZONE DEFAULT now()
  category      VARCHAR(32) NULL     -- 추후 분류용 (지금은 NULL)
  INDEX (published_at DESC)
```

`link` UNIQUE로 dedup. 14일 지난 항목은 정리 잡으로 삭제.

### 신규/수정 파일

- `pyproject.toml`: `feedparser` 추가
- `db/models.py`: `NewsItem` ORM
- `alembic/versions/<rev>_news_items.py`: migration
- `integrations/rss.py`: feedparser 래퍼, `fetch_feed(url) -> list[ParsedItem]`. 피드 실패 시 빈 리스트.
- `services/news.py`:
  - `poll_all_feeds(db)` — 모든 피드 폴링, 새 link만 INSERT, dedup
  - `list_recent(db, limit, source=None)` — 최근 N개
  - `purge_old(db, days=14)` — 오래된 항목 정리
  - `top_for_summary(db, hours=24, limit=8)` — 요약 대상 선정
- `services/daily_report.py`: `gather_context`에 `recent_news` 추가; `build_report`에서 `📰 매크로 뉴스` 섹션 prepend (브리핑 아래, raw 위).
- `integrations/anthropic_client.py`: `summarize_news(items: list[dict]) -> str | None`. 시스템 프롬프트로 한국어 요약 + 원문 인용 금지 + 출처 링크 보존.
- `api/news.py`: `GET /api/news?limit=50&source=&days=14`, `GET /api/news/summary` (60s 캐시).
- `scheduler.py`: 30분마다 `poll_all_feeds`, 매일 KST 04:00 `purge_old`.

### API 응답 형태

```
GET /api/news → {
  items: [
    { id, source, title, description, link, published_at }
  ],
  sources: ["Yahoo Finance", "MarketWatch", ...]  // 필터 드롭다운용
}

GET /api/news/summary → {
  available: bool,        // ANTHROPIC_API_KEY 존재 여부
  summary: str | null,    // 한국어 통합 요약
  items: list,            // 요약에 사용한 원본 항목 (링크용)
  model, generated_at
}
```

## 프론트

- `lib/api.ts`: `fetchNews()`, `fetchNewsSummary()` + 타입
- `components/NewsCard.tsx` (서버): 대시보드 미리보기 3개 + "더 보기 →"
- `app/news/page.tsx` (서버): 타임라인 + 소스 칩 필터 + 30초 auto-refresh + 상단에 AI 요약 카드 (BriefingCard 패턴 재사용)
- `components/NewsTimeline.tsx` (클라이언트): 필터 상태 관리
- `components/Sidebar.tsx`: `/news` 메뉴 추가

## 데이터 흐름

```
APScheduler(30분) ─→ rss.fetch_feed ─→ news.poll_all_feeds ─→ news_items 테이블
                                                                    │
                                  ┌─────────────────────────────────┤
                                  ↓                                 ↓
                          GET /api/news               gather_context.recent_news
                                  │                                 │
                                  ↓                                 ↓
                          /news 페이지 + 대시보드        daily_report 📰 섹션
                                                                    │
                                                          summarize_news → Claude
```

## 검증

- 유닛: RSS 파싱(고정 XML 픽스처), dedup 동작(같은 link 두 번 INSERT 시 skip), `summarize_news`(키 없음/예외/정상).
- 수동: 폴링 1회 트리거 후 `/api/news` 200 + items 존재; `/news` 페이지 렌더; 일일 리포트 수동 트리거 시 뉴스 섹션 포함.

## 보안·운영

- `ANTHROPIC_API_KEY` 재사용 (이미 설정됨).
- 외부 시크릿 추가 없음.
- DB 증가: 항목 ~150자/건 × 수십/일 × 14일 보관 = 무시할 수준.
