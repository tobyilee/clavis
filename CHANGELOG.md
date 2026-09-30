# 변경 내역

Clavis의 주요 변경을 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)를 따르되, 버전 태그 없이 날짜로 묶습니다.

## 쓰는 방법

- 사용자·에이전트·설치한 사람에게 보이는 변경을 **그 변경과 같은 커밋에서** `[Unreleased]`에 적습니다. 테스트·리팩터링·오타 수정은 적지 않습니다.
- 묶음(Phase의 Step, 기능 하나)이 `main`에 배포되면 `[Unreleased]` 제목을 날짜로 바꾸고, 그 위에 빈 `[Unreleased]`를 새로 둡니다.
- 분류: **추가** · **변경** · **수정** · **제거** · **보안** · **업데이트할 때 할 일**(직접 설치한 곳에서 새 리소스 만들기, 설정 바꾸기처럼 손으로 해야 하는 일 — [설치 가이드 §9](docs/guides/install.md#9-업데이트)). 빈 분류는 쓰지 않습니다.
- 한 줄에 하나씩, 무엇이 달라졌는지 씁니다. 관련 결정(`D-xx`)이나 문서가 있으면 괄호로 붙입니다.

## [Unreleased]

### 변경

- 설치 가이드: Worker의 **Access** 탭으로 Access를 켜는 새 대시보드 경로, 이미 다른 계정에 배포 중인 저장소에서 별도 설정 파일(`wrangler.personal.jsonc`, git 제외)로 설치하는 방법, R2 활성화·메타데이터 인덱스 확인·workers.dev 서브도메인 안내와 문제 해결 항목 ([`docs/guides/install.md`](docs/guides/install.md))

## 2026-09-29

### 추가

- 설치 가이드: 누구나 자기 Cloudflare 계정에 설치해 운영하는 방법 ([`docs/guides/install.md`](docs/guides/install.md))
- README, 이 변경 내역
- 에이전트 연결 가이드: 사용자별 에이전트 등록 절차(요청 → 관리자 → 보관 → 확인), Claude Desktop(`mcp-remote`)·Cursor·VS Code 설정, 토큰 교체·폐기, 자주 묻는 질문
- `.agent.env.example`(에이전트 자격 증명 파일 형식), `.gitleaks.toml`(비밀 값 검사 설정)

### 변경

- 저장소 문서의 예시 주소를 `https://clavis.<서브도메인>.workers.dev`로 바꿈 (특정 설치의 주소를 싣지 않음)

### 수정

- `APP_ORIGIN`을 바꾼 설치에서 실패하던 Webhook 단위 테스트

## 2026-09-28 — Phase 3: 안전한 편집·알림·의미 검색

### 추가

- 버전 기록: 모든 저장이 버전으로 남고, 차이 보기와 복원. MCP `list_revisions`·`read_revision`·`restore_revision` (D-54)
- 알림: 헤더의 벨, 문서 지켜보기, 댓글 `@멘션`(자동 완성), 에이전트 수정 알림 끄기. MCP `list_notifications`·`mark_notifications_read`
- Space 알림 채널: Slack Incoming Webhook, 서명된 JSON Webhook, 테스트 전송과 최근 전달 기록
- 의미 검색(뜻으로 찾기): H2 섹션 단위 색인(Workers AI bge-m3 + Vectorize), 글자 검색과 합쳐 순위. MCP `semantic_search`, 관리 → 의미 검색 (D-61~D-63)
- 관리 화면에서 에이전트 이름 변경

### 변경

- 화면을 GitHub 라이트 테마와 GitHub Markdown 스타일로
- 저장 뒤 작업(알림·Webhook·색인)을 Queue 소비자가 따로 처리 (D-60)

### 업데이트할 때 할 일

- Queue `clavis-events`, Vectorize 인덱스 `clavis-chunks`(1024차원, cosine, 메타데이터 인덱스 `space`·`docType`을 벡터보다 먼저)를 만든다. Workers AI는 만들 것 없음 ([설치 가이드 §2](docs/guides/install.md#2-리소스-만들기))

## 2026-09-28 — Phase 2: 팀 생산성 & AI 연동

### 추가

- 백링크, 문서 상태 대시보드(규칙 위반·깨진 링크). MCP `get_backlinks`·`get_space_health`
- 섹션 단위 편집과 속성만 바꾸기. MCP `list_sections`·`read_section`·`update_section`·`set_page_meta` (D-48)
- 댓글: 섹션에 연결된 스레드, 답글, 해결. 에이전트도 참여 (`list_comments`·`add_comment`·`resolve_comment`)
- Space 설정: 규칙 수준, 유형별 필수 섹션, 긴 문서 기준, 커스텀 템플릿 (D-47)
- 홈(즐겨찾기·최근 본·최근 변경·내 문서의 열린 댓글), 페이지 원본 `.md`와 `llms.txt`, AI용 복사 (D-51)
- 폰 편집: 키보드 위 서식 툴바, 사진 첨부(긴 변 2000px JPEG로 줄임), 속성·문제 시트

### 변경

- 사람의 호출 한도를 1분 600번으로 (에이전트는 120번 그대로)

### 수정

- 다크 모드에서 에디터 커서가 보이지 않음
- iOS Safari에서 입력칸을 누르면 화면이 확대되어 저장 버튼이 가려짐

## 2026-09-27 — Phase 1: MVP

### 추가

- Space와 페이지 트리(끌어서 이동), 한글 제목 URL
- Markdown 편집기(CodeMirror 6, 분할 미리보기, 초안 보관)와 속성(frontmatter) 폼
- 문서 유형별 템플릿 7종과 문서 규칙(lint) — 편집 중과 저장할 때 같은 규칙
- 위키 링크 `[[제목]]`. 제목을 바꾸면 다른 문서의 링크도 고쳐짐 (D-42)
- 첨부 파일, 전문 검색, 휴지통(30일), 관리 화면(사람 승인·역할, 에이전트·토큰, Space)
- REST API(OpenAPI)와 MCP 쓰기 도구(`create_page`·`update_page`·`move_page`·`delete_page` 등)

## 2026-09-27 — Phase 0: 기반

### 추가

- Worker 하나에 웹 화면·REST·MCP, D1·R2
- 인증: 사람은 Cloudflare Access, 에이전트는 Access 서비스 토큰 + Clavis API 토큰. 처음 로그인한 사람이 관리자, 이후는 승인 대기 (D-05, D-29)
- 에이전트 호출 한도(1분 120번), 야간 분할 Markdown 백업(14일 보관), GitHub Actions 검사·배포
