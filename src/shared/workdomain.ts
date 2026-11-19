// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORK DOMAIN VOCABULARY: ONE TABLE OF OVERLAP CLASSES, ONE SET OF CODES, ONE SET OF SENTENCES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A WORK DOMAIN IS, IN ONE PARAGRAPH
 * ---------------------------------------------------------------------------------------
 *
 * An agent says what it thinks it is about to do — the objective, the paths it expects to write,
 * create and rely on — BEFORE Mole Office tells it anything. That is the hypothesis, and it is revision 1
 * of an ordinary record of kind `work_domain`. Mole Office then resolves those paths against the file
 * index and the module claims and writes what it made of them as a LATER revision. The difference
 * between the two is the scope diff, and the agent answers it. What it accepts is the accepted
 * domain, and every later comparison — who collides with whom, what drifted outside — reads that.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE TABLES ARE HERE AND NOT IN THE SERVER OR THE BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * `OVERLAP_CLASSES` below is read by the server that computes an overlap, by the browser that draws
 * it, and by the tests that hold the ranks apart. A second mapping in a component — a
 * `class === 'write_write'` or a `rank === 4` — is two declarations of one fact, agreeing on the day
 * they are written and drifting after, which is this repository's named and recurring defect.
 * A test deleted on 13 November 2026 walked `src/web` twice for exactly those two shapes.
 *
 * ---------------------------------------------------------------------------------------
 * NO SENTENCE IS EVER STORED. CODES ARE STORED AND SENTENCES ARE COMPOSED AT READ
 * ---------------------------------------------------------------------------------------
 *
 * `data.resolved` and `data.accepted` are canonical, so an English sentence written into one is a
 * screen string somebody has to migrate, and a module title written into one is the old title for
 * ever. So a resolution stores CODES and IDS — `not_indexed`, a module's record id — and
 * `sayCouldNotDo` below composes the sentence at read, in one place, for the server, the browser
 * and the tests alike.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS STORED, AND WHY ABSENT KEYS RATHER THAN NULLS
 * ---------------------------------------------------------------------------------------
 *
 * The stored shapes below — `ResolvedEntry`, `Resolution`, `AcceptedDomain` and the rest — are
 * declared in `WORK_DOMAIN_SHAPES` in ./kinds/work-domain.ts, which `SHAPE_SPECS` in ./kinds.ts
 * joins; that is what validates them on every write and what an agent reads over HTTP as
 * documentation. That checker refuses an unknown key and checks a present
 * key against its declared type; it has no way to declare `string | null`. So a fact Mole Office does
 * not have is an ABSENT KEY, never a null, and the optional properties below say so in the type.
 * The computed-at-read shapes are a different matter: nothing stores them, so they use `| null`
 * freely and the compiler can refuse the shorter reading, which is what `Dependents` needs.
 */

// THE FOUR CHANNELS A MARK HAS, and the comparison that chose this file's four. `withoutHue` is
// what every other mark family in this product is held apart by, so this one is held apart by it
// too rather than by a check of its own. See `OVERLAP_MARKS` below.
import type { StateMark } from './states.ts'

/**
 * WHAT A RESOLUTION, A DIFF ROW OR AN OVERLAP COULD NOT WORK OUT. A code, never a sentence.
 *
 * Every one of these is a real limit of what this product can do TODAY, and each is named rather
 * than answered with an empty list. An empty list means *there is nothing there*; one of these
 * means *nobody could look*, and the difference between the two is the whole reason this read is
 * worth having rather than a comfort.
 */
export const COULD_NOT_DO = [
  'no_file_index',
  'unknown_repository',
  'ambiguous_repository',
  'not_indexed',
  'imports_unresolved',
  'map_absent',
  'module_gone',
] as const
export type CouldNotDo = (typeof COULD_NOT_DO)[number]

/** Whether a string is one of the seven. */
export function isCouldNotDo(value: unknown): value is CouldNotDo {
  return typeof value === 'string' && (COULD_NOT_DO as readonly string[]).includes(value)
}

