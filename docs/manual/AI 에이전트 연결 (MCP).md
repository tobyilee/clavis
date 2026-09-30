---
type: guide
status: approved
owner: admin
tags: [매뉴얼]
---

Claude Code, Claude Desktop, Cursor, VS Code, Hermes 같은 AI 에이전트를 Clavis에 연결하는 방법입니다. 연결하면 에이전트가 문서를 찾고, 읽고, 쓰고, 댓글로 일을 받습니다. 상위 문서: [[Clavis 사용 매뉴얼]]

> [!TIP]
> 아직 에이전트를 등록하지 않았다면 [[내 AI 에이전트 등록하고 연결하기]]부터 보세요. 등록 요청부터 연결 확인, 토큰 관리까지 순서대로 안내합니다.

## MCP란

MCP(Model Context Protocol)는 AI 에이전트가 외부 서비스의 기능을 **도구**로 쓰게 해 주는 표준입니다. Clavis는 MCP 서버를 내장하고 있어, 에이전트가 `search_pages`, `read_section`, `update_section` 같은 도구를 직접 부릅니다. 도구 전체는 [[MCP 도구 레퍼런스]].

| 항목 | 값 |
|---|---|
| 주소 | `https://clavis.crawl-proxy.workers.dev/mcp` |
| 전송 방식 | Streamable HTTP (stateless) |
| 도구 수 | 편집자 에이전트 25개, 뷰어 에이전트 17개 (쓰기 도구 제외) |
| 호출 한도 | 에이전트마다 1분에 120번 (같은 에이전트의 토큰끼리 나눠 씀) |

## 필요한 것: 헤더 세 개

| 헤더 | 값 | 예시의 환경 변수 | 받는 곳 |
|---|---|---|---|
| `CF-Access-Client-Id` | Cloudflare Access 서비스 토큰의 Client ID | `CLAVIS_CF_ACCESS_CLIENT_ID` | 관리자에게 받음 |
| `CF-Access-Client-Secret` | 같은 서비스 토큰의 Client Secret | `CLAVIS_CF_ACCESS_CLIENT_SECRET` | 관리자에게 받음 |
| `Authorization` | `Bearer clv_…` — 에이전트별 Clavis 토큰 | `CLAVIS_TOKEN` | 관리 → AI 에이전트 → **토큰 발급** |

- 서비스 토큰은 Clavis 앞의 Cloudflare 문을 통과하는 **출입증**이고, Clavis 토큰은 **어느 에이전트인지**를 밝힙니다. 둘 다 있어야 합니다.
- 등록 요청, 값 보관, 연결 확인은 [[내 AI 에이전트 등록하고 연결하기]], 관리자 화면은 [[관리자 기능]]을 보세요.

> [!CAUTION]
> 토큰은 비밀번호입니다. 채팅, 문서, 코드 저장소에 붙이지 말고 환경 변수나 에이전트의 비밀 설정에만 넣으세요. 유출됐다면 관리 화면에서 바로 폐기하고 새로 발급합니다.

## Claude Code에 연결

모든 프로젝트에서 쓰기 (내 설정에만 저장):

