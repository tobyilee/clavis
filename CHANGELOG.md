# 변경 내역

Clavis의 주요 변경을 기록합니다. 형식은 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)를 따르고, 0.9.0부터 [유의적 버전](https://semver.org/lang/ko/)으로 묶습니다(그 전은 날짜로 묶었습니다).

## 쓰는 방법

- 사용자·에이전트·설치한 사람에게 보이는 변경을 **그 변경과 같은 커밋에서** `[Unreleased]`에 적습니다. 테스트·리팩터링·오타 수정은 적지 않습니다.
- 릴리스할 때 루트 `package.json`의 `version`을 올리고, `[Unreleased]` 제목을 `[새 버전] - 날짜`로 바꾼 뒤 그 위에 빈 `[Unreleased]`를 새로 둡니다. 1.0 전에는 기능 추가·동작 변경이면 가운데 자리(0.9.0 → 0.10.0), 수정만이면 끝자리(0.9.0 → 0.9.1)를 올립니다. 절차는 [README의 버전](README.md#버전).
- 분류: **추가** · **변경** · **수정** · **제거** · **보안** · **업데이트할 때 할 일**(직접 설치한 곳에서 새 리소스 만들기, 설정 바꾸기처럼 손으로 해야 하는 일 — [설치 가이드 §9](docs/guides/install.md#9-업데이트)). 빈 분류는 쓰지 않습니다.
- 한 줄에 하나씩, 무엇이 달라졌는지 씁니다. 관련 결정(`D-xx`)이나 문서가 있으면 괄호로 붙입니다.

## [Unreleased]

### 추가

- 사용 매뉴얼: CLAVIS Space의 「Clavis 사용 매뉴얼」과 하위 페이지 14개를 Markdown 원문 그대로 저장소에 둠. 파일 이름은 페이지 제목 ([`docs/manual`](docs/manual))
- `scripts/cf-as.sh <별칭> <wrangler 인자>`: `.agent.env`의 `CLOUDFLARE_API_TOKEN_<별칭>`으로 브라우저 로그인 없이 그 사용자로 wrangler 실행 (README **Cloudflare 계정 바꾸기**)
- 사이드바 폭 조절: 데스크톱에서 사이드바 오른쪽 경계를 끌어 200px~560px(창 폭의 절반까지)로 넓히거나 좁힘. 경계에 포커스를 두고 ←/→ 키로도 바뀌고, 더블클릭하면 기본 폭으로 돌아감. 폭은 브라우저마다 기억함
- 사이드바 페이지 트리·즐겨찾기에서 잘린 제목에 마우스를 올리면 전체 제목이 툴팁으로 보임
- `agent:create`에 `--config wrangler.<별칭>.jsonc`(다른 계정의 인스턴스에 에이전트 등록)와 `--key`(`.agent.env`에 저장할 이름). `.agent.env`의 주석·빈 줄을 지우지 않음

### 변경

- 설치 가이드: Access에 로그인 방법(Google·GitHub 등) 추가하기 — 새 대시보드 위치 **Integrations → Identity providers**와 앱의 **Login methods** 탭, 정책별로 누가 들어오는지(**Cloudflare account**, **Everyone** + 관리자 승인)와 무료 플랜 50명 자리, 문제 해결 항목 ([`docs/guides/install.md`](docs/guides/install.md#로그인-방법-추가-선택))

## [0.9.0] - 2026-09-30

### 추가

- 버전: 0.9.0부터 루트 `package.json` 한 곳에서 버전을 매김. 사이드바 맨 아래 `Clavis v0.9.0`(마우스를 올리면 빌드한 커밋), `/api/v1/health`의 `version`, MCP 서버 정보에 같은 번호 (D-69)
- 사이트 제목: 관리 → **일반**에서 정하면 화면 왼쪽 위와 브라우저 탭에 `Clavis - 제목`으로 보임. `GET /site`, `PUT /admin/site` (D-64, D-65)
- 표시 이름: 헤더의 계정 메뉴에서 내 이름을 바꾸고, 지난 기록에도 새 이름이 보임. `PATCH /me` (D-66, D-67)

### 변경

- 설치 가이드: Worker의 **Access** 탭으로 Access를 켜는 새 대시보드 경로, 이미 다른 계정에 배포 중인 저장소에서 별도 설정 파일(`wrangler.personal.jsonc`, git 제외)로 설치하는 방법, R2 활성화·메타데이터 인덱스 확인·workers.dev 서브도메인 안내와 문제 해결 항목 ([`docs/guides/install.md`](docs/guides/install.md))
- 사람·에이전트 이름은 새로 정하거나 바꿀 때 대소문자를 무시하고 겹칠 수 없음(409 `name-taken`), `[`·`]`·줄바꿈은 쓸 수 없음 (D-68)
- 댓글의 `@멘션`이 쓸 때의 이름 대신 지금 이름으로 보임
- 폰 헤더: 사이트 제목 자리를 위해 검색은 아이콘으로, 언어 선택은 계정 메뉴로
- Worker 변수 `APP_VERSION`을 없앰 (버전은 빌드에 들어감)
- README에 **Cloudflare 계정 바꾸기**: 계정마다 `apps/worker/wrangler.<별칭>.jsonc`를 두고 `-c`로 골라 배포, 로그인 바꾸기·API 토큰 방법. `.gitignore`는 `wrangler.*.jsonc`를 모두 뺌

### 수정

- Space 키가 길면 사이드바의 Space 목록, 홈의 문서 목록, 관리 → Space에서 키가 이름과 겹치던 문제 (키 칸을 가장 긴 키에 맞춤)

### 업데이트할 때 할 일

- D1 마이그레이션 `0012_settings`: GitHub Actions 자동 배포면 할 일 없음. 직접 배포하면 먼저 `pnpm exec wrangler d1 migrations apply DB --remote` ([설치 가이드 §9](docs/guides/install.md#9-업데이트))
- 계정별 설정 파일(`wrangler.<별칭>.jsonc`)의 `vars.APP_VERSION`은 더 쓰이지 않으므로 지워도 됨

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
