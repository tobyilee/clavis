# AI 에이전트 연결 가이드 (MCP)

> 대상: Claude Code, Claude Desktop, Cursor, VS Code, Hermes Agent 등 MCP 클라이언트 · 작성일: 2026-09-27 · 갱신: 2026-09-29 (사용자별 에이전트 등록 절차, 클라이언트 추가)
> 예시의 `https://clavis.<서브도메인>.workers.dev`는 내가 설치한 Clavis 주소로 바꿔 읽습니다([설치 가이드](./install.md)).

사용자가 **자기 AI 에이전트**를 Clavis에 등록하고 MCP로 연결하는 순서:

| 단계 | 누가 | 할 일 | 절 |
|---|---|---|---|
| 1 | 사용자 | 에이전트 이름·역할을 정해 관리자에게 요청 | §1.1 |
| 2 | 관리자 | 에이전트 추가, Clavis 토큰 발급, 서비스 토큰 준비, 안전하게 전달 | §1.2 |
| 3 | 사용자 | 받은 값 세 개를 환경 변수로 보관 | §1.3 |
| 4 | 사용자 | `curl`로 연결 확인 | §2 |
| 5 | 사용자 | 쓰는 클라이언트에 MCP 서버 등록 | §3 |
| 6 | 사용자 | SANDBOX에서 첫 작업 | §4 |

## 1. 에이전트 등록

에이전트는 사람과 별개인 **계정**입니다. 자기 이름(🤖)과 역할을 갖고, 로그인 대신 **토큰**으로 접속합니다. 에이전트를 만들고 토큰을 발급하는 일은 **관리자만** 할 수 있으므로, 사용자는 관리자에게 요청합니다.

### 1.1 등록 요청 (사용자)

요청하기 전에 세 가지를 정합니다.

| 정할 것 | 권장 |
|---|---|
| 이름 | 주인과 도구가 드러나고 **공백이 없는** 이름. 예: `minsu-claude`, `jiyoung-cursor`. 문서·댓글·변경 기록에 이 이름이 🤖와 함께 표시되고, 댓글에서 `@minsu-claude`로 부릅니다(이름에 공백이 있으면 `@` 목록에서 골라야만 멘션됨) |
| 역할 | **편집**(editor): 문서를 만들고 고침, 도구 25개 · **읽기**(viewer): 찾고 읽고 댓글만, 도구 17개. 읽기만 필요하면 읽기로 |
| 클라이언트 | Claude Code, Claude Desktop, Cursor, VS Code, Hermes 등. 도구마다 에이전트를 따로 두면 작성자 표시와 호출 한도(120회/분)가 나뉩니다 |

요청 예 (관리자에게 메시지로):

```text
Clavis 에이전트 등록 부탁드립니다.
- 이름: minsu-claude
- 역할: 편집
- 용도: Claude Code에서 설계 문서 초안 작성, 회의록 정리
```

- 에이전트의 역할은 요청한 사람의 역할과 **무관**합니다. 에이전트는 자기 역할대로 움직이고, 작성자로는 에이전트 이름이 남습니다. Clavis는 에이전트의 주인을 따로 기록하지 않으므로 이름으로 드러냅니다.
- 에이전트는 관리자 역할을 가질 수 없습니다(편집·읽기만).

### 1.2 관리자가 할 일

1. **관리 → AI 에이전트** 탭에서 같은 이름이 없는지 확인한다. 이름 중복은 막지 않는다.
2. **에이전트 이름**과 **역할**을 넣고 **에이전트 추가**.
3. 그 행의 **토큰 발급** → 대화상자의 `clv_…` 토큰을 **복사**. 대화상자를 닫으면 다시 볼 수 없다.
4. **서비스 토큰**(Cloudflare Access)을 준비한다. 둘 중 하나:
   - **공용 서비스 토큰을 나눠 준다** — 간단하지만, 한 사람에게서 유출되면 모두의 설정을 바꿔야 한다.
   - **사람마다 서비스 토큰을 만든다 (권장)** — Cloudflare 대시보드 → Zero Trust → **Service Tokens** 화면(메뉴 위치는 대시보드 버전에 따라 Access → Service Auth 또는 Access controls → Service credentials)에서 **Create Service Token**(이름 예: `clavis-minsu`, 기간 선택). Client Secret은 만든 직후에만 보인다. 그다음 Clavis의 Access 애플리케이션(`clavis - Cloudflare Workers`) → Policies → Action이 **Service Auth**인 정책의 Include에 새 토큰을 추가한다. Action이 `Allow`면 Access가 서비스 토큰을 무시한다.
   - 서비스 토큰만으로는 문서를 볼 수 없다(Clavis가 401). 그래도 비밀로 다룬다.
