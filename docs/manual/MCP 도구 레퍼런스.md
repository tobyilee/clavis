---
type: guide
status: approved
owner: admin
tags: [매뉴얼]
---

Clavis MCP 서버의 도구 25개를 모두 정리합니다. 연결 방법은 [[AI 에이전트 연결 (MCP)]]. 상위 문서: [[Clavis 사용 매뉴얼]]

## 공통

- **페이지 지정 (`page`)**: 짧은 id(예: `a1b2c3`) 또는 `SPACE:제목`(예: `PAY:결제 API 설계`).
- **섹션 지정 (`section`)**: `list_sections`가 주는 id(예: `액션-아이템`, 페이지 목차의 앵커와 같음) 또는 헤딩 텍스트(`액션 아이템`, `## 액션 아이템`).
- **권한**: 뷰어 에이전트에게는 쓰기 도구가 목록에 나오지 않습니다.
- **오류**: 도구 오류는 에이전트가 바로 고칠 수 있는 문장으로 옵니다. 예:
  - 충돌: "Current revision is N" + "read_page로 다시 읽고 다시 적용하라"
  - 규칙 오류: "Nothing was saved. Fix these and try again:" + `- L2 error clavis/frontmatter-required: …`
  - 경고는 저장된 뒤 "Warnings (N), saved anyway:"로 함께 옵니다.
- **응답은 짧게**: 페이지는 JSON이 아니라 원문 + 한 줄 주석, 트리는 id·제목·유형·상태만 줍니다 (토큰 절약).

## 한눈에 보기

| 분류 | 도구 | 권한 |
|---|---|---|
| 탐색 | `list_spaces`, `get_space_tree` | 뷰어 |
| 검색 | `search_pages`, `semantic_search` | 뷰어 |
| 읽기 | `read_page`, `list_sections`, `read_section`, `get_backlinks` | 뷰어 |
| 품질 | `list_templates`, `lint_markdown`, `get_space_health` | 뷰어 |
| 쓰기 | `create_page`, `update_page`, `update_section`, `set_page_meta`, `move_page`, `delete_page` | 편집자 |
| 변경 기록 | `list_revisions`, `read_revision` (뷰어) · `restore_revision` (편집자) | |
| 댓글 | `list_comments`, `add_comment` (뷰어) · `resolve_comment` (편집자) | |
| 알림 | `list_notifications`, `mark_notifications_read` | 뷰어 |

## 탐색

### list_spaces

Space 목록(키, 이름, 설명)과 호출한 에이전트 이름. 입력 없음.

### get_space_tree

| 입력 | 설명 |
|---|---|
| `space` | Space 키, 예: `PAY` |

페이지 계층을 `shortId`·`title`·`docType`·`status`·`children`으로 돌려줍니다.

## 검색

### search_pages

제목·본문 **단어** 검색. 검색어는 모두 들어가야 하고(AND), 3글자 이상은 색인, 짧으면 부분 일치.

| 입력 | 설명 |
|---|---|
| `query` | 검색어 (1~200자) |
| `space?` | Space 키로 제한 |
| `type?` | `spec`·`prd`·`adr`·`architecture`·`meeting`·`guide`·`note` |
| `status?` | `draft`·`review`·`approved`·`deprecated` |
| `limit?` | 1~50 |

```text
- PAY/a1b2c3 "결제 API 설계" [spec, review]
  … **부분 환불**은 결제 후 7일 이내 …
```

### semantic_search

**뜻으로** 찾기. 질문 문장으로 써도 됩니다. 결과마다 가장 가까운 섹션 id를 주므로 `read_section`으로 그 부분만 읽습니다.

| 입력 | 설명 |
|---|---|
| `query` | 찾는 내용 (1~200자) |
| `space?`, `type?` | 제한 |
| `limit?` | 1~20 (기본 10) |

```text
- PAY/a1b2c3 "결제 설계" section=환불-정책 "환불 정책" [spec, draft] score=0.71
  환불은 결제 후 7일 이내에만 가능하며 부분 환불을 지원한다.
```

- `score`는 0~1 유사도. 가까운 내용이 없으면 "Nothing close to …".
- 의미 검색을 쓸 수 없을 때는 오류로 "Use search_pages instead"가 옵니다.

## 읽기

### read_page

| 입력 | 설명 |
|---|---|
| `page` | 페이지 |

속성을 포함한 원문과 첫 줄 주석:

