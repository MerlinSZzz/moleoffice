// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE REMINDER BEFORE THE SEAL JUDGES, AND THE READER OF THE RUN'S COMMITS. Pure: no database, no process of its own.
 * The reminder (./before-the-seal.ts) reads the facts and hands them here; a test, or a replay of a refused branch in a
 * scratch clone, can hand them as well without opening the office's database.
 *
 * CERTAIN AND LIKELY. Wave 13j round 56: a program checks the rules that need no judgement, so a
 * check stops refusing runs for paperwork. An item is `mechanical` when the branch and the records alone decide it: the
 * report's links and fields, the commits and their files. A test proof is read from the lines a run's test tool wrote,
 * which may hide what they ran, and a starter's item is a sentence nobody can check for the run; neither is certain.
 * A test line that reads the whole machine is likely too, because a test that must read it can keep the line with a
 * reason (./machine-wide-scans.ts). Every item is named. The owner's first decision made every item a reminder; their
 * decision on migration items narrowed it for a migration item. Their later decision on faults of form took the hard gate
 * off them: a fault of form is listed and never refused. `theItemsNoSealPasses` below is the one list of the items that
 * stop a seal, and it holds the migration items of a branch seal and nothing else.
 *
 * WHOSE COMMITS. Only the run's own: those written at or after the run started. A branch that carries several rounds
 * holds earlier rounds' commits since its fork base, and those were answered for by the runs that wrote them. Round 55's
 * reminder named 15 items, most of them earlier rounds' commits and pages, before this was so.
 */
import { MAX_PROSE } from '@shared/prose-cap.ts'
import type { ANamedItem } from '@shared/before-the-seal.ts'
import { CHAPTERS_READ, whatAReportSaysItRead } from '@shared/chapters.ts'
import { DECISION_AUTHORITY_NEEDS, type DecisionAuthority } from '@shared/kinds.ts'
import { theAttributionLinesOf, theMessagesIn, theMessagesOfARange } from '../../config/attribution-lines.mjs'
import { theMachineWideScansIn, WHAT_THE_FINDER_CANNOT_SEE } from './machine-wide-scans.ts'
import { COPIED_NOT_READ, type Finding } from './copied-test-literals.ts'

/**
 * One thing an inspector would most likely refuse, or one the run's starter asked to be named. Its `key` says which check
 * found it and of what, so the seal can ask whether the same check finds it again (src/shared/before-the-seal.ts).
 */
export type ALikelyRefusal = ANamedItem

/** One file one commit changed. */
export interface AFileOfACommit {
  path: string
  status: 'A' | 'M' | 'D'
  removed: number | null
  /** The first line the commit changed, in the file as it left it. Read for files under tests/ only; absent otherwise. */
  firstLine?: number | null
  /** The lines the commit added, with their numbers. Read for files under tests/ and the migration journal only. */
  added?: { line: number; text: string }[]
}

/** One commit of the run, oldest first, with what it did to each file. */
export interface ACommitOfTheRun {
  commit: string
  subject: string
  /** The message after its subject line, trimmed. Empty when the message is one line. */
  body: string
  files: AFileOfACommit[]
}

/** The run's commits as read: its own, and how many earlier commits on the branch were left out. */
export interface TheRunsCommits {
  commits: ACommitOfTheRun[]
  /** Whether a file was there before the run's first own commit. The name is older than the reading. */
  existedAtTheForkBase: (path: string) => boolean
  /** Commits since the fork base written before the run started, left out. Null when the run gives no start that names one moment. */
  earlier?: number | null
  /**
   * Every commit since the fork base, the run's own and the earlier ones, newest first, with its whole message. Absent
   * when the facts were handed without them, and then the attribution lines are named as not checked.
   */
  messages?: { commit: string; message: string }[]
  /**
   * The lines the run's own commits add under tests/ and that are still there at the tip, by file, with their numbers at
   * the tip: the whole change from just before the run's first own commit to the tip. A line added and then taken out
   * again is not here. Absent when the facts were handed without them, and then the machine-wide test lines are named as
   * not checked.
   */
  testLinesAtTheTip?: { path: string; added: { line: number; text: string }[] }[]
}

/** Everything the reminder judges, read before it judges, so the judging is a pure function that a test can hand facts. */
export interface TheFactsBeforeTheSeal {
  runTitle: string
  /** The `said` of each named-tests use line on the run, oldest first. */
  testRuns: string[]
  /**
   * The named-tests lines among them whose proof that tools/use-line.mjs sent them was missing or did not match, oldest
   * first, each with its place on the run and its mark (item 2i). Left out by a caller that did not read the proofs.
   */
  testRunsNotFromTheTool?: { seq: number; said: string; mark: string }[]
  /** The run's commits, or why git could not be read. */
  git: TheRunsCommits | { couldNotRead: string }
  /** Copies found at the tip, or why the test lines or source snapshot could not be read. */
  copiedTestLiterals?: { findings: Finding[] } | { couldNotRead: string }
  reports: { id: string; title: string; data: Record<string, unknown> }[]
  /** Reports elsewhere in the project with the same title as one of the run's, by the run's report id. */
  sameTitleElsewhere: Record<string, string[]>
  /** The chapters the run's agent must read, by number: what its brief named, or its card's line, and its card's line as well. */
  mustRead: number[]
  /** The items the run's starter asked the reminder to name (`checkAlso`), in the starter's words. Empty when there are none. */
  checkAlso: string[]
  /**
   * The decisions the run recorded that have no short forms, by id, found as the check finds a run's decisions
   * (`theDecisionsOfTheRun` in ./inspection.ts). `complete` is false when the run's agent, its start or the filing time
   * of one of the agent's decisions could not be read, so a decision filed outside the run's own session may be
   * missing. Absent when the caller did not read the decisions.
   */
  decisionsWithoutShortForms?: { ids: string[]; complete: boolean }
  /**
   * The repository's other worktrees whose HEAD holds the run's own commits, when the office looked (item 2x): the write
   * names a tip that is not the HEAD of the record's working directory, or that directory holds none of the run's own
   * commits. Absent when it did not look.
   */
  elsewhere?: TheOtherWorktrees
  /** The run's id, which the items about the run itself name. Absent when the caller did not give it. */
  runId?: string
  /**
   * WHERE THE SHORT FORMS AND THE FIELDS STAND OF EACH RECORD THE SEAL ANSWERS FOR (the decision on faults of
   * form): every report linked about the run, every record a records or mixed submission carries, and every decision
   * the run recorded, each read once. Absent when the caller did not read them.
   */
  forms?: AFormReading[]
  /**
   * The authority of each decision the run recorded, found as `decisionsWithoutShortForms` finds them. Absent when the
   * caller did not read them.
   */
  decisionAuthorities?: ADecisionsAuthority[]
  /** The run's doing line, or null when it has none. Absent when the caller did not read it. */
  doing?: string | null
  /**
   * THE LATEST EARLIER RUN OF THE RUN'S AGENT THAT HAS ENDED, when a refusal still stands on it. Null when the agent has
   * no such run or no refusal stands on it, and `couldNotRead` when the run's agent could not be read. Absent when the
   * caller did not look.
   */
  earlierRefusal?: TheEarlierRefusal | null | { couldNotRead: string }
  /** Each report filed in the run, and whether it is linked about a run. Absent when the caller did not read them. */
  reportsFiled?: { id: string; aboutARun: boolean }[]
  /**
   * THE PACKAGES THE RUN TOOK INSIDE AND HAS NOT HANDED BACK (the inside doors in ./delegation.ts): for each, its task
   * id and title, its number of points, and whether its latest restatement was answered `aligned`. `couldNotRead` when
   * the office could not tell which agent the run serves, or could not read a package on a task; then no package is
   * named. Absent when the caller did not read them, and then the reminder says nothing about packages.
   */
  packagesHeld?: AHeldPackage[] | { couldNotRead: string }
}

/** A package the run took inside and has not handed back, as the reminder judges it. */
export interface AHeldPackage {
  id: string
  title: string
  points: number
  aligned: boolean
}