5. 값 세 개(Client ID, Client Secret, `clv_…` 토큰)를 **기록이 남지 않는 방법**으로 전달한다: 비밀번호 관리자의 공유 항목, 한 번 열면 사라지는 링크 등. 채팅·메일·Clavis 문서·댓글에 붙이지 않는다.

> 운영자용 부트스트랩 CLI (관리 화면이 생기기 전의 방법): `pnpm --filter @clavis/worker agent:create --name <이름> [--role viewer]` → 토큰은 저장소 루트 `.agent.env`에만 기록되고 출력되지 않는다. `.agent.env`는 쉘로 `source`하지 않고 `eval "$(python3 scripts/agent-env.py)"`로 읽는다.

### 1.3 받은 값 보관 (사용자)

값 세 개를 환경 변수로 둡니다. 이 문서의 예시는 모두 이 이름을 씁니다.

| 환경 변수 | 값 | 보내는 헤더 |
|---|---|---|
| `CLAVIS_CF_ACCESS_CLIENT_ID` | 서비스 토큰의 Client ID | `CF-Access-Client-Id` |
| `CLAVIS_CF_ACCESS_CLIENT_SECRET` | 서비스 토큰의 Client Secret | `CF-Access-Client-Secret` |
| `CLAVIS_TOKEN` | `clv_…` | `Authorization: Bearer clv_…` |

macOS·Linux — 권한을 좁힌 파일에 두고 셸 설정에서 읽습니다:

```sh
mkdir -p ~/.config/clavis && touch ~/.config/clavis/env && chmod 600 ~/.config/clavis/env
# 편집기로 ~/.config/clavis/env에 세 줄을 넣는다 (= 앞뒤 공백 없이, 값은 작은따옴표로)
#   export CLAVIS_CF_ACCESS_CLIENT_ID='…'
#   export CLAVIS_CF_ACCESS_CLIENT_SECRET='…'
#   export CLAVIS_TOKEN='clv_…'
echo '[ -f ~/.config/clavis/env ] && . ~/.config/clavis/env' >> ~/.zshrc
```

macOS 키체인에 두려면 (나머지 두 값도 같은 방식):

```sh
security add-generic-password -a "$USER" -s clavis-token -w   # 값을 물으면 clv_… 붙여넣기
# ~/.zshrc에:
export CLAVIS_TOKEN="$(security find-generic-password -a "$USER" -s clavis-token -w)"
```

- 값을 명령줄에 직접 치지 않습니다(셸 기록에 남음). 이 파일을 dotfiles 저장소에 넣지 않습니다.
- 클라이언트 설정 파일(`~/.claude.json`, `claude_desktop_config.json` 등)에도 값이 평문으로 저장될 수 있습니다. 그 파일을 공유하지 않습니다.

## 2. 엔드포인트와 연결 확인

- URL: `https://clavis.<서브도메인>.workers.dev/mcp`
- 전송 방식: Streamable HTTP (Stateless)
- 헤더 세 개: 서비스 토큰(`CF-Access-Client-Id`·`CF-Access-Client-Secret`)은 Cloudflare Access를 통과하는 **출입증**, `Authorization: Bearer clv_…`는 **어느 에이전트인지**를 밝힌다. 둘 다 있어야 한다.
- 도구: §5 참고 (편집 에이전트는 25개, 읽기 에이전트는 쓰기 도구를 뺀 17개)
- 호출 한도: 에이전트마다 1분에 120번 (같은 에이전트의 토큰끼리 나눠 씀)

클라이언트에 등록하기 전에 값이 맞는지 확인합니다:

