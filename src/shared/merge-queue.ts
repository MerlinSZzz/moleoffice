// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S WORDS: what a merge entry is, the states it can be in, and what a changeset holds.
 *
 * Sandbox v1, piece P6 — the queue's data layer — widened by decision R3: what the queue carries into
 * the main world is a CHANGESET, not a git branch. A changeset is a
 * base plus a list of changes, and it comes through one of two adapters, both first-class:
 *
 *   git    the changes are a commit on a branch, over a base commit, in a repository this office has
 *          registered. The commit and the base are read off the run's seal, never typed by the caller.
 *   files  the changes are a manifest over a folder that is not in git — images, PDFs, datasets,
 *          Mole Office's own data/ files: each operation names a path, the content's hash before and
 *          after (`absent` where there is none), where the content came from, and the new content is
 *          staged in a folder beside it.
 *
 * ---------------------------------------------------------------------------------------
 * THE STATES ARE STORED WORDS HERE; THE STATE MACHINE DECIDES BETWEEN THEM
 * ---------------------------------------------------------------------------------------
 *
 * `MERGE_STATES` is the state machine of SPEC.md section 5.4, as the words an entry stores. This
 * file says four things about each state that the data layer needs — whether an entry in it holds
 * its lane, whether it is final, whether it may still be withdrawn, and whether the merge tool makes
 * its next move, which is what the message worker starts the tool for (piece P9), through the mark
 * `toolWanted` the state writer derives from it — and one table of which state each reported step
 * is taken from (`A_STEP_IS_TAKEN_FROM`). Which state follows a step, on what evidence, is
 * src/server/lib/merge-state-machine.ts (piece P7); the moves that need no record are written once, in
 * `theMoveAStepMakes` at the end of this file, and that state machine calls it.
 *
 * ONE ENTRY PER LANE AT A TIME, AND THE LANE IS A DIRECTORY. The lane is the directory the changes
 * land in: a repository's checkout for git, the target folder for files. Two changesets that land in
 * one directory wait for each other; two that land in two directories do not. The database enforces
 * it — `records_one_merge_entry_per_lane` in drizzle/0171 — through the one field `occupies`, which
 * only the state writer in src/server/lib/merge-queue.ts sets, and only from `occupiesTheLane` below.
 */
import { gateNamed, gateValueIsAllowed } from '../config/gates.mjs'
import { theHourAfter, type ClockStamp } from './time.ts'
import type { ParticipantRef } from './participants.ts'

/** The kind word, in one place, for the reason `NOTEBOOK_KIND` gives. */
export const MERGE_ENTRY_KIND = 'merge_entry'

/**
 * THE RUNTIME NAME THE MESSAGE WORKER GIVES THE MERGE TOOL'S SESSION. SPEC.md section 5.3: the
 * worker's `MergeAdapter` (piece P9) starts `tools/the-merger.mjs` under this name, and the tool doors
 * accept a session only when it carries it — the same binding `inspection-tool` gives the check.
 * The merge tool runs no model and serves no agent; `RUNTIMES_THAT_RUN_NO_MODEL` in
 * src/shared/check-eligibility.ts lists this runtime with the round launcher's.
 */
export const MERGE_TOOL_RUNTIME = 'merge-tool'

/**
 * Every state an entry can be in, in the order SPEC.md section 5.4 draws them. `resolving` is not in that drawing: it is
 * tier 2 of a decision of the owner's, and it stands after `integrating` because a resolution goes to the check again
 * next.
 */
export const MERGE_STATES = [
  'submitted',
  'pinned',
  'judged',
  'integrating',
  'resolving',
  'reinspecting',
  'testing',
  'landing',
  'merged',
  'bounced',
  'withdrawn',
  'superseded',
] as const
export type MergeState = (typeof MERGE_STATES)[number]

/** Correlated normal submissions keep only the authoritative problem reference and take-out target IDs. */
export type { MainSuiteFixReference } from './main-suite-fix.ts'

/**
 * Why an entry went back to whoever submitted it. Stored on the entry by the state machine (P7).
 *
 * `unjudged`: no inspector's verdict can cover a path it lands — a files entry bringing bytes its seal
 * did not freeze, or one a checker handed on for a reading no check of a files entry can give.
 * `stalled`: the merge tool ended without moving it as often as the tool-runs-in-one-place row allows.
 * Both added at the sandbox v1 fix of the queue (INTEGRATION.md section 7, issues 4 to 6).
 * `incomplete`: the run's report lacked a doing line, the chapters read, or a control, mutation and restore for a test the
 * run added, read at the pin before any check of the run started, by part 1 of a decision, in wave 13v round
 * 34.
 */
export const BOUNCE_REASONS = ['refused', 'conflict', 'guard', 'red', 'churn', 'unjudged', 'stalled', 'incomplete'] as const
export type BounceReason = (typeof BOUNCE_REASONS)[number]

/** What the data layer knows about one state. */
export interface MergeStateSpec {
  /** What an entry in this state is, in one sentence a person reads. */
  readonly means: string
  /** Who or what the next move is waiting on. */
  readonly waitsOn: string
  /** An entry in this state holds its lane, and no other entry may hold that lane at the same time. */
  readonly occupiesTheLane: boolean
  /** Nothing follows this state. An entry in it is never moved again. */
  readonly final: boolean
  /** Its submitter or the person may still withdraw it. Everything before `landing` that is not final. */
  readonly mayBeWithdrawn: boolean
  /**
   * THE MERGE TOOL MAKES THE NEXT MOVE. When an entry arrives in a state with this, the office marks it
   * `toolWanted`, and the message worker starts the merge tool for a marked entry that no tool run holds.
   * The same derivation as `occupiesTheLane`: the mark is written by the state writer, from this, and
   * from nothing else. SPEC.md 5.4: the tool pins a submitted entry, takes the lane for a judged one, and
   * integrates, tests and lands one that holds its lane. One state where this is false still has the tool act in one
   * case, which `theMergeToolActsOn` reads: a resolving entry whose resolution waits for the tool's check.
   */
  readonly theMergeToolActs: boolean
}

export const MERGE_STATE_SPECS: { readonly [S in MergeState]: MergeStateSpec } = {
  submitted: {
    means: 'Submitted. Its run has a seal, and nothing has been fetched or checked yet.',
    waitsOn: 'the merge tool, which pins the submitted content so it cannot move under the check',
    occupiesTheLane: false,
    final: false,
    mayBeWithdrawn: true,
    theMergeToolActs: true,
  },
  pinned: {
    means: 'Pinned. The submitted content is held by the office and cannot move any more.',
    waitsOn: "the inspector's release of the run that submitted it",
    occupiesTheLane: false,
    final: false,
    mayBeWithdrawn: true,
    theMergeToolActs: false,
  },
  judged: {
    means: 'Judged. A verdict covers exactly this content, and it is queued for its lane.',
    waitsOn: 'its lane, which takes one entry at a time, and then the merge tool, which takes the lane and puts it on top of the main world',
    occupiesTheLane: false,
    final: false,
    mayBeWithdrawn: true,
    // THE MERGE TOOL TAKES THE LANE (the `integrating` step is reported from judged, A_STEP_IS_TAKEN_FROM),
    // so the office asks for the tool here. The worker is not handed a judged entry whose lane another
    // entry holds, or whose deletes the secretary has not confirmed: `theMergeToolWork` holds it back
    // with its mark standing, and it is handed on once that changes. Sandbox v1 integration.
    theMergeToolActs: true,
  },
  integrating: {
    means: 'Integrating. It holds its lane and is being put on top of the main world as it is now.',
    waitsOn: 'the merge tool',
    occupiesTheLane: true,
    final: false,
    mayBeWithdrawn: true,
    theMergeToolActs: true,
  },
  // A CONFLICT NO RULE JOINS (tier 2 of the plan for merge conflicts).
  // The entry leaves its lane so the queue goes on, and its own supervisor has the time set for resolving a conflict on
  // the Gates panel, counted from the first conflict and never reset. Nothing moves an entry here while
  // MOLE_OFFICE_CONFLICT_RESOLVING is off, and it is off by default. A TEST RED ONLY WITH THE ENTRY comes here the same way
  // (13u round 63), in the same time, and only while MOLE_OFFICE_RED_FIXING is on, which is off by default too.
  // THE MERGE TOOL ACTS HERE ONLY WHILE A RESOLUTION WAITS FOR ITS CHECK (aResolutionWaitsForItsCheck, XHY2fVFG3Qq8,
  // answer 1), so the state's own word is false, and the state writer reads the entry's resolution beside it.
  resolving: {
    means: 'Resolving. Its commits conflict with the main world in a way no rule joins, or a test is red only with it, and its own supervisor is asked to resolve the conflict or fix the test. It has left its lane, so the queue goes on.',
    waitsOn: 'its own supervisor, who resolves the conflict or fixes the red test within the time set for resolving a conflict on the Gates panel',
    occupiesTheLane: false,
    final: false,
    mayBeWithdrawn: true,
    theMergeToolActs: false,
  },
  // A CHECK AGAIN LETS THE LANE GO (wave 13u, item 53). Somebody has to start the check, and that can
  // take an hour, so the next judged entry of the lane may land meanwhile. The check's release takes the lane back when
  // it is free and main has not moved, and otherwise sends the entry back to judged with `returnsFirst`. An entry back
  // from a check holds its lane through its next check, so a second check does not let the lane go again; the state
  // writer reads `returnsFirst` beside this word, in `occupiesTheLaneIn`.
  reinspecting: {
    means: 'Reinspecting. Putting it on top of the main world changed some files, and only those are checked again.',
    waitsOn: 'the inspector, reading only the files that changed',
    occupiesTheLane: false,
    final: false,
    mayBeWithdrawn: true,
    theMergeToolActs: false,
  },
  testing: {
    means: 'Testing. The integrated result is being tested before it lands.',
    waitsOn: 'the merge tool',
    occupiesTheLane: true,
    final: false,
    mayBeWithdrawn: true,
    theMergeToolActs: true,
  },
  landing: {
    means: 'Landing. The office has started moving the main world. It can no longer be withdrawn.',
    waitsOn: 'the merge tool, and then the server being healthy again',
    occupiesTheLane: true,
    final: false,
    mayBeWithdrawn: false,
    theMergeToolActs: true,
  },
  merged: {
    means: 'Merged. It is in the main world.',
    waitsOn: 'nobody',
    occupiesTheLane: false,
    final: true,
    mayBeWithdrawn: false,
    theMergeToolActs: false,
  },
  bounced: {
    means: `Bounced back to its submitter, for one of these reasons: ${BOUNCE_REASONS.join(', ')}.`,
    waitsOn: 'its submitter, who fixes it and submits again',
    occupiesTheLane: false,
    final: true,
    mayBeWithdrawn: false,
    theMergeToolActs: false,
  },
  withdrawn: {
    means: 'Withdrawn by its submitter or the person before it landed.',
    waitsOn: 'nobody',
    occupiesTheLane: false,
    final: true,
    mayBeWithdrawn: false,
    theMergeToolActs: false,
  },
  superseded: {
    means: 'Superseded. A newer entry for the same work was submitted, and that one carries it now.',
    waitsOn: 'nobody',
    occupiesTheLane: false,
    final: true,
    mayBeWithdrawn: false,
    theMergeToolActs: false,
  },
}