/**
 * The sentence for one code, composed from the code and its inputs.
 *
 * ONE FUNCTION, ONE PLACE. The server writes this into a reply, the browser draws it, and a test
 * asserts each code produces a sentence that names its own inputs. Storing the sentence instead
 * would put a screen string in canonical data.
 */
export function sayCouldNotDo(code: CouldNotDo, inputs: Readonly<Record<string, string>> = {}): string {
  const has = (key: string): string => inputs[key] ?? 'not recorded'
  switch (code) {
    case 'no_file_index':
      // ONE ENTRY WHOSE REPOSITORY HAS NO STORED SCAN. Other scans may be stored, so this sentence does not say
      // the project has none.
      if (inputs['unscanned'] !== undefined) {
        return (
          `No scan of ${inputs['unscanned']} is stored, so "${has('path')}" could not be resolved. POST ` +
          `/api/source/reindex scans every registered repository that has a checkout on this machine into its own ` +
          `slot; resolve again after it.`
        )
      }
      return (
        `This project has no file index, so no path could be resolved. Every path entry reads as unresolved ` +
        `and four of the seven scope-diff rows could not be computed at all. Build one for "${has('workspace')}" ` +
        `and resolve again.`
      )
    case 'unknown_repository':
      return `"${has('prefix')}" names a repository this server has never scanned, so nothing could be resolved against it.`
    case 'ambiguous_repository':
      return (
        `This project indexes more than one repository — ${has('candidates')} — the entry carries no prefix, and the ` +
        `domain declares no repository. Mole Office did not pick one: picking would decide, silently, whether two agents ` +
        `are told they collide.`
      )
    case 'not_indexed':
      return `"${has('path')}" is not in the file index. Either it is new, or the index is older than the work.`
    case 'imports_unresolved':
      return (
        `Imports are stored exactly as they are written and nothing resolves them to paths. ` +
        `"${has('example')}" is stored as written, and "${has('alias')}" is declared in the project's own manifest; ` +
        `no code reads the second to resolve the first. So what depends on this path is not known — which is a ` +
        `different answer from nothing depending on it.`
      )
    case 'map_absent':
      return `The Implementation Map has not answered here, so this could not be asked of it.`
    case 'module_gone':
      return `This resolution named record ${has('id')}, which no longer exists. Resolving again would leave it out.`
  }
}

// ============================================================================ the stored shapes

/** How a written path entry was read. `unresolved` is an answer, and it is not `unindexed`. */
export const ENTRY_SHAPES = ['file', 'directory', 'pattern', 'unindexed', 'unresolved'] as const
export type EntryShape = (typeof ENTRY_SHAPES)[number]

/**
 * ONE WRITTEN PATH, AND WHAT THE MACHINE MADE OF IT.
 *
 * `asWritten` is the agent's own string and nothing ever rewrites it. Everything else is the
 * resolver's reading of it, and the two are shown side by side rather than one replacing the other.
 */
export interface ResolvedEntry {
  asWritten: string
  repository?: string
  /** Repository-relative. Absent when it could not be resolved — see `note`. */
  path?: string
  shape: EntryShape
  /** How many indexed files it covers. Absent when nobody could count. */
  files?: number
  /** Record ids only. A title is read at read time and never stored. */
  modules?: string[]
  provenance?: string
  authority?: string
  note?: CouldNotDo
}

/** What the resolver could not do, in the shape the checker can hold. */
export interface CouldNotDoReport {
  /**
   * TRUE when the resolver finished and `items` is the complete list of what it could not do —
   * possibly empty. FALSE when it did not finish, and `because` says why.
   *
   * AN EMPTY LIST IS NEVER AN ANSWER ON ITS OWN. That is what the pair of keys is for: a reader
   * holding `{checked: false, because: 'no_file_index'}` cannot read it as *the resolver checked and
   * all is fine*, and `SHAPE_CROSS_CHECKS.CouldNotDoReport` refuses a stored object that carries
   * neither or both.
   */
  checked: boolean
  items?: { code: CouldNotDo; inputs?: Record<string, string> }[]
  because?: CouldNotDo
}

