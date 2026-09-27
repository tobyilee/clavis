# Clavis — 결정 사항 로그

> 각 항목은 선택지와 결정 결과, 이유를 기록한다. 상태: `Open` / `Decided` / `Verify`(Phase 0 검증 필요)

## 요약

| ID | 주제 | 상태 | 결정 |
|---|---|---|---|
| D-01 | 백엔드 기술 스택 | Decided | Cloudflare Workers + TypeScript |
| D-02 | 프론트엔드 기술 스택 | Decided | React + Vite SPA |
| D-03 | 문서 저장 방식 | Decided | DB에 Markdown 원문 저장 |
| D-04 | 데이터베이스 | Decided | Cloudflare D1 |
| D-05 | 인증 & 권한 | Decided | Cloudflare Access + API Token, 전역 역할 |
| D-06 | 모바일 편집 범위 | Decided | 읽기 우선 + 간단 편집 |
| D-07 | 페이지 구조 | Decided | 페이지 트리 (Confluence 방식) |
| D-08 | 페이지 URL 형식 | Decided | `slug-shortId` |
| D-09 | Lint 위반 시 저장 정책 | Decided | error만 차단 |
| D-10 | Frontmatter | Decided | 필수 + 폼 UI |
| D-11 | 검색 | Verify | D1 FTS5 trigram |
| D-12 | 에이전트 연동 수단 | Decided | REST API + Remote MCP (둘 다 P1) |
| D-13 | 에이전트 쓰기 정책 / Hermes | Decided | 자유 수정 + 작성자 표시 / Hermes는 MCP |
| D-14 | Markdown 확장 문법 | Decided | Mermaid, Callout, 위키 링크 |
| D-15 | 댓글·템플릿 Phase | Decided | 템플릿 P1, 댓글 P2 |
| D-16 | Import | Decided | 하지 않음 |
| D-17 | 배포 환경 | Decided | Cloudflare 무료 플랜 |
| D-18 | UI 언어 | Decided | 한국어 + 영어 (i18n) |
| D-19 | 사용 규모 | Decided | 10명 이하, 수백 건 |
| D-20 | 첨부파일 저장소 | Decided | Cloudflare R2 |
| D-21 | 편집 안전장치 | Decided | 휴지통만 |
| D-22 | 한글 slug | Decided | 한글 그대로 사용 |
| D-23 | 위키 링크 해석 범위 | Decided | 현재 Space 우선, `[[KEY:제목]]`로 다른 Space |
| D-24 | DB 접근 방식 | Decided | Drizzle ORM + drizzle-kit |
| D-25 | UI 스타일링 | Decided | Tailwind + shadcn/ui |
| D-26 | REST API 정의 방식 | Decided | Hono + zod-openapi |
| D-27 | 서버측 lint 범위 | Decided (rev. S3) | 서버는 Clavis 줄 단위 규칙 전체, markdownlint 스타일 규칙은 브라우저 전용 |
| D-28 | 페이지 원문 저장 형식 | Proposed | frontmatter 포함 Markdown 전체를 `content`에 저장, 메타는 파생 컬럼 |
| D-29 | 사용자 등록 방식 | Proposed | 첫 로그인 시 Viewer 자동 생성, 최초 사용자는 Admin |
| D-30 | 운영 백업 | Proposed | D1 Time Travel + 야간 Markdown 덤프(R2, 14일) |
| D-31 | 첨부 참조 문법 | Proposed | `attachments/<파일명>` 상대 경로 |
| D-32 | 형제 페이지 순서 | Proposed | fractional index 문자열 |

---

## 상세

### D-01 · D-04 · D-17 · D-20 — Cloudflare 기반 스택
- **결정**: Workers(TypeScript) + D1 + R2, 가능한 한 무료 플랜 안에서 운영.
- **선택지**: Spring Boot(Kotlin/Java), TypeScript(Node), Go / Docker 자체 호스팅, Kubernetes.
- **이유**: 운영 비용 최소화. 소규모 팀(D-19)이라 무료 한도로 충분할 것으로 판단.
- **영향**: 백엔드는 TypeScript로 고정 → 프론트엔드와 Markdown 파서·Lint 규칙 코드를 공유할 수 있다(장점). Workers 무료 플랜 CPU 한도(10ms/요청)를 설계 제약으로 삼는다.

### D-02 — React + Vite SPA
- **선택지**: Next.js(SSR), SvelteKit.
- **이유**: UI가 에이전트와 같은 공개 API를 사용하게 되어 API 완결성이 자연스럽게 보장된다. Workers Static Assets로 함께 배포.

### D-03 — DB에 Markdown 원문 저장
- **선택지**: Git 저장소, DB + Git 동기화.
- **이유**: 트리 이동·검색·권한·동시 편집 처리가 단순하고 MVP가 가장 빠르다. Git 내보내기는 필요 시 P3.

### D-05 — 인증 & 권한
- **결정**: 사람은 Cloudflare Access(SSO), 에이전트는 앱 발급 Bearer API Token. 권한은 전역 역할(Admin/Editor/Viewer)만.
- **선택지**: GitHub OAuth, Google OAuth, 이메일+비밀번호 / Space 단위 권한.
- **이유**: 인증 코드를 앱에서 제거. 10명 이하 단일 팀이라 Space 단위 권한은 불필요.
- **구현 메모**: `/api/*`, `/mcp` 경로는 Access 정책에서 bypass하고 Worker가 토큰을 검증. 웹 요청은 `Cf-Access-Jwt-Assertion` JWT를 검증.

### D-06 — 모바일
- **결정**: 읽기 최적화 우선, 편집은 에디터/미리보기 탭 전환으로 가능. 고급 편집 기능은 데스크톱 전용.

