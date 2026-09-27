# Clavis — 컨셉 & 범위 (Draft v0.2)

> 상태: **Draft** · 최종 수정: 2026-09-27
> 이 문서는 Clavis의 기본 아이디어와 기능 범위, Phase 구분을 정리한다.
> 결정 사항과 그 이유는 [`decisions.md`](./decisions.md)에 기록하며, 본문에서는 `[D-xx]`로 참조한다.

---

## 1. 한 줄 정의

**Clavis는 사람과 AI 에이전트가 함께 읽고 쓰는, Markdown 기반의 개발팀 지식 위키다.**

*Clavis*(라틴어: 열쇠)라는 이름처럼, 팀의 스펙·기획·아키텍처 지식에 사람과 AI가 같은 방식으로 접근하게 해주는 "열쇠"를 지향한다.

## 2. 배경과 문제

AI 코딩 에이전트(Claude Code, Codex 등)와 AI 협업 에이전트(Hermes)가 개발 팀의 일원처럼 일하게 되면서, 지식 관리에 새로운 요구가 생겼다.

| 문제 | 설명 |
|---|---|
| 지식이 AI에게 보이지 않음 | Confluence·Notion의 리치 텍스트는 API로 꺼내도 변환 손실이 크고, 토큰 낭비가 많다. |
| 문서 품질의 편차 | 사람과 AI가 모두 문서를 쓰면 형식이 제각각이 되고, AI가 참고할 때 신뢰도가 떨어진다. |
| 도구가 너무 무거움 | Confluence는 기능이 방대하여 팀이 실제로 쓰는 것은 일부에 불과하다. |
| 코드 저장소와의 단절 | 스펙/ADR이 위키와 저장소에 흩어져 최신본이 어디인지 불분명하다. |

## 3. 목표와 비목표

### 목표 (Goals)
1. **Markdown-native**: 문서의 원본(source of truth)은 DB에 저장된 Markdown 텍스트다. 사람이 보는 화면과 AI가 받는 데이터가 같다. `[D-03]`
2. **Agent-first API**: UI에서 할 수 있는 주요 작업은 모두 REST API와 MCP로도 가능하다. AI 에이전트는 1급 사용자다. `[D-12]`
3. **문서 품질 규칙(Lint)**: 문서 규칙을 정의하고, 위반 시 편집 화면과 API 응답 모두에서 경고한다.
4. **단순함 & 저비용**: Confluence 핵심 기능 중 꼭 필요한 것만 제공하고, Cloudflare 무료 플랜 안에서 운영한다. `[D-17]`
5. **어디서나 읽기**: 데스크톱 웹과 모바일 웹을 기본 지원한다.

### 비목표 (Non-goals, 초기)
- 문서 버전 관리(히스토리/diff/롤백) — 안전장치는 휴지통만 제공 `[D-21]`
- WYSIWYG 리치 텍스트 편집기
- 실시간 동시 편집 (CRDT) — 대신 낙관적 잠금으로 충돌만 감지
- Space 단위 세분화 권한 `[D-05]`
- 매크로/플러그인, 데이터베이스/테이블 뷰(Notion식)
- 네이티브 모바일 앱, CLI 도구
- 외부 문서 Import (Confluence/Notion) `[D-16]`

## 4. 사용자 (Personas)

규모: 10명 이하 단일 팀, 수백 건 문서 `[D-19]`

| 사용자 | 주요 행동 | 인터페이스 |
|---|---|---|
| **개발팀원** | 스펙/설계 문서 작성, 검색, 참고 | Web UI (데스크톱) |
| **PM/기획자** | 기획 문서 작성, 리뷰 | Web UI |
| **이동 중인 팀원** | 문서 읽기, 간단한 수정 | Mobile Web UI `[D-06]` |
| **AI 코딩 에이전트** | 작업 전 스펙/아키텍처 조회, 작업 후 문서 갱신 | REST API / MCP |
| **Hermes (Nous Research Hermes Agent)** | 회의록·결정 사항 정리, 문서 생성/요약 | MCP `[D-13]` |