/** What one run of the resolver concluded. Written only by the resolve route. */
export interface Resolution {
  at: string
  /** The resolver version. Bumped when the rules change, so a stored conclusion says what made it. */
  resolver: string
  index?: { builtAt: string; root: string; fileCount: number; scanId?: string }
  /** When the Implementation Map answered. Absent until it does, which is a real answer. */
  map?: { readAt: string }
  writes?: ResolvedEntry[]
  creates?: ResolvedEntry[]
  dependsOn?: ResolvedEntry[]
  semantic?: { declared?: string[]; discovered?: { id: string; provenance: string; from: string }[] }
  couldNotDo: CouldNotDoReport
}

/** The eight things an agent may say about one difference. B.4's own list. */
export const RESPONSE_OUTCOMES = [
  'accept',
  'revise',
  'keep',
  'map_wrong',
  'resolver_limit',
  'narrow',
  'expand',
  'coordinate',
] as const
export type ResponseOutcome = (typeof RESPONSE_OUTCOMES)[number]

/** One answer to one difference, or to a whole row of them. */
export interface WorkDomainResponse {
  /** The exact difference this answers. One of `key` or `row` is present, never both. */
  key?: string
  row?: DiffRow
  outcome: ResponseOutcome
  because?: string
  at?: string
}

/** The accepted domain: what every later comparison reads. Written only by the accept route. */
export interface AcceptedDomain {
  at: string
  /** The file index this was accepted against. The beginning of every drift window. */
  index?: { builtAt: string; root: string; scanId?: string }
  /** `data.resolved.at`, so an accepted set names the resolution it answered. */
  fromResolution?: string
  writes?: string[]
  creates?: string[]
  dependsOn?: string[]
  /** The three lists resolved ONCE, at acceptance, and frozen. Overlap compares these. */
  entries?: ResolvedEntry[]
}

/** What an agent decided about one overlap. Advisory: it refuses nobody anything. */
export const ACKNOWLEDGE_STANCES = ['continuing', 'waiting', 'narrowed'] as const
export type AcknowledgeStance = (typeof ACKNOWLEDGE_STANCES)[number]

export interface Acknowledgement {
  /** The overlap key, which is derived from its inputs and holds no class — see `overlapKey`. */
  key: string
  stance: AcknowledgeStance
  note?: string
  at?: string
}

/** The sentence a person reads for one stance. */
export const STANCE_SAYS: Readonly<Record<AcknowledgeStance, string>> = {
  continuing: 'Both are carrying on.',
  waiting: 'Waiting for the other session.',
  narrowed: 'Scope was narrowed because of this.',
}

// ============================================================================ the scope diff

/** The seven rows of B.3, and not one more. */
export const DIFF_ROWS = [
  'agree',
  'dependency_missing',
  'no_known_path',
  'extra_semantic',
  'shared_file',
  'other_domain_depends',
  'mapping_unsure',
] as const
export type DiffRow = (typeof DIFF_ROWS)[number]

/**
 * ROW 6 CAN NEVER REFUSE AN ACCEPT, and this list is where that rule lives rather than in a
 * condition inside the accept route.
 *
 * `other_domain_depends` is computed over OTHER agents' domains. If it could hold an accept open,
 * then a second agent filing a domain could make the first agent's accept fail on a key it had
 * never seen — and "nothing in this design refuses an act because another agent is working" would
 * be false. About one working hour in nine in this corpus has more than one session writing, so
 * that is not a rare shape.
 */
export const ROWS_THE_ACCEPT_GATE_REFUSES_ON: readonly DiffRow[] = DIFF_ROWS.filter(
  (row) => row !== 'other_domain_depends',
)