```sh
claude mcp add --transport http --scope user clavis https://clavis.crawl-proxy.workers.dev/mcp \
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
      "url": "https://clavis.crawl-proxy.workers.dev/mcp",
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
- 확인: `claude mcp list`에서 clavis가 연결됨(✓)으로 나오고, 세션 안의 `/mcp`에서 도구 수가 보이면 됩니다.

## Claude Desktop에 연결

Claude Desktop의 커넥터 추가 화면은 요청 헤더를 넣을 수 없어서, `mcp-remote`가 중간에서 헤더를 붙여 줍니다. Node.js 18 이상이 필요합니다.

설정 → 개발자 → **구성 편집**으로 여는 `claude_desktop_config.json`(macOS `~/Library/Application Support/Claude/`, Windows `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "clavis": {
      "command": "npx",
      "args": [
        "-y", "mcp-remote", "https://clavis.crawl-proxy.workers.dev/mcp",
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

## Cursor에 연결

`~/.cursor/mcp.json`(모든 프로젝트) 또는 프로젝트의 `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "clavis": {
      "url": "https://clavis.crawl-proxy.workers.dev/mcp",
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

## VS Code에 연결

Copilot 에이전트 모드에서 씁니다. 프로젝트의 `.vscode/mcp.json` — 값은 처음 연결할 때 물어보고 VS Code가 안전하게 보관합니다:

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
      "url": "https://clavis.crawl-proxy.workers.dev/mcp",
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

## Hermes Agent에 연결

`~/.hermes/config.yaml`:

```yaml
mcp_servers:
  clavis:
    url: "https://clavis.crawl-proxy.workers.dev/mcp"
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

확인과 다시 읽기:

```sh
hermes mcp test clavis     # 서버 응답·HTTP 상태 진단
hermes mcp catalog         # 등록된 서버 목록
```

Hermes가 실행 중이면 `/reload-mcp`로 새 설정과 새 도구를 다시 읽습니다. Clavis에 도구가 추가된 뒤에도 필요합니다.

## 다른 MCP 클라이언트

Streamable HTTP로 연결하면서 요청 헤더를 정할 수 있으면 위 주소와 헤더 세 개로 연결됩니다. 헤더를 넣을 수 없는 stdio 클라이언트는 Claude Desktop처럼 `mcp-remote`를 거칩니다. OAuth 로그인만 받는 커넥터(claude.ai 웹·모바일의 커넥터 등)로는 연결할 수 없습니다.

## 에이전트가 알고 있는 규칙

연결하면 Clavis가 에이전트에게 사용 규칙(instructions)을 알려 줍니다. 요약하면:

- 페이지는 짧은 id(예: `a1b2c3`) 또는 `SPACE:제목`으로 가리킨다.
- 모든 페이지는 속성(`type`, `status`, `owner`, `tags`)으로 시작하고, 제목은 `title` 인자로 준다 (본문에 H1 금지).
- 새 문서는 `list_templates`로 템플릿을 골라 `create_page`의 `template`으로 시작한다.
- 문서 전체를 고칠 때는 `read_page`로 revision을 받아 `update_page`의 `baseRevision`으로 넘긴다. 충돌하면 다시 읽고 다시 적용한다.
- 일부만 고칠 때는 섹션 도구(`list_sections` → `read_section` → `update_section`)를 우선한다. 목록 항목 추가는 `mode: append`.
- 속성만 바꿀 때는 `set_page_meta`.
- 잘못 고쳤으면 `list_revisions` → `restore_revision`.
- 미해결 댓글을 반영하면 답글을 달고 해결한다. 모르면 추측하지 말고 댓글로 묻는다.
- `@멘션`은 `list_notifications`로 확인 → 처리 → 답글 → `mark_notifications_read`.
- 단어는 `search_pages`, 뜻은 `semantic_search` → `read_section`.

## 에이전트에게 일 시키는 예

사람이 에이전트 채팅에서:

```text
Clavis PAY Space의 "결제 API 설계" 문서에서 미결 사항 섹션을 읽고,
결정된 것은 결정 사항으로 옮겨 줘.
```

사람이 Clavis 댓글에서:

```text
@Adam 액션 아이템을 담당자별로 묶어 줘
```

에이전트는 알림을 확인하고 문서를 고친 뒤 답글을 답니다. Clavis가 에이전트를 깨우지는 않으므로, 에이전트에게 "Clavis 알림 확인해서 처리해 줘"라고 시키거나 주기적으로 확인하게 둡니다. 결과는 변경 기록에서 확인하고, 필요하면 되돌립니다 ([[변경 기록과 되돌리기]]).

## 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| 302 (로그인 페이지로 이동) | 서비스 토큰 헤더가 없거나 틀림, 만료됨, 또는 Access 정책에 그 서비스 토큰이 없음 → 관리자에게 |
| 401 `unauthenticated` | `Authorization` 헤더 없음 — `.mcp.json`·`${env:…}`를 쓰는데 환경 변수를 읽지 않은 셸·앱에서 실행한 경우 포함 |
| 401 `invalid-token` | Clavis 토큰이 틀렸거나 폐기됨 → 새로 발급 |
| 403 `forbidden` | 역할 부족 (예: 뷰어 에이전트가 쓰기 시도) |
| 403 `disabled` | 관리 화면에서 에이전트가 사용 중지됨 |
| 429 | 1분 120번 호출 한도 초과 → `Retry-After` 초 뒤 재시도 |
| 읽기 도구만 보임 | ① 에이전트 역할이 뷰어 ② 클라이언트 설정에서 도구를 거름(Hermes `tools.include`/`exclude`) ③ 설정·역할 변경 뒤 다시 읽지 않음 → `/reload-mcp` 또는 새 세션 |
| 새 도구가 안 보임 | 클라이언트가 도구 목록을 다시 읽지 않음 → `/reload-mcp`, Claude Code는 새 세션 |
| Claude Desktop에 clavis가 안 보임, 로그에 `spawn npx ENOENT` | Node.js가 없거나 앱이 `npx`를 찾지 못함(nvm 등) → `command`에 `which npx`로 찾은 전체 경로 |
| `semantic_search`가 "unavailable" | 의미 검색이 일시적으로 안 됨 → `search_pages` 사용 |

## 연결정보
```
CF_ACCESS_CLIENT_ID=<서비스 토큰 Client ID>
CF_ACCESS_CLIENT_SECRET=<서비스 토큰 Client Secret>
```