```text
<!-- clavis: PAY/a1b2c3 "결제 API 설계" revision=7 updated_by=toby open_comments=2 -->
---
type: spec
…
```

`revision`은 `update_page`의 `baseRevision`으로, `open_comments`는 미해결 댓글 수입니다.

### list_sections

페이지의 헤딩을 섹션 목록으로. 문서 전체 대신 필요한 섹션만 읽고 고칠 때 먼저 부릅니다.

```text
revision=7
  - ## 개요  id=개요 lines=6-12 hash=1a2b3c4d
  - ## 설계  id=설계 lines=13-40 hash=5e6f7a8b
    - ### API  id=api lines=15-28 hash=9c0d1e2f
```

### read_section

| 입력 | 설명 |
|---|---|
| `page`, `section` | 페이지, 섹션 |

섹션 하나(헤딩과 하위 섹션 포함)와, 교체할 때 필요한 `hash`:

```text
<!-- clavis section: id=설계 lines=13-40 hash=5e6f7a8b revision=7 -->
## 설계
…
```

### get_backlinks

이 페이지를 `[[위키 링크]]`로 가리키는 문서 목록 (다른 Space 포함). 제목을 바꾸거나 지우기 전에 확인합니다.

## 품질

### list_templates

| 입력 | 설명 |
|---|---|
| `space?` | 그 Space의 커스텀 템플릿과 필수 섹션까지 |
| `locale?` | `ko`(기본) 또는 `en` |

템플릿 id·이름·유형·필수 섹션. id를 `create_page`의 `template`으로 넘깁니다.

### lint_markdown

저장하지 않고 규칙 검사. 저장 전에 초안을 확인할 때.

| 입력 | 설명 |
|---|---|
| `content` | 속성 포함 Markdown |
| `space?` | 위키 링크 확인과 그 Space 규칙 적용 |
| `page?` | 그 페이지의 첨부 파일까지 확인 |

"No problems found." 또는 "N error(s) would block saving." + 줄 번호별 위반.

### get_space_health

Space의 규칙 위반 페이지(규칙·개수·첫 줄)와 깨진 위키 링크. 문서 정리 작업을 시작할 때 씁니다.

## 쓰기 (편집자)

### create_page

| 입력 | 설명 |
|---|---|
| `space` | Space 키 |
| `title` | 제목 (본문에 H1을 쓰지 않음) |
| `content?` | 속성 포함 전체 Markdown |
| `template?` | 문서 유형(예: `meeting`) 또는 커스텀 템플릿 id — 필수 섹션이 채워진 채 시작 |
| `parent?` | 부모 페이지 짧은 id (없으면 맨 위) |
| `after?` | 이 형제 뒤에 놓기 |

```text
Created PAY/k3x9q1 "주간 회의 2026-09-28" revision=1
https://clavis.crawl-proxy.workers.dev/s/PAY/p/주간-회의-2026-09-28-k3x9q1
```

### update_page

문서 전체를 교체합니다.

| 입력 | 설명 |
|---|---|
| `page` | 페이지 |
| `content` | 속성 포함 전체 Markdown |
| `baseRevision` | `read_page`에서 받은 revision (필수) |
| `title?` | 새 제목. 다른 문서의 `[[옛 제목]]` 링크가 자동으로 고쳐지고, 고친 문서 수를 알려 줍니다 |

그사이 누가 저장했으면 실패합니다 → `read_page`로 다시 읽고 변경을 다시 적용합니다.

### update_section

섹션 하나만 고칩니다. 그사이 다른 섹션이 바뀌었어도 충돌하지 않습니다.

| 입력 | 설명 |
|---|---|
| `page`, `section` | 페이지, 섹션 |
| `mode` | `replace`: 섹션 본문 교체 (같은 레벨 헤딩으로 시작하면 헤딩도 바뀜) · `append`: 섹션 끝에 추가 |
| `content` | 넣을 Markdown |
| `baseSectionHash?` | `replace`에 필수 — `read_section`·`list_sections`의 hash |

- `append`는 목록 항목이면 기존 목록에 이어 붙고, 문단이면 빈 줄로 나뉩니다. 회의록 액션 아이템, 로그 추가에 알맞습니다.
- 섹션이 그사이 바뀌었으면 최신 섹션과 새 hash를 알려 주므로 다시 적용합니다.

### set_page_meta

본문을 보내지 않고 속성만 바꿉니다 (YAML의 주석·순서 유지).

