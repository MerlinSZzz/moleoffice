// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A ROUND'S LAST MESSAGE THAT SAID "I SEAL NEXT", AND WHOSE CHECK WAS HELD FOR A GATE THAT "REFUSES NO SEAL": the fixture
 * for tests/how-a-round-ended-rules.test.ts and tests/how-a-round-ended.test.ts.
 *
 * On 12 November 2026 run 5S0ss9-wi3Pk (line 13n, round FA) sealed after its message DxOOpQHiJyJW to its starters, and
 * the office read it as saying the run will not seal. The message begins "I seal next." The stop was read from the
 * sentence below, which says what a gate lets through and not that the run stops. Every line of the message is its own,
 * copied from the record as it is stored. A second message of the same day, held for a step name in single quotes, is
 * at the end. Four decision ids in the first message are made up; the rest is as it is stored.
 */

export const THE_MESSAGE_WHOSE_GATE_REFUSES_NO_SEAL = [
  "I seal next. Round FA (run 5S0ss9-wi3Pk, report mxIFB9-ci14e) seals branch wave-13n-supervisor-5S0ss9-wi3Pk at tip 20291227e89ae14893b9c6fb5b0beb455937ea6f: nine commits cut from 77e43566ab1e90bd54d8a6da9ff26fdb5aae8317. The first three are round EZ's (3dcc5f780, 6d41a5999, 12c3ceefb). EZ's entry nmotsfxD5auh bounced, so EZ and FA go as one entry.",
  '',
  'What it does:',
  '- Item 1, the seal form. A fault of form is listed before the seal and refuses no seal at "remind" or "off". The hard gate judges migration items only, and each of its refusals is counted as stopped, on the before-the-seal row of GET /api/office/gates (decision dF_BrFjzgVLc).',
  "- Item 2, message bodies. The Claude Code step hook hands each unseen message over whole, once a session. A held supervisor stop gives each message's words.",
  '- Item 3 waits for the next round (decision 18Frx1-RCp6e).',
  '- Item 4: the live office has not applied 0335, so I read nothing.',
  '- Task zaNEHGn4ifnt is done.',
  '- Under the freeze, no gate, check rule or flow feature is added.',
  '',
  "EZ's two fixes:",
  '- fa9bc0106 makes the second case of tests/migration-0334-run-tokens-come-in-a-kind.test.ts apply the migrations only up to 0334. So 0335 no longer makes it "expected 2 to be 1". The test came from the coordinator\'s integrator commit 3da60fd33, and so did tests/a-run-in-form.ts, which this round also changes.',
  "- 20291227e changes one entry of tests/server-refusals-without-codes.json, the list every line shares: the entry for the reason in src/server/lib/before-the-seal.ts now reads [text]. 13t asked about the file in group ntgpQFx5yaw_. I answered at 15:13 (MZmgF8WJy_le) that the entry is in none of 13t's three files. 13t had already said neither line has to hold.",
  '',
  "Other lines' files:",
  "- src/server/lib/records.ts and src/server/api/records.ts are 13s's: comments, the gate call's actor and the seal door's description. 13s answered that its own comment changes are elsewhere (0p8837JQM4bj).",
  '- src/server/api/kinds.ts is on the list every line may join.',
  "- src/shared/words/en-wave-13r.ts is 13r's, and src/config/word-sources.mjs is no line's. They hold the gate's English words. I answered 13r in group Nt4-94U9qRJF.",
  "- By the fallback rule, tests/the-before-seal-gate-counts-items-and-later-judgements.test.ts is 13r's and tests/a-claude-code-run-in-a-sandbox-is-told-and-held.test.ts is 13s's. tests/a-claude-code-runs-hooks-read-with-the-runs-key.test.ts and tests/an-agents-messages-go-through-a-draft-by-default.test.ts are no line's.",
  "- EZ's change to src/server/db/schema.ts is in 13s's file, under Madeup200001. drizzle/ has the coordinator's yes from EZ (ZhZtDgezEL5B). EZ's change to src/server/lib/inspection.ts is in the file 13y will change for P1.",
  "- tools/dsh-hooks/ has the tool maintainer's yes (sqNMr510lD5D, 14:24). It came after the commits. That was my miss, and the report says so. The comments the diff removes cited Madeup200002 item 4, which Madeup200003 item 6 changes.",
  "- for-agents/session-hook.mjs (13t's) is unchanged, and so is tools/session-hook.mjs. Both were checked with node --check only, never loaded.",
  '',
  "Test files: this round renames tests/a-fault-of-form-refuses-the-seal.test.ts to tests/a-fault-of-form-is-listed-not-refused.test.ts, and adds or deletes none. EZ's commits add tests/what-an-agent-filed-is-found-by-index.test.ts and tests/what-each-migration-adds/0335_what_an_agent_filed_is_found_by_index.json. The audit table is left for the merge queue.",
  '',
  'Proofs: every test run went to a worker. Four dsh workers made 49 uses of the test tool, on runs yuwAMGxQecpK, In-mhLUAfSa6, SvhlP8lB6z_o and KNjmxoNl6mVi. At the tip, Worker 4 found tsc exit 0, the 13 text gates at 309 passed, 3 skipped and 0 failed, and the build exit 0. The owner-content screen refused and reminded nothing, and no commit has a trailer.',
  '',
  'The seal preview refuses nothing:',
  '- It names three certain commit-order items: 46b20020d, fa9bc0106 and 20291227e change older tests after code commit 2ad847599. I kept that order, because the reds the last two fix appeared only once the pieces were joined. The report says why.',
  '- Its eight "likely" test-proof items are proved on the workers\' runs.',
  '- The copied-literal item has a kept-because line in the report: lines 92 and 212 are unchanged from the file before its rename.',
  '',
  "Main: origin/main was d3805d67c at 14:56:49 and again at 15:09:56, after the preview. That is one landing past 9d1185775: 13r's entry zHtqtq2rhxdU. It shares src/config/word-sources.mjs and src/shared/words/en-wave-13r.ts with this branch. git merge-tree finds no conflict. It adds no migration, so the highest on origin/main is still 0334, and 0335 is this entry's. No 13n round has landed, so nothing was carried. If a newer migration lands first, 0335 moves with its journal entry and its tests/what-each-migration-adds file.",
  '',
  'Next: briefs/NEXT.md gives the next round item 3. It deletes the 120 H-class files the tool maintainer chose (WRAqRO1l_2E0) and keeps the 40 borderline files, the 12 mixed and the 7 text gates. Its report names Madeup300001 as the decision it changes. Package P1 (42764tCruZff) moved to 13y at 15:04 (JUFoToW-uTkK), and NEXT.md says not to take it. The old brief is appended byte for byte to briefs/NEXT-history.md.',
].join('\n')

