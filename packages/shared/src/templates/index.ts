import type { DocType } from '../schema/frontmatter';

/**
 * Document templates (D-15). A template is the model answer to the lint rules: it starts
 * with valid frontmatter and every required section, so a new page lints clean.
 */

export type Locale = 'ko' | 'en';

export interface Section {
  ko: string;
  en: string;
  /** Guidance shown under the heading in a fresh page. */
  hint: { ko: string; en: string };
}

export interface TemplateDef {
  type: DocType;
  name: { ko: string; en: string };
  description: { ko: string; en: string };
  /** Required H2 sections, checked by clavis/required-sections. */
  sections: readonly Section[];
}

const s = (ko: string, en: string, hintKo: string, hintEn: string): Section => ({
  ko,
  en,
  hint: { ko: hintKo, en: hintEn },
});

export const TEMPLATES: readonly TemplateDef[] = [
  {
    type: 'prd',
    name: { ko: '제품 요구사항 (PRD)', en: 'Product requirements (PRD)' },
    description: { ko: '무엇을 왜 만드는지', en: 'What to build and why' },
    sections: [
      s('배경', 'Background', '이 제품/기능이 필요한 이유', 'Why this is needed'),
      s('목표', 'Goals', '측정 가능한 목표', 'Measurable goals'),
      s('사용자 스토리', 'User stories', '누가, 무엇을, 왜', 'Who wants what, and why'),
      s('요구사항', 'Requirements', '기능·비기능 요구사항', 'Functional and non-functional'),
      s('범위 외', 'Out of scope', '이번에 하지 않는 것', 'What this does not cover'),
    ],
  },
  {
    type: 'spec',
    name: { ko: '기술 명세 (Spec)', en: 'Technical spec' },
    description: { ko: '어떻게 만드는지', en: 'How to build it' },
    sections: [
      s('개요', 'Overview', '한두 문단 요약', 'A short summary'),
      s('요구사항', 'Requirements', '만족해야 할 조건', 'Conditions to satisfy'),
      s('설계', 'Design', 'API, 데이터, 흐름', 'APIs, data, flows'),
      s('미결 사항', 'Open questions', '아직 정하지 못한 것', 'Undecided points'),
    ],
  },
  {
    type: 'adr',
    name: { ko: '아키텍처 결정 기록 (ADR)', en: 'Architecture decision record' },
    description: { ko: '결정 하나와 그 이유', en: 'One decision and its reasons' },
    sections: [
      s('Context', 'Context', '결정이 필요한 상황', 'The situation that needs a decision'),
      s('Decision', 'Decision', '내린 결정', 'The decision'),
      s('Consequences', 'Consequences', '결과와 트레이드오프', 'Results and trade-offs'),
    ],
  },
  {
    type: 'architecture',
    name: { ko: '아키텍처', en: 'Architecture' },
    description: { ko: '시스템 구조 설명', en: 'How a system is put together' },
    sections: [
      s('개요', 'Overview', '시스템의 목적과 범위', 'Purpose and scope'),
      s('구성 요소', 'Components', '주요 구성 요소와 책임', 'Main parts and responsibilities'),
      s('데이터 흐름', 'Data flow', '요청과 데이터가 흐르는 방식', 'How requests and data move'),
    ],
  },
  {
    type: 'meeting',
    name: { ko: '회의록', en: 'Meeting notes' },
    description: { ko: '회의 기록과 결정', en: 'Notes and decisions' },
    sections: [
      s('참석자', 'Attendees', '', ''),
      s('논의 내용', 'Discussion', '', ''),
      s('결정 사항', 'Decisions', '', ''),
      s('액션 아이템', 'Action items', '- [ ] 담당자: 할 일', '- [ ] Owner: task'),
    ],
  },
  {
    type: 'guide',
    name: { ko: '가이드', en: 'Guide' },
    description: { ko: '사용법·절차 안내', en: 'How-to and procedures' },
    sections: [],
  },
  {
    type: 'note',
    name: { ko: '노트', en: 'Note' },
    description: { ko: '형식 없는 문서', en: 'Free-form page' },
    sections: [],
  },
];

export function findTemplate(type: string): TemplateDef | undefined {
  return TEMPLATES.find((t) => t.type === type);
}

export function requiredSections(type: string): readonly Section[] {
  return findTemplate(type)?.sections ?? [];
}

/** Quotes a YAML scalar only when it needs it. */
function yamlScalar(v: string): string {
  return /^[\w.@+-][\w .@+/-]*$/.test(v) && !/^(true|false|null|yes|no)$/i.test(v)
    ? v
    : JSON.stringify(v);
}

/** Renders a new page's Markdown: frontmatter plus the required sections with hints. */
export function renderTemplate(
  type: DocType,
  opts: { owner: string; locale?: Locale; tags?: string[] },
): string {
  const locale = opts.locale ?? 'ko';
  const tags = opts.tags ?? [];
  const fm = [
    '---',
    `type: ${type}`,
    'status: draft',
    `owner: ${yamlScalar(opts.owner)}`,
    `tags: [${tags.map(yamlScalar).join(', ')}]`,
    '---',
    '',
  ].join('\n');
  const sections = requiredSections(type)
    .map((sec) => {
      const hint = sec.hint[locale];
      return hint ? `## ${sec[locale]}\n\n${hint}\n` : `## ${sec[locale]}\n`;
    })
    .join('\n');
  return sections ? `${fm}${sections}` : fm;
}