/**
 * WHAT THE MERGE TOOL REPORTS THROUGH `POST /api/merge-queue/:id/step`. The door contract of SPEC.md
 * section 5.2, settled here so the tool (P8), the worker (P9) and the state machine (P7) are written
 * against one list. The tool reports what happened; the server decides the next state. Each step's
 * `facts` object is the state machine's to define, and this layer only requires that it is an object.
 */
export const MERGE_STEPS = [
  // The submitted content is held by the office: a pinned ref for git, verified and copied blobs for files.
  'pinned',
  // The tool asks for the lane before it puts the entry on top of the main world. Refused while the lane is held.
  'integrating',
  // It was put on top of the main world without a conflict. Facts name the result and the files it changed.
  'integrated',
  // It could not be put on top of the main world. Facts name the files.
  'conflict',
  // A guard refused it (a protected path, a mutation marker). Facts name the guard and the files.
  'guard-failed',
  // The tests ran on the integrated result. Facts say green or red and name the red tests.
  'tested',
  // The tool is about to move the main world. Written BEFORE it does, so the state is on disk first.
  'landing',
  // The main world moved under it before it could land (the compare-and-swap failed).
  'main-moved',
  // The main world moved while its tests ran, found before the tool ran its red files again or compared them with
  // main: the tree it tested can no longer land, so nothing more is run on it. Acceptance finding 54, the step that was
  // approved (message yGDKJuwi6VbE).
  'main-moved-while-testing',
  // Main moved under it only by documentation landings: the tool put it on the new main again,
  // with nothing to test again, and the office checks that only those landings lie between the two mains.
  'moved-past-documents',
  // It landed: main moved to the landed commit. The step's sentence says whether the office was healthy after the move,
  // and the landing does not always wait for that.
  'landed',
  // THE SANDBOX LAUNCHER HAD NO ROOM, while the entry was tested or integrated: it refused a build or a test with exit
  // 75 (EX_TEMPFAIL), under 80 GB free or while another GPU sandbox runs, before anything was filed or started. Nothing
  // ran, so nothing is red. The entry keeps its place, the tool tries again, and the office tells the secretary one
  // line an hour at most while it waits, in wave 13p round 19. Facts carry the launcher's
  // sentence.
  'no-room-to-test',
  'no-room-to-integrate',
  // FILES RED ON MAIN ALONE, which belong to no entry: the office files a problem for the build sheriff for each one
  // not already open, and tells the secretary one line, by item 4 of a decision. The entry is not moved.
  'red-on-main',
  // THE MERGE TOOL CHECKED A RESOLVING ENTRY'S RESOLUTION, in tier 2 of a decision, round B, with XHY2fVFG3Qq8, answer
  // 1.
  // Facts name the commit checked, and say passed, with the places and the ref that holds it, or refused, with why.
  'resolution-checked',
  // THE OFFICE LOOKS WHETHER THE FIX ROUND IT ASKED FOR HAS OPENED (wave 13u round 90). The entry waits in testing for
  // at most FIX_ROUND_MINUTES; the tool reports this while it waits, and the office lands it handed back, asks the build
  // sheriff, or bounces it. No facts.
  'fix-round-looked',
] as const
export type MergeStep = (typeof MERGE_STEPS)[number]

/**
 * THE STATE MACHINE'S ONE TABLE: WHICH STATE EACH STEP IS REPORTED FROM. Sandbox v1 piece P7,
 * SPEC.md section 5.4. The tool reports a step; the server takes it only from the state named here,
 * and answers 409 naming the state the entry is in and what that state waits on otherwise.
 *
 * WHERE A STEP LEADS WHEN NO RECORD DECIDES IT is `theMoveAStepMakes` below: `tested` stays
 * `testing` when green or explicitly admitted for a fix round, and otherwise bounces when red; `main-moved` goes back to `judged` until
 * the landing-attempts limit is spent, and then bounces as churn, and so does `main-moved-while-testing`,
 * counted with it. The rest is decided in src/server/lib/merge-state-machine.ts, because it depends on
 * evidence the step carries: `pinned` goes to `judged` when the inspector's release already covers
 * the pinned content or the project's review level covers it, to `bounced` when a refusal stands, and
 * stays `pinned` while the check or the confirmation is owed; `integrated` goes to `testing` when
 * nothing the verdict covered changed or the review level is below Full, and to `reinspecting`
 * otherwise.
 */
export const A_STEP_IS_TAKEN_FROM: { readonly [S in MergeStep]: MergeState } = {
  pinned: 'submitted',
  integrating: 'judged',
  integrated: 'integrating',
  conflict: 'integrating',
  'guard-failed': 'integrating',
  tested: 'testing',
  landing: 'testing',
  'main-moved': 'landing',
  'main-moved-while-testing': 'testing',
  'moved-past-documents': 'testing',
  landed: 'landing',
  'no-room-to-test': 'testing',
  'no-room-to-integrate': 'integrating',
  'red-on-main': 'testing',
  'resolution-checked': 'resolving',
  'fix-round-looked': 'testing',
}

/** The two limits the move table reads. */
export interface MergeLimits {
  /**
   * HOW MANY TIMES THE MAIN WORLD MAY MOVE UNDER AN ENTRY, while it is tested or as it lands, before the
   * entry is bounced as churn instead of being queued again. Both steps count (acceptance finding 54).
   * The landing-attempts row declares the default.
   */
  readonly landingAttempts: number

  /**
   * HOW MANY MERGE TOOL RUNS ONE ARRIVAL IN A STATE GETS, when each ends without moving the entry — a crash,
   * a stop press, a start that never reached the ledger, a step lost in a race. After each such ending the
   * office asks for its tool again (it marks the entry `toolWanted` once more), and after this many it
   * stops asking: the entry bounces as `stalled` with the last run's own words, except in `landing`, where
   * the main world may already hold part of it, so the entry stays where it is and the secretary is told a
   * person must look. The count is `stalls` on the entry, and the state writer drops it on every arrival in
   * another state. Sandbox v1 fix of the queue, INTEGRATION.md section 7 issue 6.
   */
  readonly toolRuns: number
}

/**
 * THE VERDICT FOLLOWS FILE CONTENT. Decision R2, and SPEC.md
 * section 5.5: a verdict is on content, not on a commit. An entry remembers, path by path, the
 * content hash an independent passing verdict read — `judged` — and after the entry is put on top
 * of the main world only the paths whose content is not what the verdict read are judged again.
 *
 * A `ContentByPath` names each changed path at its content hash: sha256 of the file's bytes — for a
 * git entry, of the blob as `git cat-file` reads it, which is exactly the hash the seal holds in
 * `seal.git.files`; for a files entry, the manifest's after-hash — and the word `absent` for a path
 * the change deletes. It is never git's own object id. It never holds a null, because a null in a
 * stored patch removes the key, and a deleted path is a real answer.
 */
