// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The demo originally covered every writable kind. sealed_tip is now explicitly absent: only a real finish may create one, and demo history must not invent a submitted seal. */
/**
 * The seed: what it writes, and that it can be run twice.
 *
 * Every screenshot, every manual review and every demonstration of Mole Office happens on seeded data,
 * so an empty or half-written seed does not look like a broken script — it looks like a broken
 * feature. These tests assert what a review NEEDS from the demo, and never the demo's own shape.
 *
 * THAT DISTINCTION IS NEW, AND IT IS WHY THE FIRST THREE CASES CHANGED. They used to assert about
 * 220 records in named proportions, at least twelve Chinese titles, and a list of particular demo
 * titles. All three went red when somebody edited the demo, with no rule broken, and none would
 * have gone red if the demo had stopped demonstrating anything. What replaced them is coverage of
 * every record kind, floors rather than counts, and shares of the corpus rather than totals.
 *
 * WHAT IS CHECKED HERE AND WHAT IS CHECKED IN THE SEED. The seed's own `check()` runs on every
 * `npm run db:seed` and refuses to finish if the data has stopped demonstrating the rules; it is
 * about the CONTENT, which rots on a different clock from code. These tests are about the SHAPE:
 * that the record the reviewer is told to look at is there, of the right kind, with the right
 * fields, and that the semantics work.ts defines are each exercised by something a person can
 * open. Where the two overlap it is on purpose — a check that only runs when somebody re-seeds is
 * not a check the suite can rely on.
 *
 * THE REGRESSION AT THE BOTTOM IS ONE REASON THIS FILE EXISTS. The seed used to report "19 already
 * current" while the app could see only nine records. Everything it was missing was still in the
 * table, soft-deleted: `getRecordByTitle` returns deleted rows, `upsert` compared their contents,
 * found them identical and called them current, and `listRecords()` — what the API and the pages
 * read — skips deleted rows. Content equality is not state equality.
 *
 * Importing scripts/seed.ts RUNS the seed, so freshDb() has to point the connection at a throwaway
 * database before that import happens. See tests/helpers.ts for why the imports are dynamic.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, one, type TestDb } from './helpers.ts'
import { completenessOf } from '@shared/kinds.ts'
import { PACK_KIND } from '@shared/kinds/pack.ts'
import { RECORD_KINDS, type PanelRecord } from '@shared/types.ts'
import {
  blockIdsOf,
  readPipelineBlocks,
  type BlockLinkRow,
  type PipelineBlockView,
} from '@shared/blocks.ts'
import {
  CONSEQUENCE_BEARERS,
  gateIsWellFormed,
  type GateKind,
  isSafety,
  progressOf,
  readConsequence,
  readFulfilment,
  readPause,
  type ConsequenceBearer,
  type Gate,
} from '@shared/work.ts'
import { computeAttention, compareRows } from '@shared/attention.ts'
import { localStamp } from '@shared/time.ts'
import { parseDueStamp } from '../src/web/lib/attention.ts'


type SeedModule = typeof import('../scripts/seed.ts')

let t: TestDb
let seed!: SeedModule

beforeAll(async () => {
  t = await freshDb()
  seed = await import('../scripts/seed.ts')
})

afterAll(() => {
  t.close()
})

// ---------------------------------------------------------------------------- small helpers

/** The seeded record with this title, or a failure that names it. */
function record(title: string): PanelRecord {
  const r = t.api.getRecordByTitle(title, 'default')
  if (!r) throw new Error(`the seed wrote no record called "${title}"`)
  return r
}

/**
 * A stored timestamp as milliseconds, local time.
 *
 * Two forms are stored on purpose and both are exercised here: "YYYY-MM-DD HH:MM:SS" is an
 * instant, and a bare "YYYY-MM-DD" due date means the END of that day — so something due today
 * does not turn overdue one minute after midnight.
 */
function localMs(stamp: string): number {
  const iso = stamp.length > 10 ? stamp.replace(' ', 'T') : `${stamp}T23:59:59`
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) throw new Error(`unparseable timestamp "${stamp}"`)
  return ms
}

/** A record's `data` field as a string, or a failure. `data` is an open bag, so this checks. */
function dataStr(title: string, field: string): string {
  const v = record(title).data[field]
  if (typeof v !== 'string') throw new Error(`"${title}" has no string \`${field}\`, got ${typeof v}`)
  return v
}

/**
 * The blocks of a pipeline, in its stored order, read back through the one reader there is.
 *
 * It used to read `data.steps` straight out of the record. A block is a record, so this resolves
 * the ordered ids against the records and the links, exactly as every page does.
 */
function blocksOf(title: string): PipelineBlockView[] {
  const pipeline = record(title)
  const reading = readPipelineBlocks(pipeline, t.api.listRecords({ workspaceId: 'default', includeDeleted: true }), blockLinkRowsOf())
  if (reading.undeclared) throw new Error(`pipeline "${title}" has no blockIds`)
  expect(reading.problems, `"${title}" has holes in its order`).toEqual([])
  return reading.blocks
}

/** Every link in the database, in the shape the block reader takes. */
function blockLinkRowsOf(): BlockLinkRow[] {
  const rows = t.client.sqlite
    .prepare('select id, from_id as fromId, to_id as toId, type, gate, gate_up_to as upTo, inferred from links')
    .all() as { id: string; fromId: string; toId: string; type: string; gate: GateKind | null; upTo: string | null; inferred: number }[]
  return rows.map((row) => ({ ...row, inferred: row.inferred === 1 }))
}

/** Every gate stored on a link, read straight out of the table the write path writes. */
function linkGates(): { type: string; gate: Gate }[] {
  const rows = t.client.sqlite.prepare('select type, gate, gate_up_to as upTo from links where gate is not null').all() as {
    type: string
    gate: string
    upTo: string | null
  }[]
  return rows.map((row) => ({
    type: row.type,
    gate: (row.upTo === null ? { kind: row.gate } : { kind: row.gate, upTo: row.upTo }) as Gate,
  }))
}

/** The rule, over everything the seed wrote. This is what a reader would see. */
function attention() {
  return computeAttention({
    now: Date.now(),
    records: t.api.listRecords({ workspaceId: 'default', includeDeleted: true }),
    links: readLinks(),
    changes: t.api
      .listChanges({ workspaceId: 'default', limit: 20000 })
      .map((row) => ({ ...row, op: row.op as never, actorType: row.actorType as never, origin: null })),
    resources: [],
    dueMs: parseDueStamp,
  })
}