/** Why the seal answers for a record whose forms it reads. A record can be there for more than one reason. */
export type WhyTheSealReadsIt = 'linked report' | 'carried' | 'decision of the run'

/** Where one record's short forms and fields stand, as the seal reads them, or why they could not be read. */
export type AFormReading =
  | { id: string; about: 'report' | 'record' | 'decision'; why: WhyTheSealReadsIt[]; couldNotRead: string }
  | {
      id: string
      about: 'report' | 'record' | 'decision'
      why: WhyTheSealReadsIt[]
      /** What nobody has written where the record has a place and room for it (`readShortForms`'s `none`). */
      missing: ('label' | 'parts')[]
      /** Whether a short form was written from a revision the record has moved past (`out_of_date`). */
      outOfDate: boolean
      /** Whether a short form names a revision this database's ledger does not hold (`cannot_check`). */
      cannotCheck: boolean
      /** What `recordIncompleteness` in src/shared/kinds/incompleteness.ts says the record still needs. */
      incomplete: { path: string; message: string }[]
    }

/** One decision the run recorded, with what its authority asks of it. */
export interface ADecisionsAuthority {
  id: string
  authority: string | null
  /** Whether `revisit_when` holds words. */
  revisitWhen: boolean
  /** Its `authority_reference` when that is shaped as a record id, and whether a live record has that id. Null otherwise. */
  reference: { id: string; live: boolean } | null
}

/** A refusal that still stands on the latest earlier run of the run's agent that has ended. */
export interface TheEarlierRefusal {
  run: string
  /** The refusal's message (`refused.check`), or null when the refusal names none. */
  check: string | null
  /** The records this run is linked `about` by links of its own. */
  thisRunIsAbout: string[]
}

/** A worktree of the run's repository, other than the one its record names, whose HEAD holds the run's own commits. */
export interface AWorktreeHoldingTheRunsCommits {
  path: string
  /** The branch its HEAD is on, or null when its HEAD is detached. */
  branch: string | null
  head: string
  /** The run's own commits on it, oldest first (`theOwnCommitsReadWith`). */
  commits: string[]
}

/** What the office found when it looked at the repository's other worktrees, or why it could not look. */
export type TheOtherWorktrees =
  | {
      /** The record's workingDirectory, which the seal reads, and its HEAD. */
      named: string
      head: string
      /** The tip the write names, when the office looked for the worktrees at it; null when it looked by the commits written since the start. */
      tip: string | null
      found: AWorktreeHoldingTheRunsCommits[]
    }
  | { couldNotLook: string }

/** The four widths and two themes chapter 6 asks for, which the report's words are searched for. */
const WIDTHS = ['1440', '990', '660', '390'] as const
const THEMES = ['light', 'dark'] as const
const THE_JOURNAL = 'drizzle/meta/_journal.json'
/** How many named-tests lines not shown to come through the tool the reminder names one by one, and how much of each. */
const LINES_NAMED_MOST = 3
const WORKTREES_NAMED_MOST = 5
const COMMITS_NAMED_MOST = 5
const SAID_SHOWN_MOST = 120

const isATest = (path: string): boolean => /\.test\.(ts|tsx|mjs|js)$/u.test(path)
const isUnderTests = (path: string): boolean => path.startsWith('tests/')
const isAPage = (path: string): boolean => path.startsWith('src/web/') && /\.(tsx|css)$/u.test(path) && !isATest(path)
/** Not a test, not under tests/ and not prose. A commit that changes one of these is a code commit. */
const isCode = (path: string): boolean => !isATest(path) && !isUnderTests(path) && !/\.md$/u.test(path)
const isAMigration = (path: string): boolean => /^drizzle\/\d{4}_[^/]+\.sql$/u.test(path)
const fileName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
/** The authority whose decision must say what would reopen it. Exported so a test reads it rather than copying it. */
export const A_REVERSIBLE_JUDGEMENT: DecisionAuthority = 'reversible engineering judgement'
/** A file's name without its last extension: what a report would call the page. */
const pageName = (path: string): string => fileName(path).replace(/\.[^.]+$/u, '')
const atItsLine = (file: AFileOfACommit): string => (typeof file.firstLine === 'number' ? `${file.path}:${file.firstLine}` : file.path)
const theCommit = (commit: ACommitOfTheRun): string => `Commit ${commit.commit.slice(0, 9)} ("${commit.subject}")`

/** How one named-tests line ended: green, red, or null when it says neither. */
function howItEnded(said: string): 'green' | 'red' | null {
  if (/parts [\d, ]+ of \d+ failed|vitest was ended by|vitest exited [1-9]/u.test(said)) return 'red'
  if (/vitest exited 0\b/u.test(said)) return 'green'
  return null
}

/** The file names one named-tests line shows, and whether it hid more behind "and K more" or a --list. */
function theNamesShown(said: string): { names: string[]; hidesMore: boolean } {
  const list = /^named \d+ files? \((.*?)\); /u.exec(said)?.[1]
  if (list === undefined) return { names: [], hidesMore: true }
  const parts = list.split(', ').map((one) => one.replace(/^and /u, ''))
  const hidesMore = parts.some((one) => /^\d+ more$|^\d+ names$|^--list /u.test(one))
  return { names: parts.filter((one) => !/^\d+ more$|^\d+ names$|^--list /u.test(one)), hidesMore }
}

/** Every string anywhere in a report's blocks, joined, for the words a check looks for. */
function theWordsOf(report: { title: string; data: Record<string, unknown> }): string {
  return `${report.title} ${JSON.stringify(report.data['blocks'] ?? [])}`
}

function theBlocksOf(report: { data: Record<string, unknown> }): Record<string, unknown>[] {
  const blocks = report.data['blocks']
  return Array.isArray(blocks) ? blocks.filter((one): one is Record<string, unknown> => typeof one === 'object' && one !== null) : []
}

/**
 * WHAT THE RUN CHANGED, by path, from its own commits, with the last thing done to each. One reading for the reminder and
 * for the report the merge queue reads before a check (`whatTheReportLacks`), so the two cannot judge different files.
 */
function whatTheRunChanged(git: TheFactsBeforeTheSeal['git']): {
  existed: (path: string) => boolean
  testsAdded: string[]
  testsChanged: string[]
  pagesChanged: string[]
} {
  const commits = 'commits' in git ? git.commits : []
  const lastDone = new Map<string, 'A' | 'M' | 'D'>()
  for (const commit of commits) for (const file of commit.files) lastDone.set(file.path, file.status)
  const existed = 'commits' in git ? git.existedAtTheForkBase : () => true
  return {
    existed,
    testsAdded: [...lastDone].filter(([path, status]) => isATest(path) && status !== 'D' && !existed(path)).map(([path]) => path),
    testsChanged: [...lastDone].filter(([path, status]) => isATest(path) && status !== 'D').map(([path]) => path),
    pagesChanged: [...lastDone].filter(([path, status]) => isAPage(path) && status !== 'D').map(([path]) => path),
  }
}

/** The chapters a report must list: those the run had to read, with chapter 5 when test files changed and 6 when page files did. */
function theChaptersAReportMustList(mustRead: readonly number[], testsChanged: readonly string[], pagesChanged: readonly string[]): number[] {
  const wanted = new Set(mustRead)
  if (testsChanged.length > 0) wanted.add(5)
  if (pagesChanged.length > 0) wanted.add(6)
  return [...wanted].sort((a, b) => a - b)
}

/** The write that gives a report its chapters read, with the field in its place: a list of chapter numbers in its data. */
export function theWriteOfTheChaptersRead(report: string): string {
  return `PATCH /api/records/${report} {"dataPatch":{"${CHAPTERS_READ}":[<the number of each chapter the run read>]}}`
}

/**
 * WHETHER THE RUN'S named-tests LINES SHOW A CONTROL RUN, A MUTATION THAT TURNED IT RED AND A RESTORE, in that order, for one
 * test file. `hidden` says some line hid part of what it ran behind "and K more" or a --list, so the proof may be there.
 */