export type ContentByPath = Readonly<Record<string, string>>

/**
 * WHICH PATHS KEEP THEIR VERDICT AND WHICH NEED ONE. The one rule of decision R2, read by the state
 * machine at the integrate step and by anybody asking what a re-check would cover.
 *
 * `judged` is what a verdict read, path by path; `now` is what the entry changes now, path by path.
 * A path of `now` whose hash is exactly what was judged keeps its verdict. A path of `now` that no
 * verdict read, or that was read at other content, needs one. A path in `judged` that `now` does not
 * change any more is neither: the entry no longer changes it, so there is nothing to judge.
 *
 * `lines` is what the merge tool found of line files (decision HV60rcgJlfDH). A path of `now` at other content keeps its
 * verdict as well when a verdict read it, it is a line file, and the tool says its own lines held; those are named again
 * in `keptByLine`, so the office can say which verdicts held by line.
 */
export function whatChangedSinceTheVerdict(
  judged: ContentByPath,
  now: ContentByPath,
  lines: readonly LinesOfAFile[] = [],
): { kept: string[]; changed: string[]; keptByLine: LinesOfAFile[] } {
  const kept: string[] = []
  const changed: string[] = []
  const keptByLine: LinesOfAFile[] = []
  for (const path of Object.keys(now).sort()) {
    if (Object.hasOwn(judged, path) && judged[path] === now[path]) kept.push(path)
    else {
      const held = Object.hasOwn(judged, path) && isALineFile(path) ? lines.find((one) => one.path === path && one.held) : undefined
      if (held === undefined) changed.push(path)
      else {
        kept.push(path)
        keptByLine.push(held)
      }
    }
  }
  return { kept, changed, keptByLine }
}

/** The joiner of the fields each line adds to a shared kind, which src/shared/kinds.ts reads. */
export const THE_KIND_FIELDS_PARTS = 'src/shared/kind-fields/parts.ts'

/**
 * THE NAMED LINE FILES: a verdict follows the entry's own lines under decision HV60rcgJlfDH in these list files and wave
 * 13j's word files of one wave each, by the pattern below. The round 7 brief adds parts.ts, the word-list joiner with
 * one re-export line per wave word file. A joining file stays eligible only while it holds one import or re-export
 * per line and no code; if it holds code, judge it by file (cHz3hjwN4flv). A decision adds the two
 * operation-name and route-group lists. They hold one literal name per line; their
 * executable code and authorization
 * stay judged by file. A list that holds code is judged by file. These are explicit exceptions to R2.
 * 13s round 96's END asked for the same for the fields a line adds to a shared kind, and it was made item 14 of 13u's
 * list. So the kind-fields joiner is a line file under the joining-file rule above, and so is each line's own file
 * beside it, by the second pattern below. The joiner may also hold `export {}`, as it does before any line adds a file.
 */
export const LINE_FILES: readonly string[] = ['src/shared/words/en.ts', 'src/shared/words/zh.ts', 'src/shared/words/parts.ts', THE_KIND_FIELDS_PARTS, 'src/shared/ops-list.ts', 'src/server/routes-list.ts']
const A_WORD_FILE_OF_ONE_WAVE = /^src\/shared\/words\/(en|zh)-(wave-[^/]+|no-wave)\.ts$/
/** A line's own file of fields for one kind, named `<kind>-wave-<line>.ts` as src/shared/kinds.ts says. */
export const A_KIND_FIELDS_FILE_OF_ONE_LINE = /^src\/shared\/kind-fields\/[a-z-]+-wave-[^/]+\.ts$/

/** Whether a path is judged by line (decision HV60rcgJlfDH) rather than by file (decision R2). */
export function isALineFile(path: string): boolean {
  return LINE_FILES.includes(path) || A_WORD_FILE_OF_ONE_WAVE.test(path) || A_KIND_FIELDS_FILE_OF_ONE_LINE.test(path)
}

/**
 * WHAT THE MERGE TOOL FOUND OF A LINE FILE whose content is not what the verdict read: whether the entry's own lines
 * stand unchanged on the joined tree with no line of anybody else meeting them, the lines they are at there, and why
 * not when they do not hold.
 */
export interface LinesOfAFile {
  path: string
  held: boolean
  ranges?: string
  why?: string
}

/** One sentence naming the line files whose verdict holds by line, their lines and the decision. */
export function keptByLineSay(kept: readonly LinesOfAFile[]): string {
  const each = kept.map((one) => `${one.path} (its own ${one.ranges ?? 'lines'})`)
  return `${each.join(' and ')} ${kept.length === 1 ? 'keeps its' : 'keep their'} verdict by line: only other entries' lines changed there`
}

/** Where the office writes the integration receipt on the run that submitted a merged entry. */
export const INTEGRATED = 'integrated'

/**
 * WHAT THE OWNER-CONTENT GATE NAMED AND DID NOT REFUSE (wave 13v round 31): agent handles, Chinese in comments, the
 * owner's words told in prose, record ids and session ids on the lines the entry adds to what ships. The merge tool's
 * gate, tools/merge-tool/owner-content.mjs, reports it on the integrated step. The entry's `integration` keeps it, and
 * at landing the receipt, `data.integrated`, keeps it on the entry and on the run. Absent when no gate read the entry:
 * an entry integrated before the gate, or a files entry, which has none. `reminded` 0 means the gate read it and named
 * nothing.
 */
export interface OwnerContentReminders {
  /** How many hits the gate named. */
  reminded: number
  /** How many of them each pattern found, by the pattern's id, such as P10. */
  byPattern: Record<string, number>
  /** The gate's own sentence, with the first three hits of each pattern. Absent when it named nothing. */
  says?: string
  /** The gate's log in the merge tool's work folder, which keeps every hit. */
  log: string
}

/**
 * THE COMMITS AT THE PLACEHOLDER ADDRESS THAT THE COMMIT-ADDRESS GATE LET LAND (wave 13q). The gate,
 * tools/merge-tool/commit-addresses.mjs, finds each commit an entry would land whose author or committer is at the
 * domain of MOLE_OFFICE_COMMIT_EMAIL's declared default. At remind the entry goes on and the integrated step carries
 * them; the entry's `integration` keeps them, and at landing the receipt, `data.integrated`, keeps them on the entry and
 * on the run. Absent when the gate let no such commit through at remind: it found none, it was at off, which only the
 * merge tool's log says, or the entry was integrated before the gate had positions.
 */
export interface PlaceholderCommits {
  /** The gate's position when it let them through; only remind carries them. */
  position: 'remind'
  /** The placeholder domain, in lower case. */
  domain: string
  /** Each commit by its sha, with its author and its committer address where it is at the domain, and null where it is not. */
  commits: { commit: string; author: string | null; committer: string | null }[]
  /** The gate's screen in the merge tool's work folder. */
  log: string
}

/** The receipt SPEC.md section 5.4 calls `data.integrated`: one on the entry, one on its run. */
export interface IntegrationReceipt {
  /** The merge entry that carried the work. */
  entry: string
  /** The main world before and after, as the tool reported them: commits for git, what the tool measured for files. */
  mainBefore: string
  mainAfter: string
  /** The commit the entry became on top of the main world, for a git entry; null for files. */
  rebasedTip: string | null
  /** The seal the entry was submitted on. */
  sealId: string
  /** The verdict the merge rested on: the release that covered the pinned content. */
  carriedVerdict: { run: string; by: { kind: string; id: string }; at: string; how: string; paths: number; says: string }
  /** Every scoped check the queue asked for on the way, in order. */
  reinspected: { run: string; only: string[]; needsJudgment: string[]; releasedAt: string }[]
  /**
   * The tests that ran on what landed, as the tool reported them. Absent when the tool reported none. `plugin` names the
   * plugin whose own check tested a plugin-only change in place of the office's suite (plan VlQueUhVQQmi).
   */
  tests?: { ran?: number; passed?: number; log: string; plugin?: { id: string; manifest: boolean }; green?: boolean; wholeSuiteRed?: import('./whole-suite-red.ts').WholeSuiteRed; busCause?: import('./whole-suite-red.ts').BusCause; houseRules?: import('./merge-class.ts').HouseRulesDecision; mergeClass?: import('./merge-class.ts').MergeClassDecision | import('./merge-class.ts').WideRedDecision; build?: { passed: boolean }; repair?: import('./merge-class.ts').RepairFact }
  /** What the owner-content gate named on what landed and did not refuse. Absent when no gate read the entry. */
  ownerContent?: OwnerContentReminders
  /** The commits at the placeholder address the commit-address gate let land at remind. Absent when it let none through. */
  placeholderCommits?: PlaceholderCommits
  at: string
  /**
   * The clock observation beside `at`, which the queue's speed measures from, since the stamp alone repeats an hour when
   * the clocks go back. Absent on a receipt written before it was kept.
   */
  time?: ClockStamp
}