export const THE_SENTENCE_ABOUT_WHAT_A_GATE_LETS_THROUGH = 'A fault of form is listed before the seal and refuses no seal at "remind" or "off".'

/**
 * A ROUND'S LAST MESSAGE THAT SAID "I SEAL NEXT", AND WHOSE CHECK WAS HELD FOR A STEP NAME IT QUOTED IN SINGLE QUOTES.
 * On 12 November 2026 a worker of line 13n sealed after this message to its starter, and the office read it as saying
 * the run will not seal. The stop was read from the sentence below, where the worker quoted its brief's step name in
 * single quotes. Every line of the message is its own, copied from the record as it is stored, except that where it
 * named the live office's port by its number it says "the configured port".
 */
export const THE_MESSAGE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES = [
  'I seal next.',
  '',
  'Step 1: tsc --noEmit at b02ae882a exited 0 (log out/seal-fb/tsc.log).',
  '',
  "Step 2, control at 2566c445e: line R red in exactly the three expected cases (3 of 23); line I red in exactly case 10 (1 of 13), theCheck 'held'; line F red in R2, R6 and R7 (3 of 20), each because `authority` is missing.",
  '',
  'Step 3, at b02ae882a: line R 23/23, line I 13/13, line F 20/20, and batch N 10 files 129/129, all green. Per-file counts are in the report.',
  '',
  'Step 4, mutation 1 (the old pattern back): line R red in the same three cases and line I in case 10, as expected; undone, git status empty.',
  '',
  "Step 5, mutation 2 ('no seal' never a stop): line R red in exactly the two expected cases; line I red in exactly cases 9 and 11 (check still held, says 'does not say it seals'); undone, git status empty.",
  '',
  'Step 6, restore lines R and I: both green (23 and 13).',
  '',
  'Step 7, mutation 3 (the constant not exported): line F red in the same three cases as step 2; undone, git status empty.',
  '',
  'Step 8, restore line F: green (20/20).',
  '',
  "Nothing red differed from the expected red. One difference to name: the ten-file batch's stored use line (use 7) spells out four files and says 'and 6 more', because the line is capped at 300 characters. The other reading of the brief's stored-line check is that the tool's per-file rows, not the 300-character line, must spell out each file; under that reading it is not a fault. Every single-file use line names its file, every use has proof 'matches', and every full log's guard line names the configured port. Report 8ZVpCRi8FVLW is linked about my run; HEAD is b02ae882ac120140dbb5c39489e56f6bde34632a and git status --short is empty. I made no commit.",
].join('\n')

export const THE_SENTENCE_THAT_QUOTES_A_STEP_IN_SINGLE_QUOTES = "Step 5, mutation 2 ('no seal' never a stop): line R red in exactly the two expected cases;"
