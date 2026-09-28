# Clavis — 작업 인수인계 (Handoff)

> 마지막 갱신: 2026-09-28 · 코드 기준 커밋: `27323fa` (main, push·운영 배포 완료)
> 새 장비에서 Claude Code를 시작하면 **"docs/handoff.md 읽고 이어서 진행해"**라고 말하면 된다.
> 이 문서는 이전 장비의 대화 기록·Claude 메모리 없이도 이어서 작업할 수 있도록, 거기에만 있던 규칙과 요령까지 담는다.

---

## 1. 지금 어디까지 왔나

| 단계 | 상태 | 문서 |
|---|---|---|
| Phase 0 — 기반·기술 검증 | ✅ 완료 | [`02-phase0-plan.md`](./02-phase0-plan.md) |
| Phase 1 — MVP | ✅ 완료 | [`03-phase1-plan.md`](./03-phase1-plan.md) |
| **Phase 2 — 팀 생산성 & AI 연동** | 🔶 **진행 중 (Step 0~6 완료, Step 7 진행 중: Z1·Z3 ✅, Z2·Z4 남음)** | [`04-phase2-plan.md`](./04-phase2-plan.md) §9에 Step별 결과 |

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
| – | 수정: 아이폰에서 입력칸을 누르면 화면이 확대돼 저장 버튼이 가려짐 → 터치 화면은 입력칸 16px | `c8c470f` |
| 6 | 모바일 편집: 키보드 위 서식 툴바, 사진 첨부(긴 변 2000px JPEG), 속성·문제 시트, 편집 화면을 키보드 위 영역에 고정 | `27323fa` |
| 7 (일부) | Z1 섹션 추가 E2E(댓글 테스트에 합침), Z3 `01-architecture.md` v0.4·`guides/writing.md` | 이 문서와 같은 커밋 |

- 모든 커밋 push·배포 완료, CI 통과. 운영 D1에 migration `0000`~`0007` 적용됨(Step 6은 migration 없음).
- 테스트: shared 59 · web 23 · worker 109 · E2E 9개, 모두 통과.

## 2. 다음 할 일

### 바로 다음: Step 6 실기기 확인 (사용자, 계획서 U2 후속)
- 아이폰에서 운영 사이트의 편집 화면을 열고 확인할 것:
  1. 본문을 눌러도 화면이 확대되지 않는다(`c8c470f`).
  2. 키보드가 뜨면 서식 툴바가 키보드 바로 위에 붙고, 제목·저장 버튼이 화면 위에 남는다.
  3. 서식 버튼을 눌러도 키보드가 내려가지 않는다.
  4. 사진 버튼에서 카메라와 사진 보관함을 둘 다 고를 수 있고, 올린 사진이 페이지에 보인다.
- 키보드 동작은 자동화로 재현할 수 없어 가짜 `visualViewport`로만 검증했다(아래 §8). 결과가 다르면 사용자에게 증상(가능하면 스크린샷)을 받아 §8부터 본다.

### 그다음: **Step 7 — 마무리** (계획서 §5 Step 7)
- ~~Z1~~ ✅ · ~~Z3~~ ✅ (계획서 §9 Step 7 행)
- **Z2** 운영 CPU 실측(§7 방법): 섹션 저장 100KB가 가장 빠듯(getPage + 저장 파이프라인), 그다음 재검사 1회·대시보드·댓글 목록·홈·백링크 → 계획서 §9에 기록. `.agent.env`와 `wrangler login`이 필요하다(현재 장비에는 둘 다 있음). 운영 D1에 임시 페이지를 만들고 지우므로 **시작 전 사용자 확인**.
- **Z4** Exit 점검: 계획서 §2 체크리스트, 사용자와 실제 문서로 한 번 써 보기.

### 사용자 쪽 대기 항목
- **U3**: Hermes로 섹션 추가(`update_section` append)·댓글 반영 흐름 실사용 확인 → 결과를 계획서 Step 2·3 행(“S5 대기”)에 기록.
- **U4**: 팀 규칙에 맞게 lint 설정과 커스텀 템플릿 1~2개 만들어 보기.

## 3. 작업 규칙 (사용자 지시)