## 5. 기술 스택 요약

| 영역 | 선택 | 비고 |
|---|---|---|
| 런타임 / 백엔드 | **Cloudflare Workers + TypeScript** (Hono 등) | `[D-01]` |
| 프론트엔드 | **React + Vite SPA** (Workers Static Assets로 서빙) | `[D-02]` |
| DB | **Cloudflare D1** (SQLite) | `[D-04]` |
| 첨부파일 | **Cloudflare R2** | `[D-20]` |
| 검색 | **D1 FTS5 (trigram tokenizer)** | `[D-11]` |
| 사람 인증 | **Cloudflare Access** (Zero Trust 무료 플랜) | `[D-05]` |
| 에이전트 인증 | 앱 자체 **API Token** (Bearer) | `[D-05]` |
| MCP | Workers 위의 Remote MCP 서버 (Streamable HTTP) | `[D-12]` |
| Markdown | 브라우저·서버 공용 파서(remark/unified 계열) + markdownlint | `[D-14]` |
| 에디터 | CodeMirror 6 (분할 미리보기, lint 진단 표시) | 기본값 |
| i18n | 한국어 + 영어 | `[D-18]` |

> 세부 구조와 무료 플랜 한도 분석은 `01-architecture.md`에서 다룬다.

## 6. 핵심 개념 (Domain Model)

```
Workspace (설치 단위, 1개)
└── Space  (최상위 구분, 고유 key + URL)
    ├── Page (트리 구조: parent/child, 순서, 무제한 깊이)   [D-07]
    │   ├── Frontmatter (type, status, owner, tags …)     [D-10]
    │   ├── Markdown 본문
    │   ├── Attachment (이미지/파일, R2)
    │   └── revision (낙관적 잠금용 정수, 히스토리 아님)
    ├── Template (문서 유형별 템플릿)
    └── Space 설정 (홈 페이지, Lint 규칙)
User  (Cloudflare Access 이메일 + 전역 역할: Admin/Editor/Viewer)
Agent (API Token, 역할 부여, 작성자로 표시)
```

- **Space**: Confluence의 Space에 해당. 예) `PAY`(결제 프로젝트), `ARCH`(공통 아키텍처), `TEAM`(팀 운영).
- **Page**: 모든 페이지는 본문과 자식 페이지를 동시에 가질 수 있다(Confluence 방식). 페이지 제목은 Space 안에서 유일하다(위키 링크 해석을 위해).
- **작성자 표시**: 마지막 수정자가 사람인지 에이전트인지 구분하여 표시한다 (예: `🤖 hermes · 3분 전`).

## 7. URL 설계

```
/                                     → Space 목록 (대시보드)
/s/{SPACEKEY}                         → Space 홈
/s/{SPACEKEY}/p/{slug}-{shortId}      → 페이지 보기   [D-08]
/s/{SPACEKEY}/p/{slug}-{shortId}/edit → 페이지 편집
/search?q=...                         → 검색
/api/v1/...                           → REST API   (Access 뒤, 사람은 Access 신원·에이전트는 API Token)
/mcp                                  → MCP 엔드포인트 (Access 서비스 토큰 + API Token)
```

- `shortId`가 페이지를 식별하는 기준이다. slug는 장식이며, slug가 달라도 `shortId`로 찾아 정규 URL로 리다이렉트한다.
- slug는 한글 제목을 그대로 사용한다. 예) `/s/PAY/p/결제-api-설계-a1b2c3` `[D-22]`

## 8. 기능 레퍼런스 분석

참고한 제품: **Confluence**, **Notion**, **Outline**, **BookStack**, **Wiki.js**, **Docmost**, **GitBook**, **Obsidian**

