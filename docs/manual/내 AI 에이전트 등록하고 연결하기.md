---
type: guide
status: approved
owner: admin
tags: [매뉴얼]
---

내 AI 에이전트(Claude Code, Claude Desktop, Cursor, VS Code, Hermes 등)를 Clavis에 등록하고 MCP로 연결하는 과정을 처음부터 끝까지 안내합니다. 상위 문서: [[Clavis 사용 매뉴얼]]

## 전체 흐름

| 단계 | 누가 | 할 일 |
|---|---|---|
| 1 | 나 | 에이전트 이름·역할을 정해 관리자에게 요청 |
| 2 | 관리자 | 에이전트 추가, Clavis 토큰 발급, 서비스 토큰 준비, 안전하게 전달 |
| 3 | 나 | 받은 값 세 개를 환경 변수로 보관 |
| 4 | 나 | `curl`로 연결 확인 |
| 5 | 나 | 쓰는 클라이언트에 MCP 서버 등록 |
| 6 | 나 | SANDBOX에서 첫 작업 |

에이전트는 사람과 별개인 **계정**입니다. 자기 이름(🤖)과 역할을 갖고, 로그인 대신 **토큰**으로 접속합니다. 에이전트를 만들고 토큰을 발급하는 일은 **관리자만** 할 수 있으므로 관리자에게 요청합니다.

## 1단계: 등록 요청

요청하기 전에 세 가지를 정합니다.

| 정할 것 | 권장 |
|---|---|
| 이름 | 주인과 도구가 드러나고 **공백이 없는** 이름. 예: `minsu-claude`, `jiyoung-cursor`. 문서·댓글·변경 기록에 이 이름이 🤖와 함께 표시되고, 댓글에서 `@minsu-claude`로 부릅니다. 이름에 공백이 있으면 `@` 목록에서 골라야만 멘션됩니다 |
| 역할 | **편집**: 문서를 만들고 고침, 도구 25개 · **읽기**: 찾고 읽고 댓글만, 도구 17개. 읽기만 필요하면 읽기로 |
| 클라이언트 | 어떤 도구에 붙일지. 도구마다 에이전트를 따로 두면 작성자 표시와 호출 한도(1분 120번)가 나뉩니다 |

요청 예 (관리자에게 메시지로):

```text
Clavis 에이전트 등록 부탁드립니다.
- 이름: minsu-claude
- 역할: 편집
- 용도: Claude Code에서 설계 문서 초안 작성, 회의록 정리
```

- 에이전트의 역할은 요청한 사람의 역할과 **무관**합니다. 에이전트는 자기 역할대로 움직이고, 작성자로는 에이전트 이름이 남습니다. Clavis는 에이전트의 주인을 따로 기록하지 않으므로 이름으로 드러냅니다.
- 에이전트는 관리자 역할을 가질 수 없습니다(편집·읽기만).

## 2단계: 관리자가 할 일

1. **관리 → AI 에이전트** 탭에서 같은 이름이 없는지 확인합니다. 이름 중복은 막지 않습니다.
2. **에이전트 이름**과 **역할**을 넣고 **에이전트 추가**.
3. 그 행의 **토큰 발급** → 대화상자의 `clv_…` 토큰을 **복사**합니다. 대화상자를 닫으면 다시 볼 수 없습니다.
4. **서비스 토큰**(Cloudflare Access)을 준비합니다. 둘 중 하나:
   - **공용 서비스 토큰을 나눠 준다** — 간단하지만, 한 사람에게서 유출되면 모두의 설정을 바꿔야 합니다.
   - **사람마다 서비스 토큰을 만든다 (권장)** — Cloudflare 대시보드 → Zero Trust → **Service Tokens** 화면(메뉴 위치는 대시보드 버전에 따라 Access → Service Auth 또는 Access controls → Service credentials)에서 **Create Service Token**(이름 예: `clavis-minsu`, 기간 선택). Client Secret은 만든 직후에만 보입니다. 그다음 Clavis의 Access 애플리케이션(`clavis - Cloudflare Workers`) → Policies → Action이 **Service Auth**인 정책의 Include에 새 토큰을 추가합니다. Action이 `Allow`면 Access가 서비스 토큰을 무시합니다.
   - 서비스 토큰만으로는 문서를 볼 수 없습니다(Clavis가 401). 그래도 비밀로 다룹니다.
5. 값 세 개(Client ID, Client Secret, `clv_…` 토큰)를 **기록이 남지 않는 방법**으로 전달합니다: 비밀번호 관리자의 공유 항목, 한 번 열면 사라지는 링크 등.

> [!CAUTION]
> 토큰은 비밀번호입니다. 채팅, 메일, Clavis 문서·댓글, 코드 저장소에 붙이지 않습니다. 유출됐다면 관리 화면에서 바로 **폐기**하고 새로 발급합니다.

