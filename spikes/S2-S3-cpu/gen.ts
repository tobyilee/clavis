/** Generates a realistic Korean spec document of roughly `targetBytes` UTF-8 bytes. */
export function generateDoc(targetBytes: number): string {
  const fm = '---\ntype: spec\nstatus: review\nowner: toby@team.dev\ntags: [payment, api]\n---\n';
  const section = (i: number) => `## ${i}. 결제 승인 흐름 ${i}

결제 승인 요청은 **API Gateway**를 거쳐 결제 서비스로 전달된다. 결제 서비스는 [[결제 정책]]과 [[PAY:환불 정책|환불]] 문서의 규칙을 따른다.
PG사 응답이 3초 안에 오지 않으면 \`TIMEOUT\` 상태로 기록하고 재시도 큐에 넣는다.

### ${i}.1 요구사항

- [ ] 승인 요청은 멱등 키(\`Idempotency-Key\`)를 반드시 포함한다
- [x] 승인 결과는 웹훅으로 가맹점에 통지한다
- 실패 시 최대 3회까지 지수 백오프로 재시도한다

| 필드 | 타입 | 설명 |
|---|---|---|
| orderId | string | 주문 번호 |
| amount | number | 결제 금액 (원) |

\`\`\`ts
export async function approve(req: ApproveRequest): Promise<ApproveResult> {
  const res = await pg.post('/approve', req, { timeout: 3000 });
  return mapResult(res);
}
\`\`\`

![승인 시퀀스](attachments/approve-seq-${i}.png)

> [!NOTE]
> 부분 취소는 Phase 2에서 지원한다.

`;
  // Track size incrementally: re-encoding the whole string each loop is O(n²).
  const enc = new TextEncoder();
  const parts = [fm];
  let size = enc.encode(fm).length;
  for (let i = 1; size < targetBytes; i++) {
    const s = section(i);
    parts.push(s);
    size += enc.encode(s).length;
  }
  return parts.join('');
}