| 기능 | Confluence | 인기 위키에서의 양상 | Clavis |
|---|---|---|---|
| Space(최상위 구분) | Space | Outline: Collection, BookStack: Book, GitBook: Space | **P1** |
| 페이지 트리 + 사이드바 | Page tree | 공통 | **P1** |
| Markdown 편집 + 분할 미리보기 | (제한적) | Wiki.js, HackMD | **P1** 핵심 |
| 문서 규칙 Lint | ❌ | markdownlint, Vale | **P1** 핵심 차별점 |
| Frontmatter 폼 UI | 페이지 속성 | Notion 속성, Obsidian Properties | **P1** |
| 페이지 템플릿 | Blueprint | 공통 | **P1** `[D-15]` |
| 이미지/첨부 | 지원 | 공통 | **P1** |
| 전문 검색 | 지원 | 공통 | **P1** (FTS5) |
| 시맨틱 검색 | Rovo | 최근 추세 | **P3** |
| Mermaid / Callout / 코드 하이라이트 / TOC | 매크로 | GitHub·GitBook 기본 | **P1** |
| 위키 링크 `[[제목]]` | ❌ | Obsidian, Outline | **P1** `[D-23]` |
| 백링크 / 깨진 링크 리포트 | 부분 | Obsidian | **P2** |
| REST API + API Token | 지원 | 공통 | **P1** |
| Remote MCP 서버 | 공식 MCP | Notion·GitBook 도입 추세 | **P1** |
| 원본 `.md` URL / `llms.txt` | ❌ | GitBook, Mintlify | **P2** (저비용 선택) |
| 동시 편집 충돌 감지 | 실시간 편집 | 공통 | **P1** (낙관적 잠금) |
| 휴지통/복원 | 지원 | 공통 | **P1** (유일한 안전장치) `[D-21]` |
| 페이지 댓글 | 지원 | 공통 | **P2** `[D-15]` |
| 즐겨찾기/최근 문서 | 지원 | 공통 | **P2** |
| Watch/알림, Webhook, Slack | 지원 | 공통 | **P3** |
| Space 단위 권한 | 세분화 | Outline: Collection 단위 | 제외 (전역 역할만) |
| 버전 히스토리 | 지원 | 공통 | 제외 |
| 실시간 공동 편집 | 지원 | Outline, Notion | 제외 |
| Import (Confluence/Notion) | - | 공통 | 제외 |
| CLI | - | GitBook CLI | 제외 |

## 9. Markdown 지원 범위 `[D-14]`