```sh
curl -sS -w '\nHTTP %{http_code}\n' https://clavis.<서브도메인>.workers.dev/api/v1/me \
  -H "CF-Access-Client-Id: $CLAVIS_CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CLAVIS_CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $CLAVIS_TOKEN"
```

```text
{"id":"01K…","kind":"agent","name":"minsu-claude","email":null,"role":"editor"}
HTTP 200
```

`kind`가 `agent`이고 이름·역할이 요청한 대로면 됩니다. `HTTP 302`면 서비스 토큰, `HTTP 401`이면 Clavis 토큰 문제입니다(§9).

MCP 도구 목록까지 확인하려면:

```sh
curl -sS https://clavis.<서브도메인>.workers.dev/mcp \
  -H "CF-Access-Client-Id: $CLAVIS_CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CLAVIS_CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $CLAVIS_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -o '"name":"[a-z_]*"'
```

## 3. 클라이언트별 설정

### Claude Code

모든 프로젝트에서 쓰기 (내 설정에만 저장):

```sh
claude mcp add --transport http --scope user clavis https://clavis.<서브도메인>.workers.dev/mcp \
  --header "CF-Access-Client-Id: $CLAVIS_CF_ACCESS_CLIENT_ID" \
  --header "CF-Access-Client-Secret: $CLAVIS_CF_ACCESS_CLIENT_SECRET" \
  --header "Authorization: Bearer $CLAVIS_TOKEN"
```

- 셸이 값을 펼쳐서 `~/.claude.json`에 저장합니다. 토큰을 바꾸면 `claude mcp remove clavis --scope user` 후 다시 추가합니다.

팀 저장소에 함께 두기 — 저장소 루트의 `.mcp.json`. 값 대신 환경 변수 이름만 들어가므로 커밋해도 되고, 사람마다 자기 에이전트 토큰으로 접속합니다:

```json
{
  "mcpServers": {
    "clavis": {
      "type": "http",
      "url": "https://clavis.<서브도메인>.workers.dev/mcp",
      "headers": {
        "CF-Access-Client-Id": "${CLAVIS_CF_ACCESS_CLIENT_ID}",
        "CF-Access-Client-Secret": "${CLAVIS_CF_ACCESS_CLIENT_SECRET}",
        "Authorization": "Bearer ${CLAVIS_TOKEN}"
      }
    }
  }
}
```

- 처음 열 때 Claude Code가 이 서버를 쓸지 묻습니다. 환경 변수를 읽은 셸에서 `claude`를 실행해야 합니다.
- 확인: `claude mcp list`에서 clavis가 연결됨(✓)으로 나오고, 세션 안의 `/mcp`에서 도구 수(25 또는 17)가 보이면 됩니다.

### Claude Desktop

Claude Desktop의 커넥터 추가 화면은 요청 헤더를 넣을 수 없어서, `mcp-remote`가 중간에서 헤더를 붙여 줍니다. Node.js 18 이상이 필요합니다.

