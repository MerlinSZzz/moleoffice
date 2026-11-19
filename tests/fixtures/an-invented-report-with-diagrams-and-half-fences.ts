// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INVENTED REPORT WITH THREE DIAGRAMS AND TWO FENCES LEFT OPEN, read by
 * tests/a-diagram-keeps-its-text-where-a-comment-can-land.test.ts.
 *
 * EVERYTHING HERE IS MADE UP. No person, project or record in it exists anywhere.
 *
 * WHY IT EXISTS. That test used to file an export of one real report, because the real report held
 * the fences a made-up one had missed. This report keeps each of them:
 *
 *   - three `mermaid` fences that close: two in one block after a heading and a table, and one that
 *     opens its block. Each becomes a region, so each carries a comment anchor, and each must be
 *     drawn as a picture with its text kept under it in a closed fold;
 *   - a `json` fence that never closes, so it swallows the rest of its block. A fence that never
 *     closes is not a region and carries no anchor;
 *   - a stray closing fence in a later block. The page reads it as a fence that says nothing and
 *     never closes, which is what it is;
 *   - inline code in the prose, so a marked `<code>` that is not a fence is on the page as well;
 *   - one diagram drawn left to right with long labels, so a wide picture is on the page and the
 *     test can say the page does not scroll sideways.
 *
 * The test counts these fences out of the blocks themselves, so a change here shows up there as a
 * changed count, not as a silent change of subject.
 */

import type { SummaryBlock } from '../../src/shared/types.ts'

/** One block's text, written a line at a time so each fence line is easy to see. */
const lines = (...each: string[]): string => each.join('\n')

export const title = 'The import tool, round three: the steps drawn, and two questions'

export const summary =
  'Three diagrams show the import steps, cancelling and the hand-over to the summary page. Two questions are still open.'

export const blocks: SummaryBlock[] = [
  // Prose with inline code, and no fence.
  {
    id: 't1',
    type: 'text',
    text: lines(
      'This round draws the import as three diagrams. The step names are the ones in `import/steps.ts`.',
      '',
      'Each diagram is kept as text under its picture, so a comment can land on any line of it.',
    ),
  },
  // A heading, a table, then TWO closed diagrams in one block, the second drawn left to right with
  // long labels so it is the widest picture on the page.
  {
    id: 't2',
    type: 'text',
    text: lines(
      '## The steps',
      '',
      '| Step | Ends when |',
      '|---|---|',
      '| Read | every file in the list is open |',
      '| Check | every file has a verdict |',
      '',
      '```mermaid',
      'flowchart TD',
      '  A[Files listed] --> B[Files read]',
      '  B --> G1{Every file has a verdict}',
      '  G1 -->|yes| C[Summary written]',
      '  G1 -->|no| X[Import stopped and the reason shown]',
      '```',
      '',
      '### The hand-over to the summary page',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[Every file checked and given a verdict] --> B[Verdicts counted by kind]',
      '  B --> C[Summary page written with one line for each kind]',
      '  C --> D[The person who started the import is told where the page is]',
      '```',
    ),
  },
  // A block that OPENS with a closed diagram.
  {
    id: 't3',
    type: 'text',
    text: lines(
      '```mermaid',
      'flowchart TD',
      '  A[Cancel pressed] --> B{Step still running}',
      '  B -->|yes| C[Step stops at the next file]',
      '  B -->|no| D[Nothing to stop]',
      '```',
      '',
      'Cancel waits for the file in hand, so no file is left half written.',
    ),
  },
  // A `json` fence that is NEVER CLOSED, so it swallows the rest of this block.
  {
    id: 't4',
    type: 'text',
    text: lines(
      'The steps are also written as data:',
      '',
      '```json',
      '{',
      '  "steps": [',
      '    { "name": "Read", "ends_with": "every file in the list is open" },',
      '    { "name": "Check", "ends_with": "every file has a verdict" }',
      '  ]',
      '}',
    ),
  },
  // A STRAY CLOSING FENCE after some prose. On its own it opens a fence that says nothing and never
  // closes.
  {
    id: 't5',
    type: 'text',
    text: lines(
      'Two questions are open for the person who asked for this round.',
      '',
      '1. Should a stopped import keep the files it already read?',
      '2. Should the summary page list the files that passed?',
      '```',
    ),
  },
]