- **기본**: CommonMark + GFM (표, 체크리스트, 취소선, 자동 링크, 각주)
- **코드**: 언어별 신택스 하이라이트
- **Mermaid**: ```` ```mermaid ```` 블록을 다이어그램으로 렌더링
- **Callout**: GitHub 방식 `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]`
- **위키 링크**: `[[페이지 제목]]`, `[[페이지 제목|표시 텍스트]]`, `[[SPACEKEY:페이지 제목]]`
  - 현재 Space에서 먼저 해석, 다른 Space는 key 접두사로 지정 `[D-23]`
  - 저장 시 내부적으로 `shortId`와 매핑하여 제목이 바뀌어도 링크를 추적할 수 있게 한다 (링크 테이블)
- **제외**: 수식(KaTeX), HTML 원문 삽입(보안상 sanitize)

## 10. Markdown 문서 규칙 (Lint)

문서 규칙은 **Clavis의 핵심 차별점**이다. AI가 신뢰하고 참고할 수 있는 문서를 만들기 위한 장치다.

### 10.1 동작 방식 `[D-09]`
- **편집 중(브라우저)**: 전체 규칙을 실시간 검사하여 에디터에 밑줄 + 하단 Problems 패널로 표시.
- **저장 시(서버)**: 같은 규칙 코드로 재검사. `error`가 있으면 저장 거부, `warning`/`info`는 저장 허용.
- **API 응답**: 저장 거부 시 `422` + 위반 목록, 성공 시에도 `warnings`를 포함하여 AI 에이전트가 스스로 고칠 수 있게 한다.
- **Lint 전용 API**: 저장 없이 검사만 수행 (`POST /api/v1/lint`).

### 10.2 Frontmatter `[D-10]`
모든 페이지는 frontmatter가 필수다. 편집 화면에서는 본문 위 **폼 UI**로 보여주고, 저장 시 YAML로 직렬화한다. 에이전트는 YAML을 직접 쓴다.

```yaml
---
type: spec            # spec | prd | adr | architecture | meeting | guide | note
status: draft         # draft | review | approved | deprecated
owner: toby@team.dev  # 책임자 (사람)
tags: [payment, api]
---
```

> 페이지 제목은 frontmatter가 아닌 페이지 속성으로 관리한다 (트리·URL·위키 링크와 연동되므로).

### 10.3 기본 규칙 (초안)

| 분류 | 규칙 | 심각도 |
|---|---|---|
| 메타데이터 | 필수 필드(`type`, `status`, `owner`) 누락 | error |
| 메타데이터 | `type`/`status` 값이 허용 목록 밖 | error |
| 링크 | 존재하지 않는 첨부파일 참조 | error |
| 구조 | 본문에 H1 사용 (제목은 페이지 속성) | warning |
| 구조 | 헤딩 레벨 건너뛰기 (H2 → H4) | warning |
| 문서 유형 | 유형별 필수 섹션 누락 (아래 표) | warning |
| 링크 | 존재하지 않는 위키 링크 / 내부 링크 | warning |
| 접근성 | 이미지 alt 텍스트 누락 | info |
| 코드 | 코드 블록 언어 미지정 | info |
| 크기 | 문서가 너무 김 (AI 컨텍스트 고려, 분할 권장) | info |

### 10.4 문서 유형별 필수 섹션 (템플릿과 연동)

| type | 필수 섹션 (H2) |
|---|---|
| `prd` | 배경, 목표, 사용자 스토리, 요구사항, 범위 외 |
| `spec` | 개요, 요구사항, 설계, 미결 사항 |
| `adr` | Context, Decision, Consequences |
| `architecture` | 개요, 구성 요소, 데이터 흐름 |
| `meeting` | 참석자, 논의 내용, 결정 사항, 액션 아이템 |

- 템플릿은 이 필수 섹션을 미리 채운 상태로 새 페이지를 만든다. 즉 **템플릿 = Lint 규칙의 모범 답안**이다.
- P1은 전역 규칙 세트 하나를 코드로 정의하고, P2에서 Space별 규칙 설정 UI를 제공한다.

## 11. AI 에이전트 연동 `[D-12]` `[D-13]`

### 11.1 인터페이스
| 수단 | 설명 | Phase |
|---|---|---|
| REST API | Space/Page/Attachment/Search/Lint/Template. 본문은 Markdown 원문(frontmatter 포함)으로 주고받음. OpenAPI 스펙 공개 | P1 |
| Remote MCP | REST를 감싼 얇은 MCP 서버. Hermes Agent, Claude Code 등이 직접 연결 | P1 |
| 섹션 단위 편집 | 헤딩 기준 부분 수정 — 대형 문서의 토큰 절약 | P2 |
| 원본 `.md` URL / `llms.txt` | 읽기 전용 저비용 접근 | P2 (선택) |
| Webhook | 페이지 이벤트를 외부로 전달 | P3 |
| 시맨틱 검색 | Workers AI 임베딩 + Vectorize | P3 |

### 11.2 MCP 도구 (P1, 구현됨)
| 도구 | 설명 |
|---|---|
| `list_spaces` | Space 목록 |
| `get_space_tree` | Space의 페이지 트리 (제목, id, type, status) |
| `search_pages` | 전문 검색 (Space/type/status 필터) |
| `read_page` | 페이지 Markdown 원문 + 메타데이터 + revision |
| `create_page` | 페이지 생성 (템플릿 지정 가능). lint 결과 반환 |
| `update_page` | 페이지 수정 (`revision` 필수). lint 결과 반환 |
| `move_page` | 부모/순서 변경 |
| `delete_page` | 휴지통으로 이동 (하위 포함, 30일 내 복원) |
| `lint_markdown` | 저장 없이 규칙 검사 |
| `list_templates` | 템플릿 목록 및 필수 섹션 |

### 11.3 쓰기 정책
- 에이전트는 사람과 동일하게 자유롭게 생성·수정·삭제할 수 있다. `[D-13]`
- 모든 변경에 **작성자(에이전트명)**를 기록하고 UI에 표시한다.
- Lint `error`가 있으면 사람과 마찬가지로 저장이 거부된다.
- 수정 시 `revision`을 반드시 보내야 한다 (낙관적 잠금 → 충돌 시 `409`).
- 삭제는 휴지통으로 이동하며 복원 가능하다. 수정 내용은 되돌릴 수 없다. `[D-21]`

## 12. 인증 & 권한 `[D-05]`

```
브라우저 ──▶ Cloudflare Access (이메일 PIN, 추후 Google) ──▶ Worker
                                              │ Access JWT 검증 → email
                                              ▼
                                   actors 테이블 (email → 역할, 첫 로그인은 승인 대기)

