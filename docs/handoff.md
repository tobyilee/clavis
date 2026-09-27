# Clavis — 작업 인수인계 (Handoff)

> 마지막 갱신: 2026-09-28 · 기준 커밋: `02b01fd` (main, 운영 배포 완료)
> 새 장비에서 Claude Code를 시작하면 **"docs/handoff.md 읽고 이어서 진행해"**라고 말하면 된다.
> 이 문서는 이전 장비의 대화 기록·Claude 메모리 없이도 이어서 작업할 수 있도록, 거기에만 있던 규칙과 요령까지 담는다.

---

## 1. 지금 어디까지 왔나

| 단계 | 상태 | 문서 |
|---|---|---|
| Phase 0 — 기반·기술 검증 | ✅ 완료 | [`02-phase0-plan.md`](./02-phase0-plan.md) |
| Phase 1 — MVP | ✅ 완료 | [`03-phase1-plan.md`](./03-phase1-plan.md) |
| **Phase 2 — 팀 생산성 & AI 연동** | 🔶 **진행 중 (Step 0~5 완료)** | [`04-phase2-plan.md`](./04-phase2-plan.md) §9에 Step별 결과 |

Phase 2 진행 현황 (결정 D-44~D-53은 모두 추천안으로 확정, [`decisions.md`](./decisions.md)):

| Step | 내용 | 커밋 |
|---|---|---|
| 0 | lint 엔진이 Space 규칙 설정을 받음 | `704efe6` |
| 1 | 백링크, 문서 상태 대시보드, 저장 시 lint 요약(`page_lint`), 재검사 | `592ae42` |
| 2 | 섹션 단위 편집 API·MCP, 속성(meta) PATCH | `16e9535` |
| 3 | 댓글(스레드·답글·해결, 헤딩 배지, MCP) | `101cc40` |
| 4 | Space 규칙 설정 화면, 커스텀 템플릿, 사람용 호출 한도 600회/분 | `1e4d037` |
| 5 | 홈(즐겨찾기·최근 본·최근 변경·내 문서 댓글), `.md` 원본, `llms.txt`, AI용 복사 | `2402d2e` |
| – | 수정: 다크 모드에서 에디터 커서가 안 보임 + 편집 화면 진입 시 자동 포커스 | `02b01fd` |

- 모든 커밋은 push·배포 완료, CI 통과. 운영 D1에 migration `0000`~`0007` 적용됨.
- 테스트: shared 59 · web 12 · worker 109 · E2E 9개, 모두 통과.

## 2. 다음 할 일

### 바로 다음: Phase 2 **Step 6 — 모바일 편집** (계획서 §5 Step 6)
- **사용자에게 먼저 물을 것**: 휴대폰으로 편집할 때 불편했던 점 목록(계획의 U2). 따로 없으면 기본안으로 진행.
- 기본안: K1 키보드 위 서식 툴바(헤딩·굵게·목록·체크박스·링크·`[[`·코드) · K2 카메라/사진 첨부(긴 변 2000px로 줄여 업로드) · K3 저장 버튼 고정, 속성(frontmatter)을 아래 시트로, lint 문제 수 배지.
- 모바일에서는 에디터 자동 포커스를 하지 않는다(키보드가 가림) — `02b01fd`에서 `(pointer: coarse)`로 구분.

### 그다음: **Step 7 — 마무리**
- Z1 E2E 추가(모바일 툴바 등, 전체 6~8개 수준 유지 — 현재 9개), Z2 **운영 CPU 실측**(섹션 저장 100KB가 가장 빠듯: getPage + 저장 파이프라인), Z3 `01-architecture.md` v0.4 + 가이드 갱신, Z4 Exit 점검(§2 체크리스트).

### 사용자 쪽 대기 항목
- **U3**: Hermes로 섹션 추가(`update_section` append)·댓글 반영 흐름 실사용 확인 → 결과를 계획서 Step 2·3 행(“S5 대기”)에 기록.
- **U4**: 팀 규칙에 맞게 lint 설정과 커스텀 템플릿 1~2개 만들어 보기.