function whatTheTestRunsProve(path: string, testRuns: readonly string[]): { proved: boolean; hidden: boolean } {
  const name = fileName(path)
  const short = name.replace(/\.test\.(ts|tsx|mjs|js)$/u, '')
  let step = 0
  let hidden = false
  for (const said of testRuns) {
    const shown = theNamesShown(said)
    const named = shown.names.some((one) => one === name || one === short || one === path)
    if (!named) {
      if (shown.hidesMore) hidden = true
      continue
    }
    const ended = howItEnded(said)
    if ((step === 0 || step === 2) && ended === 'green') step += 1
    else if (step === 1 && ended === 'red') step = 2
  }
  return { proved: step >= 3, hidden }
}

/** A record the seal reads the form of, named as an item names it: its kind, its id, and why the seal answers for it. */
function theRecordAsTheSealReadsIt(read: AFormReading): string {
  const noun = read.about === 'report' ? 'Report' : read.about === 'decision' ? 'Decision' : 'Record'
  const why = read.why.includes('linked report') ? 'linked about this run' : read.why.includes('carried') ? "carried by this run's submission" : 'recorded by this run'
  return `${noun} ${read.id} (${why})`
}

const THE_PACKAGE_ITEM_KIND = 'package'

/** The key of the item naming a package the run took inside and has not handed back. */
export function theKeyOfAPackageToHandBack(taskId: string): string {
  return `${THE_PACKAGE_ITEM_KIND}:${taskId}:hand-back`
}

/** The door that restates an inside package, for its parent to answer. */
export function theRestatementDoorOfAPackage(taskId: string): string {
  return `POST /api/delegation/${taskId}/align`
}

/** The door that hands an inside package back, point by point. */
export function theHandBackDoorOfAPackage(taskId: string): string {
  return `POST /api/delegation/${taskId}/hand-back`
}

/**
 * WHAT THE REMINDER SAYS OF ONE PACKAGE THE RUN TOOK INSIDE AND HAS NOT HANDED BACK. When the latest restatement is not
 * answered `aligned`, it says first what the package must do before a hand-back is possible.
 */
export function whatTheHeldPackageSays(held: AHeldPackage): string {
  const restate = held.aligned
    ? ''
    : `The package must be restated with ${theRestatementDoorOfAPackage(held.id)} and answered by its parent before it can be handed back. `
  const points = held.points === 1 ? 'point' : 'points'
  return (
    `${restate}The package "${held.title}" (${held.id}) was taken inside by this run's agent and is not handed back. ` +
    `Hand it back point by point at ${theHandBackDoorOfAPackage(held.id)}: each of its ${String(held.points)} ${points} as done, part or not, with words.`
  )
}

/**
 * WHAT AN INSPECTOR WOULD MOST LIKELY REFUSE, from facts already read. Pure. Each item names the rule it comes from in
 * words the run can act on; `notChecked` names what was not looked at, which is never counted as passed.
 */
