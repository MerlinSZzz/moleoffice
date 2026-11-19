// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN'S LAST MESSAGE WHOSE QUOTATION HELD ITS CHECK: the fixture for tests/how-a-round-ended-rules.test.ts and
 * tests/how-a-round-ended.test.ts.
 *
 * On 15 October 2026 a supervisor sent its starter this message (message yo5PlvfZ7OFK) and then sealed its run. The message
 * says "I seal it next" and ends "I seal next". Its question 1 quotes the title of a line the office itself writes, "A round
 * ended without a seal". The office read that quotation as the agent saying it stops, and held the check of the run.
 * `THE_MESSAGE` is the body as it was sent, one array item per line. `THE_SENTENCE` is the sentence the office misread.
 */

export const THE_MESSAGE = [
  "Items 1 and 3 of the backlog are done on branch wave-13j-supervisor. My run is RhrF7SNT6c_0, and I seal it next.",
  "",
  "What changed:",
  "- Item 1, B for the window close. For an agent registered with no key of its own, the close now names the one true way out, which is a run key. Worker w13j-close-marked did it, run Ho4Uvtp-ktvp.",
  "- Item 3, reading (a). The supervisor run that asked for a worker may now confirm that worker's report. Worker w13j-asker-confirms did it, run BfgcgguQ3JS0.",
  "- I fixed one sentence myself. The run's reporting standing now says the report waits to be confirmed, and names nobody.",
  "- Both workers ran on Codex, gpt-6.1-sol, fast. Their ledger sections are in out/worker-ledger.md.",
  "",
  "The other items:",
  "- Item 4: I watched the first real self-start and reported it.",
  "- Item 2, the hand start with --asked-by, moves to the next round, as your SC1XRbGXS5iS point 3 says.",
  "",
  "The report is VUCgr-DFFHsC. It is linked to my run, and its short forms are current.",
  "",
  "The branch:",
  "- It holds nine commits on f5bded477. The tip is 34e9e2233.",
  "- Main moved from dd4ecf468 to f5bded477 during the round. I rebased once and ran every proof again.",
  "- The proofs are logs 56 to 70 in out/after-the-read-rule/. My run's uses door lists 55 uses.",
  "- The type check, the build, the refusal inventory, the replay proof and the owner-content gate write no use, because they do not run through run-named-tests. Their logs are 56, 57, 58 and 68.",
  "- At my last fetch, origin/main was still f5bded477. The worktree's git status is clean.",
  "",
  "NEXT.md is written at briefs/NEXT.md. It begins with \"A refusal comes first\".",
  "",
  "Three questions for you:",
  "1. Should a worker seal its run? The office sent \"A round ended without a seal\" about both worker runs (messages fR8npFNw6VR_ and TYMgKeSV4CkA). Neither brief asked the worker to seal.",
  "2. When the launcher run aYfrxKc0YQNe ended, the office added a check note to it. The note lists acts that do not apply to a run with no model. Is that a fault for the next round to fix? It is backlog item 3 in NEXT.md, and I did not answer the note by hand.",
  "3. In both Codex workers, run-named-tests could not write a use line. The office answered 403, because the request carried no run key. tools/use-line.mjs has read the run's key from the run's office tool settings since 592b8959a, yet it found none here. I do not know why. I ran the workers' control, mutation and restore runs again on my own run, so those proofs are on my uses door. The workers' own runs are in their reports, IzYbm4eqikQK and Holp5Wh0LPfB.",
  "",
  "Two things to tell you:",
  "- My worktree holds old things that git ignores. They are an out/ folder with round 41's logs from 8 Oct, .scratch/, a .logs/isolated link to ../.wave-13j-supervisor.worlds, and a node_modules link. All were made before this round, and none points into the sandbox's out/ folder. LINE-common's new line says to make no link or other new file inside a worktree. I removed nothing. Tell me if you want them gone.",
  "- The worker worktrees w13j-archive-mark, w13j-m15-test, w13j-close-marked and w13j-asker-confirms are yours to remove. I left them alone.",
  "",
  "I seal next.",
].join('\n')

export const THE_SENTENCE = "The office sent \"A round ended without a seal\" about both worker runs (messages fR8npFNw6VR_ and TYMgKeSV4CkA)."