/** The sentence a person reads for one row, with the subject filled in. */
export const DIFF_ROW_SAYS: Readonly<Record<DiffRow, string>> = {
  agree: 'Mole Office read this the same way you did.',
  dependency_missing: 'You did not name something your own work imports.',
  no_known_path: 'Nothing Mole Office can see connects this to what you are changing. You may be right; it cannot check.',
  extra_semantic: 'These paths are also in a module you did not name.',
  shared_file: 'This file belongs to two modules. Changing it reaches both.',
  other_domain_depends: 'Another session says it relies on something you are changing.',
  mapping_unsure: 'This path is not in the file index. Either it is new, or the index is older than the work.',
}

// ============================================================================ the overlap classes

/**
 * SIX CLASSES OVER FOUR RANKS. ONE TABLE.
 *
 * FOUR OF THE RANKS ARE THE SPECIFICATION'S OWN, from its five-line severity example: read/read is *usually
 * irrelevant*, same Module is a *presence signal*, write/dependency is a *meaningful coordination
 * warning* and write/write is a *strong coordination warning*. The other two classes come from its
 * separate class list, WHICH CARRIES NO SEVERITY AT ALL, so their ranks are this build's and the
 * reasons are written beside them.
 *
 * WHY TWO CLASSES SHARE RANK 3. `write_dependency` and `interface_impact` are the same fact reached
 * two ways — one declared by the other agent, one worked out through the dependency graph. The
 * difference between them is provenance, not severity. Ranking the inferred one lower would be a
 * design deciding that a real risk matters less because Mole Office was the one who noticed it.
 *
 * WHY `create_in_area` IS 2. A create that lands on exactly the path another domain writes is not
 * this class — that is `write_write`, because the entries cover each other. This is the weaker case:
 * two agents adding different files to one directory. Usually fine, occasionally a merge conflict in
 * an index or a manifest. So: above *same part*, below *one is changing what the other relies on*.
 *
 * RANK 4 IS THE ONLY RANK THAT MAY CARRY URGENCY INK, at most one per row, per the UX contract. It
 * is the one place a reader must act. Ranks 3 and below are word and shape only.
 */
export const OVERLAP_CLASSES = {
  write_write: {
    rank: 4,
    word: 'Both changing the same file',
    fires: 'a write or create entry of one covers a write or create entry of the other',
  },
  write_dependency: {
    rank: 3,
    word: 'One is changing what the other relies on',
    fires: 'a write or create entry of one covers something the other declared it relies on',
  },
  interface_impact: {
    rank: 3,
    word: 'A change reaches the other through what it imports',
    fires: 'one writes a file that something the other touches imports, however many hops away',
  },
  create_in_area: {
    rank: 2,
    word: 'One is creating inside the other’s area',
    fires: 'a create lands inside a directory the other writes, without covering a specific entry of it',
  },
  semantic_only: {
    rank: 1,
    word: 'Working on the same part',
    fires: 'the two share a module, pipeline, block, task or problem, and no path class fired',
  },
  read_read: {
    rank: 0,
    word: 'Both rely on the same file',
    fires: 'only the things they each declared they rely on cover each other',
  },
} as const satisfies Record<string, { rank: number; word: string; fires: string }>

export type OverlapClass = keyof typeof OVERLAP_CLASSES

/** The six keys, in the order they are declared, which is worst first. */
export const OVERLAP_CLASS_KEYS = Object.keys(OVERLAP_CLASSES) as readonly OverlapClass[]

/**
 * WHICH CLASSES A PAST RANGE COULD BE WORKED OUT FOR, AND THE ONE THAT COULD NOT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS DECLARED HERE AND NOT DECIDED BY WHOEVER DRAWS IT
 * ---------------------------------------------------------------------------------------
 *
 * `telemetry.md` §9.4a asks the agent-use page to draw five of the six classes over a past range and
 * to SAY WHICH ONE IT CANNOT DRAW AND WHY. Its own row records the finding behind that:
 *
 *     "§9.4a claimed a past overlap is recomputable, having checked two of the classifier's three
 *      inputs. The third is the live file index, which keeps no history."
 *
 * So the answer is a fact about how each class fires, which is this file's subject, and not a
 * judgement a page makes. A component deciding it would be a second declaration of which class
 * needs which input — the defect this file's own header names.
 *
 * THE LIST IS DERIVED, so a seventh class joins the recomputable five by existing rather than by
 * somebody remembering to add it, and only a class that genuinely needs the index is written out.
 */