/**
 * WHY AN ENTRY A CONFLICT SENT TO RESOLVING BOUNCED, as one of four closed words (design 8AJQD_oExaVt, point 5;
 * XHY2fVFG3Qq8, answer 2), stored on the bounce as `resolution`. Each keeps the bounce reason this names, so
 * the word and the reason are never written apart. Modelled on MAIN_SUITE_FIX_TAKEOUT_REASONS.
 */
export const RESOLUTION_BOUNCES = ['the hour ran out', 'could not be read', 'changes what one side meant', 'not green', 'not fixed in the hour'] as const
export type ResolutionBounce = (typeof RESOLUTION_BOUNCES)[number]
export const THE_REASON_A_RESOLUTION_BOUNCE_KEEPS: { readonly [R in ResolutionBounce]: BounceReason } = {
  'the hour ran out': 'conflict',
  'could not be read': 'conflict',
  'changes what one side meant': 'refused',
  'not green': 'red',
  // A RED HANDED TO THE ENTRY'S OWN LINE (13u round 63) whose time to fix ended with no fix handed over, or with the last
  // one refused by the merge tool's check.
  'not fixed in the hour': 'red',
}

/** Why an entry went back to its submitter, stored on the entry as `bounced`. SPEC.md section 5.6. */
export interface Bounce {
  reason: BounceReason
  at: string
  /** The paths the reason is about: the conflicting files, the guard's files, the changed-and-refused files. */
  files: string[]
  /** The tests a red bounce names: the run's red tests, and any that changed their answer at block. */
  redTests?: string[]
  /**
   * The files whose answer changed, for a red bounce that MOLE_OFFICE_GATE_FLAKY is at block sent back: they did not
   * stay red, so a sentence about staying red is not said of them. Absent on every other bounce.
   */
  changedTheirAnswer?: string[]
  /** Where the tool's log is, when it named one. */
  log?: string
  /** Where the main world stood when it bounced, when the step said. */
  mainAt?: string
  /** For an entry a conflict sent to resolving, which of the four closed words it bounced for. Absent on every other bounce. */
  resolution?: ResolutionBounce
  /**
   * WHO SAID THE CONFLICT CANNOT BE RESOLVED, and the sentence as they wrote it, for a bounce the entry's own line asked
   * for with the resolution door's body {"cannot"} (message XHY2fVFG3Qq8, answer 4). Absent on every other bounce.
   */
  cannot?: { by: { kind: string; id: string }; said: string }
  /** One paragraph a person reads: what happened and what to do next. */
  says: string
}

/**
 * THE NEXT-ROUND DOOR REFUSED A RESOLVING ENTRY'S RESOLVE BRIEF, as the secretary's watcher or the person told the queue
 * through POST /api/merge-queue/<id>/nobody-started (message XHY2fVFG3Qq8, answer 5): who told it, when, and the status
 * and words the door answered.
 */
export interface NobodyStarted {
  by: { kind: string; id: string }
  at: string
  status: number
  said: string
}

/**
 * WHOM THE OFFICE ASKED TO RESOLVE A CONFLICT IT HANDED ON, AND WHAT IT WROTE (Fr7xGMIidn97, way (a); XHY2fVFG3Qq8,
 * answer 6). `agent` is the supervisor the brief asks for. `brief` is the absolute path of the resolve brief the office
 * wrote into that agent's sandbox, or else `noBrief` says why none was written, and why no agent is named when none is.
 * `message` is the id of the one message that asked, or else `noMessage` says why none was sent.
 *
 * A MISSING ONE IS ABSENT, NOT NULL. A later write of the entry merges into what is stored, and a null there deletes the
 * key, so a stored null would not last past the next write of `resolving`.
 */
export interface AskedToResolve {
  agent?: string
  brief?: string
  noBrief?: string
  message?: string
  noMessage?: string
  /**
   * THE OFFICE ASKED FOR THE ROUND ITSELF (wave 13u round 90), because the agent had no run going: when, the status the
   * next-round door answered, its words, and the run that holds the ask when the door took it.
   */
  round?: { at: string; status: number; said: string; run?: string }
}

/**
 * THE FIVE THINGS THE ASKING MESSAGE CARRIES FOR A PROGRAM, stored on it as `askedToResolve` and written only by the
 * office: the entry, the files to resolve, the brief's absolute path or null, the agent to ask for
 * or null, and the end of the time to resolve as an instant in UTC. A red handed on adds the red tests as `red`, and
 * its `files` is empty.
 */
export interface AskedToResolveMessage {
  entry: string
  files: string[]
  red?: string[]
  brief: string | null
  agent: string | null
  until: string
}

/**
 * A CONFLICT HANDED TO THE ENTRY'S OWN SUPERVISOR, stored on the entry as `resolving`. The conflict as its bounce
 * would have stored it, and when its time to resolve started: `since` is an instant with its offset, `timeZone` the
 * office's zone at that moment, and `minutes` the duration fixed then. `theEndOfResolving` reads them together.
 */
export interface Resolving {
  files: string[]
  log?: string
  mainAt?: string
  /** The words the bounce would have used for the same conflict, without a bounce's remedy. */
  says: string
  since: string
  timeZone: string
  /**
   * The conflict-minutes row when the first conflict was handed on; later conflicts keep it. Absent means 60:
   * an entry stored without this field was given one hour when it started. That is its duration, not a guess.
   */
  minutes?: number
  /** Present once somebody told the queue that the next-round door refused the resolve brief. A later one replaces it. */
  nobodyStarted?: NobodyStarted
  /** Whom the office asked and what it wrote, at this hand-over. Absent on an entry handed on before round B asked anybody. */
  asked?: AskedToResolve
  /**
   * A CONFLICT MET BY A RESOLUTION THE CHECK PASSED (jmghLKcXenGW): that resolution's files, its commit, which
   * refs/mole-office/resolved/<entry> still holds, and the main it stood on. It is a help for resolving the earlier files
   * again, never the entry's side: `files` above names them, and the check judges them again in full.
   */
  resolvedBefore?: { files: string[]; commit: string; mainAt: string }
  /**
   * A TEST RED ONLY WITH THE ENTRY, handed to its own supervisor instead of a conflict (13u round 63): the test files that
   * were red with the entry on main and green on main without it. With `red`, `files` is empty and `mainAt` is the main
   * the entry was integrated and tested on.
   */
  red?: { tests: string[] }
  /**
   * WHAT THE CLEAN COPY AND THE CHECK REPLAY ONTO `mainAt` when it is not the entry's own pinned commit: a fix of red tests
   * the check passed, its commit, and the ref that held it in the lane's repository when this was written.
   */
  replays?: { ref: string; commit: string }
}

/**
 * HOW LONG A FEW-RED ENTRY KEEPS ITS LANE WHILE THE OFFICE ASKS FOR A FIX ROUND (wave 13u round 90). Starting a round
 * takes about a minute when the office asks itself.
 */
export const FIX_ROUND_MINUTES = 5

/**
 * ONE ASK FOR A FIX ROUND, AND WHAT THE NEXT-ROUND DOOR ANSWERED. `for` is the line's own supervisor or the build
 * sheriff. With no `status` the door was not asked, and `said` says why. `holder` is the run the ask is kept on.
 * `started` is the run the round started, and `ended` an ask that ended with no run, in the words its run holds.
 */
export interface FixRoundAsk {
  for: 'line' | 'sheriff'
  agent?: string
  at: string
  brief?: string
  status?: number
  said: string
  holder?: string
  started?: { at: string; run: string }
  ended?: { at: string; says: string }
}

/**
 * A FEW-RED ENTRY THAT WAITS FOR A FIX ROUND, stored on the entry as `waitsForAFixRound`. Its line's starter had no run
 * going, so the office asked for a round itself. `until` is the local end in `timeZone`, and `dueAt` the same end as an
 * instant. `reserved` permits landing but starts no repair before it; `opened` is an actual running round.
 * A reservation stays through landing so the eventual fresh run can be linked to its hand-back.
 */
export interface WaitsForAFixRound {
  since: string
  time: ClockStamp
  until: string
  dueAt: string
  timeZone: string
  minutes: number
  asks: FixRoundAsk[]
  /** An accepted launch reservation, distinct from a run that has opened. */
  reserved?: { at: string; for: 'line' | 'sheriff'; agent: string; holder: string }
  opened?: { at: string; for: 'line' | 'sheriff' | 'starter'; agent: string; run: string }
}

/** The one reading of a stored conflict's end, for the server and page. Invalid stored fields leave no readable end. */
export function theEndOfResolving(resolving: { since?: unknown; timeZone?: unknown; minutes?: unknown } | null): (ReturnType<typeof theHourAfter> & { minutes: number }) | null {
  if (resolving === null || typeof resolving.since !== 'string' || typeof resolving.timeZone !== 'string') return null
  // A missing duration is the 60 minutes this entry was given before durations were stored, not today's setting.
  const minutes = resolving.minutes === undefined ? 60 : resolving.minutes
  if (!(typeof minutes === 'number' && gateValueIsAllowed(gateNamed('conflict-minutes'), String(minutes)))) return null
  return { ...theHourAfter(resolving.since, resolving.timeZone, minutes), minutes }
}

