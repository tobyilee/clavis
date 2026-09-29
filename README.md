# Clavis

**사람과 AI 에이전트가 함께 읽고 쓰는 Markdown 위키.** 개발팀의 명세·기획·아키텍처 문서를 Markdown 원문 그대로 저장하고, 사람은 웹에서, 에이전트는 MCP·REST로 같은 문서를 다룹니다. Cloudflare 무료 플랜 안에서 돌아갑니다.

*Clavis*는 라틴어로 "열쇠"입니다. 팀의 지식에 사람과 AI가 같은 방식으로 들어가게 하는 열쇠라는 뜻입니다.

누구나 자기 Cloudflare 계정에 설치해 팀 위키로 쓸 수 있습니다 → [설치](#설치)

## 주요 기능

- **Markdown 원문 한 벌**: frontmatter(`type`·`status`·`owner`·`tags`)를 포함한 Markdown이 원본입니다. 화면에 보이는 글과 에이전트가 받는 글이 같습니다.
- **편집**: CodeMirror 6 분할 미리보기, 속성 폼, 위키 링크(`[[제목]]`), 첨부, Mermaid, 초안 자동 보관, 폰 편집(서식 툴바·사진 첨부).
- **문서 규칙(Lint)**: 유형별 필수 섹션, frontmatter, 깨진 링크 등을 편집 중과 저장 시 같은 규칙으로 검사합니다. 규칙 수준과 필수 섹션은 Space마다 바꿀 수 있습니다.
- **함께 쓰기**: 낙관적 잠금(revision)으로 충돌 감지, 섹션 단위 편집, 댓글·답글·해결, `@멘션`, 모든 저장의 버전 기록과 되돌리기.
- **찾기**: 전문 검색(D1 FTS5 trigram)과 의미 검색(Workers AI bge-m3 + Vectorize, H2 섹션 단위).
- **알림**: 앱 안 알림(지켜보기·멘션), Space별 Slack·서명된 JSON Webhook.
- **AI 에이전트가 1급 사용자**: MCP 도구 25개(읽기 전용 에이전트는 17개), REST API(OpenAPI), 페이지별 원본 `.md`와 `llms.txt`. 에이전트가 쓴 글은 🤖와 이름으로 표시됩니다.
- **관리**: 사용자 승인·역할(관리자·편집·읽기), 에이전트 등록·토큰 발급/폐기, Space 관리, 휴지통(30일), 야간 백업.

## 설치

Cloudflare 계정만 있으면 무료 플랜으로 설치할 수 있습니다. Worker 하나에 D1·R2·Queues·Vectorize·Workers AI를 붙이고, 로그인은 Cloudflare Access가 맡습니다.

1. 저장소를 fork(또는 clone)하고 `wrangler login`
2. D1·R2·Queue·Vectorize 리소스 만들기
3. `apps/worker/wrangler.jsonc`에 내 값 넣기 → D1 마이그레이션 → 빌드 → 배포
4. Worker에 Cloudflare Access를 켜고 로그인할 사람을 정한 뒤, 팀 도메인과 AUD 값을 넣어 다시 배포
5. 처음 로그인한 사람이 관리자 → Space 만들기, 팀원 승인, AI 에이전트 연결

명령과 설정 값, 비용, GitHub Actions 자동 배포, 업데이트, 백업, 문제 해결까지 **[설치 가이드](docs/guides/install.md)**에 있습니다.

## 구조

```
사람(브라우저) ─ Cloudflare Access ─┐
에이전트(서비스 토큰 + Bearer clv_…) ─┤
                                    ▼
                 ┌──────── clavis Worker (단일 배포) ────────┐
                 │ Static Assets  React SPA                  │
                 │ /api/v1/*      REST (Hono + zod-openapi)  │
                 │ /mcp           Stateless MCP              │
                 │ /files/*       첨부 파일                   │
                 │ *.md, llms.txt 원본 Markdown (AI용)        │
                 │ queue()        알림·Webhook·색인           │
                 │ scheduled()    백업·정리                   │
                 └───────┬──────────────┬───────────────────┘
                         ▼              ▼
              D1 (SQLite + FTS5)   R2 (첨부·백업·버전 본문)
              Queues · Workers AI · Vectorize
```

REST와 MCP는 같은 서비스 계층을 호출합니다. Markdown 렌더링은 브라우저에서만 하고, 서버는 저장·검증·색인만 합니다(요청당 CPU 10ms 제약). 자세한 설계는 [`docs/01-architecture.md`](docs/01-architecture.md).

| 영역 | 사용 기술 |
|---|---|
| 런타임 | Cloudflare Workers, TypeScript |
| 백엔드 | Hono, `@hono/zod-openapi`, Drizzle ORM, MCP SDK(`@modelcontextprotocol/server`, `agents`) |
| 저장 | D1, R2, Queues, Workers AI, Vectorize |
| 프론트엔드 | React 19, Vite, TanStack Router·Query, Tailwind CSS v4, shadcn/ui, CodeMirror 6, unified |
| 인증 | Cloudflare Access(사람), Access 서비스 토큰 + Clavis API 토큰(에이전트) |
| 도구 | pnpm 모노레포, Biome, Vitest(`@cloudflare/vitest-pool-workers`), Playwright |

## 저장소 구성

```
apps/
  web/        React SPA (화면, 에디터, Markdown 렌더링, i18n ko/en)
  worker/     Cloudflare Worker (REST, MCP, 서비스 계층, D1 마이그레이션, 백업)
packages/
  shared/     브라우저와 Worker가 함께 쓰는 zod 스키마, Markdown 스캔, lint 엔진·규칙, 템플릿
e2e/          Playwright E2E (데스크톱 1440px, 모바일 Pixel 7)
docs/         컨셉, 아키텍처, Phase별 계획, 결정 로그, 가이드
scripts/      보조 스크립트 (agent-env.py: 에이전트 자격 증명 읽기)
spikes/       Phase 0 기술 검증 기록
```

## 로컬 개발

Cloudflare 계정 없이 내 컴퓨터에서 실행합니다. 필요한 것: Node.js 24(`.nvmrc`, 최소 22), pnpm 12.

```sh
git clone https://github.com/tobyilee/clavis.git && cd clavis
pnpm install
cp apps/worker/.dev.vars.example apps/worker/.dev.vars   # DEV_ACCESS_EMAIL을 내 이메일로
pnpm --filter @clavis/worker db:migrate:local           # 로컬 D1에 마이그레이션 적용
pnpm dev                                                 # Worker :8787 + Vite :5173
```

<http://localhost:5173>을 엽니다. 로컬에는 Cloudflare Access가 없으므로 `DEV_ACCESS_EMAIL`의 사람으로 로그인됩니다(localhost에서만 동작). 처음 로그인한 사람이 관리자가 됩니다.

- 로컬에는 Workers AI·Vectorize가 없어 의미 검색은 전문 검색으로 대신합니다. 색인 실패 로그가 찍혀도 정상입니다.
- 로컬 에이전트 토큰: `pnpm --filter @clavis/worker agent:create --name <이름> --local` → 저장소 루트 `.agent.env`에 기록됩니다(출력되지 않음). 로컬 관리 화면(**관리 → AI 에이전트**)에서 만들어도 됩니다.
- 배포한 Worker를 에이전트로 부를 때: `cp .agent.env.example .agent.env && chmod 600 .agent.env` 후 값을 채우고, `eval "$(python3 scripts/agent-env.py)"`로 읽습니다. 이 파일은 쉘로 `source`하지 않습니다(설명은 예시 파일 안에).

## 테스트

```sh
pnpm exec biome ci .      # 린트·포맷 검사 (고칠 때는 pnpm format)
pnpm -r typecheck
pnpm -r test              # shared · web · worker 단위 테스트
pnpm build && pnpm e2e    # 빌드한 SPA + wrangler dev(:8788, 빈 로컬 D1)로 E2E
```

- E2E 브라우저가 없으면 `pnpm exec playwright install chromium`.
- API 라우트를 바꾸면 `pnpm --filter @clavis/worker openapi`로 OpenAPI 문서를 다시 만듭니다(안 하면 테스트가 실패).
- 스키마를 바꾸면 `apps/worker/src/db/schema.ts` 수정 후 `pnpm --filter @clavis/worker db:generate --name <이름>`.

## 자동 배포 (CI)

`main`에 push하면 GitHub Actions가 검사한 뒤 배포합니다([`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

1. **check**: Biome, typecheck, 단위 테스트, 빌드, E2E
2. **deploy**: D1 마이그레이션(`--remote`) → 웹 빌드 → `wrangler deploy` → 헬스 체크

fork에서 쓰려면 GitHub secrets(`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)를 넣고 `ci.yml`의 주소를 내 주소로 바꿉니다 → [설치 가이드 §8](docs/guides/install.md#8-github-actions로-자동-배포-선택).

## AI 에이전트 연결

에이전트는 관리자가 등록하고 토큰을 발급합니다. 연결에는 헤더 세 개가 필요합니다.

```sh
claude mcp add --transport http --scope user clavis https://clavis.<서브도메인>.workers.dev/mcp \
  --header "CF-Access-Client-Id: $CLAVIS_CF_ACCESS_CLIENT_ID" \
  --header "CF-Access-Client-Secret: $CLAVIS_CF_ACCESS_CLIENT_SECRET" \
  --header "Authorization: Bearer $CLAVIS_TOKEN"
```

등록 요청부터 Claude Desktop·Cursor·VS Code·Hermes 설정, 도구 목록, REST·Webhook까지는 [`docs/guides/agent-connection.md`](docs/guides/agent-connection.md)에 있습니다. REST 명세는 `/api/v1/openapi.json`, 문서 화면은 `/api/v1/docs`.

## 문서

| 문서 | 내용 |
|---|---|
| [`CHANGELOG.md`](CHANGELOG.md) | 주요 변경 내역 (업데이트할 때 할 일 포함) |
| [`docs/00-concept.md`](docs/00-concept.md) | 컨셉, 목표와 비목표, 기능 범위 |
| [`docs/01-architecture.md`](docs/01-architecture.md) | 기술 아키텍처, 데이터 모델, API, 무료 플랜 한도 |
| [`docs/decisions.md`](docs/decisions.md) | 결정 로그 (`D-xx`) |
| [`docs/02-phase0-plan.md`](docs/02-phase0-plan.md) ~ [`docs/05-phase3-plan.md`](docs/05-phase3-plan.md) | Phase별 계획과 결과 |
| [`docs/handoff.md`](docs/handoff.md) | 작업 인수인계: 현재 상태, 작업 규칙, 보안 수칙, 제약과 요령 |
| [`docs/guides/install.md`](docs/guides/install.md) | 설치 가이드: 내 Cloudflare 계정에 설치·운영 |
| [`docs/guides/writing.md`](docs/guides/writing.md) | 문서 작성 가이드 (사람용) |
| [`docs/guides/agent-connection.md`](docs/guides/agent-connection.md) | AI 에이전트 연결 가이드 (MCP·REST·Webhook) |