에이전트 ──▶ Cloudflare Access (서비스 토큰) ──▶ Worker
                 Authorization: Bearer <API Token>  ──▶ api_tokens 테이블 (해시 저장)
```

- **전역 역할**: `Admin`(Space·사용자·토큰 관리), `Editor`(문서 읽기/쓰기), `Viewer`(읽기).
- 모든 Space는 로그인한 팀원 전원에게 보인다.
- API Token은 Admin이 발급하며, 토큰마다 이름(예: `hermes`, `claude-code`)과 역할을 가진다.

## 13. 화면 구성

### 데스크톱 — 보기
```
┌──────────────────────────────────────────────────────────────┐
│ [Clavis] [Space 선택 ▾]        [ 🔍 검색 (⌘K) ]    [KO|EN][👤]│
├─────────────┬──────────────────────────────────┬─────────────┤
│ PAY 홈       │  PAY / 설계 / 결제 API 설계          │  목차(TOC)  │
│ ▾ 기획       │  결제 API 설계                     │  - 개요     │
│   ├ PRD     │  [spec][approved] owner: toby     │  - 요구사항  │
│   └ 로드맵   │  🤖 hermes가 3분 전 수정            │  - 설계     │
│ ▾ 설계       │                                  │             │
│   ├ 결제API ◀│  (본문 렌더링)                     │  ⚠ Lint 2건 │
│   └ ADR     │                                  │             │
│ + 새 페이지   │                                  │             │
│ 🗑 휴지통     │                                  │             │
└─────────────┴──────────────────────────────────┴─────────────┘
```

### 데스크톱 — 편집
```
┌─────────────┬──────────────────────────────────────────────────┐
│ 사이드바     │ 제목: [결제 API 설계                         ]      │
│ (접힘 가능)  │ type:[spec▾] status:[draft▾] owner:[toby] tags:[…] │
│             ├────────────────────────┬─────────────────────────┤
│             │  Markdown 에디터         │  미리보기 (스크롤 동기화) │
│             │  ## 개요                 │                         │
│             │  #### 상세 ~~~~ (⚠)      │                         │
├─────────────┴────────────────────────┴─────────────────────────┤
│ ⚠ Problems: L12 헤딩 레벨 건너뜀 · L30 깨진 링크 [[결제 정책]]  [저장]│
└────────────────────────────────────────────────────────────────┘
```

### 모바일 `[D-06]`
- 사이드바 → 햄버거 드로어, TOC → 상단 접이식 메뉴
- 읽기 최적화가 우선. 편집은 [에디터 | 미리보기] 탭 전환으로 가능
- 모바일 편집에서는 첨부 드래그&드롭 등 고급 기능 제외 (파일 선택 업로드만)

## 14. Phase 계획

### Phase 0 — 기반 (Foundation)
- 프로젝트 골격: 모노레포(`web`, `worker`, `shared`), Wrangler 설정, CI
- **기술 검증 (Spike)**
  - D1 FTS5 trigram tokenizer 동작 및 한국어 검색 품질
  - Workers 무료 플랜 CPU 한도(10ms) 안에서 서버측 lint 실행 가능 여부
  - Cloudflare Access + Bearer Token 경로 분리
  - Workers에서 Remote MCP 서버 구동 (Hermes Agent 연결 확인)
- 도메인 모델, D1 스키마, API 규약(에러 포맷, 페이지네이션)
- `shared` 패키지: Markdown 파서 설정, Lint 규칙 (브라우저·서버 공용)

### Phase 1 — MVP: "사람과 AI가 읽고 쓸 수 있는 위키"
- **Space**: 생성/수정/삭제, Space별 URL과 홈 페이지
- **Page**: 트리 CRUD, 이동/순서 변경, 좌측 사이드바, breadcrumb, 휴지통/복원
- **편집**: CodeMirror 에디터 + 분할 미리보기(스크롤 동기화), frontmatter 폼, 낙관적 잠금
- **Markdown**: GFM, 코드 하이라이트, Mermaid, Callout, 위키 링크, TOC
- **첨부**: 이미지/파일 업로드 (드래그&드롭, 붙여넣기) → R2
- **Lint**: 기본 규칙 세트, 에디터 경고, 저장 시 서버 검사(error 차단)
- **템플릿**: 문서 유형별 기본 템플릿 (prd, spec, adr, architecture, meeting)
- **검색**: 제목+본문 전문 검색, type/status 필터
- **인증**: Cloudflare Access, 전역 역할, API Token 관리 화면
- **API**: REST API + OpenAPI 스펙, Remote MCP 서버
- **UI**: 반응형(모바일 읽기 + 간단 편집), 한국어/영어

### Phase 2 — 팀 생산성 & AI 연동 강화
- 페이지 댓글
- 백링크, 깨진 링크 리포트, Space 단위 Lint 대시보드
- Space별 Lint 규칙 설정 UI, 커스텀 템플릿 관리
- 섹션 단위 편집 API
- 즐겨찾기, 최근 문서
- 원본 `.md` URL / `llms.txt` (선택)
- 모바일 편집 개선

### Phase 3 — 확장
- 시맨틱 검색 (Workers AI + Vectorize)
- Watch/알림, Webhook, Slack 연동
- (필요 시) 버전 히스토리, Space 단위 권한, Git 내보내기

## 15. 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| Workers 무료 CPU 한도(10ms) | 서버측 lint/렌더링 실패 | 렌더링은 브라우저에서만, 서버는 lint만. 초과 시 유료 플랜($5/월) 검토 |
| 한국어 검색 품질 | trigram은 2글자 검색어 불가 | Phase 0 검증, 필요 시 bigram 보조 인덱스 |
| 버전 관리 부재 | 잘못된 수정(특히 에이전트) 복구 불가 | 작성자 표시 + 낙관적 잠금. D1 Time Travel(시점 복원)을 최후 수단으로 문서화 |
| 에이전트 과다 호출 | 무료 요청 한도(10만/일) 초과 | 토큰별 rate limit, 트리/검색 응답 캐싱 |
| 제목 유일성 제약 | 같은 Space 내 동명 페이지 불가 | 생성 시 검증, 위키 링크 해석 규칙 명확화 |

## 16. 성공 기준
- 팀의 스펙/아키텍처 문서가 Clavis로 이전되어 단일 출처가 된다.
- AI 코딩 에이전트와 Hermes가 MCP로 Clavis의 스펙을 조회·갱신하는 흐름이 정착한다.
- 신규 문서의 Lint `error` 0건, `warning` 비율이 지속적으로 감소한다.

## 17. 다음 단계
1. ~~기술 아키텍처 문서~~ → [`01-architecture.md`](./01-architecture.md) (v0.1 작성됨)
2. D-28 ~ D-32 제안 검토
3. Phase 0 Spike(S1~S7) 수행 및 결과 반영
4. ~~Phase 0 계획~~ → [`02-phase0-plan.md`](./02-phase0-plan.md) (완료)
5. Phase 1 계획 → [`03-phase1-plan.md`](./03-phase1-plan.md)