/**
 * THE MINUTES LEFT TO HAND OVER ANOTHER RESOLUTION OR FIX at `nowMs`, from the one end `theEndOfResolving` reads: whole
 * minutes rounded up, so a part of a minute still counts, and 0 once the end has come. Null when the end cannot be read.
 */
export function theTimeLeftToResolve(resolving: Parameters<typeof theEndOfResolving>[0], nowMs: number): { left: number; minutes: number; until: string; untilMs: number } | null {
  const hour = theEndOfResolving(resolving)
  if (hour === null || hour.until === null || hour.untilMs === null) return null
  return { left: Math.max(0, Math.ceil((hour.untilMs - nowMs) / 60_000)), minutes: hour.minutes, until: hour.until, untilMs: hour.untilMs }
}

/**
 * A RESOLUTION HANDED OVER BY THE ENTRY'S OWN LINE, stored on a resolving entry as `resolution` (door (a) of
 * xqGNR20SQ9vO). The office read `commit` off the HEAD of `workingDirectory` itself, found it stands on `mainAt`, the
 * main the conflict met, and recorded each file the commit changes against that main with the hash and mode of its
 * content there, as a seal does. A later hand-over within the time set for resolving a conflict on the Gates panel
 * replaces it. The merge tool checks it next (tools/merge-tool/check-a-resolution.mjs), and
 * writes `checked` or `refused` through the 'resolution-checked' step.
 */
export interface Resolution {
  commit: string
  workingDirectory: string
  mainAt: string
  files: { path: string; hash: string | null; mode: string | null }[]
  by: { kind: string; id: string }
  at: string
  /** The supervisor's own run of the related tests, as it declared it with this hand-over. Absent when none was declared. */
  tests?: DeclaredTestRun
  /**
   * The merge tool's check refused this resolution, or the office refused it because the check ended without a result:
   * when, and its words. The entry stays resolving. Either way `message` is the one message that told the agent asked to
   * resolve and the secretary, or else `noMessage` says why none was sent.
   */
  refused?: { at: string; says: string; message?: string; noMessage?: string }
  /**
   * The merge tool's check passed this resolution: when, the ref in the lane's repository that holds its commit, and each
   * place it resolved, with the merge entry that landed each of main's commits there, or null when no receipt covers it.
   * The entry left resolving for pinned in the same write. A fix of red tests resolves no place, and names in `fixed` the
   * files it changes on top of the replay of the entry's own commits.
   */
  checked?: { at: string; ref: string; places: ResolvedPlace[]; morePlaces?: number; fixed?: string[] }
}

/**
 * THE SUPERVISOR'S OWN RUN OF THE RELATED TESTS, AS DECLARED with a hand-over (XHY2fVFG3Qq8, answer 3), in the shape
 * tools/merge-tool/resolve-a-conflict.mjs prints at the end of a replay: the commit it ran at, its exit code, how many
 * tests passed and failed, and the path of its log. Only an agent of the entry's own line whose own key proved its name
 * declares one, and the queue adds who and when. The office runs nothing and reads no log. It is evidence for the
 * inspector, never a pass or a fail, and the merge tool's check refuses a resolution whose declared run is at another
 * commit.
 */
export interface DeclaredTestRun {
  commit: string
  exit: number
  counts: { passed: number; failed: number }
  log: string
  by: ParticipantRef
  at: string
}

/** One side of one place, cut as HOW_MUCH_A_RESOLUTION_CHECK_REPORTS says, and how many lines more it had. */
export interface SideOfAPlace {
  lines: string[]
  more: number
}

/** One place a resolution resolved, as `Resolution.checked` keeps it. */
export interface ResolvedPlace {
  path: string
  /** The line of the conflicted file where git's markers of this place begin. */
  at: number
  /**
   * The entry's commit the replay stopped on, and the resolution's commit that resolved it, or null where the resolution
   * took main's side and git dropped the entry's commit, which that left with no change.
   */
  entryCommit: string
  resolvedIn: string | null
  ancestor: SideOfAPlace
  main: SideOfAPlace
  entry: SideOfAPlace
  resolution: SideOfAPlace
  /** Main's commits that wrote main's side, found by its lines or else by the file (`mainBy`), each with the entry that landed it. */
  mainCommits: { commit: string; entry: string | null }[]
  mainBy: 'lines' | 'file'
  /** The lines between two places also stand inside a resolution, so where one place ends is a reading, not a fact. */
  ambiguous?: true
}

/**
 * WHETHER A RESOLVING ENTRY'S RESOLUTION WAITS FOR THE MERGE TOOL'S CHECK (XHY2fVFG3Qq8, answer 1): one was handed
 * over and the check has not refused it. A pass moves the entry to pinned, and a conflict met after it drops the
 * resolution, so a resolving entry never holds a resolution the check passed. `resolution` is the entry's field as it is
 * stored, or as GET /api/merge-queue/<id> hands it.
 */
export function aResolutionWaitsForItsCheck(state: MergeState, resolution: unknown): boolean {
  if (state !== 'resolving' || typeof resolution !== 'object' || resolution === null || Array.isArray(resolution)) return false
  const held = resolution as Record<string, unknown>
  return typeof held['commit'] === 'string' && (held['refused'] === undefined || held['refused'] === null)
}

/**
 * WHETHER AN ENTRY CARRIES A RESOLUTION THE MERGE TOOL'S CHECK PASSED. Its turn integrates that resolution, held at
 * resolvedRefOf(entry), and not its own commit (tools/merge-tool/integrate.mjs), so the probe after a landing and the bus
 * pass it over: what its own commit meets on a later main is not what its turn meets.
 */
export function aResolutionPassedItsCheck(resolution: unknown): boolean {
  if (typeof resolution !== 'object' || resolution === null || Array.isArray(resolution)) return false
  const checked = (resolution as Record<string, unknown>)['checked']
  return typeof checked === 'object' && checked !== null
}

/**
 * WHETHER THE MERGE TOOL MAKES AN ENTRY'S NEXT MOVE: its state's own word, or, in resolving, a resolution that waits for
 * the tool's check. The state writer marks an entry for the tool by this, the entry's reader refuses a mark where it is
 * false, and the move table asks for the tool again by it after a run that ended without a result.
 */
export function theMergeToolActsOn(state: MergeState, resolution: unknown): boolean {
  return MERGE_STATE_SPECS[state].theMergeToolActs || aResolutionWaitsForItsCheck(state, resolution)
}

/** The two ways a changeset reaches the main world. */
export const CHANGESET_ADAPTERS = ['git', 'files'] as const
export type ChangesetAdapter = (typeof CHANGESET_ADAPTERS)[number]

/** The four operations a files changeset may carry. */
export const FILE_OPERATIONS = ['add', 'modify', 'delete', 'rename'] as const
export type FileOperationName = (typeof FILE_OPERATIONS)[number]

/**
 * THE TWO MODES A LANDED FILE MAY HAVE, in git's words: executable or not. Acceptance finding 41: a
 * check could ask for a file's mode, and no field could carry it, so a worker could only promise it.
 */
export const FILE_MODES = ['100644', '100755'] as const
export type FileMode = (typeof FILE_MODES)[number]

/** The hash word for "there is no file here", before an add and after a delete. */
export const ABSENT = 'absent'

/**
 * WHAT A FILES MERGE DOES WHEN THE MAIN WORLD'S FILE IS NOT THE ONE THE CHANGESET WAS MADE AGAINST.
 * Decision R3: binary files cannot be merged, so the files adapter never overwrites
 * silently — a conflict bounces back to the submitter, or keeps both versions if the submitter chose
 * that when submitting. `bounce` is what an entry holds when its submitter said nothing.
 */
export const ON_CONFLICT = ['bounce', 'keep-both'] as const
export type OnConflict = (typeof ON_CONFLICT)[number]

/** A git changeset as an entry stores it. */
export interface GitChangeset {
  readonly adapter: 'git'
  /** The directory it lands in: the registered repository's checkout, resolved on this machine. */
  readonly root: string
  /** The id of the `repositories` row the submitter named. */
  readonly repository: string
  /** The branch it was submitted from, as its submitter said it. A description; null when nobody said. */
  readonly branch: string | null
  /** The commit the run's seal names. */
  readonly commit: string
  /** The commit the work was cut from, as the run's seal names it. */
  readonly base: string
}

/** One operation of a files changeset. Paths are relative to the changeset's `root`. */
export interface FileOperation {
  readonly op: FileOperationName
  /** Where the file is after the operation. For a rename, the new path. */
  readonly path: string
  /** A rename's old path. Present only on a rename. */
  readonly from?: string
  /** sha256 of what the main world holds at this path (at `from` for a rename) before, or `absent`. */
  readonly before: string
  /** sha256 of what it holds after, or `absent` for a delete. */
  readonly after: string
  /**
   * The mode it lands with. Absent: the merge tool creates it as it always has, with no execute bit.
   * An entry on a files seal must name the mode the seal holds, and the merge tool lands exactly that.
   */
  readonly mode?: FileMode
  /** Where this content came from: a path, a run, a record — what somebody can follow back. */
  readonly source: string
  /** The record this file belongs to, when there is one. */
  readonly record?: string
}