export const OVERLAP_NEEDS_THE_LIVE_INDEX: readonly OverlapClass[] = ['interface_impact']

/** The five a past range could be worked out for, derived so a new class is included by default. */
export const OVERLAP_OVER_A_PAST_RANGE: readonly OverlapClass[] = OVERLAP_CLASS_KEYS.filter(
  (key) => !OVERLAP_NEEDS_THE_LIVE_INDEX.includes(key),
)

/**
 * Why the one that cannot, cannot — in a reader's words, because a screen draws this.
 *
 * `interface_impact` fires when one session writes a file and the things that import it reach the
 * other session. That reaching is read from the file index, and the index holds what imports what
 * TODAY. Applied to work from a fortnight ago it would answer with today's imports, which is a
 * different question wearing the right label.
 */
export const WHY_A_PAST_RANGE_LOSES_IT =
  'it is worked out from the file index, and the index only knows what imports what today'

/**
 * HOW ONE OVERLAP RANK IS DRAWN, ON A CARD THAT MAY HAVE NO ROOM FOR ITS WORD.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS TABLE IS KEYED ON THE RANK AND NOT ON THE CLASS
 * ---------------------------------------------------------------------------------------
 *
 * There are six classes and four drawn ranks, because `write_dependency` and `interface_impact` are
 * the same fact reached two ways and share rank 3 — see `OVERLAP_CLASSES` above. Giving them two
 * marks would draw a difference of provenance as a difference of severity. Rank 0 is counted and
 * never drawn, so it has no entry here at all.
 *
 * ---------------------------------------------------------------------------------------
 * THE FOUR WERE CHOSEN WITH `withoutHue`, AND NOT WITH `tellsApart`
 * ---------------------------------------------------------------------------------------
 *
 * `tellsApart` in `./states.ts` is `one.word !== other.word || withoutHue(one.mark) !== ...`. It
 * passes the moment two WORDS differ, and four ranks have four different words by construction, so
 * it would have accepted any four marks at all — including four identical ones. On a 196px graph
 * card there may be no word drawn. So the check that chose these is `withoutHue(a) !== withoutHue(b)`
 * over every pair, which is what `composition.ts`'s `markPairs()` already does for the same job.
 * A test deleted on 13 November 2026 asserted both halves: that these four differ under `withoutHue`, and that
 * `tellsApart` alone would have let a straight collision through.
 *
 * ---------------------------------------------------------------------------------------
 * THE FAMILY'S OWN SIGNATURE IS THE ROUND GLYPH, AND IT IS WHAT KEEPS IT APART FROM THE OTHERS
 * ---------------------------------------------------------------------------------------
 *
 * `RESTRICTION_MARKS` separates itself from everything else by drawing every entry in the left
 * margin. That channel is spent. So this family takes the three round glyphs — `disc`, `ring` and
 * `dot` — which no other inline family uses: the composition marks are `filled`, `struck`,
 * `broken`, `barred`, `doubled` and `hollow`. Round means people. A reader who has learned that one
 * thing can tell an overlap mark from a history mark before reading either.
 *
 * ADJACENT RANKS DIFFER IN TWO CHANNELS, NOT ONE. Rank 4 against rank 3 is a filled block against a
 * bordered box AND a solid disc against a hollow ring. One channel apart is a difference that
 * survives in a table and disappears at 24% zoom.
 *
 * `dashed` AND `hairline` ARE NOT USED HERE. The dash means *Mole Office worked this out and nobody
 * confirmed it* and the hairline belongs to the planned world; both are spent elsewhere and neither
 * is free to mean a severity.
 *
 * WEIGHT FALLS WITH RANK, WHICH IS THE POINT. Rank 4 is the only rank that may carry urgency ink,
 * and it is also the only one drawn as solid ink. Rank 1 is a bare dot with no enclosure at all —
 * two agents working on the same part is who else is here, not a warning, and a drawing that gave
 * it a box would put four boxes on every card in a busy project.
 */