/** The links, straight from the table — there is no lib function that returns them all. */
function readLinks() {
  return t.client.sqlite
    .prepare('select id, from_id as fromId, to_id as toId, type, inferred, created_at as createdAt, created_by as createdBy from links')
    .all() as never
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

/** The record the whole exercise turned on. Named once, asserted on several times below. */
const SAFETY_ITEM = 'Two reels in the 1931 crate are nitrate film, and they are stored beside the scanner lamp'

// ============================================================================ what it writes

/**
 * KINDS THE DEMO DELIBERATELY DOES NOT WRITE, each with the reason.
 *
 * The case below holds this against `RECORD_KINDS` in both directions. A kind that stops being
 * seeded fails until somebody adds it here; a kind that starts being seeded fails until its entry
 * is deleted. The list shrinking is the repair.
 */
/**
 * `agent` CAME OFF THIS LIST ON 6 SEPTEMBER 2026, and here is why the reason it gave stopped being
 * true. It said seeding an agent record would claim an agent exists. The demo has always claimed
 * that: twenty of its messages are written by an agent actor and twenty of its sessions say which
 * runtime ran them. What it did not have was the registry row saying who those writers are, and
 * criterion M59 now refuses a message to a person from a writer no registry holds — so without the
 * records the demo could not be written at all. The four it files are the four writers its own
 * messages already had.
 *
 * `incident` CAME OFF THIS LIST ON 14 SEPTEMBER 2026. Its reason was that an incident is a real
 * loss with the scene reconstructed and responsibility weighed, so seeding one would invent a loss
 * and invent blame. That is still true of an incident presented as an observation; what changed is
 * where the review tool can get one. `node tools/review.mjs` photographs every page the router
 * declares at four widths in both themes, and `#/incident/<id>` is reachable only with an id. The
 * seed is the honest source of that id — it is where every other photographed record comes from,
 * and its rows are stamped `fixture` — and the one it now writes says in its own title that it is
 * the review's fixture incident. So this list gains the incident by the seed writing one, not by
 * pretending a fabricated loss is real.
 */
const NOT_IN_THE_DEMO: Readonly<Record<string, string>> = {
  whole_suite_receipt: 'A receipt is produced only from an original cloud run; the demo does not run that method or have those artifacts.',
  notice_rules: 'Personal notice choices belong to their recipient. A demo must not change somebody’s wake choices; dedicated notice-rules fixtures exercise this kind.',
  sealed_tip: 'Historical demo runs carry no invented submission; the finish writer and dedicated seal fixtures exercise this immutable kind.',
  merge_entry:
    'A merge entry is a sealed run submitted to the merge queue, written only by the queue\'s doors. A seeded one ' +
    'would say a changeset is waiting to land in a directory when nothing is.',
  emergency_push:
    'An emergency push is one commit pushed straight to main while the owner\'s emergency switch is on, written only by ' +
    'its two doors. A seeded one would say main was moved past the queue when nothing moved it, and would name who ' +
    'pushed when nobody did; tests/an-emergency-push-to-main.test.ts makes real ones in a test office.',
  host_job:
    'A host job is one registered tool the office ran on the host for a run that asked for it, written only by its own ' +
    'doors. A seeded one would say a tool ran and a run got its result when nothing ran; ' +
    'tests/a-sandboxed-agent-asks-the-office-for-a-registered-host-tool.test.ts makes real ones in a test office.',
  [PACK_KIND]: 'A pack records a file that was made and checked. A seeded one would name a file that does not exist.',
  proposal: 'A proposal is a live question put to the owner. Seeding one would put a decision in front of the owner that nobody is actually asking for.',
  report: 'A report is finished writing for a person. There is none to write.',
  draft:
    'A draft is writing an agent has not sent yet, and the office reminds its writer about it. Seeding one would put ' +
    'unsent words in the demo that no agent is writing, and a reminder for them would reach somebody. The seed is ' +
    'scripts/seed.ts, which this change does not touch.',
  annotation: 'A comment is written about something on a screen, by somebody looking at it.',
  stopping_point: 'A stopping point is where a real run stopped.',
  placeholder: 'A deliberate unresolved slot is somebody deciding to leave something open.',
  ran_instead: 'A record that something else ran is a fact about an execution that happened.',
  work_domain: 'Work domains are established by the owner for the owner\'s own work.',
  trajectory: 'A trajectory is recorded from a moving machine.',
  planned_state: 'A planned state belongs to a plan somebody wrote.',
  context_bundle: 'A context bundle is gathered for a particular handover.',
  role_card:
    'A role card is a COPY of src/config/roles.json, written by POST /api/roles/mirror. Seeding invented ' +
    'ones would put permissions in the demo that nothing enforces, which is the one thing the kind says it must ' +
    'never be. Every installation gets the real five with one request.',
  role_card_words:
    'A role card\'s words are filed by the office itself at its start, one record per declared card, copied from ' +
    'src/config/roles.json (src/server/lib/card-words.ts). Seeding them as well would be a second account of each ' +
    'card\'s words, and the office refuses a second record for one card.',
  role_request:
    'A role request is one agent asking the agent that started it for a higher rung, and it waits on a press. ' +
    'Seeding one would put an unanswered request in front of somebody that no agent is actually making, and a ' +
    'seeded ANSWERED one would say a rung was granted that nobody granted.',
  notebook:
    'A notebook is what one person and one secretary have written down about working together. Seeding one would ' +
    'put invented preferences, invented instructions about what an agent may settle alone, and an invented ' +
    'character into the one record a run reads before anything else and takes as the person\'s own words. The ' +
    'person writes the first entries, which is the owner\'s own 一开始人在里面先写一些内容.',
  regulation:
    'A regulation is the person\'s own constraint on themselves, filed on the owner\'s words (criterion G2) and revocable by ' +
    'the owner only. Seeding one would put an invented constraint into the owner\'s name — the exact thing the owner\'s first regulation ' +
    'forbids an agent. The page that lists them says nothing has been filed, which is the true answer for this ' +
    'corpus and for the live one until the owner files the first.',
  tool_category:
    'The toolset catalogue\'s categories are filed into a project by tools/file-the-basic-toolset.mjs, which ' +
    'tests/the-basic-toolset-is-filed-once.test.ts runs against a test office. Seeding them as well would be a ' +
    'second list of the same categories, free to drift from the one the filer holds.',
  booking:
    'A booking holds a real program on the real card. Seeding one would show a GPU line nobody booked, and a ' +
    'program the office would end at once because it never ran. There is no bookings page yet.',
  checklist:
    'A checklist keeps real requests, each with the message it came in. Seeding one would invent requests nobody ' +
    'made and messages nobody sent. The checklists page is part 2 of the work of a decision.',
  tool:
    'A tool record says whether a tool is built and where its file is. Seeding invented tools would put tools in ' +
    'the demo that nobody built, and the catalogue must never make a tool look finished. The real entries are ' +
    'filed by tools/file-the-basic-toolset.mjs.',
  secretary_duties:
    "A secretary's duties are the share of the work the person gave one real secretary, resting on the person's own " +
    'decisions. Seeding one would show duties nobody gave, resting on a decision nobody made. ' +
    'tests/secretary-duties.test.ts writes them in a test world.',
  department:
    "A department is a real part of the person's organisation, named by the person or by a secretary on the person's " +
    'words. Seeding one would show a department nobody set up, led by a supervisor nobody chose. ' +
    'tests/departments-are-records-of-their-own.test.ts files them in a test world.',
  key_item:
    'A key item is one of the few things the person keeps in front of them, with its progress and an estimate of the ' +
    'time left that somebody made. Seeding one would show an estimate nobody made, of work nobody named. ' +
    'tests/key-items-carry-progress-and-a-time-left-estimate.test.ts files them in a test world.',
  watch:
    'A watch says a program is running on this computer for a real agent, and when it was last seen alive. Seeding ' +
    'one would show a program nobody started, seen alive at a time nobody looked. tests/a-watch-is-a-record.test.ts ' +
    'files them in a test world.',
  backlog_item:
    "A backlog item is work a real person or agent placed in a real line's list. Seeding one would show work nobody " +
    'placed, in a line nobody runs. tests/a-backlog-item-is-a-record.test.ts files them in a test world.',
  handbook:
    'A handbook is sent to a real agent that starts a flow or takes a card, as guidance somebody wrote for it. Seeding ' +
    'one would show guidance nobody wrote, hanging on a flow nobody runs. tests/a-handbook-is-a-record.test.ts files ' +
    'them in a test world.',
  knowledge_entry:
    'A knowledge entry is guidance written only through the knowledge doors into the shared knowledge workspace, ' +
    'never into the project the demo seeds. Seeding one would show guidance nobody wrote. ' +
    'tests/knowledge-entries-and-changes.test.ts writes real ones in a test world.',
  knowledge_category:
    'A knowledge category is a shelf written only through the knowledge doors into the shared knowledge workspace, ' +
    'never into the project the demo seeds. tests/knowledge-entries-and-changes.test.ts writes real ones in a test world.',
  knowledge_bookmark:
    'A knowledge bookmark records a use only through the knowledge doors into the shared knowledge workspace, ' +
    'never into the project the demo seeds. tests/knowledge-entries-and-changes.test.ts writes real ones in a test world.',
  knowledge_change:
    'A knowledge change records a review only through the knowledge doors into the shared knowledge workspace, ' +
    'never into the project the demo seeds. tests/knowledge-entries-and-changes.test.ts writes real ones in a test world.',
  knowledge_query:
    'A knowledge query records what a run asked the library, only through the knowledge doors into the shared knowledge workspace, ' +
    'never into the project the demo seeds. tests/knowledge-query-and-word-search.test.ts writes real ones in a test world.',
  knowledge_rating:
    'A knowledge rating records what a run said about an entry it read, only through the knowledge doors into the shared knowledge workspace, ' +
    'never into the project the demo seeds. tests/knowledge-ratings-and-counts.test.ts writes real ones in a test world.',
  project_chapter:
    "A project chapter holds the rules the person or a project's own secretary wrote for one real project, and only " +
    'its own doors write one. Seeding one would show rules nobody wrote, for a project nobody runs. ' +
    'tests/project-rules-the-chapter.test.ts writes one in a test world.',
  design:
    'A design holds the candidates one real piece of method work compared, and names who asked for it by registry id. ' +
    'Seeding one would show a choice nobody made, for work nobody asked for. ' +
    'tests/project-rules-the-judge.test.ts files them in a test world.',
  design_review:
    'A design review is written only by its own door, which writes the reviewer from the key. Seeding one would show ' +
    'a judgement nobody made. tests/project-rules-the-judge.test.ts writes them in a test world.',
  design_reminder:
    "A design reminder is written only through its own doors: by the office before a real run's seal, or as a miss " +
    'by the person or the secretary who judges it. Seeding one would show a reminder no run was given and a ' +
    'judgement nobody made. tests/a-method-run-is-reminded-of-its-reviewed-design-before-the-seal.test.ts writes ' +
    'them in a test world.',
  criticism:
    "A criticism is one agent's account of the product getting in its way, and its independent mark names the " +
    'critic, the work\'s author and the moment. The demo is filed by one fixture person, so a seeded criticism ' +
    'would be that person criticising their own work, which the independent step refuses. ' +
    'tests/the-criticism-record.test.ts files an independent one and an ordinary one in a test world.',
  quick_note:
    "A quick note is the person's own writing, filed from its own page as they write. The seed is scripts/seed.ts, " +
    'which the change adding the kind does not touch, so the demo has none, and My notes is reviewed empty until the ' +
    'seed writes one.',
}

// ============================================================================ what it writes

describe('the seed writes a corpus a review can be done on', () => {
  /*
   * WHAT THESE CASES USED TO BE, AND WHY THEY CHANGED.
   *
   * Three cases here asserted the SHAPE OF THE DEMO: about 220 records in named proportions, at
   * least twelve Chinese titles, and a list of particular demo titles, each named in the test. Every
   * one of them went red when somebody edited the demo, with no rule of the product broken, and none
   * of them would have gone red if the demo had stopped demonstrating
   * anything. The seed's own `check()` runs on every `npm run db:seed` and is what owns the
   * content; these cases now hold only what a REVIEW needs to be possible at all.
   *
   * The case asserting particular titles is gone rather than rewritten. It said a reviewer should
   * open Mole Office and find the same work, which is a wish about the demo and not a rule; the
   * records this file's other cases open are named where they are opened, and those cases fail on
   * their own if the seed stops writing one.
   */
  it('covers every kind of record it is meant to demonstrate, and names the ones it does not', () => {
    const all = t.api.listRecords({ workspaceId: 'default', includeDeleted: true })
    const written = new Set(all.map((r) => r.kind as string))
    const owed = Object.keys(NOT_IN_THE_DEMO)
    const shouldBeThere = (RECORD_KINDS as readonly string[]).filter((kind) => !owed.includes(kind))

    for (const kind of shouldBeThere) {
      expect(written.has(kind), `no ${kind} is seeded, so any page listing them is reviewed empty`).toBe(true)
    }
    // And the other way. A kind that has started being demonstrated must come off the list, so the
    // list can only shrink by somebody saying so.
    for (const kind of owed) {
      expect(written.has(kind), `${kind} is seeded now and is still written down as one the demo leaves out`).toBe(
        false,
      )
    }
    // Every name on the list is a kind. A typo would silently excuse a kind that is missing.
    for (const kind of owed) {
      expect(RECORD_KINDS as readonly string[], `${kind} is not a record kind`).toContain(kind)
    }
  })

  it('writes more than one screenful, because a list that fits on one says nothing about length', () => {
    // THE SIZE IS THE DEMONSTRATION, and this is a floor rather than a shape. 28 records told
    // nobody anything about how the interface behaves at 2,000. The number is not asserted, because
    // a demo that grows or shrinks breaks no rule; what is asserted is that a reviewer can still
    // see what a long list does.
    const live = t.api.listRecords({ workspaceId: 'default' })
    expect(live.length, 'the corpus fits on one screen, so no scrolling behaviour can be reviewed').toBeGreaterThan(100)
  })

  it('leaves records soft-deleted with live links into them, which is what the restore cases need', () => {
    // The regression at the bottom of this file needs rows that are deleted and still pointed at.
    // A count is not asserted: one is enough to review, and three is a fact about the demo.
    const live = t.api.listRecords({ workspaceId: 'default' })
    const all = t.api.listRecords({ workspaceId: 'default', includeDeleted: true })
    expect(all.length - live.length, 'nothing is soft-deleted, so a deleted row cannot be reviewed').toBeGreaterThan(0)
  })

  it('writes enough Chinese, and mixes it with English inside one sentence', () => {
    // People who use the product write like this. A layout that only works with English is broken, and it cannot be
    // found to be broken on a corpus with two Chinese titles in it.
    //
    // HELD AS A SHARE OF THE CORPUS, NOT AS A COUNT. Twelve was asserted here, which went red the
    // day somebody added English records and said nothing about whether a photographed page would
    // show one. A share survives the demo growing and shrinking and is what decides whether a
    // reviewer meets one.
    const cjk = /[一-鿿]/
    const all = t.api.listRecords({ workspaceId: 'default', includeDeleted: true })
    const share = (rows: readonly PanelRecord[]): number => rows.length / all.length
    expect(share(all.filter((r) => cjk.test(r.title))), 'too little Chinese to meet any of it on a page').toBeGreaterThan(
      0.05,
    )
    expect(
      share(all.filter((r) => r.summary !== null && cjk.test(r.summary))),
      'no summary is in Chinese, so no measured line width is tested on one',
    ).toBeGreaterThan(0.02)

    // Mixed inside one sentence, which is the case that breaks measured line widths.
    const mixed = all.filter((r) => r.summary !== null && cjk.test(r.summary) && /[A-Za-z]{4,}/.test(r.summary))
    expect(mixed.length, 'no record mixes the two scripts in one sentence').toBeGreaterThan(0)

    // THE TWO EXTREMES A LAYOUT HAS TO SURVIVE, said as what they are for. `node tools/review.mjs`
    // photographs every page at 390 as well as at 1440, so the corpus needs a title short enough to
    // leave a row nearly empty and one long enough to wrap several times at the narrow width.
    const lengths = all.map((r) => r.title.length)
    expect(Math.min(...lengths), 'no title is short enough to see a nearly empty row').toBeLessThanOrEqual(8)
    expect(Math.max(...lengths), 'no title is long enough to wrap at 390').toBeGreaterThanOrEqual(100)
  })
})

// ============================================================================ the new semantics

describe('consequence is stored, and covers the range of bearers', () => {
  it('records who is hurt on every bearer the vocabulary has', () => {
    const live = t.api.listRecords({ workspaceId: 'default' })
    const bearers = new Map<ConsequenceBearer, number>()
    for (const r of live) {
      const consequence = readConsequence(r.data)
      if (consequence !== null) bearers.set(consequence.bearer, (bearers.get(consequence.bearer) ?? 0) + 1)
    }
    for (const bearer of CONSEQUENCE_BEARERS) {
      expect(bearers.get(bearer) ?? 0, `nothing is borne by "${bearer}"`).toBeGreaterThan(0)
    }
    // Several honest "nothing follows from this", which is what makes a list shorter without
    // hiding anything.
    expect(bearers.get('none') ?? 0).toBeGreaterThanOrEqual(3)

    // And most records carry none at all. Absent is not `none`: one is a gap, the other is a
    // judgement somebody made, and a seed where everything carried one would hide the difference.
    const withAny = live.filter((r) => readConsequence(r.data) !== null).length
    expect(withAny).toBeLessThan(live.length / 2)
  })

  it('files the safety item today, and puts it at the top of the list', () => {
    const safety = record(SAFETY_ITEM)
    expect(isSafety(readConsequence(safety.data))).toBe(true)

    // FILED TODAY, which is the case the whole exercise turned on: the measurement found the same
    // record ranking 48th when it was new and 31st when it was three weeks old, because age was
    // doing the ranking.
    //
    // `localStamp(new Date())` and NOT `new Date().toISOString()`. Stored stamps are the operator's
    // wall clock, so the day they name is the local day; `toISOString` names the UTC day, and the
    // two are a different date for part of every day on any machine that is not at offset zero.
    // Written that way this test failed under TZ=Pacific/Kiritimati (+14:00) reporting 2026-08-11
    // against 2026-08-10 — the seed was right and the assertion was reading a different calendar.
    expect(safety.createdAt.slice(0, 10)).toBe(localStamp(new Date()).slice(0, 10))
    expect(Date.now() - localMs(safety.createdAt)).toBeLessThan(DAY)

    const result = attention()
    expect(result.visible[0]?.recordId, 'the newly filed safety item is not the top row').toBe(safety.id)
    expect(result.visible[0]?.safety).toBe(true)

    // And nothing that is not safety-critical outranks anything that is.
    const ranked = [...result.visible, ...result.remainder].sort(compareRows)
    const firstUnsafe = ranked.findIndex((row) => !row.safety)
    const lastSafe = ranked.map((row) => row.safety).lastIndexOf(true)
    if (firstUnsafe !== -1) expect(lastSafe).toBeLessThan(firstUnsafe)
  })

  it('does not put a record on the list just because it records a person', () => {
    // The rewind-bench guard module says a person could be hurt and is NOT selected: a module carries no state
    // word and is owed to nobody, so neither half of the rule reaches it. A stored consequence
    // ranks a row; it does not select one, and confusing the two would make the field a way of
    // forcing anything onto the front screen.
    const module = record('倒片台安全护罩')
    expect(readConsequence(module.data)?.bearer).toBe('person')
    const result = attention()
    // The RECORD is not selected. Its checklist items are, because their own state words say the
    // work stopped short — which is the rule working, not the consequence pulling the module in.
    const rows = [...result.visible, ...result.remainder]
    expect(rows.some((row) => row.shape === 'record' && row.recordId === module.id)).toBe(false)
    expect(result.passedOver.some((group) => group.keys.includes(`rec:${module.id}`))).toBe(true)
  })
})

describe('pauses', () => {
  it('seeds all four shapes, and they read differently', () => {
    const paused = t.api
      .listRecords({ workspaceId: 'default' })
      .map((r) => ({ record: r, pause: readPause(r.data) }))
      .filter((p) => p.pause !== null)
    expect(paused.length).toBeGreaterThanOrEqual(4)

    const now = Date.now()
    const withDate = paused.filter((p) => p.pause?.until?.date !== undefined)
    // One resume date has passed and one has not. Both are stored the same way and a reader has to
    // tell them apart, so both are here.
    expect(withDate.some((p) => (parseDueStamp(p.pause!.until!.date!) ?? 0) < now)).toBe(true)
    expect(withDate.some((p) => (parseDueStamp(p.pause!.until!.date!) ?? 0) > now)).toBe(true)

    // One waits on another record, and that record exists — a pause pointing at an id nothing
    // holds would be a dangling reference dressed up as a condition.
    const onRecord = paused.filter((p) => p.pause?.until?.recordId !== undefined)
    expect(onRecord.length).toBeGreaterThanOrEqual(1)
    for (const p of onRecord) expect(t.api.getRecord(p.pause!.until!.recordId!)).not.toBeNull()

    // One is open-ended, which is honest and common: "not now, no idea when".
    expect(paused.some((p) => p.pause?.until === undefined)).toBe(true)
    // And one names a condition Mole Office cannot check, in words.
    expect(paused.some((p) => p.pause?.until?.condition !== undefined)).toBe(true)

    // Every pause says why. A pause with no reason is indistinguishable from abandonment a month
    // later, which is the whole reason the field is required.
    for (const p of paused) expect(p.pause?.why.length ?? 0).toBeGreaterThan(10)
  })

  it('keeps a live pause off the attention list, and puts an expired one back on it', () => {
    const result = attention()
    expect(result.paused.length).toBeGreaterThanOrEqual(4)

    // A paused record is reported with its reason. Whether it is ALSO on the attention list is
    // decided by one thing only: whether the date somebody set it until has passed. That is the
    // third half of the rule and it is why this test is not "paused means off the list" any more —
    // "not now, until the 6th" and "not now, ever" are different pieces of news.
    const selected = new Set([...result.visible, ...result.remainder].map((row) => row.key))
    for (const row of result.paused) {
      expect(row.onList).toBe(selected.has(row.key))
      expect(row.note.length).toBeGreaterThan(10)
      // `standing` and `onList` are two readings of the same fact and must never disagree: only a
      // resume date that has passed puts a pause on the list by itself.
      if (row.standing === 'resume-date-passed') expect(row.onList).toBe(true)
      else if (!row.onList) expect(row.dueToResume).not.toBe(true)
    }

    // The seed carries exactly one of each, so both halves of that sentence are demonstrated by a
    // record a person can open rather than by a hypothetical.
    expect(result.paused.filter((row) => row.standing === 'resume-date-passed').length).toBe(1)
    expect(result.paused.filter((row) => row.standing === 'waiting-for-date').length).toBe(1)
    expect(result.paused.filter((row) => row.onList).length).toBe(1)

    // And the expired one is in its own reason-group, so six expired pauses could never take the
    // screen away from a crashed session and an overdue report.
    const expired = result.paused.find((row) => row.standing === 'resume-date-passed')
    const onList = [...result.visible, ...result.remainder].find((row) => row.key === expired?.key)
    expect(onList?.group).toBe('pause-elapsed')
    expect(onList?.reason.selectedBy).toBe('pause_elapsed')

    // The paused task whose state word says "todo" is a good example of why the pause has to beat
    // the word: nothing about `todo` says somebody put this down on purpose.
    const relabel = record('Relabel the 600 advert boxes against the new advert definition')
    expect(progressOf(relabel.data['state'])).toBe('not_started')
    expect(readPause(relabel.data)?.until?.recordId).toBe(record('Write down what counts as an advert and what counts as a notice').id)
  })
})

describe('gates', () => {
  it('records hard and partial gates on blocks links, and leaves some unqualified', () => {
    const gates = linkGates()
    expect(gates.filter((g) => g.gate.kind === 'hard').length).toBeGreaterThanOrEqual(2)
    expect(gates.filter((g) => g.gate.kind === 'partial').length).toBeGreaterThanOrEqual(2)

    // A gate rides on a `blocks` link and on nothing else. It is not a second dependency model.
    for (const g of gates) expect(g.type).toBe('blocks')
    // And every one of them is well formed: a partial gate that does not say how far is a hard
    // gate that is lying.
    for (const g of gates) expect(gateIsWellFormed(g.gate), JSON.stringify(g)).toBe(true)

    // Unqualified links are kept. NULL means the author said A blocks B and said nothing about how
    // much, and reading that as `hard` would make work that is mostly doable look completely stuck.
    const blocks = t.client.sqlite.prepare("select count(*) as n from links where type = 'blocks' and gate is null").get() as { n: number }
    expect(blocks.n).toBeGreaterThanOrEqual(1)
  })

  it('records the partial-gate case as partial, not hard', () => {
    // Both OCR runs on the sample can be done without the proofread text; nothing can be scored
    // without it. Recorded as a hard gate, three finished blocks would read as blocked work.
    const from = record('Finish proofreading the 300-page sample')
    const to = record('OCR accuracy check on a 300-page sample')
    const row = t.client.sqlite
      .prepare("select gate, gate_up_to as upTo from links where from_id = ? and to_id = ? and type = 'blocks'")
      .get(from.id, to.id) as { gate: string; upTo: string | null } | undefined
    expect(row?.gate).toBe('partial')
    // THE STAGE NAMES A RECORD NOW. It used to be the step id `ac-04`, which was free text nothing
    // could check: a gate naming a step of the wrong pipeline was indistinguishable from a stage
    // named in words, and both were stored behind a 201.
    const upTo = t.api.getRecord(String(row?.upTo))
    expect(upTo?.kind).toBe('block')
    expect(upTo?.title).toBe('Run the sample through the new binarisation')
  })

  it('records hard and partial gates on the dependencies between blocks', () => {
    // THE SAME LINK TYPE AND THE SAME CHECK as every other dependency in the product. A step's
    // `needs` was a second dependency model with its own half of the gate rule; this reads the
    // links between two blocks of one pipeline, which is what it became.
    const needs = t.api
      .listRecords({ workspaceId: 'default', kind: 'pipeline' })
      .flatMap((p) => blockIdsOf(p))
      .flatMap((id) => blockLinkRowsOf().filter((l) => l.type === 'blocks' && l.toId === id))
    expect(needs.filter((n) => n.gate === 'hard').length).toBeGreaterThanOrEqual(2)
    expect(needs.filter((n) => n.gate === 'partial').length).toBeGreaterThanOrEqual(2)
    for (const need of needs) {
      if (need.gate === null) continue
      expect(gateIsWellFormed(need.upTo === null ? { kind: need.gate } : { kind: need.gate, upTo: need.upTo })).toBe(true)
    }
  })

  it('writes a pipeline that genuinely branches and rejoins', () => {
    const blocks = blocksOf('OCR accuracy check on a 300-page sample')
    const byName = (name: string) => one(blocks.filter((b) => b.name === name), `the block "${name}"`)
    const ids = new Set(blocks.map((b) => b.id))
    for (const block of blocks) for (const need of block.needs) expect(ids.has(need.blockId)).toBe(true)

    // A BRANCH: several blocks waiting on the same predecessor, none waiting on another. Three
    // tracks hang off the drawn sample: the hand proofreading and the two OCR runs.
    const freeze = byName('Draw 300 pages at random, spread across the decades')
    const fromFreeze = blocks.filter((b) => b.needs.some((n) => n.blockId === freeze.id))
    expect(fromFreeze.map((b) => b.name).sort()).toEqual([
      'Proofread the sample by hand',
      'Run the sample through the new binarisation',
      'Run the sample through the old binarisation',
    ])

    // A REJOIN: one block waiting on all three tracks.
    const compare = byName('Score both runs against the proofread text')
    expect(compare.needs.map((n) => blocks.find((b) => b.id === n.blockId)?.name).sort()).toEqual([
      'Proofread the sample by hand',
      'Run the sample through the new binarisation',
      'Run the sample through the old binarisation',
    ])

    // And the branch is NOT written into the block names, which is what design/fixture.json had to
    // do because the model could not hold it.
    expect(blocks.some((b) => b.name.includes('BRANCH'))).toBe(false)
  })
})

describe('fulfilment', () => {
  it('discharges an obligation with done, fulfilledAt and fulfilledNote', () => {
    const discharged = t.api.listRecords({ workspaceId: 'default', kind: 'obligation' }).filter((r) => readFulfilment(r.data).done)
    expect(discharged.length).toBeGreaterThanOrEqual(1)

    for (const record of discharged) {
      const fulfilment = readFulfilment(record.data)
      // `data.done` is the mechanism that already existed and that nothing ever wrote. These two
      // are the addition: a boolean cannot say when a promise was kept, or what settled it.
      expect(record.data['done']).toBe(true)
      expect(fulfilment.at, `${record.title} says it is done but not when`).not.toBeNull()
      expect(fulfilment.note, `${record.title} says it is done but not what settled it`).not.toBeNull()
    }
  })

  it('takes the discharged obligation off the list, even though it is overdue', () => {
    const record = one(
      t.api.listRecords({ workspaceId: 'default', kind: 'obligation' }).filter((r) => readFulfilment(r.data).done),
      'discharged obligation',
    )
    // It is past its date. Without `done` it would be on the list and would stay there for ever,
    // which is what every obligation used to do.
    expect(localMs(dataStr(record.title, 'due'))).toBeLessThan(Date.now())

    const result = attention()
    expect([...result.visible, ...result.remainder].some((row) => row.recordId === record.id)).toBe(false)
    const bucket = result.passedOver.find((group) => group.bucket === 'discharged')
    expect(bucket?.keys).toContain(`rec:${record.id}`)
  })
})

describe('state words nobody has classified', () => {
  it('seeds not one of them, because the two gates between a write and that group both hold', () => {
    // THIS TEST WAS THE OPPOSITE ASSERTION UNTIL THIS PASS, and the assertion was correct then. A
    // purchase said `ordered`, no such word was in STATE_MEANING, and the seed proved the group
    // existed by filling it. Filling it is no longer possible and that is the fix, not a loss:
    // `createRecord` refuses a word its kind does not declare, and every word every kind declares
    // is now classified. A seeded record in this group would mean one of those two had broken.
    const result = attention()
    const words = [...new Set(result.unclassified.map((row) => row.state))]
    expect(result.unclassified, `seeded records carry unclassified words: ${words.join(', ')}`).toEqual([])

    // And the purchase that used to be the example is now readable: money that has left the
    // account is work in progress, which is a fact about the purchase rather than a question.
    expect(progressOf(record('Nitrile gloves and lint-free cloths for reel handling').data['state'])).toBe('in_flight')
  })

  it('keeps a classified word apart from no state at all, which is the other answer entirely', () => {
    // Two different answers, and a reader that collapses them turns a gap into a verdict. The
    // third answer — a word nobody has classified — cannot be seeded any more, and is covered
    // where it can still arise: tests/attention-rule.test.ts on a hand-built record, and
    // tests/import-conflicts.test.ts §7 on an archive written under an older vocabulary.
    expect(progressOf(record('Scan the rest of the 1931 crate').data['state'])).toBe('stopped_short')
    expect(progressOf(record('unclaimed log 4b1e77c2 in logs/agents/').data['state'])).toBeNull()

    const result = attention()
    expect(result.noState.length).toBeGreaterThan(0)
    // A session with no state was expected to have one, and the row says so.
    const session = record('unclaimed log 4b1e77c2 in logs/agents/')
    const row = result.noState.find((r) => r.recordId === session.id)
    expect(row?.expected).toBe(true)
  })
})

describe('sessions', () => {
  it('covers all six states and several with none at all', () => {
    const sessions = t.api.listRecords({ workspaceId: 'default', kind: 'session' })
    const states = sessions.map((r) => r.data['state']).filter((s) => s !== undefined)
    for (const state of ['running', 'idle', 'finished', 'crashed', 'orphaned', 'unknown']) {
      expect(states, `no session is "${state}"`).toContain(state)
    }

    // `unknown` means somebody looked and could not tell. NO STATE means nobody ever said
    // anything. Nine records make that difference visible.
    const stateless = sessions.filter((r) => r.data['state'] === undefined)
    expect(stateless.length).toBeGreaterThanOrEqual(5)
    for (const r of stateless) {
      expect(completenessOf('session', r.data).map((m) => m.path)).toEqual(['data.state'])
      // They were found by a sweep rather than filed by the run itself, and they say so.
      expect(String(r.data['source'] ?? '')).toContain('discover')
    }

    // Enough confirmed-finished runs that an interface has to fold them away rather than list them.
    expect(sessions.filter((r) => r.data['state'] === 'finished').length).toBeGreaterThanOrEqual(10)
  })
})

describe('the awkward records', () => {
  it('leaves work depending on records that were retracted', () => {
    const unmet = t.api.unmetDependencies('default')
    expect(unmet.length).toBeGreaterThanOrEqual(2)
    expect(unmet.map((u) => u.consumer.title)).toContain('Choose the confidence threshold for sending pages to proofreading')
    expect(unmet.map((u) => u.missingTitle)).toContain('Default OCR settings reach 90 % word accuracy on every decade')
  })

  it('breaks a link at the from end as well as at the to end', () => {
    // Most broken links point at something deleted. This one is written BY something deleted, and
    // a reader that only looks at the target end never notices it.
    const live = record('Twelve issues of 1923 are missing from reel R-1923-01')
    const broken = t.api.resolveLinks(live.id).filter((l) => l.broken)
    expect(broken.map((l) => l.other.title)).toContain('Reel R-1923-01 holds every issue of 1923')
  })

  it('keeps a contradicted claim that a pipeline still consumes', () => {
    const older = record('The new binarisation lifts 1880s pages to 88 % word accuracy')
    const links = t.api.resolveLinks(older.id)
    // Something says it is wrong...
    expect(links.some((l) => l.type === 'contradicts' && l.isBacklink)).toBe(true)
    // ...and something still depends on it. That pair is the state the product exists to surface.
    expect(links.some((l) => l.type === 'consumes' && l.isBacklink && l.other.title === 'Reel to searchable page')).toBe(true)
  })

  it('leaves a measured claim that nothing consumes', () => {
    // The other half of what `consumes` is for: which results is nobody using?
    expect(t.api.unconsumed('default').map((r) => r.title)).toContain('Volunteers proofread 41 pages an hour on average')
  })

  it('reports exactly the records that are incomplete on purpose', () => {
    // Completeness is never stored: it is recomputed from KIND_SPECS on every read, which is why a
    // schema change can never leave it lying. What is asserted here is that the seed's deliberate
    // gaps are still the only gaps.
    const unfinished = t.api
      .listRecords({ workspaceId: 'default', includeDeleted: true })
      .map((r) => ({ title: r.title, missing: completenessOf(r.kind, r.data).map((m) => m.path) }))
      .filter((r) => r.missing.length > 0)

    expect(unfinished.length).toBe(31)
    const byPath = new Map<string, number>()
    for (const r of unfinished) for (const path of r.missing) byPath.set(path, (byPath.get(path) ?? 0) + 1)
    expect(byPath.get('data.state')).toBe(9) // sessions found on disk
    expect(byPath.get('data.body')).toBe(10) // messages that are a subject line and nothing else
    expect(byPath.get('data.depth')).toBe(5) // directions filed as "we are looking into X"
    expect(byPath.get('data.context')).toBe(4) // modules filed before they were written up
    expect(byPath.get('data.parts')).toBe(2)
    expect(byPath.get('data.blockIds')).toBe(1)
    expect(byPath.get('data.due')).toBe(1)

    // The emptiest one, which is a different failure from an empty checklist: a module with no
    // `parts` key cannot be drawn at all, where `parts: []` is an answer.
    expect(record('Issue metadata schema').data['parts']).toBeUndefined()
    expect(record('广告分类器').data['parts']).toEqual([])
  })
})

describe('pipelines map onto modules N:M', () => {
  it('maps blocks onto modules many to many, not one to one', () => {
    const pipelines = t.api.listRecords({ workspaceId: 'default', kind: 'pipeline' }).filter((p) => blockIdsOf(p).length > 0)
    const blocksPerModule = new Map<string, number>()
    let widest = 0

    for (const pipeline of pipelines) {
      for (const block of blocksOf(pipeline.title)) {
        widest = Math.max(widest, block.moduleIds.length)
        for (const moduleId of block.moduleIds) {
          // AN ID, NOT A TITLE, and that is the whole change: a title copied onto a step could name
          // a module that had been renamed, and one accepted rename broke ten of them behind a 200.
          const module = t.api.getRecord(moduleId)
          expect(module?.kind).toBe('module')
          expect(module?.deletedAt).toBeNull()
          blocksPerModule.set(moduleId, (blocksPerModule.get(moduleId) ?? 0) + 1)
        }
      }
    }

    expect(widest).toBeGreaterThanOrEqual(2)
    expect(Math.max(...blocksPerModule.values())).toBeGreaterThanOrEqual(2)
    // And blocks that nobody owns yet, which is a real answer rather than a gap to be filled in.
    expect(pipelines.some((p) => blocksOf(p.title).some((b) => b.moduleIds.length === 0))).toBe(true)
  })

  it('has ONE representation of the block-to-module mapping, and it is the link', () => {
    // THIS TEST USED TO COMPARE TWO REPRESENTATIONS. A step stored its modules as TITLES and a
    // parallel `implements` link stored the same modules as IDS, and this loop was the only thing
    // anywhere that refused to let them disagree — not the write path, which accepted a module
    // rename that broke ten mappings behind a 200. There is nothing left to compare, so what it
    // checks now is that the second representation really is gone and the link is the one that
    // survived.
    for (const pipeline of t.api.listRecords({ workspaceId: 'default', kind: 'pipeline' })) {
      expect(pipeline.data['steps'], `"${pipeline.title}" still stores a nested step array`).toBeUndefined()
      // The placeholder pipeline has no blocks written at all, which is a stub and not a fault.
      for (const block of blockIdsOf(pipeline).length === 0 ? [] : blocksOf(pipeline.title)) {
        expect(block.record.data['modules'], `"${block.title}" stores module titles beside its links`).toBeUndefined()
        // The names on the card come from the module RECORDS at the far end of the links, so a
        // rename moves them rather than breaking them.
        expect(block.modules).toEqual(block.moduleIds.map((id) => t.api.getRecord(id)?.title))
      }
      // The pipeline-level `implements` links are gone too: "this module implements this pipeline"
      // could not say WHICH of its blocks, and the block-level links say it exactly.
      const atPipeline = t.api.resolveLinks(pipeline.id).filter((l) => l.type === 'implements')
      expect(atPipeline, `"${pipeline.title}" still carries a pipeline-level implements link`).toEqual([])
    }
  })
})

describe('obligations and the 48-hour window', () => {
  it('puts obligations on both sides of the window', () => {
    const now = Date.now()
    const left = (title: string) => localMs(dataStr(title, 'due')) - now

    // Overdue. A window that only ever saw future dates would never prove it sorts them.
    expect(left('Interim report to the County Heritage Fund')).toBeLessThan(0)

    // Inside 48 hours: tomorrow at 17:00 is between 17 and 41 hours away whenever this runs.
    const soon = left("Return the county records office's spare scanner")
    expect(soon).toBeGreaterThan(0)
    expect(soon).toBeLessThanOrEqual(48 * HOUR)

    // Weeks away. This is the one that proves the window FILTERS rather than passing everything.
    expect(left('Yearly fire-safety walk-round of the archive store')).toBeGreaterThan(48 * HOUR)

    // And one with no date at all, which is why it has never appeared on anything.
    expect(record('Thank-you evening for the volunteers').data['due']).toBeUndefined()
  })
})

describe('the fabricated history', () => {
  it('leaves a checklist item stale enough to trip the three-day rule', () => {
    const scanner = record('Microfilm scanner station')
    const parts = scanner.data['parts']
    if (!Array.isArray(parts)) throw new Error('the Microfilm scanner station has no parts array')
    const items = parts.flatMap((p: { items?: unknown }) => (Array.isArray(p.items) ? p.items : []))
    expect(items.find((i: { id?: unknown }) => i.id === 'sc-3')?.state).toBe('doing')

    const transition = one(
      t.api.listChanges({ workspaceId: 'default', recordId: scanner.id, limit: 5000 }).filter((c) => c.id === 'seed-hist-sc-3'),
      'transition row for sc-3',
    )
    expect(Date.now() - localMs(transition.at)).toBeGreaterThan(3 * DAY)
  })

  it('says when a record entered the state it is in now', () => {
    // `data.state` rows are what makes "how long has this been stuck" a measured answer rather
    // than the record's own updated stamp, which moves when anybody edits a title.
    const rows = t.api.listChanges({ workspaceId: 'default', limit: 20000 }).filter((c) => c.field === 'data.state')
    expect(rows.length).toBeGreaterThanOrEqual(3)
    for (const row of rows) {
      const current = t.api.getRecord(row.recordId)?.data['state']
      // A row whose newValue is not the word the record holds now would be silently ignored by the
      // reader, so it would be a fabrication that demonstrates nothing.
      expect(row.newValue).toBe(current)
    }
  })

  it('names a session record, never a raw run name, in the change log', () => {
    const unresolved = t.api
      .storedSessionRefs('default')
      .filter((ref) => t.api.resolveSessionRef(ref.stored, 'default').matchedBy !== 'recordId')
    expect(unresolved.map((r) => r.stored)).toEqual([])
    expect(t.api.storedSessionRefs('default').length).toBeGreaterThan(0)
  })
})

// ============================================================================== running twice

describe('running the seed twice', () => {
  it('changes nothing the second time', () => {
    const before = t.api.listRecords({ workspaceId: 'default', includeDeleted: true })
    const changesBefore = t.api.listChanges({ workspaceId: 'default', limit: 20000 }).length
    const summary = seed.seed()

    expect(summary.created).toBe(0)
    expect(summary.updated).toBe(0)
    expect(summary.restored).toBe(0)
    expect(summary.linksCreated).toBe(0)
    expect(summary.historyRows).toBe(0)
    expect(summary.retracted).toBe(0)

    const after = t.api.listRecords({ workspaceId: 'default', includeDeleted: true })
    expect(after.length).toBe(before.length)
    expect(after.map((r) => r.title).sort()).toEqual(before.map((r) => r.title).sort())
    expect(after.filter((r) => r.deletedAt !== null).length).toBe(3)
    // Not one new change row either: an idempotent run is genuinely a no-op, not a rewrite.
    expect(t.api.listChanges({ workspaceId: 'default', limit: 20000 })).toHaveLength(changesBefore)
  })

  it('reports what it wrote, by kind', () => {
    const summary = seed.seed()
    const live = t.api.listRecords({ workspaceId: 'default' })
    for (const [kind, count] of Object.entries(summary.byKind)) {
      expect(live.filter((r) => r.kind === kind).length, kind).toBe(count)
    }
  })
})

// ====================================================== the regression: nine records, silently

describe('a database that has been poked at', () => {
  it('restores seeded records that were deleted, and reports that it did', () => {
    // Delete exactly what a person clicking around in the app could delete. This is the state that
    // produced the nine-record report: the records are still there, just invisible.
    const removed = t.api.listRecords({ workspaceId: 'default' }).filter((r) => r.kind === 'session' || r.kind === 'obligation' || r.kind === 'pipeline')
    const liveBefore = t.api.listRecords({ workspaceId: 'default' }).length
    for (const r of removed) t.api.deleteRecord(r.id, { type: 'human', id: 'made-up-person' })
    expect(t.api.listRecords({ workspaceId: 'default' }).length).toBe(liveBefore - removed.length)
    expect(t.api.listRecords({ workspaceId: 'default', kind: 'session' }).length).toBe(0)

    const summary = seed.seed()

    // Repaired, and said so. Silence here is what made the original bug expensive: the script
    // reported "already current" about records the whole app could no longer see.
    expect(summary.restored).toBe(removed.length)
    expect(summary.created).toBe(0)
    expect(t.api.listRecords({ workspaceId: 'default' }).length).toBe(liveBefore)
    expect(t.api.listRecords({ workspaceId: 'default', kind: 'session' }).length).toBeGreaterThan(50)
  })

  it('does not revive the records that are retracted on purpose', () => {
    // The three that are meant to be gone say so with `retracted: true`. Without that flag the
    // repair above would heal the demo's deliberately broken links too.
    for (const title of [
      'Default OCR settings reach 90 % word accuracy on every decade',
      'Reel R-1923-01 holds every issue of 1923',
      'A second microfilm scanner station',
    ]) {
      expect(record(title).deletedAt, title).not.toBeNull()
    }
    expect(t.api.unmetDependencies('default').length).toBeGreaterThanOrEqual(2)
  })

  it('re-retracts a record if someone restores it', () => {
    const claim = record('Default OCR settings reach 90 % word accuracy on every decade')
    t.api.restoreRecord(claim.id, { type: 'human', id: 'made-up-person' })
    expect(record(claim.title).deletedAt).toBeNull()

    seed.seed()

    // Convergence has to work in both directions, or "run the seed to get the demo back" is only
    // true for half the ways a database can drift.
    expect(record(claim.title).deletedAt).not.toBeNull()
  })
})