/** A files changeset as an entry stores it. */
export interface FilesChangeset {
  readonly adapter: 'files'
  /** The directory it lands in, resolved on this machine. */
  readonly root: string
  /** Where the new content waits: each added, modified or renamed file is at `<stagedAt>/<path>`. */
  readonly stagedAt: string
  readonly onConflict: OnConflict
  readonly operations: readonly FileOperation[]
}

export type Changeset = GitChangeset | FilesChangeset

/** The word that names a repository's documentation lane beside its root. */
export const DOCUMENTS_LANE = 'documents'

/**
 * A DOCUMENT: Markdown or plain text. A file of any other kind is an ordinary change whether a test reads it or not,
 * since a data file no test reads may still be read by the running office. The merge tool's documentation lane and the
 * standard change of documents (src/shared/standard-change.ts) both ask here.
 */
export const A_DOCUMENT = /\.(?:md|markdown|txt)$/iu

/** What a record of the suite's reads holds that says which files it read: the files, and the folders read whole. */
export interface WhatTheSuiteReads {
  readonly files: readonly string[]
  readonly folders: readonly string[]
}

/**
 * WHETHER THE SUITE READS A PATH'S CONTENT, BY ITS RECORD: the file was read, or a folder that holds it was read whole
 * ('.' is the whole tree). The one rule for the question: the merge tool asks it to find documents no test reads
 * (tools/merge-tool/documents.mjs), and the change door asks it to name the files a test under way reads
 * .
 */
export function theSuiteReads(path: string, record: WhatTheSuiteReads): boolean {
  if (record.files.includes(path)) return true
  return record.folders.some((folder) => folder === '.' || path === folder || path.startsWith(`${folder}/`))
}

/**
 * THE LANE A CHANGESET QUEUES IN: the directory it lands in. The one place that rule is written. A documentation entry
 * is one where every path it touches is a document no test reads, decided at its pin step. It
 * queues in a lane of its own beside it, `<root> documents`, so it never waits behind a suite; one move of main at a
 * time is kept by the landing step, whichever lane an entry is in.
 */
export function laneOf(changeset: Pick<Changeset, 'root'>, documents: unknown = null): string {
  return documents === null || documents === undefined ? changeset.root : `${changeset.root} ${DOCUMENTS_LANE}`
}

/**
 * AN ENTRY MOVED TO THE FRONT OF ITS LANE, as `POST /api/merge-queue/<id>/first`
 * writes it on the entry: who moved it, when, why, and its turn. `turn` counts the moves in the office from 1, so two
 * entries moved in one second keep the order they were moved in. `underARaise` is the id of the person's raise that
 * let a secretary move it, and is absent when no raise was needed.
 */
export interface MovedFirst {
  readonly by: { readonly kind: string; readonly id: string }
  readonly at: string
  readonly because: string
  readonly turn: number
  readonly underARaise?: string
}

/**
 * AN ENTRY BACK FROM A CHECK THAT LET ITS LANE GO (wave 13u, item 53). The check's release found the lane held by another
 * entry, or found that another entry had landed on the main it was integrated on, so it went back to judged. `run` is the
 * check-again run that released it, `at` is when, and `turn` counts the returns in the office from 1. While it is judged,
 * it takes its lane before every other judged entry but the ones moved to the front and the riders of the lane's newest
 * bus. Its next check holds the lane, and its release into testing takes the mark off.
 */
export interface ReturnsFirst {
  readonly run: string
  readonly at: string
  readonly turn: number
}

/**
 * WHETHER AN ENTRY IN `state` HOLDS ITS LANE, in one place: the state's own word, and for a check again, whether the entry
 * is back from an earlier check. The state writer sets `occupies` from this and from nothing else.
 */
export function occupiesTheLaneIn(state: MergeState, returnsFirst: ReturnsFirst | null | undefined): boolean {
  return MERGE_STATE_SPECS[state].occupiesTheLane || (state === 'reinspecting' && returnsFirst !== undefined && returnsFirst !== null)
}

/**
 * AN ENTRY THE QUEUE CANNOT READ, as `GET /api/merge-queue` names it beside the entries it can read: its id, the
 * record's own title, and why, in the queue's own sentence. It is not in the shape the queue writes, so its lane and
 * state cannot be told, and it is named whatever lane or states were asked for.
 */
export interface UnreadableEntry {
  readonly id: string
  readonly title: string
  readonly why: string
}

/**
 * THE SHAPES THE MERGE LIST ANSWERS IN (wave 13u round 123), asked as `GET /api/merge-queue?shape=`. Asked with no
 * shape, the list answers each entry whole, as before, because callers outside this repository read it and nobody here
 * can see what they read. `narrow` answers each entry with only the fields the merge tool and the timing job read, and
 * works out nothing else. `page` answers the queue page's reading whole, with only the fields of each entry it draws.
 * `ids` answers each entry with only its id, state and lane, for a gate outside this repository that reads no more
 * (wave 13u round 132).
 */
export const MERGE_LIST_SHAPES = ['narrow', 'page', 'ids'] as const
export type MergeListShape = (typeof MERGE_LIST_SHAPES)[number]

/**
 * WHAT AN OFFICE OLDER THAN THE SHAPES ANSWERS a list asked with one, word for word, with status 400: its query takes
 * no key it does not know. The merge tool and the timing job ask the live office, which may be older than their code
 * until the upgrade, so this answer, and only this one, is asked again without a shape (`askTheMergeList`).
 */
export const AN_OLDER_OFFICES_REFUSAL_OF_A_SHAPE = 'The queue to narrow to Unrecognized key: "shape"'

/** The line said when an office older than the shapes was asked `path`, and the whole list was asked for instead. */
export function theWholeListAskedOfAnOlderOffice(path: string): string {
  return `The office refused ${path} because it is older than the merge list's shapes, so the whole list was asked for once more.`
}

/**
 * ONE ASK OF THE MERGE LIST IN A SHAPE, for one lane and, when given, only the states asked. `ask(path)` answers
 * `{ status, body }`. An office older than the shapes is said with `say` and asked once more without a shape, for the
 * whole list. Any other answer, a refusal included, is the answer.
 */
export async function askTheMergeList<A extends { readonly status: number | null; readonly body: unknown }>(
  asked: { readonly lane: string; readonly states?: readonly MergeState[] },
  shape: MergeListShape,
  ask: (path: string) => Promise<A>,
  say: (line: string) => void,
): Promise<A> {
  const whole = `/api/merge-queue?lane=${encodeURIComponent(asked.lane)}${asked.states === undefined ? '' : `&state=${asked.states.join(',')}`}`
  const shaped = `${whole}&shape=${shape}`
  const answer = await ask(shaped)
  const words = typeof answer.body === 'object' && answer.body !== null ? (answer.body as { error?: unknown }).error : undefined
  if (answer.status !== 400 || words !== AN_OLDER_OFFICES_REFUSAL_OF_A_SHAPE) return answer
  say(theWholeListAskedOfAnOlderOffice(shaped))
  return ask(whole)
}

/**
 * WHETHER A MOVE TO THE FRONT STILL ORDERS THE LANE: the entry was moved, and it is waiting for its lane, neither
 * holding it nor final. An entry holding the lane is already first, and one that is final has left the line.
 */
export function aMoveToTheFrontStands(entry: {
  readonly state: MergeState
  readonly movedFirst?: MovedFirst | null
  readonly returnsFirst?: ReturnsFirst | null
}): boolean {
  return entry.movedFirst !== undefined && entry.movedFirst !== null && !occupiesTheLaneIn(entry.state, entry.returnsFirst) && !MERGE_STATE_SPECS[entry.state].final
}

/** WHETHER A RETURN FROM A CHECK STILL ORDERS THE LANE: the entry is back from a check that let its lane go, and judged. */
export function aReturnStands(entry: { readonly state: MergeState; readonly returnsFirst?: ReturnsFirst | null }): boolean {
  return entry.returnsFirst !== undefined && entry.returnsFirst !== null && entry.state === 'judged'
}

/**
 * THE LANE'S ORDER, IN ONE PLACE. The office lists a lane in it (`listMergeQueue`), hands the
 * merge tool its wanted entries in it (`theMergeToolWork`), and the merge tool reads its lane in it (`theLane` in
 * tools/merge-tool/office-keeper.mjs), so the bus boards in it and sorts the entries it passed over by it.
 *
 * Entries whose move to the front stands come first, by their turn. Entries whose return from a check stands come next,
 * by their turn (wave 13u, item 53), so an entry the person, or the queue's owner, moved to the front stays ahead of a
 * returning one. Every other entry keeps the order it comes in.
 * The office reads a lane in the order its entries were written (`theOrderWritten` in src/server/lib/merge-queue.ts),
 * and the merge tool reads the lane in the order the office lists it, so the sort, which is stable, keeps that order.
 * `submittedAt` is not compared: it is the office's local time in words, and when the clocks go back an entry
 * submitted at 01:10 winter time would sort before one submitted twenty minutes earlier, at 01:50 summer time.
 */