### D-07 — 페이지 트리
- **결정**: 모든 페이지가 본문과 자식을 가질 수 있는 무제한 깊이 트리.
- **선택지**: 폴더 + 페이지(파일 시스템 방식).

### D-08 · D-22 — URL
- **결정**: `/s/{SPACEKEY}/p/{slug}-{shortId}`, slug는 한글 제목을 그대로 사용.
- **선택지**: 계층 경로, id만 / 로마자 변환, 사용자 지정 slug.
- **이유**: 읽기 쉬우면서 제목 변경·이동에도 링크가 깨지지 않음. `shortId`로 조회 후 slug가 다르면 정규 URL로 리다이렉트.

### D-09 — Lint 저장 정책
- **결정**: `error`는 저장 차단(API는 `422`), `warning`/`info`는 표시만.
- **선택지**: 경고만, Space별 설정.

### D-10 — Frontmatter
- **결정**: `type`, `status`, `owner` 필수, `tags` 선택. 편집 화면에서는 폼 UI로 제공. 제목은 frontmatter가 아닌 페이지 속성.
- **선택지**: 필수 + 텍스트 직접 작성, 선택 사항.

### D-11 — 검색 (Verify)
- **결정**: D1 FTS5 + trigram tokenizer로 제목/본문 전문 검색.
- **선택지**: FTS5 + Vectorize 시맨틱 검색을 P1에 포함.
- **검증 필요**: D1에서 trigram tokenizer 사용 가능 여부, 2글자 한국어 검색어(예: "결제") 처리 방법.

### D-12 — 에이전트 연동 수단
- **결정**: REST API + Remote MCP 서버를 P1에 포함. CLI는 만들지 않음. 원본 `.md` URL / `llms.txt`는 P2 선택 사항.
- **이유**: Hermes가 MCP로 연결하므로(D-13) MCP가 P1에 필요. MCP는 REST를 감싼 얇은 계층으로 구현하여 중복을 줄인다.

### D-13 — 에이전트 쓰기 정책 / Hermes
- **결정**: 에이전트는 사람과 동일하게 자유롭게 수정. 작성자를 기록·표시. Hermes는 Nous Research Hermes Agent이며 MCP 클라이언트로 연결.
- **선택지**: 토큰별 scope(read / write-draft / write-all), draft만 생성.
- **리스크**: 버전 관리가 없어(D-21) 잘못된 수정을 되돌릴 수 없음 → 낙관적 잠금, lint, 작성자 표시로 완화.

### D-14 — Markdown 확장
- **결정**: GFM + Mermaid, Callout(`> [!NOTE]`), 위키 링크 `[[제목]]`.
- **제외**: 수식(KaTeX).

### D-15 · D-16 — 댓글, 템플릿, Import
- **결정**: 템플릿 P1(문서 유형별 필수 섹션과 짝을 이룸), 댓글 P2, Confluence/Notion Import는 하지 않음.

### D-18 — UI 언어
- **결정**: 한국어 + 영어, 처음부터 i18n 구조.

### D-19 — 규모
- **결정**: 10명 이하 단일 팀, 문서 수백 건. 무료 플랜 적합성 판단의 근거.

### D-21 — 편집 안전장치
- **결정**: 휴지통(삭제 페이지 복원)만 제공. 수정 되돌리기 없음.
- **선택지**: 직전 1개 버전 보관, 최근 N개 스냅샷, 정기 백업.
- **메모**: D1 Time Travel(시점 복원, 무료 플랜 7일)을 운영 매뉴얼에 최후 복구 수단으로 기록.

### D-23 — 위키 링크 해석
- **결정**: `[[제목]]`은 현재 Space에서 해석, 다른 Space는 `[[SPACEKEY:제목]]`. 페이지 제목은 Space 안에서 유일.
- **선택지**: 전체 Space에서 제목 유일.

### D-24 · D-25 · D-26 — 구현 스택 세부
- **결정**: Drizzle ORM, Tailwind + shadcn/ui, Hono + `@hono/zod-openapi`.
- **선택지**: Kysely, Raw SQL / Mantine, CSS Modules / OpenAPI 수기 작성, tRPC.
- **이유**: zod 스키마 하나로 검증·타입·OpenAPI·MCP 도구 입력을 모두 만든다. shadcn/ui는 컴포넌트 코드가 저장소에 있어 코딩 에이전트가 수정하기 쉽다.

### D-27 — 서버측 lint 범위 (S3 결과로 개정, 2026-09-27)
- **최초 결정**: 저장 시 blocking(error) 규칙만 서버에서 실행.
- **S3 결과**: AST 기반 파싱(remark, markdownlint)은 ~0.5ms/KB로 50KB에 50ms 이상 → 무료 플랜 불가. Clavis의 줄 단위 규칙은 100KB에 0.4ms.
- **개정 결정**: Clavis 규칙은 **AST 없이 줄 단위로만** 작성하고, 저장·`POST /lint`·MCP `lint_markdown`에서 **전부** 실행한다. 저장 응답에 warning/info도 포함한다. markdownlint 기반 서식 규칙은 **브라우저 에디터 전용**.
- **선택지**: Workers Paid($5/월)로 전체 서버 실행, 문서 크기 상한 조건부 전체 실행.
- **영향**: `LintRule`에 "AST 사용 금지" 제약이 생긴다. 규칙 추가 시 CPU 회귀를 막기 위해 벤치마크(`spikes/S2-S3-cpu`)를 CI 성능 테스트로 승격한다.

### D-28 ~ D-32 — 아키텍처 제안 (검토 필요)
상세는 [`01-architecture.md`](./01-architecture.md) §4, §5, §10 참고. 이의가 없으면 Decided로 전환.