export const OVERLAP_MARKS: Readonly<Record<number, { word: string; mark: StateMark; detail: string }>> = {
  4: {
    word: 'Both writing here',
    mark: { form: 'block', glyph: 'disc', edge: 'solid', where: 'inline' },
    detail:
      'Two work domains have said they will change the same file. Whichever writes second overwrites the first ' +
      'unless somebody decides who owns it.',
  },
  3: {
    word: 'One is changing what the other relies on',
    mark: { form: 'outline', glyph: 'ring', edge: 'solid', where: 'inline' },
    detail:
      'One domain writes something the other declared it relies on, either directly or through what that file ' +
      'imports. The second domain can be broken by work it never sees.',
  },
  2: {
    word: 'One is working inside the other’s area',
    mark: { form: 'outline', glyph: 'dot', edge: 'underline', where: 'inline' },
    detail:
      'A create lands inside a directory the other domain writes, without covering any entry of it. Usually fine; ' +
      'occasionally a conflict in an index or a manifest.',
  },
  1: {
    word: 'Both on the same part',
    mark: { form: 'text', glyph: 'dot', edge: 'none', where: 'inline' },
    detail:
      'The two domains share a module, pipeline, block, task or problem, and nothing about the files they touch ' +
      'fired. It is who else is here, not a warning.',
  },
}

/**
 * The mark for a drawn rank, or null for a rank nobody gave one. Never a fallback shape.
 *
 * Rank 0 returns null on purpose: *usually irrelevant* is counted and said in a line under the
 * drawing, and drawing it would put a mark on nearly every card in a busy project.
 */
export function overlapMarkOf(rank: number): { word: string; mark: StateMark; detail: string } | null {
  return OVERLAP_MARKS[rank] ?? null
}

/** The rank of one class, 0 to 4. */
export function rankOf(overlapClass: OverlapClass): number {
  return OVERLAP_CLASSES[overlapClass].rank
}

/**
 * THE RANKS THAT ARE DRAWN, worst first. Rank 0 is COUNTED AND NOT DRAWN: *usually irrelevant* is
 * not *never recorded*, so the read carries the count and the pairs and the page prints them in one
 * line. A count of zero draws nothing at all.
 */
export const DRAWN_RANKS: readonly number[] = [4, 3, 2, 1]

// ============================================================================ the overlap key

/**
 * THE IDENTITY OF ONE OVERLAP, DERIVED FROM ITS INPUTS AND STORED NOWHERE.
 *
 * The two domain ids sorted, then the shared subject — a normalised path, or a record id when the
 * class is `semantic_only`. THE CLASS IS NOT IN IT, and that is the whole point rather than a
 * shorthand: `narrow` and `expand` exist to change the entries, so an overlap that was
 * `write_write` becomes `write_dependency` the first time an agent narrows its writes at a second
 * accept. With the class inside the key, every acknowledgement made against the old key would be
 * refused and every message written under it would stop being found — the identity would not be
 * stable under the one change it has to survive, and that change is the common case.
 */
export function overlapKey(domainA: string, domainB: string, subject: string): string {
  const [first, second] = domainA <= domainB ? [domainA, domainB] : [domainB, domainA]
  return `${first}|${second}|${subject}`
}

/** The two domain ids of a key, for the read that has to find a message written before a re-scope. */
export function domainsInKey(key: string): { a: string; b: string } | null {
  const parts = key.split('|')
  if (parts.length < 3) return null
  const [a, b] = parts
  if (a === undefined || b === undefined || a === '' || b === '') return null
  return { a, b }
}