export function whatAnInspectorWouldMostLikelyRefuse(facts: TheFactsBeforeTheSeal): { items: ALikelyRefusal[]; notChecked: string[] } {
  const items: ALikelyRefusal[] = []
  const certain = (item: Omit<ALikelyRefusal, 'mechanical'>) => items.push({ ...item, mechanical: true })
  const likely = (item: Omit<ALikelyRefusal, 'mechanical'>) => items.push({ ...item, mechanical: false })
  const notChecked: string[] = [
    `Blocks over ${MAX_PROSE.toLocaleString('en-GB')} characters: not checked here, because the office refuses such a block when a report is written (src/shared/prose-cap.ts).`,
    "Whether the report covers every part of the brief: not checked, because the brief's words are not kept on the run.",
  ]
  const commits = 'commits' in facts.git ? facts.git.commits : []
  if ('couldNotRead' in facts.git) notChecked.push(`The run's commits, its test files and its page files: git could not be read (${facts.git.couldNotRead}).`)
  else if (facts.git.earlier === null) {
    notChecked.push(
      'Whose commits these are: the run gives no start that names one moment, so every commit since the fork base was judged as ' +
        "this run's. A start written as a time in words with no offset names two moments, or none, in the hour the clocks change.",
    )
  }
  else if (facts.git.earlier !== undefined && facts.git.earlier > 0) {
    notChecked.push(`${facts.git.earlier} commit${facts.git.earlier === 1 ? '' : 's'} on this branch ${facts.git.earlier === 1 ? 'was' : 'were'} written before this run started: not judged, because the runs that wrote them answered for them.`)
  }
  const { existed, testsChanged, pagesChanged } = whatTheRunChanged(facts.git)

  // ------------------------------------------------------------------------------------------------ the report
  if (facts.reports.length === 0) {
    certain({ key: 'report:none', about: 'report', says: 'No report is linked to this run. Link it with POST /api/links {"fromId":"<report>","toId":"<this run>","type":"about"}.' })
  }
  for (const report of facts.reports) {
    const read = whatAReportSaysItRead(report)
    if (read === null) {
      certain({
        key: `report:${report.id}:chaptersRead`,
        about: 'report',
        says:
          `Report ${report.id} has no chaptersRead, so nobody can check it against the chapters the run had to read. ` +
          `Write it: ${theWriteOfTheChaptersRead(report.id)}.`,
      })
    } else {
      const missed = theChaptersAReportMustList(facts.mustRead, testsChanged, pagesChanged).filter((n) => !read.includes(n))
      if (missed.length > 0) {
        certain({
          key: `report:${report.id}:chapters`,
          about: 'report',
          says:
            `Report ${report.id} does not list chapter${missed.length === 1 ? '' : 's'} ${missed.join(', ')} in chaptersRead. ` +
            'They are the chapters the run had to read, with chapter 5 when test files changed and chapter 6 when page files changed. ' +
            `The write replaces the whole list: ${theWriteOfTheChaptersRead(report.id)}.`,
        })
      }
    }
    if (report.title.trim() === facts.runTitle.trim()) {
      certain({ key: `report:${report.id}:title`, about: 'report', says: `Report ${report.id} has the same title as the run. A report's title says what the round did.` })
    }
    const same = facts.sameTitleElsewhere[report.id] ?? []
    if (same.length > 0) {
      certain({ key: `report:${report.id}:copied-title`, about: 'report', says: `Report ${report.id} has the same title as ${same.join(', ')}. A copied title says another round's work.` })
    }
  }

  // ------------------------------------------------------------------------------------------------ the run's decisions
  // Chapter 10 rule 3: every record gets its name at reading level 1 in the run that files it. Two seals of 8 November
  // were refused for one decision each with none, after a reminder that had named nothing.
  for (const id of facts.decisionsWithoutShortForms?.ids ?? []) {
    certain({
      key: `decision:${id}:short-forms`,
      about: 'decision',
      says: `Decision ${id}, which this run recorded, has no short forms. Write its label, two to five words, with POST /api/records/${id}/short-forms.`,
    })
  }
  if (facts.decisionsWithoutShortForms?.complete === false) {
    notChecked.push(
      "Decisions the run's agent recorded outside the run's own session: not all could be found, because the run's agent, " +
        "its start or a decision's filing time could not be read. Only the decisions found were checked for short forms.",
    )
  }

  // ------------------------------------------------------------------------------------------------ the records' form
  // THE DECISION ON FAULTS OF FORM: what a program can find in the records the seal answers for is found here, so
  // the reminder can list it and a run can fix it before a check is spent. The hard gate never refuses one. Each item
  // names the record and the write that fixes it; the rule it breaks is kept with the list.
  const named = new Set(items.map((one) => one.key))
  for (const read of facts.forms ?? []) {
    const record = theRecordAsTheSealReadsIt(read)
    if ('couldNotRead' in read) {
      notChecked.push(`The short forms and fields of ${record}: they could not be read (${read.couldNotRead}).`)
      continue
    }
    // A LINKED REPORT OR A CARRIED RECORD OWES ITS SHORT FORMS AND ITS FIELDS. A decision the run recorded owes its label,
    // which `decisionsWithoutShortForms` reads above; here it is read only for short forms the record has moved past.
    const owed = read.why.includes('linked report') || read.why.includes('carried')
    const shortForms = `${read.about}:${read.id}:short-forms`
    if (owed && read.missing.length > 0 && !named.has(shortForms)) {
      const what = read.missing.length === 2 ? 'no label and no parts' : read.missing[0] === 'label' ? 'no label' : 'no parts'
      certain({
        key: shortForms,
        about: read.about,
        says:
          `${record} has ${what} in its short forms. Write them with POST /api/records/${read.id}/short-forms: a label of two to ` +
          'five words and one part per block, checked first with the short-forms check.',
      })
    }
    if (read.outOfDate) {
      certain({
        key: `${read.about}:${read.id}:short-forms-out-of-date`,
        about: read.about,
        says:
          `${record} has short forms written from an earlier revision, and the record has changed since. Write them again from ` +
          `its newest revision with POST /api/records/${read.id}/short-forms.`,
      })
    }
    if (read.cannotCheck) {
      notChecked.push(`Whether the short forms of ${record} are out of date: one names a revision this database's ledger does not hold.`)
    }
    if (owed && read.incomplete.length > 0) {
      certain({
        key: `${read.about}:${read.id}:incomplete`,
        about: read.about,
        says:
          `${record} is incomplete: ${read.incomplete.map((one) => `${one.path}: ${one.message}`).join(' ')} ` +
          `Write what it still needs with PATCH /api/records/${read.id} {"dataPatch":{...}}.`,
      })
    }
  }
  for (const decision of facts.decisionAuthorities ?? []) {
    if (decision.authority === A_REVERSIBLE_JUDGEMENT && !decision.revisitWhen) {
      certain({
        key: `decision:${decision.id}:revisit-when`,
        about: 'decision',
        says:
          `Decision ${decision.id}, which this run recorded, rests on '${A_REVERSIBLE_JUDGEMENT}' and has no revisit_when. That authority ` +
          `needs ${DECISION_AUTHORITY_NEEDS[A_REVERSIBLE_JUDGEMENT]}. Write it with PATCH /api/records/${decision.id} ` +
          '{"dataPatch":{"revisit_when":"<what would reopen it>"}}.',
      })
    }
    if (decision.reference !== null && !decision.reference.live) {
      certain({
        key: `decision:${decision.id}:authority-reference`,
        about: 'decision',
        says:
          `Decision ${decision.id}, which this run recorded, names ${decision.reference.id} as its authority_reference, and no live ` +
          `record has that id. Name the record its authority rests on with PATCH /api/records/${decision.id} ` +
          '{"dataPatch":{"authority_reference":"<the id of that record>"}}.',
      })
    }
  }

  // ------------------------------------------------------------------------------------------------ the run itself
  const thisRun = facts.runId ?? '<this run>'
  if (facts.doing !== undefined) {
    const lacks = whatTheDoingLineLacks(facts.doing, thisRun)
    if (lacks !== null) certain({ key: 'run:doing', about: 'run', says: lacks })
  }
  const earlier = facts.earlierRefusal
  if (earlier !== undefined && earlier !== null) {
    if ('couldNotRead' in earlier) notChecked.push(`Whether a refusal still stands on an earlier run of this run's agent: ${earlier.couldNotRead}`)
    else if (![earlier.run, earlier.check].some((id) => id !== null && earlier.thisRunIsAbout.includes(id))) {
      const asks = earlier.check ?? earlier.run
      certain({
        key: `run:${earlier.run}:refusal`,
        about: 'run',
        says:
          `A refusal still stands on run ${earlier.run}, the latest earlier run of this run's agent that has ended, and run ${thisRun} ` +
          `is linked about neither ${earlier.check === null ? 'that run nor a message of the refusal' : `the refusal's message ${earlier.check} nor that run`}. ` +
          `Link it with POST /api/links {"fromId":"${thisRun}","toId":"${asks}","type":"about"}. Only the latest earlier run that has ` +
          'ended is read; older runs are not judged.',
      })
    }
  }
  for (const report of facts.reportsFiled ?? []) {
    if (report.aboutARun) continue
    certain({
      key: `report:${report.id}:about-a-run`,
      about: 'report',
      says:
        `Report ${report.id}, which this run filed, is linked about no run. Link it to the run it is about with POST /api/links ` +
        `{"fromId":"${report.id}","toId":"<that run>","type":"about"}.`,
    })
  }

  // ------------------------------------------------------------------------------------------------ test proofs
  for (const path of testsChanged) {
    const { proved, hidden } = whatTheTestRunsProve(path, facts.testRuns)
    if (!proved) {
      likely({
        key: `test:${path}`,
        about: 'test proof',
        says:
          `${path} changed, and this run's named-tests lines do not show a control run, a mutation that turned it red and a restore, in that order` +
          (hidden ? '. Some lines hide part of what they ran, so it may be among those.' : '.') +
          ' Chapter 5: a test is proved by mutation, after a control run.',
      })
    }
  }

  // A LINE THE TOOL DID NOT SEND STILL COUNTS ABOVE, and is named here: the mark is a reminder, not a refusal.
  const notFromTheTool = facts.testRunsNotFromTheTool ?? []
  if (notFromTheTool.length > 0) {
    const shown = notFromTheTool.slice(0, LINES_NAMED_MOST).map((one) => `use ${String(one.seq)} ("${one.said.length > SAID_SHOWN_MOST ? `${one.said.slice(0, SAID_SHOWN_MOST)}…` : one.said}"): ${one.mark}`)
    const more = notFromTheTool.length - shown.length
    likely({
      key: 'test-lines:not-from-the-tool',
      about: 'test proof',
      says:
        `${String(notFromTheTool.length)} of this run's named-tests line${notFromTheTool.length === 1 ? ' is' : 's are'} not shown to have come through tools/use-line.mjs. ` +
        `${shown.join(' ')}${more > 0 ? ` And ${String(more)} more.` : ''} ` +
        'Their results are still counted above. A test run through tools/run-named-tests.mjs sends its own line, with its proof.',
    })
  }

  // ------------------------------------------------------------------------------------------------ pictures
  if (pagesChanged.length > 0) {
    for (const report of facts.reports) {
      const words = theWordsOf(report)
      const images = theBlocksOf(report).filter((one) => one['type'] === 'image').length
      const unnamedPages = pagesChanged.filter((path) => !words.includes(pageName(path)))
      const missing = [...unnamedPages, ...[...WIDTHS, ...THEMES].filter((one) => !new RegExp(`\\b${one}\\b`, 'iu').test(words))]
      if (images === 0 || missing.length > 0) {
        const lacks = [...(images === 0 ? ['has no image blocks'] : []), ...(missing.length > 0 ? [`does not name ${missing.join(', ')}`] : [])]
        certain({
          key: `pictures:${report.id}`,
          about: 'pictures',
          says:
            `This run changed ${pagesChanged.length} page files (${pagesChanged.join(', ')}), and report ${report.id} ${lacks.join(' and ')}. ` +
            'Chapter 6: every changed screen is looked at, at 1440, 990, 660 and 390, light and dark, and the 1440 ones go in the report. ' +
            'What to do: take the pictures of each changed screen, look at them, and name each page and what it shows in the report.',
        })
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ commits
  // A CRITERION CHANGE IS ANY CHANGE TO A FILE UNDER tests/ THAT WAS THERE BEFORE THE RUN: a case added to an existing
  // test, a row added to a .json list a test reads (refusal of run UtHA9CNImJSN, 13j round 54), lines taken out. A file the
  // run added itself is not a criterion anybody else relied on, so changing it is not one.
  const criteriaOf = (commit: ACommitOfTheRun) => commit.files.filter((file) => isUnderTests(file.path) && file.status !== 'A' && existed(file.path))
  const toDo = 'What to do: split the test changes into their own commit before the first code commit (git rebase), whose message gives the old and the new wording, why, and the runs. Chapter 5 rule 2.'
  let codeSeen: string | null = null
  for (const commit of commits) {
    const criteria = criteriaOf(commit)
    const named = criteria.map(atItsLine).join(', ')
    const code = commit.files.filter((file) => isCode(file.path)).map((file) => file.path)
    if (criteria.length > 0 && code.length > 0) {
      certain({
        key: `commit:${commit.subject}:mixed`,
        about: 'commit',
        says:
          `${theCommit(commit)} changes ${named}, which existed before this run, and also changes code ` +
          `(${code.slice(0, 3).join(', ')}${code.length > 3 ? ` and ${code.length - 3} more` : ''}). A changed expectation is a criterion change. ${toDo}`,
      })
    } else if (criteria.length > 0 && codeSeen !== null) {
      certain({
        key: `commit:${commit.subject}:after-code`,
        about: 'commit',
        says: `${theCommit(commit)} changes ${named}, which existed before this run, after code commit ${codeSeen}. A criterion change comes before the code. ${toDo}`,
      })
    }
    if (criteria.length > 0 && commit.body === '') {
      certain({
        key: `commit:${commit.subject}:message`,
        about: 'commit',
        says:
          `${theCommit(commit)} changes ${named}, which existed before this run, and its message is one line. ` +
          'What to do: reword it (git rebase) so its body gives the old and the new wording, why, and the runs. Chapter 5 rule 2.',
      })
    }
    if (code.length > 0 && codeSeen === null) codeSeen = commit.commit.slice(0, 9)
  }
  // AN ATTRIBUTION LINE IN ANY COMMIT SINCE THE FORK BASE, an earlier round's as well (wave 13u item 31): the merge queue
  // reads every one of them when the entry is submitted and refuses the entry if one carries a line, whoever wrote it.
  if (!('couldNotRead' in facts.git)) {
    if (facts.git.messages === undefined) notChecked.push('Attribution lines in the commit messages: the messages were not read.')
    for (const { commit, message } of [...(facts.git.messages ?? [])].reverse()) {
      const lines = theAttributionLinesOf(message)
      if (lines.length === 0) continue
      const subject = message.split('\n')[0] ?? ''
      certain({
        key: `commit:${subject}:attribution`,
        about: 'commit',
        says:
          `Commit ${commit.slice(0, 9)} ("${subject}") carries ${lines.map((line) => `the attribution line "${line}"`).join(' and ')}. ` +
          'The merge queue refuses an entry when any commit since its fork base carries one, because the merge tool would land it and then refuse to push it. ' +
          "What to do: take the line out of the commit's message (git rebase, and reword the commit) before the seal.",
      })
    }
  }

  // ------------------------------------------------------------------------------------------------ the worktree
  // THE SEAL READS THE RECORD'S workingDirectory, so it does not seal commits held in another worktree, and the items above
  // judged none of them (item 2x). Likely and never certain: the office cannot tell a worker's worktree from the run's own.
  if (facts.elsewhere !== undefined) {
    if ('couldNotLook' in facts.elsewhere) notChecked.push(`Whether this run's commits are in another worktree than its record names: ${facts.elsewhere.couldNotLook}`)
    else if (facts.elsewhere.found.length > 0) likely({ key: `worktree:${facts.elsewhere.named}`, about: 'commit', says: whereTheCommitsAre(facts.elsewhere) })
  }

  // ------------------------------------------------------------------------------------------------ migrations
  // A MIGRATION IS ADDED WHOLE IN ITS FIRST COMMIT, with its journal row: the merge queue renumbers a migration by the
  // commit that adds it (tools/merge-tool/migrations.mjs), and a later commit that changes it lands on the old number.
  const addedBy = new Map<string, ACommitOfTheRun>()
  for (const commit of commits) {
    for (const file of commit.files) {
      if (!isAMigration(file.path)) continue
      const first = addedBy.get(file.path)
      if (file.status === 'A' && first === undefined) {
        addedBy.set(file.path, commit)
        const tag = fileName(file.path).replace(/\.sql$/u, '')
        const journal = commit.files.find((one) => one.path === THE_JOURNAL)
        const hasTheRow = journal !== undefined && (journal.added === undefined || journal.added.some((one) => one.text.includes(`"${tag}"`)))
        if (!hasTheRow) {
          certain({
            key: `migration:${file.path}:journal`,
            about: 'migration',
            says:
              `${theCommit(commit)} adds ${file.path} and not its row in ${THE_JOURNAL}. A migration is added whole in its first commit. ` +
              `What to do: put the journal row with tag "${tag}" in the same commit.`,
          })
        }
      } else if (first !== undefined && first !== commit) {
        certain({
          key: `migration:${file.path}:changed-later`,
          about: 'migration',
          says:
            `${theCommit(commit)} changes ${file.path}, which commit ${first.commit.slice(0, 9)} added in this run. A migration is added whole in its ` +
            `first commit, because the merge queue renumbers it by that commit. What to do: fold the change into ${first.commit.slice(0, 9)} (git rebase).`,
        })
      }
    }
  }
  // A BARE MIGRATION NUMBER IN A TEST points at another migration once the queue renumbers (refusal of run TEKUgNl_7uEK,
  // 13k round 47d, tests/migration.test.ts:2062).
  for (const commit of commits) {
    for (const file of commit.files) {
      if (!isUnderTests(file.path)) continue
      for (const added of file.added ?? []) {
        const bare = /(['"`])(\d{4}_)\1/u.exec(added.text)
        if (bare === null) continue
        certain({
          key: `migration:${file.path}:${added.line}:bare-prefix`,
          about: 'migration',
          says:
            `${file.path}:${added.line} names a migration by the bare prefix '${bare[2]}'. The merge queue renumbers migrations, so the number ` +
            "can point at another migration afterwards. What to do: name it by its whole tag, as migrationsBefore('0216_a_handover_for_every_agent') does.",
        })
      }
    }
  }

  // COPIED TEST LITERALS are likely: a test may keep the wording with a reason in its report.
  // The facts were read at the same tip as the run's own added lines; this function opens no files.
  if (!('couldNotRead' in facts.git)) {
    notChecked.push('Copied test literals: generated files, including src/shared/words/*-made-from.ts, files outside src/, tools/ and plugin src/ folders, non-code files, relative paths such as ../src/x.mjs and lines this run did not add were not checked; interpolated expressions and dynamic concatenations were not evaluated.')
    notChecked.push('Copied test limits: common numbers 0, 1, 2, 10, 100 and 1000, and numbers other than unseparated decimal integers, were not checked.')
    notChecked.push('Copied test values: lists need two distinct members and must be an it.each argument or a named constant sharing a word with the export. Named numbers need to be at least 1000 and use the export\'s words. Inline numbers need to be at least 30, exclude common numbers, and are considered only between files with four matching numeric contexts on a pair of lines. Other inline values, renamed constants and non-integers may be missed.')
    notChecked.push('Complex JSX or regular expressions and literals spanning unchanged lines may be missed.')
    const read = facts.copiedTestLiterals
    if (read === undefined || 'couldNotRead' in read) notChecked.push(COPIED_NOT_READ)
    else {
      const paths = new Map<string, Finding[]>()
      for (const found of read.findings) {
        const list = paths.get(found.path) ?? []
        list.push(found)
        paths.set(found.path, list)
      }
      const reportStrings = (value: unknown): string[] => {
        if (typeof value === 'string') return [value]
        if (Array.isArray(value)) return value.flatMap(reportStrings)
        return value !== null && typeof value === 'object' ? Object.values(value).flatMap(reportStrings) : []
      }
      for (const [path, found] of paths) {
        const key = `copied:${path}`
        const marker = `${key}: kept, because `
        const reason = facts.reports.flatMap((report) => reportStrings(report.data['blocks'] ?? []))
          .flatMap((words) => words.split(/\r?\n/u))
          .map((line) => line.trim())
          .find((line) => line.startsWith(marker) && line.slice(marker.length).trim() !== '')
        const findings = found.flatMap((one) => {
          if (one.kind === 'list') {
            const members = (one.members ?? []).map((member) => JSON.stringify(member)).join(', ')
            return one.sources.map((at) => `Test ${one.path}:${one.line} repeats the list [${members}] from ${at.path}:${at.line}, where it is ${at.name ?? 'an exported constant'}. Read it from there instead.`)
          }
          if (one.kind === 'value') {
            return one.sources.map((at) => `Test ${one.path}:${one.line} repeats the number ${one.value} from ${at.path}:${at.line}, where it is ${at.name ?? 'an exported constant'}. Read it from there instead.`)
          }
          const shown = one.kind === 'number' ? one.value : JSON.stringify(one.value)
          return one.sources.map((at) => `Test ${one.path}:${one.line} repeats ${shown} from ${at.path}:${at.line}.`)
        }).join(' ')
        likely({ key, about: 'test proof', says:
          reason === undefined
            ? `${path} copies words, a limit or a value from the code. ${findings} Read each value from the code, or write "${key}: kept, because <reason>" in a linked report.`
            : `${path} copies words, a limit or a value from the code. ${findings} The report says "${reason}".`,
        })
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ the whole machine
  // A TEST LINE THAT READS THE WHOLE TEMPORARY FOLDER OR EVERY PROCESS. Likely and
  // never certain: the run fixes the line or keeps it with a reason, and the seal records which (./before-the-seal.ts).
  if (!('couldNotRead' in facts.git)) {
    if (facts.git.testLinesAtTheTip === undefined) notChecked.push('Tests that read the whole machine: the lines this run adds under tests/ were not read at its tip.')
    else {
      for (const scan of theMachineWideScansIn(facts.git.testLinesAtTheTip)) likely({ key: scan.key, about: 'machine-wide test', says: scan.says })
      notChecked.push(WHAT_THE_FINDER_CANNOT_SEE)
    }
  }

  // ------------------------------------------------------------------------------------------------ a design for the person
  // The owner decided that a design reaches the person as a few whole options with one question and a picture
  // of each whole option.
  for (const report of facts.reports) {
    const blocks = theBlocksOf(report)
    const questions = blocks.filter((one) => one['type'] === 'choice' || one['type'] === 'fillin')
    if (questions.length > 1) {
      certain({
        key: `design:${report.id}:questions`,
        about: 'design',
        says: `Report ${report.id} asks ${questions.length} questions. A design reaches the person as a few whole options with one question.`,
      })
    }
    const images = blocks.filter((one) => one['type'] === 'image').length
    for (const [n, choice] of blocks.filter((one) => one['type'] === 'choice').entries()) {
      const options = Array.isArray(choice['options']) ? choice['options'].length : 0
      if (images < options) {
        certain({
          key: `design:${report.id}:pictures:${n}`,
          about: 'design',
          says:
            `Report ${report.id} offers ${options} options and holds ${images} pictures. A design reaches the person with a picture of each whole ` +
            'option.',
        })
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ a package taken inside
  // THE POINT-BY-POINT ACCOUNT CAN BE FORGOTTEN. The inside doors let this run's agent take a package, restate it and
  // hand it back, and no reminder named one still held. Certain: the records alone say who took it and whether it was
  // handed back. It is never a gate, because a package item is not in THE_FAULTS_OF_FORM.
  if (facts.packagesHeld !== undefined && !Array.isArray(facts.packagesHeld)) {
    notChecked.push(`The packages this run took inside and has not handed back: ${facts.packagesHeld.couldNotRead}`)
  }
  for (const held of Array.isArray(facts.packagesHeld) ? facts.packagesHeld : []) {
    certain({ key: theKeyOfAPackageToHandBack(held.id), about: 'record', says: whatTheHeldPackageSays(held) })
  }

  // ------------------------------------------------------------------------------------------------ the starter's items
  // NAMED, NEVER JUDGED. The office cannot tell whether the run did what a sentence asks, so the seal never counts one as
  // answered (`notJudged` in src/shared/before-the-seal.ts).
  for (const [n, item] of facts.checkAlso.entries()) {
    likely({ key: `check-also:${n}`, about: 'check also', says: `The run's starter asked the check also to look at this: "${item}". The office cannot check it for you.` })
  }
  return { items, notChecked }
}

/** When the source snapshot is unavailable, compare the other items and leave copied items unjudged. */
export function theComparableItems(items: readonly ANamedItem[], copiedReadable: boolean): { judged: ANamedItem[]; notJudged: string[] } {
  const cannotJudge = (one: ANamedItem): boolean => one.about === 'check also' || (!copiedReadable && one.key.startsWith('copied:'))
  return { judged: items.filter((one) => !cannotJudge(one)), notJudged: items.filter(cannotJudge).map((one) => one.key) }
}

/** What the merge queue found a run's report lacks before any check of it started. */
export interface WhatTheReportLacks {
  /** Each missing piece, in words the run can act on. Empty when nothing is missing. */
  lacks: string[]
  /** The test files the run added whose proof was not found. */
  files: string[]
  /** What could not be read. It is counted neither as missing nor as there. */
  notRead: string[]
}

/**
 * WHAT A RUN'S DOING LINE LACKS, or null when it has one. The merge queue asks it before a check (`whatTheReportLacks`)
 * and the seal asks it before the seal, so the two read one rule.
 */
export function whatTheDoingLineLacks(doing: string | null, run = '<run>'): string | null {
  if (doing !== null && doing.trim() !== '') return null
  return `The run has no doing line. Write one with PATCH /api/records/${run} {"dataPatch":{"doing":"<what the run did>"}}.`
}

/**
 * WHAT A RUN'S REPORT LACKS, read by the merge queue before any check starts. That is part 1 of a
 * decision: a doing line, chapters read, and a control, mutation and restore
 * for every test file the run added. Pure, and it costs no tokens.
 *
 * A PROOF IS FOUND IN ONE OF TWO PLACES. The run's named-tests lines, read from the tool_uses rows, show a green run, a red
 * one and a green one naming the file, in that order. Or one block of a linked report names the file, with its extension,
 * and says control, mutation and restore. The chapters are judged as the reminder judges them (`theChaptersAReportMustList`); one linked
 * report must list them all. When git could not be read, the test files are not judged and `notRead` says so.
 */
export function whatTheReportLacks(facts: TheFactsBeforeTheSeal & { doing: string | null }): WhatTheReportLacks {
  const lacks: string[] = []
  const files: string[] = []
  const notRead: string[] = []
  const doing = whatTheDoingLineLacks(facts.doing)
  if (doing !== null) lacks.push(doing)
  const { testsAdded, testsChanged, pagesChanged } = whatTheRunChanged(facts.git)
  const wanted = theChaptersAReportMustList(facts.mustRead, testsChanged, pagesChanged)
  if (facts.reports.length === 0) {
    lacks.push('No report is linked to the run. Link one with POST /api/links {"fromId":"<report>","toId":"<run>","type":"about"}.')
  } else {
    const each = facts.reports.map((report) => {
      const read = whatAReportSaysItRead(report)
      if (read === null) return `report ${report.id} has no chaptersRead`
      const missed = wanted.filter((n) => !read.includes(n))
      return missed.length === 0 ? null : `report ${report.id} does not list chapter${missed.length === 1 ? '' : 's'} ${missed.join(', ')}`
    })
    if (each.every((one) => one !== null)) {
      const had = wanted.length === 0 ? 'No chapter was named for the run' : `The run had to read chapter${wanted.length === 1 ? '' : 's'} ${wanted.join(', ')}`
      const report = facts.reports.length === 1 ? facts.reports[0]!.id : '<report>'
      lacks.push(`No linked report lists the chapters read. ${had}, and ${each.join('; ')}. Write them in a report: ${theWriteOfTheChaptersRead(report)}.`)
    }
  }
  if ('couldNotRead' in facts.git) {
    notRead.push(`The test files the run added: git could not be read (${facts.git.couldNotRead}).`)
  } else {
    const blocks = facts.reports.flatMap((report) => theBlocksOf(report).map((block) => JSON.stringify(block)))
    let hidden = false
    for (const path of testsAdded) {
      const name = fileName(path)
      const runs = whatTheTestRunsProve(path, facts.testRuns)
      const named = blocks.some((words) => words.includes(name) && /control/iu.test(words) && /mutat/iu.test(words) && /restor/iu.test(words))
      if (runs.proved || named) continue
      files.push(path)
      if (runs.hidden) hidden = true
    }
    if (files.length > 0) {
      lacks.push(
        `No control, mutation and restore was found for ${files.length === 1 ? 'the new test' : `${files.length} new tests`} ${files.join(', ')}. ` +
          'Neither the run\'s named-tests lines show a green run, a red one and a green one naming it, in that order, nor does one block of a ' +
          'linked report name it with its control, mutation and restore' +
          (hidden ? '. Some named-tests lines hide part of what they ran, so naming the proof in the report answers this.' : '.'),
      )
    }
  }
  return { lacks, files, notRead }
}

/**
 * THE MIGRATION ITEMS A SEAL CANNOT PASS: the items of a finder's reading that are about a migration, and only those.
 * Pure. `theItemsNoSealPasses` below reads it, so the gate in ./before-the-seal.ts and its tests read the same list.
 *
 * NULL IS NOTHING TO REFUSE. It is a reading that did not happen — a reminder the office could not keep, or git it could
 * not read — and an item nobody found cannot be said to be still there. The seal itself refuses unreadable git, so
 * nothing is sealed on a reading this gate could not make.
 *
 * A migration item stops every git seal, whoever writes it (the decision on migration items, which narrowed an
 * earlier decision that every item is a reminder). Every other item, certain or likely, is named and stops nothing here.
 */
export function theMigrationItemsRefusingASeal(items: readonly ANamedItem[] | null): ANamedItem[] {
  if (items === null) return []
  return items.filter((one) => one.about === 'migration')
}

const A_REPORT_IS_LINKED = 'chapter 10 rule 2, "Publish finished writing for a person inside Mole Office": a report is linked about the work it is about'
const SHORT_FORMS_IN_THE_SAME_RUN = 'chapter 10 rule 3, "Write the record\'s short forms in the same run that files it"'
const A_REPORTS_TITLE = "a report's title says what the round did, in words of its own"
const THE_CHAPTERS_READ = 'a report lists in chaptersRead the chapters the run had to read, with chapter 5 when test files changed and chapter 6 when page files changed'

/**
 * THE FAULTS OF FORM, by the kind of an item's key, each with the rule it breaks (the decision on faults of form; the
 * coordinator said yes to this list). A program finds each of them in the records the seal answers for, so the
 * reminder can list it and a run can fix it before a check is spent. The hard gate never refuses one; only the block
 * position refuses a certain item the reminder named. An item's kind is its key's first and last part:
 * `report:<id>:title` is `report:title`. The finder names each of these as certain, and test proofs, pictures, commits,
 * design, check-also, machine-wide tests and copied test values are not here.
 */
export const THE_FAULTS_OF_FORM: Readonly<Record<string, string>> = {
  'report:none': A_REPORT_IS_LINKED,
  'report:chaptersRead': THE_CHAPTERS_READ,
  'report:chapters': THE_CHAPTERS_READ,
  'report:title': A_REPORTS_TITLE,
  'report:copied-title': A_REPORTS_TITLE,
  'report:short-forms': SHORT_FORMS_IN_THE_SAME_RUN,
  'record:short-forms': SHORT_FORMS_IN_THE_SAME_RUN,
  'decision:short-forms': SHORT_FORMS_IN_THE_SAME_RUN,
  'report:short-forms-out-of-date': SHORT_FORMS_IN_THE_SAME_RUN,
  'record:short-forms-out-of-date': SHORT_FORMS_IN_THE_SAME_RUN,
  'decision:short-forms-out-of-date': SHORT_FORMS_IN_THE_SAME_RUN,
  'report:incomplete': 'chapter 4 rule 6, "File the record before you can finish it": the write\'s answer names the fields a record still wants',
  'record:incomplete': 'chapter 4 rule 6, "File the record before you can finish it": the write\'s answer names the fields a record still wants',
  'decision:revisit-when': `a decision says what its authority needs: '${A_REVERSIBLE_JUDGEMENT}' needs ${DECISION_AUTHORITY_NEEDS[A_REVERSIBLE_JUDGEMENT]}`,
  'decision:authority-reference': "a decision's authority_reference has to answer to a live record",
  'run:doing': 'chapter 9 rule 6: a run changes its doing line as soon as it knows what it is working on',
  'run:refusal': 'the rule of every line, "Link the round\'s run to the record that asks for its change" (the coordinator, 31 October)',
  'report:about-a-run': A_REPORT_IS_LINKED,
}

/** An item's kind: its key's first and last part, or the whole key when it has two parts or fewer. */
export function theKindOfAnItem(key: string): string {
  const parts = key.split(':')
  return parts.length <= 2 ? key : `${parts[0]}:${parts.at(-1)}`
}

/** The rule a fault of form breaks, or null when the item is not one. */
export function theRuleAFaultOfFormBreaks(item: ANamedItem): string | null {
  if (item.mechanical !== true) return null
  return Object.hasOwn(THE_FAULTS_OF_FORM, theKindOfAnItem(item.key)) ? THE_FAULTS_OF_FORM[theKindOfAnItem(item.key)]! : null
}

/**
 * THE ITEMS NO SEAL PASSES, of a finder's reading. Pure, and the one place the refusing set is written: the hard gate in
 * ./before-the-seal.ts and the reminder that marks what will refuse both read it.
 *
 * `branch` says the seal seals a branch: then every migration item refuses, whoever writes it. Nothing else refuses the
 * hard gate: a fault of form is listed by the reminder and never refused, and at block the reminder computes its own
 * certain items beside this list. Null is nothing to refuse, as for `theMigrationItemsRefusingASeal`.
 */
export function theItemsNoSealPasses(items: readonly ANamedItem[] | null, how: { branch: boolean }): ANamedItem[] {
  if (items === null) return []
  return how.branch ? theMigrationItemsRefusingASeal(items) : []
}

/** The worktree item's words: the record's worktree, each worktree found with its commits, and what to do. */
function whereTheCommitsAre(look: Exclude<TheOtherWorktrees, { couldNotLook: string }>): string {
  const short = (commit: string): string => commit.slice(0, 9)
  const found = [...look.found].sort((a, b) => b.commits.length - a.commits.length)
  const aWorktree = (one: AWorktreeHoldingTheRunsCommits): string => {
    const shown = one.commits.slice(0, COMMITS_NAMED_MOST).map(short).join(', ')
    const more = one.commits.length - Math.min(one.commits.length, COMMITS_NAMED_MOST)
    return (
      `${one.path} (${one.branch === null ? 'a detached HEAD' : `branch ${one.branch}`}, HEAD ${short(one.head)}), with ` +
      `${one.commits.length} commit${one.commits.length === 1 ? '' : 's'} written since the run started: ${shown}${more > 0 ? ` and ${more} more` : ''}`
    )
  }
  const listed = found.slice(0, WORKTREES_NAMED_MOST).map(aWorktree).join('; ') +
    (found.length > WORKTREES_NAMED_MOST ? `; and ${found.length - WORKTREES_NAMED_MOST} more` : '')
  const which = look.tip !== null
    ? `The tip this write names, ${short(look.tip)}, is the HEAD of another worktree: ${listed}.`
    : found.length === 1
      ? `That worktree holds none of the commits written since this run started, and another one does: ${listed}.`
      : `That worktree holds none of the commits written since this run started, and ${found.length} other worktrees do, so the office cannot tell which holds this run's work: ${listed}.`
  const there = found.length === 1 ? found[0]!.path : "the worktree that holds this run's work"
  return (
    `This run's record names ${look.named} (HEAD ${short(look.head)}) as its workingDirectory, and the seal reads that worktree. ${which} ` +
    'The seal would not seal those commits, and this reminder judged none of them. ' +
    `What to do: name ${there} as the record's workingDirectory, in the sealing write or before it; or bring the commits into ${look.named} and seal from there.`
  )
}

/**
 * The reminder's one sentence: how many items, the certain and the likely counted apart. `refusing` is how many of them
 * the reminder marks as refusing a later write at this position; with none, nothing is required.
 */
export function whatTheReminderSays(items: readonly ALikelyRefusal[], refusing = 0): string {
  if (items.length === 0) return 'Nothing was found that an inspector would most likely refuse, among the things this reminder checks. The write was not stored.'
  const certain = items.filter((one) => one.mechanical === true).length
  const likely = items.length - certain
  return (
    `${items.length} thing${items.length === 1 ? '' : 's'} an inspector would most likely refuse: ${certain} certain, which a program decided from the ` +
    `branch and the records, and ${likely} that need${likely === 1 ? 's' : ''} a person to judge. ` +
    (refusing === 0
      ? 'The write was not stored, and nothing is required.'
      : `The write was not stored. ${refusing} of them refuse${refusing === 1 ? 's' : ''} the seal until ${refusing === 1 ? 'it is' : 'they are'} fixed.`)
  )
}

// ================================================================================================== the reader

/** The hunks of one commit's patch, read for its first changed line and its added lines, by path. */
function theLinesOf(patch: string): Map<string, { firstLine: number | null; added: { line: number; text: string }[] }> {
  const byPath = new Map<string, { firstLine: number | null; added: { line: number; text: string }[] }>()
  let from: string | null = null
  let current: { firstLine: number | null; added: { line: number; text: string }[] } | null = null
  let next = 0
  // INSIDE A HUNK a taken-out line "-- x" reads "--- x", so a header is read only before the file's first hunk.
  let inAHunk = false
  for (const line of patch.split('\n')) {
    if (line.startsWith('diff --git ')) {
      current = null
      from = null
      inAHunk = false
    } else if (!inAHunk && line.startsWith('--- ')) {
      from = line === '--- /dev/null' ? null : line.slice('--- a/'.length)
    } else if (!inAHunk && line.startsWith('+++ ')) {
      const path = line === '+++ /dev/null' ? from : line.slice('+++ b/'.length)
      current = path === null ? null : { firstLine: null, added: [] }
      if (path !== null && current !== null) byPath.set(path, current)
    } else if (line.startsWith('@@ ') && current !== null) {
      inAHunk = true
      const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,(\d+))? @@/u.exec(line)
      if (hunk === null) continue
      next = Number(hunk[2])
      if (current.firstLine === null) current.firstLine = next === 0 ? Number(hunk[1]) : next
    } else if (line.startsWith('+') && current !== null) {
      current.added.push({ line: next, text: line.slice(1) })
      next += 1
    }
  }
  return byPath
}

/**
 * THE RUN'S OWN COMMITS between the fork base and the tip, oldest first: from the first one written (its author time) at
 * or after `startedMs`. A rebase keeps author times, so an earlier round's commit carried on the branch stays earlier.
 * Git keeps an author time to the whole second, so the start is compared at its whole second: a commit made in the
 * second the run started is the run's. With no start, every commit since the fork base. `git` runs one read-only git
 * command and answers what it printed.
 */
export function theCommitsReadWith(git: (...args: string[]) => string, forkBase: string, tip: string, startedMs: number | null): TheRunsCommits {
  return theRunsCommitsOf(theCommitsCarriedReadWith(git, forkBase, tip, startedMs))
}

/**
 * `TheRunsCommits` AS DATA A THREAD CAN HAND ON: the paths of the commit before the run's first own one, in place of the
 * function that answers from them, and the author time of every commit since the fork base in the order written, so a
 * reading can say which other starts it answers (`theFirstOwnCommitAmong`). The seal-read thread reads a finish's
 * commits this way (./a-finish-reads-git-apart.ts).
 */
export type TheRunsCommitsCarried = Omit<TheRunsCommits, 'existedAtTheForkBase'> & { atTheStart: string[]; authorTimes: number[] }

/** The commits a carried reading holds, answered as `theCommitsReadWith` answers them. */
export function theRunsCommitsOf(carried: TheRunsCommitsCarried): TheRunsCommits {
  const there = new Set(carried.atTheStart)
  return { commits: carried.commits, existedAtTheForkBase: (path) => there.has(path), earlier: carried.earlier, messages: carried.messages, testLinesAtTheTip: carried.testLinesAtTheTip }
}

/** What `theCommitsReadWith` reads, as `TheRunsCommitsCarried`. */
export function theCommitsCarriedReadWith(git: (...args: string[]) => string, forkBase: string, tip: string, startedMs: number | null): TheRunsCommitsCarried {
  const { listed, start } = theCommitsSince(git, forkBase, tip, startedMs)
  const before = start === 0 ? forkBase : listed[start - 1]![0]
  const commits = listed.slice(start).map(([commit]): ACommitOfTheRun => {
    const message = git('log', '-1', '--format=%B', commit)
    const [subject = '', ...rest] = message.split('\n')
    const statuses = git('diff-tree', '--no-commit-id', '-r', '--no-renames', '--name-status', '--root', commit)
      .split('\n').filter((one) => one !== '').map((one) => one.split('\t') as [string, string])
    const removed = new Map(
      git('diff-tree', '--no-commit-id', '-r', '--no-renames', '--numstat', '--root', commit)
        .split('\n').filter((one) => one !== '').map((one) => {
          const [, minus = '-', path = ''] = one.split('\t')
          return [path, minus === '-' ? null : Number(minus)] as const
        }),
    )
    const lines = statuses.some(([, path]) => isUnderTests(path) || path === THE_JOURNAL)
      ? theLinesOf(git('diff-tree', '--no-commit-id', '-r', '--no-renames', '-p', '-U0', '--root', commit, '--', 'tests/', THE_JOURNAL))
      : new Map<string, never>()
    return {
      commit,
      subject,
      body: rest.join('\n').trim(),
      files: statuses.map(([status, path]) => {
        const read = lines.get(path)
        return {
          path,
          status: status === 'A' ? 'A' : status === 'D' ? 'D' : 'M',
          removed: removed.get(path) ?? null,
          ...(read === undefined ? {} : { firstLine: read.firstLine, added: read.added }),
        }
      }),
    }
  })
  const atTheStart = git('ls-tree', '-r', '--name-only', before).split('\n')
  const messages = theMessagesIn(git(...theMessagesOfARange(`${forkBase}..${tip}`)))
  // ONE CHANGE, NOT ONE PER COMMIT, so a line a later commit fixed or marked is read as it is at the tip. Plugin
  // tests enter the same finder as tests/; select their test directories without reading plugin source as test lines.
  const testLinesAtTheTip = [...theLinesOf(git('diff-tree', '-r', '-p', '-U0', '--no-renames', before, tip, '--', 'tests/', ':(glob)plugins/*/tests/**'))]
    .map(([path, read]) => ({ path, added: read.added }))
  return { commits, earlier: startedMs === null ? null : start, messages, testLinesAtTheTip, atTheStart, authorTimes: listed.map(([, at]) => Number(at)) }
}

/** Every commit between the fork base and the tip, oldest first in the order written, and where the run's own begin. */
function theCommitsSince(git: (...args: string[]) => string, forkBase: string, tip: string, startedMs: number | null): { listed: [string, string][]; start: number } {
  const listed = git('log', '--reverse', '--topo-order', '--format=%H %at', `${forkBase}..${tip}`)
    .split('\n').filter((one) => one !== '').map((one) => one.split(' ') as [string, string])
  return { listed, start: theFirstOwnCommitAmong(listed.map(([, at]) => Number(at)), startedMs) }
}

/**
 * WHERE THE RUN'S OWN COMMITS BEGIN among the commits since the fork base, given their author times in the order written:
 * the first written in or after the whole second of `startedMs`, the first of all with no start, and past the last when
 * none is that late. The commits a reading holds depend on the start only through this place and whether there is one.
 */
export function theFirstOwnCommitAmong(authorTimes: readonly number[], startedMs: number | null): number {
  const from = startedMs === null ? 0 : authorTimes.findIndex((at) => at >= Math.floor(startedMs / 1000))
  return from === -1 ? authorTimes.length : from
}

/** THE RUN'S OWN COMMITS between the fork base and the tip, oldest first, as `theCommitsReadWith` reads them, and nothing else. */
export function theOwnCommitsReadWith(git: (...args: string[]) => string, forkBase: string, tip: string, startedMs: number | null): string[] {
  const { listed, start } = theCommitsSince(git, forkBase, tip, startedMs)
  return listed.slice(start).map(([commit]) => commit)
}