## 3단계: 받은 값 보관

값 세 개를 환경 변수로 둡니다. 이 매뉴얼의 예시는 모두 이 이름을 씁니다.

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

## 4단계: 연결 확인

클라이언트에 등록하기 전에 값이 맞는지 확인합니다:

```sh
curl -sS -w '\nHTTP %{http_code}\n' https://clavis.crawl-proxy.workers.dev/api/v1/me \
  -H "CF-Access-Client-Id: $CLAVIS_CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CLAVIS_CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $CLAVIS_TOKEN"
```

```text
{"id":"01K…","kind":"agent","name":"minsu-claude","email":null,"role":"editor"}
HTTP 200
```

`kind`가 `agent`이고 이름·역할이 요청한 대로면 됩니다. `HTTP 302`면 서비스 토큰, `HTTP 401`이면 Clavis 토큰 문제입니다([[AI 에이전트 연결 (MCP)]]의 문제 해결).

MCP 도구 목록까지 확인하려면:

```sh
curl -sS https://clavis.crawl-proxy.workers.dev/mcp \
  -H "CF-Access-Client-Id: $CLAVIS_CF_ACCESS_CLIENT_ID" \
  -H "CF-Access-Client-Secret: $CLAVIS_CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $CLAVIS_TOKEN" \
  -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -o '"name":"[a-z_]*"'
```

편집 에이전트는 25개, 읽기 에이전트는 17개가 나옵니다.

## 5단계: 클라이언트에 등록

클라이언트별 설정은 [[AI 에이전트 연결 (MCP)]]에 있습니다.

| 클라이언트 | 방법 |
|---|---|
| Claude Code | `claude mcp add --transport http --scope user …`, 또는 팀 저장소의 `.mcp.json`(환경 변수 이름만 들어가 커밋 가능) |
| Claude Desktop | `claude_desktop_config.json`에 `mcp-remote`로 (커넥터 화면은 헤더를 못 넣음) |
| Cursor | `~/.cursor/mcp.json`의 `url`·`headers` |
| VS Code | `.vscode/mcp.json` — 값은 처음 연결할 때 물어보고 VS Code가 보관 |
| Hermes Agent | `~/.hermes/config.yaml` + `~/.hermes/.env` |

## 6단계: 처음 해 볼 일

연결되면 **SANDBOX** Space에서 먼저 써 봅니다. 에이전트 채팅에:

```text
Clavis에 연결됐는지 확인해 줘. Space 목록을 보여 주고,
SANDBOX Space에 "연결 테스트 - minsu-claude" 노트 페이지를 만들어 오늘 날짜를 적어 줘.
```

- 웹에서 그 페이지를 열어 작성자가 🤖 `minsu-claude`인지 확인하고, 다 봤으면 삭제합니다([[문서 정리와 휴지통]]).
- 읽기 에이전트라면 "Clavis에서 환불 정책 문서를 찾아 요약해 줘"처럼 찾고 읽는 일부터 합니다.

> [!NOTE]
> 댓글에 `@minsu-claude 액션 아이템 정리해 줘`라고 남겨도 Clavis가 에이전트를 깨우지는 않습니다. 에이전트에게 "Clavis 알림 확인해서 처리해 줘"라고 시키면 알림에서 멘션을 찾아 처리하고 답글을 답니다([[댓글과 멘션]]).

## 에이전트 관리

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

## 자주 묻는 질문

- **에이전트를 직접 등록할 수는 없나요?** 지금은 관리자만 등록과 토큰 발급을 할 수 있습니다([[관리자 기능]]).
- **에이전트가 내 권한으로 움직이나요?** 아니요. 에이전트는 별도 계정이고, 관리자가 준 역할(편집·읽기)대로 움직입니다. 내가 관리자여도 에이전트는 관리 기능을 쓸 수 없습니다.
- **에이전트가 쓴 글은 누구 이름으로 남나요?** 에이전트 이름(🤖)으로 남습니다. 홈의 **최근 변경**에서 에이전트만 걸러 볼 수 있고, 모든 저장은 [[변경 기록과 되돌리기]]에서 되돌릴 수 있습니다.
- **에이전트도 알림을 받나요?** `@멘션`만 받습니다. 문서 변경·새 댓글 알림은 사람에게만 갑니다.
- **첨부 파일을 올릴 수 있나요?** MCP 도구에는 없고 REST로 올립니다([[REST API와 Webhook]]).
- **한 사람이 에이전트를 여러 개 가져도 되나요?** 됩니다. 도구(Claude Code, Cursor …)나 용도마다 따로 두면 기록과 호출 한도가 나뉩니다.
