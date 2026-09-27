# Clavis — Phase 0 계획 (Foundation & Spike)

> 상태: **In Progress** · 작성일: 2026-09-27
> 선행 문서: [`00-concept.md`](./00-concept.md) · [`01-architecture.md`](./01-architecture.md) · [`decisions.md`](./decisions.md)

---

## 1. 목표

Phase 1(MVP) 기능 개발에 들어가기 전에 **선택한 기술 조합이 Cloudflare 무료 플랜에서 실제로 동작하는지 확인**하고, 이후 모든 개발이 올라탈 **골격**을 만든다.

Phase 0의 산출물은 기능이 아니라 **검증된 사실**과 **동작하는 빈 골격**이다.

## 2. 완료 조건 (Exit Criteria)

- [ ] Spike S1~S7이 모두 **통과** 또는 **합의된 대안**으로 결론 나고, 결과가 `decisions.md`에 기록됨
- [ ] D-11(검색)이 `Verify` → `Decided`로 전환, D-28~D-32가 `Decided`로 전환
- [ ] 로컬에서 `pnpm dev` 한 번으로 SPA + Worker + 로컬 D1/R2가 동작
- [ ] `main`에 push하면 CI(타입체크·테스트) 후 Cloudflare에 자동 배포
- [ ] 배포된 환경에서 사람(Access 로그인)과 에이전트(Bearer 토큰)가 모두 `GET /api/v1/me` 응답을 받음

## 3. 역할 분담

| 표시 | 의미 |
|---|---|
| 🤖 | Claude가 로컬에서 진행 가능 |
| 👤 | 사용자 작업 필요 (계정·로그인·외부 서비스) |
| 🤝 | 사용자 준비 후 Claude가 진행 |

### 사용자 준비 사항 (👤)
| # | 작업 | 필요 시점 |
|---|---|---|
| U1 | Cloudflare 계정 준비, 터미널에서 `! pnpm wrangler login` | Step 2 |
| U2 | Zero Trust 조직(team name) 생성, 로그인 방식(Google/GitHub/OTP) 설정 | Step 3 |
| U3 | GitHub 저장소 생성 여부 결정 (Claude가 `gh`로 생성 가능, 공개/비공개 선택) | Step 4 |
| U4 | CI용 `CLOUDFLARE_API_TOKEN`을 GitHub Secrets에 등록 | Step 4 |
| U5 | Hermes Agent 실행 환경 (MCP 서버 설정 가능 상태) | Step 3 |
| U6 | 도메인 사용 여부 (`*.workers.dev` 또는 커스텀 도메인) | Step 3 |

## 4. 진행 순서

```
Step 1 (로컬, 계정 불필요)     Step 2 (Cloudflare 계정)      Step 3 (Access·Hermes)       Step 4 (CI/CD)
──────────────────────────    ─────────────────────────     ────────────────────────     ──────────────
T1 저장소 골격                  T6 원격 D1/R2 생성·배포         T8 Access 앱 + 인증 미들웨어    T10 GitHub Actions
T2 shared 패키지 골격           S1 원격 재검증                  S4 인증 경로 검증              T11 Preview 배포
T3 Worker 골격                 S2·S3 실제 CPU 측정             S5 Hermes MCP 연결            Exit 점검
T4 Web 골격                    S6 Cron 덤프                   T9 /api/v1/me
T5 DB 스키마·마이그레이션         S7 Rate Limiting
S1 FTS 로컬 검증
S2·S3 로컬 벤치마크 (근사치)
```

- **Step 1을 먼저**: 결과에 따라 DB 설계(S1)와 요금제 판단(S2·S3)이 바뀔 수 있으므로, 계정 없이 가능한 검증부터 한다.
- 로컬 결과는 **근사치**다. workerd 로컬 실행은 CPU 한도를 강제하지 않으므로, 최종 판정은 Step 2에서 배포 후 Workers Logs의 `cpuTime`으로 한다.

## 5. 작업 상세

### Step 1 — 로컬 골격 & 1차 검증 🤖

| ID | 작업 | 산출물 / 완료 기준 |
|---|---|---|
| T1 | 저장소 골격 | `git init`, pnpm workspace, TypeScript project references, Biome(lint·format), `.gitignore`, `.editorconfig` |
| T2 | `packages/shared` | zod 스키마(Frontmatter, Page DTO, Problem), Lint 엔진 인터페이스 + 규칙 2개(frontmatter 필수, 헤딩 증가), Vitest 테스트 |
| T3 | `apps/worker` | Hono + zod-openapi 앱, `GET /api/v1/health`, 에러 포맷(problem+json), `wrangler.jsonc`(D1/R2/Assets/Cron 바인딩), vitest-pool-workers 테스트 |
| T4 | `apps/web` | Vite + React + TanStack Router/Query, Tailwind + shadcn/ui 초기화, 레이아웃 셸(사이드바/본문/TOC 자리), `/api/v1/health` 호출, i18n(ko/en) 셋업 |
| T5 | DB | Drizzle 스키마(§5 테이블 전체), drizzle-kit 마이그레이션, FTS5 수동 마이그레이션, 로컬 적용 |
| S1 | FTS 로컬 검증 | 로컬 D1(workerd)에서 `trigram` + contentless 테이블 생성, 한국어 샘플 문서로 3글자·2글자·영문·혼합 검색, `snippet()` 결과 확인 |
| S2 | 저장 파이프라인 벤치 | 10/50/100KB 문서로 frontmatter 파싱 + blocking lint + 링크 추출 시간 측정 (Node, 100회 평균·p95) |
| S3 | 전체 lint 벤치 | 같은 문서로 unified 파싱 + markdownlint + 커스텀 규칙 전체 시간 측정 |