// ============================================================================ what a domain's stage is

/**
 * THE STAGE OF A WORK DOMAIN IS DERIVED FROM FOUR STORED FACTS, AND IS NEVER STORED.
 *
 * Nothing stores a stage word, so a stage cannot disagree with the content. There is a second,
 * measured reason: `STATE_DRAWING_BY_WORD` maps `accepted` to the struck glyph whose meaning is *it
 * ended without delivering — do not build on it*, so a stored `state: 'accepted'` would be drawn as
 * an abandonment on every surface in the product and nothing would fail.
 */
export type DomainStage = 'filed' | 'resolved' | 'working' | 'closed'

export function stageOf(data: { resolved?: unknown; accepted?: unknown; closedAt?: unknown }): DomainStage {
  if (data.closedAt !== undefined && data.closedAt !== null && data.closedAt !== '') return 'closed'
  if (data.accepted !== undefined && data.accepted !== null) return 'working'
  if (data.resolved !== undefined && data.resolved !== null) return 'resolved'
  return 'filed'
}

/** The sentence for a stage. `working` takes the age of the last sign of work beside it. */
export const STAGE_SAYS: Readonly<Record<DomainStage, string>> = {
  filed: 'Nothing has been resolved yet.',
  resolved: 'The agent has not answered the differences yet.',
  working: 'Working.',
  closed: 'Closed.',
}

// ============================================================================ presence, which is not the stage

/**
 * IS THERE A LIVE ATTACHMENT HERE? A SEPARATE QUESTION FROM WHAT THE AGENT IS SUPPOSED TO BE DOING.
 *
 * ---------------------------------------------------------------------------------------
 * TWO DIMENSIONS, NEVER ONE ENUM
 * ---------------------------------------------------------------------------------------
 *
 * Section 3 of the addendum: do not put everything into one giant agent status enum, and model
 * at least two independent dimensions. Presence answers *is there currently a usable
 * live attachment*. The stage above answers *what is this work supposed to be doing*. A screen may
 * draw both; nothing here merges them, and no function in this file returns one word carrying both.
 *
 * `SESSION_STATES` in ./types.ts is the single enum this replaces for the graph. It is not deleted:
 * six stored words are what a session record holds and other surfaces read them. It is not read
 * here, and the reason is measured — ten `session` records in the owner's corpus say `running` and
 * nine of them last wrote anything between ten and fourteen days ago. A stored word does not say
 * whether anybody is here.
 *
 * ---------------------------------------------------------------------------------------
 * PRESENCE IS AN AGE, TURNED INTO FOUR WORDS AT THE LAST MOMENT
 * ---------------------------------------------------------------------------------------
 *
 * `lastSignOf` on the server already measures the age from two stored facts: the newest revision of
 * the domain, and the newest change row from its session. Nothing probes a process. These four words
 * are that age banded, and the age itself travels beside them so a screen can say `38m` rather than
 * a word.
 *
 * `never` IS NOT `stale`. Nothing has ever been seen for this domain, which is a different fact from
 * work that stopped. The fifth invariant: *nothing is there* and *nobody has looked* are two answers.
 */
export const PRESENCE_STATES = ['live', 'quiet', 'stale', 'never'] as const
export type PresenceState = (typeof PRESENCE_STATES)[number]

/**
 * The two thresholds, in minutes, and why each is where it is.
 *
 * THIRTY MINUTES for `live`: an agent working through a plan writes to Mole Office several times an hour,
 * and a session that has written nothing for half an hour is not one a reader should be told is
 * here. TWENTY-FOUR HOURS for `quiet`: inside a working day, the work is paused rather than over;
 * past it, nobody has touched this since yesterday and a reader deciding who to ask needs to know.
 */
export const PRESENCE_MINUTES = { live: 30, quiet: 60 * 24 } as const

/**
 * The presence word for an age in minutes, or `never` when nothing has ever been seen.
 *
 * ONE PLACE. The server bands it, the browser draws it and the tests read it here, so a screen
 * cannot invent a fifth word or move a threshold to make a drawing look busier.
 */