## 3. 작업 규칙 (사용자 지시)

- **언어**: 사용자의 모든 프롬프트를 먼저 올바른 영어로 다시 쓰고(영어로 쓴 경우 문법 피드백), 그다음 **한국어로 답한다**. 문서는 한국어, 코드·주석·커밋 메시지는 영어.
- **계획 먼저**: 큰 작업은 계획서를 먼저 써서 검토받고, 확정 후 구현. 진짜 선택지가 있는 결정은 AskUserQuestion으로(한국어, 추천안을 첫 번째에).
- **커밋**: Step이 끝날 때마다 커밋. push는 사용자가 `p` 등으로 요청할 때만. `main`에서 바로 작업(브랜치 만들지 않음).
- **Git 단축어**: `cm` 커밋 · `p` push · `cmp` 커밋+push · `cmpr` 커밋+push+PR · `pr` push+PR · `mprm` 마지막 PR 머지 후 main pull · `mtm` main에 머지 후 전환 · `ghelp` 목록.
- **커밋 메시지 끝**: `Co-Authored-By: Claude …` 줄(세션 안내에 따름). PR 본문 끝은 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **push 전 반드시**: `set -e` 후 `pnpm exec biome ci . && pnpm -r typecheck && pnpm -r test` (한 번 Biome 실패 커밋이 push된 적이 있음). UI를 바꿨으면 `pnpm --filter @clavis/web build && pnpm e2e`도.
- push 후에는 CI(run)를 지켜보고 결과를 알린다: `gh run list --limit 1`, `gh run view <id>`.

## 4. 보안 수칙 (반드시 지킬 것)

