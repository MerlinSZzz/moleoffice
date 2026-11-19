// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S OWN SCRATCH PLAN, WRITTEN BY HAND, KEPT HERE CHARACTER FOR CHARACTER.
 *
 * It was written to test the plan editor and it is quoted whole in design/ROUND-FOUR.md. The plan
 * itself was a test artifact and has been deleted, so this is the only copy in the repository that
 * code can read. It is the document the parser has to get right: five heading levels, a numbered
 * list, nested bullets, inline mathematics, and a pipe table with no row of dashes under its
 * headings.
 *
 * It lives in its own file so that tests/plandoc.test.ts and tests/planoutline.test.ts read the
 * same characters. Two copies of it would let one test pass on a document the other does not have.
 *
 * DO NOT TIDY IT. The misspelt "levle4" and "levle5" are the owner's, the table really has no dashes, and
 * every test here is about what happens to the document as typed.
 */
export const OWNER_PLAN = [
  '# the panelx plan',
  '1. test with the pipeline',
  '2. try the pipeline',
  '3. find bugs',
  '4. report bugs',
  '',
  '$H_2 O$',
  '',
  '|column1|column2|',
  '|1|2|',
  '',
  '# Robotics',
  '## Tray clamp',
  '### replace gripper',
  '#### levle4',
  '##### levle5',
  'text',
  '',
  '## Object',
  '- abc',
  '- def',
  '- gh',
].join('\n')