### Step 2 — Cloudflare 배포 & 실측 🤝 (U1 필요)

| ID | 작업 | 완료 기준 |
|---|---|---|
| T6 | 원격 리소스 | `clavis` D1, `clavis-files` R2 생성, 마이그레이션 적용, `wrangler deploy` 성공 |
| S1' | FTS 원격 재검증 | 원격 D1에서 S1과 동일 결과 |
| S2'·S3' | CPU 실측 | 임시 벤치 엔드포인트를 배포해 Workers Logs `cpuTime` 확인 → **< 10ms** 판정 |
| S6 | Cron 덤프 | 샘플 500페이지 적재 후 `scheduled()` 수동 트리거, R2에 Markdown 파일 생성, CPU 한도 내 완료 |
| S7 | Rate Limiting | Workers Rate Limiting 바인딩을 무료 플랜에서 사용 가능한지 확인, 불가 시 D1 카운터 방식 시제품 |

### Step 3 — 인증 & 에이전트 연결 🤝 (U2, U5, U6 필요)

| ID | 작업 | 완료 기준 |
|---|---|---|
| T8 | 인증 미들웨어 | Access 앱(전체) + Bypass 앱(`/api/*`, `/mcp`, `/files/*`), Worker에서 `CF_Authorization` 쿠키 JWT 검증, Bearer 토큰 검증, 최초 사용자 Admin 자동 생성 |
| S4 | 인증 경로 검증 | 브라우저(SPA)·`curl`(Bearer)·무인증 요청이 각각 200/200/401 |
| T9 | `/api/v1/me` + 토큰 발급 | 관리자 CLI 스크립트 또는 임시 API로 에이전트 토큰 발급 |
| S5 | MCP + Hermes | Stateless `createMcpHandler`로 `/mcp`에 `list_spaces`·`read_page` 더미 도구, Hermes Agent 및 Claude Code에서 연결·호출 성공 |

### Step 4 — CI/CD 🤝 (U3, U4 필요)

| ID | 작업 | 완료 기준 |
|---|---|---|
| T10 | GitHub Actions | PR: 타입체크·Biome·Vitest / `main`: 마이그레이션 적용 + `wrangler deploy` |
| T11 | Preview | PR마다 `wrangler versions upload`로 미리보기 URL 댓글 |

## 6. Spike 판정 기준

| # | 통과 | 실패 시 대안 | 영향 받는 결정 |
|---|---|---|---|
| S1 | 3글자 이상 한국어 부분 일치 + snippet 동작 | `unicode61` + 앱 레벨 bigram 인덱스 테이블 | D-11 |
| S2 | 100KB 저장 < 10ms CPU (p95) | 문서 크기 상한(예: 100KB) 또는 Workers Paid($5/월) | D-17, D-27 |
| S3 | 50KB 전체 lint < 10ms CPU (p95) | lint API 크기 제한, 에이전트에게 클라이언트측 lint 안내 | D-27 |
| S4 | 3가지 경로 모두 기대 응답 | Access Service Token 사용 | D-05 |
| S5 | Hermes·Claude Code 모두 도구 호출 성공 | MCP 프록시/어댑터 | D-12, D-13 |
| S6 | 500페이지 덤프 성공 | 여러 Cron으로 분할, 증분 덤프 | D-30 |
| S7 | 토큰별 분당 제한 동작 | D1 카운터 테이블 | – |

## 7. 코드 규칙 (Phase 0부터 적용)

- **Spike 코드**는 `spikes/Sx-*/`에 둔다. 결론이 나면 결과를 이 문서 §8에 기록하고, 재사용할 코드만 본 코드로 옮긴다.
- 커밋은 작업 단위(T1, T2 …)로 나눈다.
- 모든 공개 API는 zod-openapi로 정의 (문서 자동 생성).

## 8. 결과 기록

| # | 상태 | 결과 요약 | 날짜 |
|---|---|---|---|
| S1 | ✅ 로컬 통과 (원격 재검증 대기) | trigram + external content + 트리거 동작. 3자 이상 한국어 부분 일치, snippet/bm25, rebuild 확인. 2자 이하는 LIKE 대체, 띄어쓰기 차이는 미지원. [상세](../spikes/S1-fts/README.md) | 2026-09-27 |
| S2 | ✅ 로컬 통과 (원격 실측 대기) | 100KB 저장 p95 0.51ms — 한도의 1/20. [상세](../spikes/S2-S3-cpu/README.md) | 2026-09-27 |
| S3 | ❌ 실패 → 대안 채택 (D-27 개정) | 전체 lint 10KB 12.9ms, 50KB 61ms. 비용은 AST 파싱(remark·markdownlint, ~0.5ms/KB). Clavis 줄 단위 규칙은 100KB 0.4ms. [상세](../spikes/S2-S3-cpu/README.md) | 2026-09-27 |
| S4 | ⏳ | | |
| S5 | ⏳ | | |
| S6 | ⏳ | | |
| S7 | ⏳ | | |