- 비밀 값은 git에 없는 `.agent.env`(저장소 루트)에만 있다: `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `CLAVIS_TOKEN_HERMES`, `CLOUDFLARE_API_TOKEN`.
  - **새 장비로는 사용자가 직접 안전한 방법으로 복사**한다. 채팅에 붙여 달라고 하지 않는다.
  - **출력하지 않는다. `source`하지 않는다.** 불러올 때는 `eval "$(python3 scripts/agent-env.py)"`만 쓴다 (쉘 source로 비밀이 한 번 노출되어 교체한 적이 있음).
- `apps/worker/.dev.vars`(git 제외): `.dev.vars.example`을 복사해 `DEV_ACCESS_EMAIL=본인@gmail.com` — 로컬 `pnpm dev` 로그인 대용(localhost에서만 동작).
- Cloudflare 계정에는 관련 없는 리소스가 있다: R2 `kpoppass`, zone `playcoin.game`, 서브도메인 `crawl-proxy`의 다른 Worker. **절대 건드리지 않는다.**
- 대시보드 변경·운영 데이터 삭제 같은 되돌리기 어려운 작업은 먼저 사용자 확인.

## 5. 새 장비 준비

```bash
git clone https://github.com/tobyilee/clavis.git && cd clavis
pnpm install                      # pnpm 12, Node ≥ 22
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # DEV_ACCESS_EMAIL 수정
# .agent.env는 사용자가 직접 복사 (위 §4)
pnpm exec playwright install chromium    # E2E용
gh auth status                    # CI 확인용
```

- 로컬 실행: `pnpm dev` (Worker :8787 + Vite 개발 서버를 함께 실행). 로컬 D1 migration은 `pnpm --filter @clavis/worker db:migrate:local`.
- 배포는 **CI가 한다**: `main` push → check 잡(Biome·typecheck·test·build·E2E) → deploy 잡(D1 migration → build → `wrangler deploy`). GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 설정됨.
- 운영 CPU를 재야 할 때만 `wrangler login` 필요(아래 §7).

## 6. 프로젝트 요약

- **무엇**: 사람과 AI 에이전트(Hermes, 코딩 에이전트)가 함께 쓰는 Markdown 위키. Cloudflare **무료 플랜**으로 Confluence 핵심 기능.
- **운영**: https://clavis.crawl-proxy.workers.dev (Cloudflare Access: 사람은 이메일 PIN, `@gmail.com`; 에이전트는 서비스 토큰 + `Bearer clv_…`). 계정 `dev@neoventures.kr`. D1 `clavis`, R2 `clavis-files`.
- **구조**: pnpm 모노레포
  - `packages/shared` — zod 스키마, Markdown 스캔(`scanLines`, 섹션, 위키 링크), lint 엔진·규칙, 템플릿
  - `apps/worker` — Hono + zod-openapi REST(`/api/v1`), MCP(`/mcp`, 도구 약 20개), D1(Drizzle, `migrations/`), R2, `.md`·`llms.txt`
  - `apps/web` — React 19 + Vite + TanStack Router/Query + Tailwind/shadcn, CodeMirror 6 에디터, i18n(ko/en)
  - `e2e/` — Playwright, `serve.sh`가 빈 로컬 D1로 `wrangler dev`(:8788)
- 설계: [`01-architecture.md`](./01-architecture.md)(v0.3 — Phase 2 반영은 Step 7에서 v0.4로), 가이드: [`guides/agent-connection.md`](./guides/agent-connection.md), [`guides/writing.md`](./guides/writing.md).

## 7. 꼭 알아야 할 제약과 요령

- **무료 플랜 한도(요청 1회)**: CPU **10ms**, 서브리퀘스트 50(D1·R2 호출마다 1), D1 쿼리 50(batch 안 문장도 각각), 문장당 바인딩 100개.
  - → D1 호출은 `DB.batch()`로 묶고, 여러 행은 `json_each(?)` 한 문장으로 쓴다. 저장은 "읽기 batch 1 + 쓰기 batch 1"(쓰기 batch 첫 문장이 revision 가드).
  - → 큰 작업은 나눠서(재검사·백업처럼 요청당 약 100~150KB).
- **CPU 측정**: `apps/worker/node_modules/.bin/wrangler tail clavis --format json`을 백그라운드로 직접 실행하고 `cpuTime`을 요청 종류별로 집계. 배포 직후는 isolate가 차가워 2~3배 높게 나오므로 **버리는 워밍업 한 바퀴** 후 측정.
- 스크립트로 운영 Worker를 호출할 때 Python `urllib` 기본 User-Agent는 Cloudflare가 `403 (1010)`으로 막는다 → User-Agent 지정하거나 curl 사용.
- Cron 변경은 반영까지 30분 이상 걸릴 수 있다 → 기다리지 말고 같은 함수를 임시 엔드포인트로 호출해 검증 후 제거.
- `run_worker_first`: `/api/*`, `/mcp`, `/files/*`, `/s/*.md`, `/s/*/llms.txt`, `/llms.txt`만 Worker, 나머지는 SPA.
- 호출 한도: 에이전트·비인증 120회/분(`API_RATE_LIMITER`), 사람 600회/분(`HUMAN_RATE_LIMITER`).
- OpenAPI는 빌드 시 생성: 라우트를 바꾸면 `pnpm --filter @clavis/worker openapi` (안 하면 테스트가 실패).
- 스키마 변경: `apps/worker/src/db/schema.ts` 수정 → `pnpm --filter @clavis/worker db:generate --name <이름>` → 테스트 `resetDb` 목록(`test/helpers.ts`)과 휴지통 영구 삭제(`services/trash.ts`)에 새 테이블 반영.

## 8. 운영 데이터 현황

- Space: CLAVIS("Clavis 사용 안내", "MCP 연결"), TEAM(홈 "팀", ADR1·ADR2 등 사용자 테스트 문서). 휴지통에 "주간 회의 2026-09-27"(hermes 작성), "아키텍처".
- 사람 관리자 1명(최초 로그인 사용자), 에이전트 `hermes`(editor).