export function inTheLanesOrder<
  T extends { readonly state: MergeState; readonly movedFirst?: MovedFirst | null; readonly returnsFirst?: ReturnsFirst | null },
>(entries: readonly T[]): T[] {
  const moveOf = (entry: T): number => (aMoveToTheFrontStands(entry) ? entry.movedFirst!.turn : Number.POSITIVE_INFINITY)
  const returnOf = (entry: T): number => (aReturnStands(entry) ? entry.returnsFirst!.turn : Number.POSITIVE_INFINITY)
  const compare = (a: number, b: number): number => (a === b ? 0 : a < b ? -1 : 1)
  return [...entries].sort((a, b) => compare(moveOf(a), moveOf(b)) || compare(returnOf(a), returnOf(b)))
}

/**
 * THE PATHS AN ENTRY LANDS ONLY AFTER A PRESS (part 4 of a decision). These paths change how every
 * later entry is tested and landed, what keeps the sandbox apart, or the database schema that the next stable upgrade
 * applies to the person's live database, so someone looks before they land. A git entry touching any of them waits for one
 * press of POST /api/merge-queue/<id>/press-to-land, by whoever holds the secretary card or by the person; every other
 * entry lands by itself. A pattern ending in `/` is a folder and everything under it; `*` is any run of characters but `/`.
 *
 * The list is the decision's five. It is here, and not in .mole-office/protected.json, because that file's reader
 * takes only its own three keys and the server never reads it.
 */
export const LANDS_AFTER_A_PRESS: readonly { readonly pattern: string; readonly why: string }[] = [
  { pattern: 'drizzle/', why: 'a database migration, which changes the schema the next stable upgrade applies to the person\'s live database' },
  { pattern: 'tools/the-merger.mjs', why: 'the merge tool, which carries every later entry to main' },
  { pattern: 'tools/sandbox*.mjs', why: 'a sandbox tool, which starts the containers agents work in' },
  { pattern: '.mole-office/protected.json', why: 'the list of the paths a check must read before they land' },
  { pattern: 'design/rules/', why: 'the office rules' },
]

const literally = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

/** The pattern of LANDS_AFTER_A_PRESS a path falls under, with its reason, or null when the path lands by itself. */
export function whyItLandsAfterAPress(path: string): { readonly pattern: string; readonly why: string } | null {
  return (
    LANDS_AFTER_A_PRESS.find((one) =>
      one.pattern.endsWith('/') ? path.startsWith(one.pattern) : new RegExp(`^${one.pattern.split('*').map(literally).join('[^/]*')}$`, 'u').test(path),
    ) ?? null
  )
}

/** The paths among these that land only after a press, in the order given. The office's readers and its state machine both ask here. */
export function thePathsThatWaitForAPress(paths: readonly string[]): string[] {
  return paths.filter((path) => whyItLandsAfterAPress(path) !== null)
}

/**
 * THE PATHS OF A GIT ENTRY THAT NEED A PRESS NOW (wave 13u round 96). A path counts only where what the entry would land
 * differs from main, so an entry on an older base is not held for a file main already has with the same content. The
 * best evidence the office holds decides:
 *
 *   - once integrated, the paths among those the integration changes over main, which is what would land;
 *   - else, when the pin compared the seal's paths with main's content (`leftOut` is there), the paths it found differ;
 *   - else every path the seal names, because main's content was not compared.
 *
 * The state machine and the reading both ask here.
 */
export function thePathsThatNeedAPress(entry: {
  readonly sealed: readonly string[]
  readonly pinned: { readonly paths: readonly string[]; readonly leftOut?: unknown } | null
  readonly integrated: readonly string[] | null
}): string[] {
  if (entry.integrated !== null) return thePathsThatWaitForAPress(entry.integrated)
  if (entry.pinned !== null && entry.pinned.leftOut !== undefined) return [...entry.pinned.paths]
  return thePathsThatWaitForAPress(entry.sealed)
}

/**
 * WHAT AN ENTRY'S PRESS IS, as GET /api/merge-queue and GET /api/merge-queue/:id hand it on a live git entry touching a
 * path of LANDS_AFTER_A_PRESS: those paths, and the press once somebody has made it, with who, when and why.
 */
export interface PressToLand {
  readonly paths: string[]
  readonly pressed: { readonly by: { readonly kind: string; readonly id: string }; readonly at: string; readonly because: string } | null
}

/**
 * WHERE THE MERGE TOOL PINS A GIT ENTRY'S COMMIT in the main repository. SPEC.md section 5.4: the
 * ref keeps the submitted commit reachable after the worker's worktree moves on or is removed.
 */
export function pinnedRefOf(entryId: string): string {
  return `refs/mole-office/queue/${entryId}`
}

/**
 * WHERE THE MERGE TOOL HOLDS A RESOLUTION ITS CHECK PASSED, in the main repository, by tier 2 of a decision, round
 * B. It is the commit the supervisor handed over, fetched from its folder, which the entry's
 * turn integrates in place of the pinned one.
 */
export function resolvedRefOf(entryId: string): string {
  return `refs/mole-office/resolved/${entryId}`
}

/**
 * HOW MUCH THE MERGE TOOL'S CHECK OF A RESOLUTION REPORTS, read by the tool that cuts it
 * (tools/merge-tool/check-a-resolution.mjs) and the door that reads it (merge-state-machine.ts). One side of one place
 * keeps at most `lines` lines, each cut at `characters` with a note of how many more; a place keeps at most `mainCommits`
 * of main's commits; the step carries at most `places` places in at most `bytes` of JSON, under the step door's 1 MiB
 * body; and a refusal says at most `says` characters. The rest is counted, never dropped silently.
 */
export const HOW_MUCH_A_RESOLUTION_CHECK_REPORTS = { lines: 40, characters: 500, mainCommits: 50, places: 200, fixed: 200, bytes: 256 * 1024, says: 4000 } as const

/** The refusal every other write path gives a merge entry. One sentence, read by a person. */
export const A_MERGE_ENTRY_IS_WRITTEN_BY_ITS_DOORS =
  'A merge entry is written only through the merge queue: submitting it, withdrawing it, and the office ' +
  "reporting what its merge tool did. Nothing was written."

/** The same refusal with the doors named, for an agent and for Developer mode. */
export const THE_MERGE_QUEUE_DOORS =
  'Submit with POST /api/merge-queue, withdraw with POST /api/merge-queue/<id>/withdraw, and read with GET ' +
  '/api/merge-queue and GET /api/merge-queue/<id>. The step and tool doors are the message worker\'s alone.'

/**
 * A RELEASED RUN GOES IN AGAIN UNDER A NEW RUN, in the words the bounce notice and the submission door both say
 * (decision CVfWgqGgLf1w, acceptance finding 71). A run is released once, and a release names the seal it read, so a run
 * released on one seal is never judged on another. On 24 September 2026 a bounce told a released run to "finish and seal
 * the run again, and submit again"; the new entry waited for a release the door will never write, and was withdrawn.
 */
export function aReleasedRunGoesInUnderANewRun(run: string): string {
  return `Run ${run} was already released, and a run is released once, so no check can release it on a new seal. ${theBranchGoesInAgainUnderANewRun()}`
}

/**
 * THE SECOND HALF OF THAT SENTENCE, ON ITS OWN: how the branch goes in again. The record door says it too, when a write
 * would seal a run a check already released or a confirm already closed (problem p-y9H17Q-baO, wave 13s round 3).
 */
export function theBranchGoesInAgainUnderANewRun(): string {
  return (
    'The branch goes in again under a new run: register one for the same branch, cut from main (node tools/register-a-run.mjs ' +
    '--handle <its agent> --worktree <the same worktree> --cut-from main --runtime <word> --model <provider/model> ' +
    '--as <you> --session <your session> --workspace <the project>), finish it so it is sealed, have it checked, and ' +
    'submit that run with POST /api/merge-queue.'
  )
}

/**
 * WHAT A TOOL RUN THAT ENDED WITHOUT MOVING ITS ENTRY IS CALLED IN THE MOVE TABLE BELOW. It is not a step
 * the tool reports: the office learns of it through the tool-ended door.
 */
export const A_TOOL_RUN_ENDED = 'tool-run-ended'