- **언어**: 사용자의 모든 프롬프트를 먼저 올바른 영어로 다시 쓰고(영어로 쓴 경우 문법 피드백), 그다음 **한국어로 답한다**. 문서는 한국어, 코드·주석·커밋 메시지는 영어.
- **계획 먼저**: 큰 작업은 계획서를 먼저 써서 검토받고, 확정 후 구현. 진짜 선택지가 있는 결정은 AskUserQuestion으로(한국어, 추천안을 첫 번째에). 사용자가 "추천안으로 진행"이라고 하면 계획서의 기본안대로 바로 진행한다.
- **커밋**: Step이 끝날 때마다 커밋. push는 사용자가 `p` 등으로 요청할 때만. `main`에서 바로 작업(브랜치 만들지 않음).
- **Git 단축어**: `cm` 커밋 · `p` push · `cmp` 커밋+push · `cmpr` 커밋+push+PR · `pr` push+PR · `mprm` 마지막 PR 머지 후 main pull · `mtm` main에 머지 후 전환 · `ghelp` 목록.
- **커밋 메시지 끝**: `Co-Authored-By: Claude …` 줄(세션 안내에 따름). PR 본문 끝은 `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **push 전 반드시**: `set -e` 후 `pnpm exec biome ci . && pnpm -r typecheck && pnpm -r test` (한 번 Biome 실패 커밋이 push된 적이 있음). UI를 바꿨으면 `pnpm --filter @clavis/web build && pnpm e2e`도.
- push 후에는 CI(run)를 지켜보고 결과를 알린다: `gh run list --limit 1`, `gh run watch <id> --exit-status`(백그라운드), `gh run view <id>`.
- Step이 끝나면 계획서 §9 결과 행과 이 문서의 §1·§2를 갱신한다.

## 4. 보안 수칙 (반드시 지킬 것)

- 비밀 값은 git에 없는 `.agent.env`(저장소 루트)에만 있다: `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `CLAVIS_TOKEN_HERMES`, `CLOUDFLARE_API_TOKEN`.
  - **새 장비로는 사용자가 직접 안전한 방법으로 복사**한다. 채팅에 붙여 달라고 하지 않는다.
  - **출력하지 않는다. `source`하지 않는다.** 불러올 때는 `eval "$(python3 scripts/agent-env.py)"`만 쓴다 (쉘 source로 비밀이 한 번 노출되어 교체한 적이 있음).
  - 코드 작업·테스트·CI 배포에는 필요 없다. 운영 Worker를 에이전트로 호출하거나 CPU를 잴 때만 필요하다(직전 장비에는 없었고, 없이 Step 6까지 진행했다).
- `apps/worker/.dev.vars`(git 제외): `.dev.vars.example`을 복사해 `DEV_ACCESS_EMAIL=본인@gmail.com` — 로컬 `pnpm dev` 로그인 대용(localhost에서만 동작).
- Cloudflare 계정에는 관련 없는 리소스가 있다: R2 `kpoppass`, zone `playcoin.game`, 서브도메인 `crawl-proxy`의 다른 Worker. **절대 건드리지 않는다.**
- 대시보드 변경·운영 데이터 삭제 같은 되돌리기 어려운 작업은 먼저 사용자 확인.

## 5. 새 장비 준비

```bash
git clone https://github.com/tobyilee/clavis.git && cd clavis   # 이미 있으면 git pull
pnpm install                      # pnpm 12, Node ≥ 22
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # DEV_ACCESS_EMAIL 수정
# .agent.env는 사용자가 직접 복사 (위 §4)
pnpm exec playwright install chromium webkit   # E2E용 + WebKit은 iPhone 확인용
gh auth status                    # CI 확인용
```

- 캐시된 Playwright 브라우저가 있어도 버전이 다르면 E2E가 "Executable doesn't exist"로 실패한다 → 위 install을 다시 실행.
- 준비가 끝나면 한 번 확인: `pnpm exec biome ci . && pnpm -r typecheck && pnpm -r test` (§1의 테스트 수와 같아야 한다).
- 로컬 실행: `pnpm dev` (Worker :8787 + Vite 개발 서버를 함께 실행). 로컬 D1 migration은 `pnpm --filter @clavis/worker db:migrate:local`.
- 배포는 **CI가 한다**: `main` push → check 잡(Biome·typecheck·test·build·E2E) → deploy 잡(D1 migration → build → `wrangler deploy`). GitHub secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 설정됨.
- 운영 CPU를 재야 할 때만 `wrangler login` 필요(아래 §7).

## 6. 프로젝트 요약

- **무엇**: 사람과 AI 에이전트(Hermes, 코딩 에이전트)가 함께 쓰는 Markdown 위키. Cloudflare **무료 플랜**으로 Confluence 핵심 기능.
- **운영**: https://clavis.crawl-proxy.workers.dev (Cloudflare Access: 사람은 이메일 PIN, `@gmail.com`; 에이전트는 서비스 토큰 + `Bearer clv_…`). 계정 `dev@neoventures.kr`. D1 `clavis`, R2 `clavis-files`.
- **구조**: pnpm 모노레포
  - `packages/shared` — zod 스키마, Markdown 스캔(`scanLines`, 섹션, 위키 링크), lint 엔진·규칙, 템플릿
  - `apps/worker` — Hono + zod-openapi REST(`/api/v1`), MCP(`/mcp`, 도구 약 20개), D1(Drizzle, `migrations/`), R2, `.md`·`llms.txt`
  - `apps/web` — React 19 + Vite + TanStack Router/Query + Tailwind v4/shadcn, CodeMirror 6 에디터, i18n(ko/en)
    - 편집 화면: `editor/page-editor.tsx`(레이아웃), `markdown-editor.tsx`(CodeMirror 핸들), `codemirror.ts`(확장·테마), `format.ts`·`format-toolbar.tsx`(모바일 서식), `lib/viewport.ts`(키보드 위 영역), `lib/images.ts`(사진 줄이기)
  - `e2e/` — Playwright, `serve.sh`가 빈 로컬 D1로 `wrangler dev`(:8788). 프로젝트: desktop(Chrome 1440px) · mobile(Pixel 7)