export function presenceFromAge(minutes: number | null): PresenceState {
  if (minutes === null) return 'never'
  if (minutes <= PRESENCE_MINUTES.live) return 'live'
  if (minutes <= PRESENCE_MINUTES.quiet) return 'quiet'
  return 'stale'
}

/**
 * WHAT THE HOVER SAYS ABOUT THE LAST SIGN OF WORK. Declared here, beside the states it is about.
 *
 * IT IS A DECLARED WORD AND NOT A SENTENCE A COMPONENT WRITES. The sentence gate, a
 * test deleted on 12 November 2026, existed because this campaign kept answering confusing screens by writing another paragraph into
 * the component that drew them. The rule that follows is that the words live in one table beside
 * the thing they describe — the way `STAGE_SAYS` above and `RESTRICTION_MARKS` already do — and a
 * component fills the slots. `fillWord` throws on a missing slot rather than drawing a gap.
 *
 * TWO ROWS AND NOT ONE, because *last sign 0m ago* is not English and rounding it up to *1m* is a
 * small lie about the one number a reader is checking.
 */
export const LAST_SIGN_SAYS = {
  justNow: 'Last sign just now, from {from}.',
  ago: 'Last sign {age} ago, from {from}.',
} as const

/** What each presence word means, for a reader who asks. One clause, no metaphor. */
export const PRESENCE_SAYS: Readonly<Record<PresenceState, string>> = {
  live: 'Something happened here in the last half hour.',
  quiet: 'Nothing in the last half hour, but something today.',
  stale: 'Nothing for more than a day. Nobody has closed it.',
  never: 'Nothing has ever been seen for this work. Not the same as nobody working.',
}

/**
 * HOW MUCH INK A PRESENCE WORD IS WORTH, 0 to 3. Section 15, made arithmetic.
 *
 * A durable agent that has no live attachment, no pending message, no active responsibility and no
 * unresolved handoff should have almost no visual weight in normal current-work views. So `stale`
 * and `never` are weight 0: they draw NOTHING on an ordinary card. They are not drawn faintly — a
 * faint mark on every card in a project with forty old domains is the session graveyard again,
 * one shade lighter.
 *
 * A card can still be asked. Weight 0 means nothing is drawn at the ordinary positions; the reading
 * layer under the drawing and Inspect still hold every domain, live or not.
 */
export const PRESENCE_WEIGHT: Readonly<Record<PresenceState, number>> = {
  live: 3,
  quiet: 2,
  stale: 0,
  never: 0,
}

/** Whether an ordinary drawing draws anything at all for this presence. */
export function presenceIsDrawn(presence: PresenceState): boolean {
  return PRESENCE_WEIGHT[presence] > 0
}

/**
 * THE FOUR FIELDS NO ORDINARY WRITE MAY TOUCH.
 *
 * Each is written by exactly one route. Without this list, `PATCH /api/records/:id` with a
 * `dataPatch` naming `resolved` lets an agent write its own resolver finding, and the whole
 * mechanism collapses into one field the agent controls.
 */
export const MACHINE_WRITTEN_FIELDS = ['resolved', 'responses', 'accepted', 'acknowledged'] as const
export type MachineWrittenField = (typeof MACHINE_WRITTEN_FIELDS)[number]

/** Which route writes each of the four, named in the refusal so a reader is not left guessing. */
export const WRITTEN_BY: Readonly<Record<MachineWrittenField, string>> = {
  resolved: 'POST /api/work-domains/<id>/resolve',
  responses: 'POST /api/work-domains/<id>/accept',
  accepted: 'POST /api/work-domains/<id>/accept',
  acknowledged: 'POST /api/work-domains/<id>/acknowledge',
}

/** The fields an agent may edit before acceptance and not after. */
export const HYPOTHESIS_FIELDS = ['objective', 'writes', 'creates', 'dependsOn', 'repository'] as const