/** What happened to an entry, with the plain facts the next move depends on. */
export interface WhatHappenedToAnEntry {
  /** The step the merge tool reported, or `A_TOOL_RUN_ENDED` for a run that ended and left the entry where it was. */
  readonly step: MergeStep | typeof A_TOOL_RUN_ENDED
  /** For `tested`: the tests were green. */
  readonly green?: boolean
  /** The server's explicit authorization, after checking the dormant setting and original evidence. */
  readonly admittedForFixRound?: boolean
  /** The server's explicit decision after reading main's list itself and its own house-rule setting. */
  readonly onlyHouseRulesRed?: boolean
  /** An office-filed take-back may land only green, before any red admission. */
  readonly takeBack?: true
  /** The office's explicit class-two decision after its own git, registry and settings readings. */
  readonly handedBack?: boolean
  /** The office authorized this exact wide red under its current switches. */
  readonly wideRed?: boolean
  /** A hand-back repair must pass every named file; false bounces even a green suite. */
  readonly repairPassed?: boolean
  /** The office read MOLE_OFFICE_GATE_FLAKY at block, and the run named files that changed their answer; it bounces even a green suite. */
  readonly flakyAtBlock?: boolean
  /**
   * For `conflict`: the server's explicit decision to hand the conflict to the entry's own supervisor, after checking
   * the dormant setting MOLE_OFFICE_CONFLICT_RESOLVING and that the entry is a git entry.
   */
  readonly handsOnTheConflict?: boolean
  /**
   * For `tested`: the server's explicit decision to hand a test red only with the entry to its own supervisor, after
   * checking the dormant setting MOLE_OFFICE_RED_FIXING, that the entry is a git entry and that the run named every red
   * test as red only with it. A red that would bounce for another reason first still bounces.
   */
  readonly handsOnTheRed?: boolean
  /**
   * For `tested`: the server's explicit decision that the red waits for a fix round it asked for itself, because the
   * line's starter has no run going. It keeps the entry in testing, after a red handed on and never before a bounce.
   */
  readonly waitsForAFixRound?: boolean
  /** For `main-moved` and `main-moved-while-testing`: how many times main had already moved under the entry, before this one. */
  readonly attempts?: number
  /** For a tool run that ended: how many runs on this arrival had already ended without moving it, before this one. */
  readonly runs?: number
  /** For a tool run that ended on a resolving entry: its resolution waits for the tool's check (`aResolutionWaitsForItsCheck`). */
  readonly aResolutionWaits?: boolean
}

/**
 * THE MOVE THE TABLE ANSWERS. `attempts` and `runs`, where present, are the new counts, this time
 * included, for the caller to store.
 *
 *   to              the entry moves to `state`. It may be the state it is in: then the tool is asked again.
 *   bounce          the entry goes back to its submitter, for `reason`.
 *   stays           the entry stays where it is: green and may land, a landing a person must look at, a
 *                   resolution whose check ended without a result too many times, a red that waits for the fix round
 *                   the office asked for, or a state whose next move is not the tool's.
 *   refused         the step is taken only from `takenFrom`, and the entry is in another state; `final`
 *                   says the entry is in a final state, which takes no more steps.
 *   needs           the move depends on `fact`, and the caller did not give it.
 *   rests-on-records  the step's move depends on records (releases, checks again, the documents chain),
 *                   so this table does not decide it. It only says the step comes from the right state.
 */
export type TheMoveAStepMakes =
  | { readonly move: 'to'; readonly state: MergeState; readonly attempts?: number; readonly runs?: number }
  | { readonly move: 'bounce'; readonly reason: BounceReason; readonly attempts?: number; readonly runs?: number }
  | { readonly move: 'stays'; readonly because: 'green' | 'admitted-for-fix-round' | 'only-house-rules-red' | 'handed-back' | 'wide-red' | 'a-person-must-look' | 'final' | 'the-tool-does-not-act-here' | 'said-and-not-moved' | 'the-check-gave-no-result' | 'waits-for-a-fix-round'; readonly runs?: number }
  | { readonly move: 'refused'; readonly takenFrom: MergeState; readonly final: boolean }
  | { readonly move: 'needs'; readonly fact: 'green' | 'attempts' | 'runs' }
  | { readonly move: 'rests-on-records' }

/**
 * THE ONE TABLE OF THE QUEUE'S MOVES THAT NEED NO RECORD. A decision makes the merge queue a
 * tool a project can run without the office, and such a project needs its own keeper of the
 * queue. The
 * office's state machine (src/server/lib/merge-state-machine.ts) and that keeper both call this function,
 * so each of these moves is written in one place only. The office then adds what only it knows: the
 * facts' shape, releases, checks again, the files area, the deletes, the receipt and the messages.
 *
 * The moves: a step is taken only from the state `A_STEP_IS_TAKEN_FROM` names. `conflict` bounces as
 * conflict, or moves to resolving when the server hands the conflict on, and `guard-failed` bounces as guard. `tested` stays when green, explicitly admitted for a fix round, or authorized by the office with only house rules red, handed back or a wide red; a repair whose named files did not pass bounces before green, a run whose files changed their answer bounces as red at block even when green, and every other red bounces, or moves to resolving when the server hands a red only with the entry on. `landing`
 * moves to landing, and `landed` to merged. `main-moved` and `main-moved-while-testing` go back to judged
 * while main has moved at most the supplied landing limit, and then bounce as churn. A tool run that ended
 * without moving the entry, in a state where the tool acts, has the tool asked again (the entry moves to
 * the state it is in) until the supplied tool run limit is reached; then a landing entry stays,
 * because main may already hold part of it and a person must look, a resolving entry stays, because the end of its
 * supervisor's time to resolve decides it, and any other bounces as stalled. In resolving the tool acts only while a
 * resolution waits for its check, which the caller says. `resolution-checked` rests on records: a pass moves the entry
 * to pinned, to be judged as the pin step judges it, and a refusal keeps it resolving.
 *
 * A repair that did not pass its named files bounces before green; a run whose files changed their answer at block bounces as
 * red even when green, before any admission; red may stay for a fix round, plain house rules, a hand-back or a wide red.
 * It reads only its arguments and the declared row defaults, and writes nothing. The office passes its current
 * settings at each step. A keeper without the office is an ordinary project, so an omitted limits argument reads
 * each row's ordinary default rather than the default for a project building the office.
 */
/** Take-backs require green before any red admission rule is considered. */
export function theMoveAStepMakes(state: MergeState, happened: WhatHappenedToAnEntry, limits: MergeLimits = {
  landingAttempts: Number(gateNamed('landing-attempts').defaults.ordinary),
  toolRuns: Number(gateNamed('tool-runs-in-one-place').defaults.ordinary),
}): TheMoveAStepMakes {
  const spec = MERGE_STATE_SPECS[state]
  if (happened.step === A_TOOL_RUN_ENDED) {
    if (spec.final) return { move: 'stays', because: 'final' }
    if (!spec.theMergeToolActs && happened.aResolutionWaits !== true) return { move: 'stays', because: 'the-tool-does-not-act-here' }
    if (happened.runs === undefined) return { move: 'needs', fact: 'runs' }
    const runs = happened.runs + 1
    if (runs < limits.toolRuns) return { move: 'to', state, runs }
    if (state === 'landing') return { move: 'stays', because: 'a-person-must-look', runs }
    if (state === 'resolving') return { move: 'stays', because: 'the-check-gave-no-result', runs }
    return { move: 'bounce', reason: 'stalled', runs }
  }
  const takenFrom = A_STEP_IS_TAKEN_FROM[happened.step]
  if (spec.final || state !== takenFrom) return { move: 'refused', takenFrom, final: spec.final }
  switch (happened.step) {
    case 'conflict':
      return happened.handsOnTheConflict === true ? { move: 'to', state: 'resolving' } : { move: 'bounce', reason: 'conflict' }
    case 'guard-failed':
      return { move: 'bounce', reason: 'guard' }
    case 'tested':
      if (happened.repairPassed === false) return { move: 'bounce', reason: 'red' }
      if (happened.green === undefined) return { move: 'needs', fact: 'green' }
      if (happened.flakyAtBlock === true) return { move: 'bounce', reason: 'red' }
      if (happened.green) return { move: 'stays', because: 'green' }
      if (happened.takeBack === true) return { move: 'bounce', reason: 'red' }
      if (happened.admittedForFixRound === true) return { move: 'stays', because: 'admitted-for-fix-round' }
      if (happened.onlyHouseRulesRed === true) return { move: 'stays', because: 'only-house-rules-red' }
      if (happened.handedBack === true) return { move: 'stays', because: 'handed-back' }
      if (happened.wideRed === true) return { move: 'stays', because: 'wide-red' }
      if (happened.handsOnTheRed === true) return { move: 'to', state: 'resolving' }
      if (happened.waitsForAFixRound === true) return { move: 'stays', because: 'waits-for-a-fix-round' }
      return { move: 'bounce', reason: 'red' }
    case 'landing':
      return { move: 'to', state: 'landing' }
    case 'landed':
      return { move: 'to', state: 'merged' }
    case 'main-moved':
    case 'main-moved-while-testing': {
      if (happened.attempts === undefined) return { move: 'needs', fact: 'attempts' }
      const attempts = happened.attempts + 1
      return attempts > limits.landingAttempts ? { move: 'bounce', reason: 'churn', attempts } : { move: 'to', state: 'judged', attempts }
    }
    case 'pinned':
    case 'integrating':
    case 'integrated':
    case 'moved-past-documents':
    case 'resolution-checked':
    case 'fix-round-looked':
      return { move: 'rests-on-records' }
    // SAID, AND NOT A MOVE: no room in the sandbox launcher, and files red on main alone. The entry stays where it is.
    case 'no-room-to-test':
    case 'no-room-to-integrate':
    case 'red-on-main':
      return { move: 'stays', because: 'said-and-not-moved' }
  }
}
