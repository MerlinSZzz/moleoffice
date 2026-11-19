// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN INVENTED REPORT WITH DIAGRAMS IN ITS PROSE, read by
 * tests/a-fence-does-not-refuse-a-part-that-was-written.test.ts.
 *
 * EVERYTHING HERE IS MADE UP. No person, project or record in it exists anywhere.
 *
 * WHY IT EXISTS. That test used to read an export of one real report, because the real report held
 * fences in the places made-up data had missed: a diagram between two sentences, a block that opens
 * with a fence, a fence that is never closed and swallows the rest of its block, and a stray closing
 * fence. The sentence gate reads a text block's whole `text`, fence and all, and mermaid syntax has
 * almost no sentence ends, so each of these makes one very long "sentence" for the gate to compare a
 * label against. This report keeps each case in one block, and says beside each block which it is.
 *
 * Its short forms are written the way a writer writes them: a label that is not the opening of the
 * report, and two parts that between them cover every block once.
 */

import type { SummaryBlock } from '../../src/shared/types.ts'

/** One block's text, written a line at a time so each fence line is easy to see. */
const lines = (...each: string[]): string => each.join('\n')

export const blocks: SummaryBlock[] = [
  // Plain prose, and the opening of the report. The test cuts its first nine words into a label to
  // prove the gate is live.
  {
    id: 't1',
    type: 'text',
    text: lines(
      'This round moved the import tool from one long script to three steps that each say when they are done.',
      '',
      'The steps are reading the files, checking them and writing the summary page.',
    ),
  },
  // A diagram BETWEEN two sentences, after a heading and a small table inside the same block.
  {
    id: 't2',
    type: 'text',
    text: lines(
      '## How the steps follow each other',
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
      'A stopped import names the file it stopped on.',
    ),
  },
  // A block that OPENS with a fence, so its first "sentence" is the diagram.
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
  // A fence that says `json` and is NEVER CLOSED, so it swallows the rest of its block.
  {
    id: 't4',
    type: 'text',
    text: lines(
      '```json',
      '{',
      '  "steps": [',
      '    { "name": "Read", "ends_with": "every file in the list is open" },',
      '    { "name": "Check", "ends_with": "every file has a verdict" }',
      '  ]',
      '}',
    ),
  },
  // Prose that ends with a STRAY closing fence, the other half of the fence left open above.
  {
    id: 't5',
    type: 'text',
    text: lines(
      'One question is left for the person who asked for this round.',
      '',
      'Should a stopped import keep the files it already read, or drop them?',
      '```',
    ),
  },
]

const madeFrom = { seq: 1, contentHash: '0000000000000000' }

export const shortForms = {
  parts: {
    madeFrom,
    writtenBy: 'agent',
    parts: [
      {
        id: 'p1',
        heading: 'Three steps instead of one script',
        text30: 'The import now runs as reading, checking and writing, and each step says when it has finished.',
        text120:
          'The import used to be one long script. It now runs in three steps: reading the files, checking ' +
          'them, and writing the summary page. A diagram shows the order, and an import that cannot finish ' +
          'stops and names the file it stopped on.',
        covers: ['t1', 't2'],
      },
      {
        id: 'p2',
        heading: 'Cancelling, and what is still open',
        text30: 'Cancel finishes the file in hand before stopping. Whether a stopped import keeps what it read is not decided.',
        text120:
          'Cancel lets the current file finish, so nothing is left half written. The steps are also given as ' +
          'data for other tools. One question is open for the person who asked: whether a stopped import ' +
          'keeps the files it already read.',
        covers: ['t3', 't4', 't5'],
      },
    ],
    at: '2026-08-01 10:00:00',
    by: 'agent-x',
  },
  label: {
    text: 'Import tool in three steps',
    madeFrom,
    writtenBy: 'agent',
    at: '2026-08-01 10:00:00',
    by: 'agent-x',
  },
}