설정 → 개발자 → **구성 편집**으로 여는 `claude_desktop_config.json`(macOS `~/Library/Application Support/Claude/`, Windows `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "clavis": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "https://clavis.<서브도메인>.workers.dev/mcp",
        "--header", "CF-Access-Client-Id:${CF_ID}",
        "--header", "CF-Access-Client-Secret:${CF_SECRET}",
        "--header", "Authorization:${CLAVIS_AUTH}"
      ],
      "env": {
        "CF_ID": "<Client ID>",
        "CF_SECRET": "<Client Secret>",
        "CLAVIS_AUTH": "Bearer clv_…"
      }
    }
  }
}
```

- 헤더는 `이름:${변수}`처럼 **콜론 뒤에 공백 없이** 씁니다. `mcp-remote`가 `${…}`를 `env` 값으로 바꿔 넣고, 인자 안의 공백이 깨지는 문제(Windows)를 피합니다. `Bearer` 뒤의 공백은 `env` 값 안에 둡니다.
- Dock에서 연 앱은 셸 환경 변수를 읽지 않으므로 값은 `env`에 직접 넣습니다. 이 파일을 공유하지 않습니다.
- 저장한 뒤 Claude Desktop을 완전히 종료했다가 다시 엽니다. 채팅 입력창의 도구 메뉴에 clavis가 보이면 됩니다.

### Cursor

`~/.cursor/mcp.json`(모든 프로젝트) 또는 프로젝트의 `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "clavis": {
      "url": "https://clavis.<서브도메인>.workers.dev/mcp",
      "headers": {
        "CF-Access-Client-Id": "${env:CLAVIS_CF_ACCESS_CLIENT_ID}",
        "CF-Access-Client-Secret": "${env:CLAVIS_CF_ACCESS_CLIENT_SECRET}",
        "Authorization": "Bearer ${env:CLAVIS_TOKEN}"
      }
    }
  }
}
```

- `${env:…}`를 지원하지 않는 옛 버전이면 값을 직접 넣습니다(그 파일은 커밋하지 않음).
- Cursor 설정의 MCP 화면에서 clavis가 켜져 있고 도구 수가 보이면 됩니다.

### VS Code (Copilot 에이전트 모드)

프로젝트의 `.vscode/mcp.json`. 값은 처음 연결할 때 물어보고 VS Code가 안전하게 보관합니다:

```json
{
  "inputs": [
    { "type": "promptString", "id": "clavis-cf-id", "description": "Clavis 서비스 토큰 Client ID" },
    { "type": "promptString", "id": "clavis-cf-secret", "description": "Clavis 서비스 토큰 Client Secret", "password": true },
    { "type": "promptString", "id": "clavis-token", "description": "Clavis 토큰 (clv_…)", "password": true }
  ],
  "servers": {
    "clavis": {
      "type": "http",
      "url": "https://clavis.<서브도메인>.workers.dev/mcp",
      "headers": {
        "CF-Access-Client-Id": "${input:clavis-cf-id}",
        "CF-Access-Client-Secret": "${input:clavis-cf-secret}",
        "Authorization": "Bearer ${input:clavis-token}"
      }
    }
  }
}
```

- 명령 팔레트 → **MCP: List Servers**에서 clavis를 시작하고 상태를 봅니다.

### Hermes Agent

`~/.hermes/config.yaml`:

```yaml
mcp_servers:
  clavis:
    url: "https://clavis.<서브도메인>.workers.dev/mcp"
    headers:
      CF-Access-Client-Id: "${CLAVIS_CF_ACCESS_CLIENT_ID}"
      CF-Access-Client-Secret: "${CLAVIS_CF_ACCESS_CLIENT_SECRET}"
      Authorization: "Bearer ${CLAVIS_TOKEN}"
```

`~/.hermes/.env` (따옴표·공백 없이):

```sh
CLAVIS_CF_ACCESS_CLIENT_ID=...
CLAVIS_CF_ACCESS_CLIENT_SECRET=...
CLAVIS_TOKEN=clv_...
```

확인:

```bash
hermes mcp test clavis     # 서버 응답·HTTP 상태 진단
hermes mcp catalog         # 등록된 서버 목록
```

Hermes 실행 중이라면 `/reload-mcp`로 다시 읽는다.

### 그 밖의 클라이언트

Streamable HTTP로 연결하면서 요청 헤더를 정할 수 있으면 위 주소와 헤더 세 개로 연결됩니다. 헤더를 넣을 수 없는 stdio 클라이언트는 Claude Desktop처럼 `mcp-remote`를 거칩니다. OAuth 로그인만 받는 커넥터(claude.ai 웹·모바일의 커넥터 등)로는 연결할 수 없습니다.

## 4. 처음 해 볼 일

연결되면 **SANDBOX** Space에서 먼저 써 봅니다. 에이전트 채팅에:

```text
Clavis에 연결됐는지 확인해 줘. Space 목록을 보여 주고,
SANDBOX Space에 "연결 테스트 - minsu-claude" 노트 페이지를 만들어 오늘 날짜를 적어 줘.
```

- 웹에서 그 페이지를 열어 작성자가 🤖 `minsu-claude`인지 확인하고, 다 봤으면 삭제합니다(휴지통).
- 읽기 에이전트라면 "Clavis에서 환불 정책 문서를 찾아 요약해 줘"처럼 찾고 읽는 일부터 합니다.
- **멘션으로 일 맡기기**: 댓글에 `@minsu-claude 액션 아이템 정리해 줘`라고 남겨도 Clavis가 에이전트를 깨우지는 않습니다. 에이전트에게 "Clavis 알림 확인해서 처리해 줘"라고 시키면 `list_notifications`로 멘션을 찾아 처리하고 답글을 답니다(§5 멘션 처리 흐름).

## 5. 도구 목록

| 도구 | 권한 | 용도 |
|---|---|---|
| `list_spaces` · `get_space_tree` | viewer | Space와 페이지 트리 탐색 |
| `search_pages` | viewer | 제목·본문 전문 검색 (3글자 이상은 색인, 짧으면 부분 일치) |
| `semantic_search` | viewer | 뜻으로 찾기: 질문처럼 써도 되고, 결과마다 가장 가까운 섹션 id(`section=`)와 앞부분 → `read_section`으로 이어 읽기 |
| `read_page` | viewer | frontmatter 포함 원문 + `revision` |
| `list_templates` · `lint_markdown` | viewer | 템플릿과 필수 섹션 확인(`space`를 주면 그 Space의 커스텀 템플릿과 규칙 반영), 저장 전 검사 |
| `get_backlinks` | viewer | 이 페이지를 링크하는 문서 (이름 변경·삭제 전 확인) |
| `get_space_health` | viewer | Space의 규칙 위반 페이지(규칙·개수·첫 줄)와 깨진 위키 링크 |
| `create_page` | editor | 새 페이지 (`template`으로 시작하면 필수 섹션이 채워짐) |
| `update_page` | editor | 원문 전체 교체. `baseRevision` 필수 |
| `list_sections` · `read_section` | viewer | 페이지의 섹션(헤딩) 목록과 id·해시, 섹션 하나 읽기 |
| `update_section` | editor | 섹션 하나 교체(`baseSectionHash` 필수) 또는 끝에 추가(`append`) |
| `set_page_meta` | editor | status·owner·tags만 변경 (본문을 보내지 않음) |
| `list_comments` · `add_comment` | viewer | 페이지 댓글 스레드 읽기, 댓글·답글 달기 (`read_page`에 `open_comments=N` 표시) |
| `resolve_comment` | editor | 스레드 해결 / 다시 열기 |
| `move_page` · `delete_page` | editor | 이동, 휴지통으로 이동 (30일 내 복원 가능) |
| `list_revisions` · `read_revision` | viewer | 누가 언제 바꿨는지(버전 목록), 옛 버전 원문 |
| `restore_revision` | editor | 옛 버전 본문을 새 버전으로 저장 (잘못 고친 것 되돌리기) |
| `list_notifications` · `mark_notifications_read` | viewer | 나를 `@멘션`한 댓글 등 알림, 처리 후 읽음 |

viewer 역할 에이전트에게는 쓰기 도구가 목록에 나타나지 않습니다.

### 쓰기 흐름 예시 (회의록)

```
list_templates space=TEAM                      → 커스텀 템플릿(id)과 meeting의 필수 섹션 확인
create_page  space=TEAM title="주간 회의 2026-09-27" template=meeting   # 또는 커스텀 템플릿 id
                                               → "Created TEAM/k3x9q1 … revision=1" + 페이지 URL
read_page    page=k3x9q1                       → 원문 + revision=1
update_page  page=k3x9q1 content=<수정한 원문 전체> baseRevision=1
                                               → "Updated … revision=2", 경고가 있으면 줄 번호와 함께
```

### 섹션 단위 수정 (큰 문서, 여러 사람이 함께 쓰는 문서)

```
list_sections   page=k3x9q1                    → "- ## 액션 아이템  id=액션-아이템 lines=20-23 hash=1a2b3c4d" …
update_section  page=k3x9q1 section=액션-아이템 mode=append content="- [ ] 환불 정책 초안"
                                               → 목록 끝에 항목 추가 (base 불필요)
read_section    page=k3x9q1 section="결정 사항"  → 섹션 원문 + hash
update_section  page=k3x9q1 section="결정 사항" mode=replace content=<새 본문> baseSectionHash=<hash>
set_page_meta   page=k3x9q1 status=review
```

- 섹션 id는 페이지 목차의 앵커와 같습니다(`…/p/회의-k3x9q1#액션-아이템`). 헤딩 텍스트로 불러도 됩니다.
- `replace`는 **그 섹션만** 바뀌지 않았으면 저장됩니다. 그사이 사람이 다른 섹션을 고쳤어도 충돌하지 않습니다. 섹션이 바뀌었으면 최신 섹션 내용과 새 해시를 알려 주니 다시 적용하세요.
- `append`는 섹션 마지막 줄 뒤에 붙입니다. 목록 항목은 기존 목록에 이어지고, 문단은 빈 줄로 나뉩니다.

### 댓글 반영 흐름

```
read_page       page=k3x9q1                    → 헤더에 open_comments=1
list_comments   page=k3x9q1                    → "- [01J…] toby on #범위: 환불도 넣어 주세요"
update_section  page=k3x9q1 section=범위 …      → 문서 수정
add_comment     page=k3x9q1 replyTo=01J… body="환불을 범위에 추가했습니다."
resolve_comment comment=01J…
```

### 멘션 처리 흐름 (사람이 댓글로 일을 맡길 때)

```
list_notifications                             → "- [01K…] mention by toby on TEAM/k3x9q1 "주간 회의" comment=01J…"
list_comments   page=k3x9q1                    → 그 댓글: "@Adam 액션 아이템 정리해 줘"
update_section  page=k3x9q1 section=액션-아이템 …  → 문서 수정
add_comment     page=k3x9q1 replyTo=01J… body="정리했습니다."
mark_notifications_read ids=["01K…"]
```

- 에이전트는 `@멘션`만 알림으로 받습니다(문서 변경·새 댓글 알림은 사람에게만).
- 잘못 고쳤다면 `list_revisions`로 버전을 보고 `restore_revision page=k3x9q1 revision=<되돌릴 번호>`.

### 관련 내용 찾기

```
semantic_search query="환불은 언제까지 가능한가"  → "- PAY/a1b2c3 "결제 설계" section=환불-정책 "환불 정책" [spec, draft] score=0.71"
read_section    page=a1b2c3 section=환불-정책    → 그 섹션만 읽기 (문서 전체 대신)
```

- 단어가 정확히 들어간 문서는 `search_pages`, 표현이 다를 수 있으면 `semantic_search`. 의미 검색을 쓸 수 없을 때는 `search_pages`를 쓰라는 오류가 옵니다.

- **충돌**: 그사이 다른 사람이 저장했다면 `update_page`가 "Current revision is N"과 함께 실패합니다. `read_page`로 다시 읽고 변경을 다시 적용하세요.
- **검사 오류**: frontmatter 누락, 없는 첨부 참조 같은 오류는 저장을 막고 `- L2 error clavis/frontmatter-required: …` 형식으로 알려 줍니다. 경고는 저장된 뒤 함께 표시됩니다.
- **제목**: 페이지 제목은 `title` 인자로 정합니다. 본문에 `# 제목`(H1)을 쓰지 않습니다.
- **링크**: `[[페이지 제목]]`, 다른 Space는 `[[KEY:페이지 제목]]`. `update_page`로 제목을 바꾸면 다른 문서의 링크도 새 제목으로 고쳐지고, 응답에 고친 문서 수가 나옵니다. 너무 많아 고치지 못한 문서가 있으면 그 수도 알려 줍니다.

## 6. 원본 Markdown과 llms.txt

- 페이지 URL 끝에 `.md`를 붙이면 frontmatter 포함 원문이 `text/markdown`으로 옵니다 (`X-Clavis-Revision` 헤더 포함).
- `/llms.txt`는 Space 목록, `/s/{KEY}/llms.txt`는 그 Space의 페이지 트리(각 항목이 `.md` 링크)입니다.
- 모두 Access 뒤에 있으므로 에이전트는 MCP와 같은 서비스 토큰 헤더와 Clavis 토큰이 필요합니다. 사람은 브라우저에서 바로 열 수 있고, 페이지 메뉴의 **AI용 복사**로 제목·URL·원문을 한 번에 복사해 AI 채팅에 붙여 넣을 수 있습니다.

## 7. REST API

MCP와 같은 기능을 REST로도 쓸 수 있습니다. 명세는 `/api/v1/openapi.json`, 문서는 `/api/v1/docs`에 있습니다. 인증 헤더는 MCP와 같습니다. 페이지 원문만 받으려면 `Accept: text/markdown`을 보냅니다.

**첨부 파일 업로드** (MCP 도구에는 없음, 파일당 25MB): 파일 내용을 그대로 본문으로 보냅니다(multipart 아님). 응답의 `filename`(이름이 겹치면 `-1`이 붙음)으로 본문에서 `![설명](attachments/<filename>)`처럼 참조합니다.

```bash
curl -X POST "https://clavis.<서브도메인>.workers.dev/api/v1/pages/<shortId>/attachments?filename=arch.png" \
  -H "CF-Access-Client-Id: $CLAVIS_CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CLAVIS_CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $CLAVIS_TOKEN" -H "Content-Type: image/png" \
  --data-binary @arch.png
```

## 8. Webhook 받기 (다른 시스템에 Clavis 소식 보내기)

Space 설정 → **알림 채널**(관리자)에서 종류 **Webhook (JSON)**으로 https 주소를 추가하면, 고른 이벤트가 생길 때마다 그 주소로 `POST`합니다. Slack은 같은 화면에서 Incoming Webhook URL로 추가합니다.

```http
POST <등록한 URL>
Content-Type: application/json
User-Agent: Clavis-Webhook/1
X-Clavis-Event: page.updated
X-Clavis-Delivery: 01K…                     # 전송마다 다른 id
X-Clavis-Signature: sha256=<hex>             # HMAC-SHA256(서명 키, 본문 바이트)

{
  "event": "page.updated",                   # page.created · page.updated · page.deleted · page.restored
                                             # comment.created · comment.resolved · ping(테스트 전송)
  "deliveryId": "01K…",
  "at": 1790000000000,
  "space":   { "key": "PAY", "name": "결제" },
  "page":    { "id": "…", "shortId": "a1b2c3", "title": "결제 API 설계", "url": "https://…" },
  "actor":   { "id": "…", "name": "Adam", "kind": "agent" },
  "revision": 5,
  "changesUrl": "https://…/history?r=5&base=4",   # 수정: 바로 이전 버전과의 차이 화면
  "comment": { "id": "…", "threadId": "…", "body": "…(1,000자까지)", "url": "…#comments" },   # 댓글 이벤트
  "pageCount": 3                              # 휴지통 이동·복원: 하위 문서 포함 개수
}
```

- **서명 확인**: 카드에 보이는 서명 키로 **받은 본문 그대로**의 HMAC-SHA256을 계산해 `X-Clavis-Signature`와 비교합니다(JSON을 다시 직렬화하지 말 것).

  ```js
  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(rawBody).digest('hex');
  const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(req.headers['x-clavis-signature']));
  ```

- **응답**: 5초 안에 2xx를 돌려주세요. 5xx·429·시간 초과·연결 실패는 30초·2분·10분 뒤에 다시 보냅니다(최대 3번). 같은 이벤트가 두 번 올 수 있다면 `X-Clavis-Delivery`가 아니라 이벤트 내용(페이지·revision·시각)으로 거르세요. 재시도는 새 delivery id를 씁니다.
- 결과는 카드의 **최근 전달**(✓/✗, 상태 코드, 오류)에서 봅니다.

## 9. 문제 해결

| 증상 | 원인 |
|---|---|
| 302 (Access 로그인 페이지로 이동) | 서비스 토큰 누락·오류·만료, Access 정책에 그 서비스 토큰이 없음, 또는 정책의 Action이 `Service Auth`가 아님 |
| 401 `unauthenticated` | Clavis 토큰(`Authorization`) 누락 — `.mcp.json`·`${env:…}`를 쓰는데 환경 변수를 읽지 않은 셸·앱에서 실행한 경우 포함 |
| 401 `invalid-token` | Clavis 토큰이 틀렸거나 폐기됨 → 관리자에게 새로 발급 |
| 403 `forbidden` | 역할 부족 (예: 읽기 에이전트가 쓰기 시도, 에이전트가 관리자 API 호출) |
| 403 `disabled` | 관리 화면에서 에이전트가 사용 중지됨 |
| 429 | 호출 한도 초과(에이전트마다 120회/분), `Retry-After` 초 후 재시도 |
| 읽기 도구만 보임 (`create_page`·`update_section` 등이 없음) | ① 에이전트 역할이 viewer — 관리 화면에서 확인 ② Hermes `config.yaml`의 `mcp_servers.clavis.tools.include`/`exclude`가 쓰기 도구를 거름 — 지우거나 `"*"`로 ③ 설정·역할 변경 뒤 다시 읽지 않음 — `/reload-mcp` 또는 새 세션 |
| Claude Desktop에 clavis가 안 보임, 로그에 `spawn npx ENOENT` | Node.js가 없거나 앱이 `npx`를 찾지 못함(nvm 등) → `command`에 `which npx`로 찾은 전체 경로 |

## 10. 에이전트 관리

| 하고 싶은 일 | 방법 |
|---|---|
| 토큰 교체 (정기적으로, 또는 컴퓨터를 바꿀 때) | 관리자가 같은 에이전트에 **토큰 발급**을 한 번 더 → 클라이언트 설정을 새 토큰으로 → 관리 화면에서 새 토큰의 "사용 기록 없음"이 "… 사용"으로 바뀌면 옛 토큰 **폐기**. 두 토큰이 잠시 함께 동작하므로 끊기지 않습니다 |
| 토큰이 유출됨 | 관리자에게 바로 알려 그 토큰을 **폐기**하고 새로 발급받습니다. 서비스 토큰이 유출됐다면 Cloudflare에서 그 서비스 토큰을 폐기·교체합니다(공용 토큰이면 모든 사람의 설정을 바꿔야 함) |
| 여러 컴퓨터에서 쓰기 | 같은 토큰도 되지만 컴퓨터마다 토큰을 따로 받으면 하나만 폐기할 수 있습니다. 호출 한도는 에이전트 단위라 함께 씁니다 |
| 역할 바꾸기 | 관리자가 에이전트 행의 역할을 바꿉니다. 클라이언트에서 새 세션을 열어야(Hermes는 `/reload-mcp`) 도구 목록이 바뀝니다 |
| 이름 바꾸기 | 관리자가 연필 버튼으로 바꿉니다. 이전 기록에도 새 이름이 보이고, 목록에서 골라 넣은 `@멘션`은 그대로 이 에이전트에게 갑니다 |
| 그만 쓰기 (퇴사·프로젝트 종료) | 관리자가 **사용 중지** → 모든 토큰이 403 `disabled`. 작성 기록은 남습니다. 에이전트는 지울 수 없고 **다시 사용**으로 되살립니다. 사람별 서비스 토큰도 Cloudflare에서 폐기합니다 |

- Clavis 토큰은 만료되지 않습니다. 쓰지 않는 토큰은 관리 화면의 마지막 사용 시각(한 시간 단위로 기록)을 보고 폐기합니다.
- 서비스 토큰은 Cloudflare에서 만들 때 정한 기간이 지나면 만료되고, 그때부터 302가 납니다.

## 11. 자주 묻는 질문

- **에이전트를 직접 등록할 수는 없나요?** 지금은 관리자만 등록과 토큰 발급을 할 수 있습니다(§1.2).
- **에이전트가 내 권한으로 움직이나요?** 아니요. 에이전트는 별도 계정이고, 관리자가 준 역할(편집·읽기)대로 움직입니다. 내가 관리자여도 에이전트는 관리 기능을 쓸 수 없습니다.
- **에이전트가 쓴 글은 누구 이름으로 남나요?** 에이전트 이름(🤖)으로 남습니다. 홈의 **최근 변경**에서 에이전트만 걸러 볼 수 있고, 모든 저장은 변경 기록에서 되돌릴 수 있습니다.
- **에이전트도 알림을 받나요?** `@멘션`만 받습니다. 문서 변경·새 댓글 알림은 사람에게만 갑니다.
- **첨부 파일을 올릴 수 있나요?** MCP 도구에는 없고 REST로 올립니다(§7).
- **한 사람이 에이전트를 여러 개 가져도 되나요?** 됩니다. 도구(Claude Code, Cursor …)나 용도마다 따로 두면 기록과 호출 한도가 나뉩니다.
