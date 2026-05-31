# 인증 Phase 1 — 단일 비밀번호 + 세션 쿠키 + BFF 프록시

작성일: 2026-05-31

## 목적

지금 공개 상태인 웹·API에 잠금장치를 건다. 단일 유저 전제(본인 + 가끔 친구)에
딱 맞는 *단일 비밀번호 + 세션 쿠키* 모델로 페이지·API 모두 차단.

## 위협 모델

| 자산 | 현재 노출 | 목표 |
|---|---|---|
| Next.js 페이지 (`/`, `/news`, `/trades`, ...) | URL만 알면 누구나 본다 | 로그인된 세션만 |
| 백엔드 `/api/*` | URL만 알면 누구나 본다 / 호출한다 | 내부 토큰을 가진 Next.js만 |
| `/api/dev/*` | 위와 같음 (KIS·LLM 폭주 위험) | 위와 같음 (자동으로 가드됨) |
| KIS / Anthropic / Slack / Telegram / DB 시크릿 | Fly secret만, 응답에 안 실림 | 그대로 OK |

## 핵심 결정: BFF 프록시

브라우저는 **백엔드 URL을 직접 호출하지 않는다.** 모든 API 요청이 Next.js
프록시 (`/api/be/...`)를 통과한다. Next.js 프록시가 세션 쿠키를 검증하고,
유효하면 백엔드로 `X-Internal-Token`을 붙여 forward. 백엔드는 토큰 없으면
401. 결과:

- 백엔드 공개 URL은 토큰 없이는 무력화됨
- CORS 신경 안 써도 됨 (브라우저는 same-origin Next.js만 봄)
- 모든 dev 엔드포인트가 자동으로 같은 가드 뒤로 들어감

## 시크릿 3개 (Fly secrets에 직접 본인이 설정)

| 시크릿 | 용도 |
|---|---|
| `SINGLE_USER_PASSWORD` | 로그인 폼이 비교할 비밀번호 (이미 config에 있음, 안 쓰이고 있었음) |
| `SESSION_SECRET` | 세션 쿠키 HMAC 서명 키 — 랜덤 32바이트 |
| `BACKEND_INTERNAL_TOKEN` | Next.js → FastAPI 인증 토큰 — 랜덤 32바이트 |

로컬 dev: 셋 다 미설정 시 미들웨어 bypass (도커 그냥 잘 돎). 셋 다 설정되면 가드 활성.

## 백엔드 변경 (FastAPI)

- `app/config.py`에 `backend_internal_token: str = ""` 추가
- `app/main.py`에 미들웨어:
  - `X-Internal-Token` 헤더 ≠ `backend_internal_token` → 401
  - 예외 경로: `/health`, `/` (Fly health check 용)
  - `backend_internal_token`가 빈 문자열 → bypass (로컬)
- CORS는 그대로 둬도 무방 (브라우저가 직접 호출 안 함)

## 프론트엔드 변경 (Next.js)

### 1. `middleware.ts` (프로젝트 루트)
- 모든 경로 가드 (정적 자산·login 경로 제외)
- 쿠키 `mm-session` 검증 (HMAC-SHA256, Web Crypto API)
- 실패 → `/login`으로 리디렉트 (원래 URL은 `?next=...`에 담아)
- `SESSION_SECRET` 미설정 → bypass

### 2. `app/login/page.tsx`
- 서버 컴포넌트, 비밀번호 입력 폼 → POST `/api/login`
- 에러 메시지 표시 (`?error=...`)

### 3. `app/api/login/route.ts`
- POST: form `password` 받음, `SINGLE_USER_PASSWORD`와 constant-time 비교
- 일치 → `mm-session` 쿠키 발급 (httpOnly, Secure, SameSite=Lax, 30일), `/` 또는 `?next=...`로 리디렉트
- 불일치 → `/login?error=invalid`

### 4. `app/api/logout/route.ts`
- POST: 쿠키 삭제 → `/login`

### 5. `app/api/be/[...slug]/route.ts` (catch-all proxy)
- 모든 메소드(GET/POST/PATCH/DELETE) 핸들
- `${INTERNAL_API_BASE_URL}/api/${slug}${query}`로 forward
- `X-Internal-Token` 헤더 부착
- 응답 body·status·content-type 그대로 패스
- (미들웨어가 이미 인증 검증했으므로 이 라우트는 인증된 요청만 받음)

### 6. `lib/api.ts` 리팩터
- 서버사이드 fetch (page.tsx에서): 그대로 `INTERNAL_API_BASE_URL/api/...` + `X-Internal-Token` 헤더
- 클라이언트사이드 fetch (브라우저): `/api/be/<path>` 상대 경로로 변경
- 헬퍼 함수 1개로 통합: `request<T>(path, init?)` — 서버·클라 자동 분기

### 7. `components/Sidebar.tsx`
- "Logout" 버튼 추가 → POST `/api/logout`

## 시크릿 발급·등록 (배포 후 본인이 수동으로)

```bash
# 1) 두 토큰 랜덤 생성
SESSION_SECRET=$(openssl rand -hex 32)
BACKEND_INTERNAL_TOKEN=$(openssl rand -hex 32)
# 2) 로그인 비밀번호 (본인이 정함)
SINGLE_USER_PASSWORD="<원하는 비밀번호>"

# 3) 백엔드에 등록
fly secrets set \
  BACKEND_INTERNAL_TOKEN="$BACKEND_INTERNAL_TOKEN" \
  -a moneymangement-api

# 4) 프론트에 등록 (Next.js가 검증·서명 둘 다 함)
fly secrets set \
  SESSION_SECRET="$SESSION_SECRET" \
  SINGLE_USER_PASSWORD="$SINGLE_USER_PASSWORD" \
  BACKEND_INTERNAL_TOKEN="$BACKEND_INTERNAL_TOKEN" \
  -a moneymangement-web

# 5) ANTHROPIC_API_KEY는 별도로 새로 발급해 교체 권장 (혹시 모를 누수 차단)
fly secrets set ANTHROPIC_API_KEY="sk-ant-new..." -a moneymangement-api
```

`BACKEND_INTERNAL_TOKEN`은 양쪽 앱에 똑같이 들어가야 함.

## 검증

- 로컬: 시크릿 미설정 docker 부팅 → 모든 페이지 그대로 열림 (bypass 모드)
- 로컬 with secrets: `.env`에 셋 세팅 → `/login` 강제 리디렉트, 비번 일치 시 통과
- 프로덕션:
  - `https://moneymangement-web.fly.dev/` → `/login`으로 리디렉트
  - 잘못된 비번 → 에러 표시
  - 맞는 비번 → 대시보드 진입
  - `https://moneymangement-api.fly.dev/api/portfolio` 직접 호출 → 401
  - 로그아웃 → 다시 `/login`

## 범위 밖 (다음 라운드)

- Cloudflare Access (Google OAuth 통합) — Phase 2
- 멀티 유저 / 권한 관리
- 비밀번호 재설정 흐름 (단일 유저라 불필요)