| 입력 | 설명 |
|---|---|
| `page` | 페이지 |
| `status?` | `draft`·`review`·`approved`·`deprecated` |
| `owner?` | 담당 |
| `tags?` | 태그 목록 (전체 교체) |

### move_page

| 입력 | 설명 |
|---|---|
| `page` | 페이지 |
| `parent?` | 새 부모 짧은 id, 맨 위는 `null`, 생략하면 부모 유지 |
| `after?` / `before?` | 이 형제 뒤 / 앞에 |

### delete_page

페이지와 모든 하위 페이지를 휴지통으로 (30일 안에 사람이 복원 가능). "Moved N page(s) to the trash."

## 변경 기록

### list_revisions

| 입력 | 설명 |
|---|---|
| `page` | 페이지 |
| `before?` | 이 번호보다 오래된 것만 (다음 쪽) |

```text
- r7 2026-09-28T09:12Z Adam (agent) update 12034B "결제 API 설계"
- r6 2026-09-28T08:55Z toby (human) update 11890B "결제 API 설계"
- r5 2026-09-27T14:02Z toby (human) restore from r3 11020B "결제 API 설계"
More: list_revisions before=5
```

### read_revision

| 입력 | 설명 |
|---|---|
| `page`, `revision` | 페이지, 버전 번호 |

그 버전의 원문. 주석에 누가 어떤 종류로 저장했는지.

### restore_revision (편집자)

| 입력 | 설명 |
|---|---|
| `page`, `revision` | 되살릴 버전 |
| `baseRevision?` | 페이지가 아직 이 revision일 때만 |

옛 본문을 **새 버전으로 저장**합니다 (기록 유지, 제목 그대로). 옛 본문이 지금 규칙에 걸리면 저장되지 않습니다.

## 댓글

### list_comments

| 입력 | 설명 |
|---|---|
| `page` | 페이지 |
| `includeResolved?` | 해결된 스레드도 |

```text
- [01J…] toby on #범위: 환불도 넣어 주세요
  - [01J…] Adam (agent): 넣었습니다.
```

### add_comment

| 입력 | 설명 |
|---|---|
| `page` | 페이지 |
| `body` | Markdown. 사람을 부를 때는 `@이름` |
| `replyTo?` | 답글을 달 댓글 id (없으면 새 스레드) |
| `section?` | 새 스레드가 가리킬 섹션 id |

뷰어 에이전트도 댓글을 달 수 있습니다.

### resolve_comment (편집자)

| 입력 | 설명 |
|---|---|
| `comment` | 스레드 안의 아무 댓글 id |
| `reopen?` | `true`면 다시 열기 |

## 알림

### list_notifications

| 입력 | 설명 |
|---|---|
| `all?` | 읽은 것도 (기본: 안 읽은 것만) |

```text
2 unread
- [01K…] mention by toby on PAY/a1b2c3 "결제 API 설계" comment=01J…
```

에이전트는 `@멘션`만 받습니다.

### mark_notifications_read

| 입력 | 설명 |
|---|---|
| `ids?` | 알림 id 목록 (생략하면 전부) |

## 자주 쓰는 흐름

### 새 회의록

```text
list_templates space=TEAM                  → meeting의 필수 섹션 확인
create_page    space=TEAM title="주간 회의 2026-09-28" template=meeting
update_section page=k3x9q1 section=참석자 mode=append content="- 토비"
set_page_meta  page=k3x9q1 status=review
```

### 큰 문서의 한 부분 고치기

```text
list_sections  page=a1b2c3
read_section   page=a1b2c3 section=설계          → 본문 + hash
update_section page=a1b2c3 section=설계 mode=replace content=<새 본문> baseSectionHash=<hash>
```

### 멘션으로 받은 일 처리

```text
list_notifications                           → mention … comment=01J…
list_comments  page=a1b2c3                   → "@Adam 액션 아이템 정리해 줘"
update_section page=a1b2c3 section=액션-아이템 …
add_comment    page=a1b2c3 replyTo=01J… body="정리했습니다."
resolve_comment comment=01J…
mark_notifications_read ids=["01K…"]
```

### 관련 내용 찾아 답하기

```text
semantic_search query="환불은 언제까지 가능한가"  → section=환불-정책
read_section    page=a1b2c3 section=환불-정책
```

### 잘못 고친 것 되돌리기

```text
list_revisions   page=a1b2c3                 → r7이 잘못, r6이 좋음
read_revision    page=a1b2c3 revision=6      → 확인
restore_revision page=a1b2c3 revision=6
```
