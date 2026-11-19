// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INVENTED REPORT WITH TWO DIAGRAMS, read by tests/a-copy-carries-a-diagrams-text-unchanged.test.ts.
 *
 * EVERYTHING HERE IS MADE UP. No person, project or record in it exists anywhere.
 *
 * WHY IT EXISTS. That test used to file an export of one real report into a throwaway database and
 * copy it at every rung. What the test needs from the report is small, and this keeps each piece:
 *
 *   - a title and a summary, because those are what a copy really carries, word for word. The summary
 *     is longer than 40 characters so the comparison has something to compare;
 *   - diagrams written as mermaid fences in text blocks, each a `flowchart TD`, because the test
 *     checks that no copy carries one, whole or in part;
 *   - diagram lines longer than 12 characters, because the half-carry check only looks at those;
 *   - a fence that is not a diagram (`json`), so "the diagrams" means the mermaid fences and not
 *     every fence;
 *   - enough prose around them that the report reads as a report.
 */

import type { SummaryBlock } from '../../src/shared/types.ts'

/** One block's text, written a line at a time so each fence line is easy to see. */
const lines = (...each: string[]): string => each.join('\n')

export const title = 'The import tool, round two: three steps and a cancel button'

export const summary =
  'The import now runs in three steps that each say when they are done, and cancel waits for the file in hand.'

export const blocks: SummaryBlock[] = [
  {
    id: 't1',
    type: 'text',
    text: lines(
      'The import used to be one long script. It now runs in three steps, and the first diagram shows their order.',
      '',
      '```mermaid',
      'flowchart TD',
      '  A[Files listed] --> B[Files read]',
      '  B --> G1{Every file has a verdict}',
      '  G1 -->|yes| C[Summary written]',
      '  G1 -->|no| X[Import stopped and the reason shown]',
      '```',
    ),
  },
  {
    id: 't2',
    type: 'text',
    text: lines(
      'Cancel lets the current file finish, so no file is left half written.',
      '',
      '```mermaid',
      'flowchart TD',
      '  A[Cancel pressed] --> B{Step still running}',
      '  B -->|yes| C[Step stops at the next file]',
      '  B -->|no| D[Nothing to stop]',
      '```',
    ),
  },
  {
    id: 't3',
    type: 'text',
    text: lines(
      'The steps are also written as data, for other tools to read.',
      '',
      '```json',
      '{ "steps": ["Read", "Check", "Write"] }',
      '```',
    ),
  },
]