- 설계: [`01-architecture.md`](./01-architecture.md)(v0.4, Phase 2 반영), 가이드: [`guides/agent-connection.md`](./guides/agent-connection.md), [`guides/writing.md`](./guides/writing.md).

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
- E2E 모바일 프로젝트(Pixel 7, Chromium 에뮬레이션)에서는 `keyboard.type`의 Enter가 가끔 줄바꿈을 잃는다(CodeMirror의 Android 입력 처리 — 실제 기기와 무관, Step 6 이전 코드에서도 같음). 모바일 테스트는 여러 줄 입력에 기대지 말고 결과 텍스트만 확인한다.
- 편집 화면에는 파일 입력이 두 개(첨부 버튼, 모바일 툴바의 사진 버튼)라 E2E에서 `input[type=file]`로 찾으면 strict 위반 → `getByLabel('파일 첨부')`·`getByLabel('사진 첨부')`.

## 8. 모바일 UI 규칙과 검증 방법 (Step 6에서 정함)

- **터치 화면의 입력칸은 16px 이상.** iOS Safari는 16px 미만 입력칸(`contenteditable` 포함)을 누르면 페이지를 확대하고 되돌리지 않는다 — 그러면 화면 오른쪽(저장 버튼)이 밀려난다.
  - 공통 `Input`·`Select`·`Textarea`는 `text-sm pointer-coarse:text-base`(폭이 아니라 터치 여부 기준 — 가로 모드 폰도 포함). 글자 크기를 덮어쓰는 곳은 `pointer-coarse:` 쪽도 함께 맞춘다(예: 제목 `text-lg pointer-coarse:text-lg`).
  - 에디터 글자는 `index.css`의 `--editor-font-size`(기본 14px, `(pointer: coarse)`에서 16px).
  - viewport meta의 `maximum-scale=1`로 막지 않는다(Android에서 확대 자체가 막혀 접근성 문제).
- **폰 편집 화면은 키보드 위 영역에 고정.** iOS는 키보드가 떠도 `100dvh`·fixed 요소를 줄이지 않고, 캐럿을 보이려고 페이지를 스크롤한다.
  - `useVisualViewportVars()`(`lib/viewport.ts`)가 `<html>`에 `--vv-top`·`--vv-height`를 맞춰 두고, `page-editor.tsx` 최상위가 `max-md:fixed max-md:top-(--vv-top) max-md:h-(--vv-height)`로 따라간다. 아래 시트도 같은 변수로 키보드 위에 뜬다.
  - CodeMirror 툴팁(자동완성·lint)은 `tooltips({ tooltipSpace })`로 에디터 영역 안에서만 열린다(툴바를 가리거나 키보드 뒤로 가지 않게).
  - 툴바 버튼은 `onMouseDown`에서 `preventDefault` → 에디터 포커스(키보드)를 유지한다.
- **검증 방법** (Playwright로는 iOS의 확대와 키보드를 재현할 수 없다)
  - 가로 넘침: 폭 320·375·390·844px, `isMobile`·`hasTouch` 컨텍스트에서 `scrollWidth - clientWidth`, 그리고 화면 밖으로 나간 요소와 16px 미만 입력칸을 모든 화면에서 수집.
  - 키보드: `addInitScript`로 `window.visualViewport`를 가짜 EventTarget(`height`·`offsetTop`을 바꾸고 `resize`·`scroll` 이벤트)으로 바꿔, 저장 버튼·툴바·시트가 보이는 영역 안에 있는지 확인. Chromium과 WebKit(`devices['iPhone 13']` 등) 둘 다.
  - 직전 장비에는 Xcode가 없어(Command Line Tools만) iOS 시뮬레이터를 못 썼다. 새 장비에 Xcode가 있으면 `xcrun simctl`로 실제 Safari에서 확인할 수 있다(시뮬레이터에서 `localhost:8788`이 호스트로 연결됨).

## 9. 운영 데이터 현황

- Space: CLAVIS("Clavis 사용 안내", "MCP 연결"), TEAM(홈 "팀", ADR1·ADR2 등 사용자 테스트 문서). 휴지통에 "주간 회의 2026-09-27"(hermes 작성), "아키텍처".
- 사람 관리자 1명(최초 로그인 사용자), 에이전트 `hermes`(editor).
