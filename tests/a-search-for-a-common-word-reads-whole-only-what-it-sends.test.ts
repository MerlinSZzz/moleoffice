// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SEARCH THE INDEX CANNOT NARROW MAKES WHOLE ONLY THE RECORDS IT SENDS, AND ANSWERS AS IT DID.
 *
 * The index of the records' text cannot narrow a search when more than AT_MOST_READ_BY_ID records hold the word, or when
 * the search has fewer than three letters the index may be asked about (src/server/lib/record-text-index.ts). The door
 * then read every record of the projects searched, and of each other project for `elsewhere`, and made each one a
 * record, to send a few of them.
 *
 * WHAT IS HELD HERE, each for searches the index cannot narrow:
 *   1. The answer is the one the door gave before, for the person and for an agent, with no kind and with one kind,
 *      with a limit that cuts the list and one that does not, and with `?projects=` naming another project or every
 *      project. The answer before is worked out here as the door worked it out then: every record listed whole, less
 *      the messages the reader may not read, through `theRecordsThatSay`.
 *   2. It matches values, never a field's name and never a number. It folds case as toLowerCase folds it: `soil` finds
 *      `SoilPen`, a word in a script written without spaces is found inside a longer one, a word stored as escapes is
 *      found, and a capital sigma at the end of a word that does not end there is found by a small sigma.
 *   3. The order: a match in the title before one in the summary before one in the body, and the newer record first
 *      among records that match in the same field.
 *   4. A message the reader may not read is neither found nor counted, and a run whose honour reading gives it as
 *      evidence is not found by its id.
 *   5. A decision a later one replaced is not a result, and the note counts it.
 *   6. `elsewhere` gives the same counts.
 *   7. The rows read whole are as many with 300 more records that say the word as without them, and for the person they
 *      are the records sent.
 *
 * 7 COUNTS THE STATEMENTS OF `theSearchAnswer`, run here, with the ask the door's own `theSearchAsk` builds. The door
 * answers a search on a thread of its own (src/server/lib/search-thread.ts), and a statement run on that thread is not
 * seen by a spy on this one. Every row is made up, and written straight into the table, so the index holds it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './the-test-offices-owner.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { saysIt, searchRecord, theNeedle, theRecordsThatSay, type SearchResult } from '../src/shared/search.ts'
import { incompletenessOf } from '../src/shared/incompleteness-of.ts'
import { resultsAtTheirLevels } from '../src/shared/results-at-a-level.ts'
import { leftOutWords, SEARCH_RESULTS_BUCKET_WORDS, type LeftOutCounts, type LeftOutGroup, type SearchResultsBucket } from '../src/shared/disclosure.ts'
import { EVERY_PROJECT } from '../src/shared/across-projects.ts'
import type { SearchAsk, SearchReply, SearchResultAtLevel } from '../src/server/api/search.ts'
import type { RecordListItem } from '../src/server/api/records.ts'

let t: TestDb

/** The other project, which `elsewhere` counts and `?projects=` names. */
const GARDEN = 'a-garden-shelf'
const GARDEN_TITLE = 'A made-up garden shelf'
/** The id of a message neither reader below is a party to, which only the person may read. */
const THE_NOTE_KEPT = 'made-up-note-kept-from-the-agent'
/** A string a run gives as evidence beside it, which is no record's id, so no reader has it taken out. */
const NO_RECORDS_ID = `${THE_NOTE_KEPT}-and-more`

const thePerson = (): { type: string; id: string } => ({ type: 'human', id: THE_PERSON })
/** An agent the office does not know, so it is a party to no message. */
const anAgent = (): { type: string; id: string } => ({ type: 'agent', id: 'made-up-reader' })
const READERS = [
  { is: 'the person', actor: thePerson },
  { is: 'an agent', actor: anAgent },
]

/** Every search below. Each is said by more records than the index reads by id, or is too short to ask the index. */
const THE_WORDS = ['shelf', 'soil', 'SOIL', '4417', '花园', 'σ', THE_NOTE_KEPT]

const A_ROW =
  'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin) ' +
  "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'fixture')"

/** One record written straight into the table. `data` as a string is stored as it is written. */
function aRow(id: string, at: string, title: string, summary: string | null, data: object | string, where: { kind?: string; workspaceId?: string } = {}): string {
  const stored = typeof data === 'string' ? data : JSON.stringify(data)
  t.client.sqlite.prepare(A_ROW).run(id, where.workspaceId ?? 'default', THE_TEST_OFFICES_OWNER.id, at, at, where.kind ?? 'note', title, summary, stored)
  return id
}

/**
 * This many copies of a record, written straight into the table, so the triggers write the index. A copy's id and title
 * are the record's with the copy's number after them, and it keeps the record's times.
 */
function copiesOf(id: string, count: number): void {
  const columns = (t.client.sqlite.prepare('PRAGMA table_info(records)').all() as { name: string }[]).map((one) => `"${one.name}"`)
  const made = columns.map((one) => (one === '"id"' || one === '"title"' ? `${one} || '-' || n.i` : one))
  t.client.sqlite.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
    INSERT INTO records (${columns.join(', ')}) SELECT ${made.join(', ')} FROM records, n WHERE "id" = ?`).run(count, id)
}

const at = (second: number): string => `2026-11-20 09:00:${String(second).padStart(2, '0')}`

beforeAll(async () => {
  t = await freshDb()
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  const { AT_MOST_READ_BY_ID } = await import('../src/server/lib/record-text-index.ts')
  createWorkspace({ id: GARDEN, title: GARDEN_TITLE })

  // "shelf" IN THE TITLE, THE SUMMARY AND THE BODY, more records in all than the index reads by id. The summary's and
  // the body's records are newer than the title's, so the field comes before the age.
  const perField = Math.ceil(AT_MOST_READ_BY_ID / 3)
  copiesOf(aRow('shelf-title', at(0), 'A shelf of boxes', null, { body: 'Three boxes.' }), perField)
  copiesOf(aRow('shelf-summary', at(1), 'A box', 'It sits on the shelf.', { body: 'One box.' }), perField)
  copiesOf(aRow('shelf-body', at(2), 'A box lid', null, { body: 'The shelf by the door\nholds a box.', count: 3 }), perField)
  // A decision a later one replaced, and the later one, both saying it in the title.
  aRow('the-shelf-stays', at(3), 'The shelf stays by the door', null, { option_taken: 'By the door', because: 'A made-up reason.', replaces: [] }, { kind: 'decision' })
  aRow('the-shelf-moves', at(4), 'The shelf moves to the hall', null, { option_taken: 'In the hall', because: 'A made-up reason.', replaces: ['the-shelf-stays'] }, { kind: 'decision' })
  t.client.sqlite
    .prepare('INSERT INTO links (owner_id, id, workspace_id, from_id, to_id, type, created_by, created_at, updated_at) ' + "VALUES (?, ?, 'default', ?, ?, 'supersedes', ?, ?, ?)")
    .run(THE_TEST_OFFICES_OWNER.id, 'made-up-link', 'the-shelf-moves', 'the-shelf-stays', 'made-up-writer', at(4), at(4))
  aRow('a-newer-shelf', at(5), 'A newer shelf', null, {})
  // THE WORD ONLY AS A FIELD'S NAME, and a number beside it.
  aRow('shelf-as-a-name', at(6), 'A plain box', null, { shelf: 'a box', soil: 'a tray', count: 7 })
  // A MESSAGE IN THIS PROJECT'S VIEW that says it, sent by the person to somebody else, so the agent may not read it.
  aRow(
    THE_NOTE_KEPT,
    at(7),
    'A made-up note about a box',
    null,
    { body: 'Put it on the shelf.', to: [{ kind: 'agent', id: 'made-up-nobody' }], sentBy: { kind: 'person', id: THE_PERSON }, writtenIn: { project: 'default' } },
    { kind: 'message', workspaceId: 'message-centre' },
  )
  for (const [i, one] of ['A garden gate', 'A watering can', 'A bench'].entries()) aRow(`nothing-here-${String(i)}`, at(8), one, null, { body: 'Nothing to find.' })

  // "soil", "4417", "花园" AND "σ", each said by more records than the index reads by id: one in the title, one in the
  // summary, inside a longer word written without spaces, and one in the body.
  copiesOf(aRow('a-box-of-soil', at(10), 'A box of soil', 'Marked 4417 by the 后花园的木架', { body: 'Σ on the lid, and σ under it.' }), AT_MOST_READ_BY_ID)
  aRow('a-soilpen-tray', at(11), 'A SoilPen tray', null, {})
  aRow('a-counted-box', at(12), 'A counted box', null, { count: 4417, sizes: [4417, 12] })
  // THE WORD STORED AS ESCAPES, as JSON may hold any letter.
  aRow('an-escaped-garden', at(13), 'A gate', null, String.raw`{"body":"后花园的木架"}`)
  // A CAPITAL SIGMA AFTER A TAB: in the stored text it follows the letter t of the escape, and folds as at the end of a
  // word; in the value it follows the tab, and folds to the small sigma.
  aRow('a-sigma-after-a-tab', at(14), 'A lid', null, { body: 'a\tΣ' })
  aRow('a-sigma-at-the-end', at(15), 'A lid', null, { body: 'ΑΣ' })

  // A RUN WHOSE HONOUR READING GIVES THE MESSAGE AS EVIDENCE, more of them than the index reads by id, and one that also
  // gives a string that is no record's id.
  copiesOf(aRow('a-run', at(16), 'A made-up run', null, { honour: { signals: [{ evidence: [THE_NOTE_KEPT] }] } }, { kind: 'session' }), AT_MOST_READ_BY_ID)
  aRow('a-run-with-more', at(17), 'A made-up run', null, { honour: { signals: [{ evidence: [THE_NOTE_KEPT, NO_RECORDS_ID] }] } }, { kind: 'session' })

  // THE OTHER PROJECT: fifty records that say "shelf", three that say "soil", one with the words only as field names, and
  // a run that gives the message as evidence.
  copiesOf(aRow('garden-shelf', at(20), 'A garden shelf', null, {}, { workspaceId: GARDEN }), 49)
  copiesOf(aRow('garden-soil', at(21), 'A soil bed', null, {}, { workspaceId: GARDEN }), 2)
  aRow('garden-names', at(22), 'A garden box', null, { shelf: 1, soil: 2 }, { workspaceId: GARDEN })
  aRow('garden-run', at(23), 'A made-up run', null, { honour: { signals: [{ evidence: [THE_NOTE_KEPT] }] } }, { kind: 'session', workspaceId: GARDEN })
}, 300_000)

afterAll(() => {
  t.close()
})

interface AnAsk {
  q: string
  kind?: string
  limit?: number
  projects?: string
}

/** The answer `theSearchAnswer` works out here, and the one the door worked out before, for the same ask. */
async function bothAnswers(ask: AnAsk, actor: () => { type: string; id: string }): Promise<{ now: SearchReply; before: SearchReply }> {
  const { theSearchAnswer, theSearchAsk } = await import('../src/server/api/search.ts')
  const { theRecordsThatMaySay } = await import('../src/server/lib/record-text-index.ts')
  expect(theRecordsThatMaySay(theNeedle(ask.q)), `the index narrows "${ask.q}", so this proves nothing about it`).toBeUndefined()
  const query: Record<string, string> = { q: ask.q }
  if (ask.kind !== undefined) query['kind'] = ask.kind
  if (ask.limit !== undefined) query['limit'] = String(ask.limit)
  if (ask.projects !== undefined) query['projects'] = ask.projects
  const asked = theSearchAsk('default', query, actor)
  return { now: theSearchAnswer(asked), before: await theAnswerAsBefore(asked) }
}

/**
 * THE ANSWER THE DOOR GAVE BEFORE, for a search the index cannot narrow and a query that is no record's id: every record
 * of the projects searched listed whole, less what the reader may not read, through `theRecordsThatSay`, and every
 * record of each other project listed whole for `elsewhere`. The note is worded as the door worded it.
 */
async function theAnswerAsBefore(ask: SearchAsk): Promise<SearchReply> {
  const { ACROSS_WORKSPACES, listRecords } = await import('../src/server/lib/records.ts')
  const { onlyTheMessagesThisReaderMayRead } = await import('../src/server/lib/messages.ts')
  const { theRowsTheReaderMaySee } = await import('../src/server/lib/across-projects.ts')
  const { recordsWithTheHonourThisReaderMaySee } = await import('../src/server/lib/honour.ts')
  const { replacedDecisionIds } = await import('../src/server/lib/replaced-decisions.ts')
  const { listWorkspaces } = await import('../src/server/db/list-workspaces.ts')
  const { SEARCH_RESULTS } = await import('../src/server/api/search.ts')
  const { workspaceId, q, reader, asked } = ask
  const searchedIds = new Set(asked === null ? [workspaceId] : asked.map((project) => project.id))
  const kindAsked = ask.kind === undefined ? {} : { kind: ask.kind }
  const which = { workspaceId: asked === null ? workspaceId : asked.length === 1 ? asked[0]!.id : ACROSS_WORKSPACES, ...kindAsked }
  const listed = listRecords(which)
  const mayBeSeen = asked === null ? onlyTheMessagesThisReaderMayRead(reader, listed) : theRowsTheReaderMaySee(listed, asked, reader)
  const searched = mayBeSeen.length
  const replaced = new Set([...searchedIds].flatMap((id) => [...replacedDecisionIds(id)]))
  const everyMatch = theRecordsThatSay(recordsWithTheHonourThisReaderMaySee(mayBeSeen, reader), q)
  const all = everyMatch.filter((match) => !replaced.has(match.record.id))
  const replacedMatched = everyMatch.length - all.length
  const limit = ask.limit ?? SEARCH_RESULTS
  const sent = all.slice(0, limit).map(({ record }): SearchResult<RecordListItem> => {
    const result = searchRecord<RecordListItem>({ ...record, incompleteCount: incompletenessOf(record).length }, q)
    if (result === null) throw new Error(`The record ${record.id} was found to say "${q}" and then found not to.`)
    return result
  })
  const atLevels = resultsAtTheirLevels(sent.map((result) => result.record), ask.level, ask.levels)
  const results = sent.map((result, i): SearchResultAtLevel => ({ ...result, record: atLevels.rows[i]! }))
  const leftOutGroups: LeftOutGroup<SearchResultsBucket>[] = [{
    cause: 'budget', bucket: 'row_limit', count: all.length - results.length,
    ids: all.slice(limit).map((match) => match.record.id),
  }]
  const subtraction: LeftOutCounts = { candidates: all.length, carried: results.length, leftOut: all.length - results.length, shortened: 0 }
  const elsewhere = listWorkspaces()
    .filter((w) => !searchedIds.has(w.id))
    .map((w) => {
      const rows = recordsWithTheHonourThisReaderMaySee(onlyTheMessagesThisReaderMayRead(reader, listRecords({ workspaceId: w.id, ...kindAsked })), reader)
      return { workspaceId: w.id, title: w.title, matched: rows.filter((record) => saysIt(record, q)).length }
    })
    .filter((w) => w.matched > 0)
    .sort((a, b) => b.matched - a.matched)

  const scope = ask.kind === undefined ? '' : ` of kind ${ask.kind}`
  const searchedWords =
    asked === null
      ? null
      : asked.length === 1
        ? `the project "${asked[0]!.id}"`
        : `the ${String(asked.length)} projects searched`
  const found =
    searched === 0
      ? (searchedWords === null ? 'This project holds' : `${searchedWords.charAt(0).toUpperCase()}${searchedWords.slice(1)} hold${asked!.length === 1 ? 's' : ''}`) +
        ` no records${scope} at all, so there was nothing to search. That is not the same ` +
        `as "${q}" not being here.`
      : all.length === 0
        ? (searchedWords === null ? `Nothing in this project's ${searched}` : `Nothing in the ${searched}`) +
          ` record${searched === 1 ? '' : 's'}${scope}${searchedWords === null ? '' : ` of ${searchedWords}`} says ` +
          `"${q}" — in a title, a summary, or any text inside a record. This reads what is stored, so a word ` +
          `that only appears in a file a record points at is not searched.`
        : `${all.length} of ${searched} record${searched === 1 ? '' : 's'}${scope} say "${q}"` +
          (all.length > results.length
            ? `; the first ${results.length} are here, best match first, and the count is the whole of it. ` +
              leftOutWords(SEARCH_RESULTS_BUCKET_WORDS.row_limit, all.length - results.length)
            : `, best match first — a match in the title before one in the summary before one in the body.`)
  const alsoLine =
    elsewhere.length === 0
      ? ''
      : ` ${elsewhere.map((w) => `${w.matched} in "${w.title}"`).join(', ')} — switch project to read ` +
        `${elsewhere.length === 1 && elsewhere[0]?.matched === 1 ? 'it' : 'them'}.`
  const replacedLine =
    replacedMatched === 0
      ? ''
      : ` ${String(replacedMatched)} decision${replacedMatched === 1 ? '' : 's'} that a later decision replaced also ` +
        `${replacedMatched === 1 ? 'says' : 'say'} it and ${replacedMatched === 1 ? 'is' : 'are'} not listed; ` +
        `each is on its own page, naming the one that replaced it.`

  return {
    subtraction,
    leftOutGroups,
    q,
    exact: null,
    workspace: asked === null ? workspaceId : asked.length === 1 ? asked[0]!.id : EVERY_PROJECT,
    ...(asked === null ? {} : { projects: asked.map((project) => project.id) }),
    elsewhere,
    results,
    levels: atLevels.levels,
    counts: { matched: all.length, returned: results.length, searched },
    truncated: all.length > results.length,
    note: found + replacedLine + alsoLine,
  }
}

/**
 * Every record a search found, the ones sent and then the ones left out, in its order. A left-out group that withholds
 * its ids fails here rather than reading as none, because this test compares the ids found.
 */
function theIdsFound(answer: SearchReply): string[] {
  return [
    ...answer.results.map((result) => result.record.id),
    ...answer.leftOutGroups.flatMap((group) => {
      if (group.ids === null) {
        throw new Error(`The left-out group "${group.cause}" in "${group.bucket}" withheld its ${String(group.count)} ids, so the ids this search found cannot be compared.`)
      }
      return group.ids
    }),
  ]
}

/** The ids the same as before for this ask and this reader, and the answer the door gives now. */
async function theSameAsBefore(ask: AnAsk, reader: (typeof READERS)[number]): Promise<SearchReply> {
  const { now, before } = await bothAnswers(ask, reader.actor)
  expect(now, `${JSON.stringify(ask)}, for ${reader.is}`).toEqual(before)
  return now
}

describe('1. a search the index cannot narrow', () => {
  it('gives the answer the door gave before, for every reader, kind, limit and project asked', async () => {
    const truncated = new Set<boolean>()
    let compared = 0
    for (const reader of READERS) {
      for (const kind of [undefined, 'note', 'decision']) {
        for (const limit of [5, 500]) {
          for (const projects of [undefined, GARDEN, EVERY_PROJECT]) {
            const now = await theSameAsBefore({ q: 'shelf', kind, limit, projects }, reader)
            truncated.add(now.truncated)
            if (now.counts.matched > 0) compared += 1
          }
        }
      }
    }
    // A LIMIT THAT CUTS THE LIST AND ONE THAT DOES NOT were both met, and most searches found something.
    expect([...truncated].sort(), 'whether the answers were cut').toEqual([false, true])
    expect(compared, 'the searches that found something').toBeGreaterThan(24)
  }, 240_000)

  it('gives the answer the door gave before for every other word, with no limit, and across every project', async () => {
    for (const reader of READERS) {
      for (const q of THE_WORDS.filter((one) => one !== 'shelf')) {
        for (const ask of [{ q }, { q, limit: 500 }, { q, projects: EVERY_PROJECT }, { q, kind: 'session' }]) await theSameAsBefore(ask, reader)
      }
    }
  }, 240_000)
})

describe('2. values only, folded as toLowerCase folds them', () => {
  it('finds no record by a field name or a number, and finds the records a folded value holds', async () => {
    const [person] = READERS
    const shelf = theIdsFound(await theSameAsBefore({ q: 'shelf', limit: 500 }, person!))
    expect(shelf, 'the record that holds "shelf" only as a field name').not.toContain('shelf-as-a-name')
    expect(shelf).toContain('shelf-body')
    const number = theIdsFound(await theSameAsBefore({ q: '4417', limit: 500 }, person!))
    expect(number, 'the record that holds 4417 only as a number').not.toContain('a-counted-box')
    expect(number).toContain('a-box-of-soil')
    for (const q of ['soil', 'SOIL']) {
      const soil = theIdsFound(await theSameAsBefore({ q, limit: 500 }, person!))
      expect(soil, `"${q}" finds SoilPen`).toContain('a-soilpen-tray')
      expect(soil, `"${q}" finds no field's name`).not.toContain('shelf-as-a-name')
    }
    const garden = theIdsFound(await theSameAsBefore({ q: '花园', limit: 500 }, person!))
    expect(garden, 'a word inside a longer one written without spaces').toContain('a-box-of-soil')
    expect(garden, 'a word stored as escapes').toContain('an-escaped-garden')
    const sigma = theIdsFound(await theSameAsBefore({ q: 'σ', limit: 500 }, person!))
    expect(sigma, 'a capital sigma after a tab').toContain('a-sigma-after-a-tab')
    expect(sigma, 'a capital sigma at the end of a word').not.toContain('a-sigma-at-the-end')
  }, 120_000)
})

describe('3. the order', () => {
  it('is the title before the summary before the body, and the newer record first in the same field', async () => {
    for (const reader of READERS) {
      const found = theIdsFound(await theSameAsBefore({ q: 'shelf', limit: 500 }, reader))
      expect(found.slice(0, 2), `the newer titles first, for ${reader.is}`).toEqual(['a-newer-shelf', 'the-shelf-moves'])
      const fields = found.slice(2).map((id) => (id === THE_NOTE_KEPT ? 'the message' : id.replace(/-\d+$/, '')))
      const inTurn = fields.filter((one, i) => i === 0 || one !== fields[i - 1])
      expect(inTurn, `the fields in turn, for ${reader.is}`).toEqual(
        reader.is === 'the person' ? ['shelf-title', 'shelf-summary', 'the message', 'shelf-body'] : ['shelf-title', 'shelf-summary', 'shelf-body'],
      )
    }
  }, 120_000)
})

describe('4. what the reader may not read', () => {
  it('a message the agent may not read is neither found nor counted', async () => {
    const [person, agent] = READERS
    const forThePerson = await theSameAsBefore({ q: 'shelf', limit: 500 }, person!)
    const forTheAgent = await theSameAsBefore({ q: 'shelf', limit: 500 }, agent!)
    expect(theIdsFound(forThePerson)).toContain(THE_NOTE_KEPT)
    expect(theIdsFound(forTheAgent)).not.toContain(THE_NOTE_KEPT)
    expect(forThePerson.counts.matched - forTheAgent.counts.matched, 'the matches the agent was not given').toBe(1)
    // THE AGENT IS A PARTY TO NO MESSAGE, so of every kind it searched the records the person searched less the messages.
    const messagesForThePerson = await theSameAsBefore({ q: 'shelf', kind: 'message' }, person!)
    const messagesForTheAgent = await theSameAsBefore({ q: 'shelf', kind: 'message' }, agent!)
    expect(theIdsFound(messagesForThePerson)).toEqual([THE_NOTE_KEPT])
    expect(messagesForTheAgent.counts, 'the messages the agent searched and found').toEqual({ matched: 0, returned: 0, searched: 0 })
    expect(forThePerson.counts.searched - forTheAgent.counts.searched, 'the records the agent did not search').toBe(messagesForThePerson.counts.searched)
  }, 120_000)

  it('a run whose honour reading gives that message is not found by its id, and a string beside it still is', async () => {
    const [person, agent] = READERS
    const forThePerson = await theSameAsBefore({ q: THE_NOTE_KEPT, limit: 500 }, person!)
    const forTheAgent = await theSameAsBefore({ q: THE_NOTE_KEPT, limit: 500 }, agent!)
    expect(forThePerson.counts.matched, 'every run that gives it, for the person').toBeGreaterThan(2000)
    expect(theIdsFound(forTheAgent), 'the one run that gives a string beside it, for the agent').toEqual(['a-run-with-more'])
    expect(forThePerson.elsewhere.find((one) => one.workspaceId === GARDEN)?.matched, 'the run in the other project, for the person').toBe(1)
    expect(forTheAgent.elsewhere.find((one) => one.workspaceId === GARDEN), 'the run in the other project, for the agent').toBeUndefined()
  }, 120_000)
})

describe('5. a replaced decision', () => {
  it('is not a result, and the note counts it', async () => {
    for (const reader of READERS) {
      for (const kind of [undefined, 'decision']) {
        const answer = await theSameAsBefore({ q: 'shelf', kind, limit: 500 }, reader)
        expect(theIdsFound(answer), `${String(kind)}, for ${reader.is}`).not.toContain('the-shelf-stays')
        expect(theIdsFound(answer), `${String(kind)}, for ${reader.is}`).toContain('the-shelf-moves')
        expect(answer.note).toContain('1 decision that a later decision replaced also says it')
      }
    }
  }, 120_000)
})

describe('6. elsewhere', () => {
  it('gives the same counts', async () => {
    for (const reader of READERS) {
      const shelf = await theSameAsBefore({ q: 'shelf' }, reader)
      expect(shelf.elsewhere.find((one) => one.workspaceId === GARDEN), `for ${reader.is}`).toEqual({ workspaceId: GARDEN, title: GARDEN_TITLE, matched: 50 })
      const soil = await theSameAsBefore({ q: 'soil', kind: 'note' }, reader)
      expect(soil.elsewhere.find((one) => one.workspaceId === GARDEN), `for ${reader.is}`).toEqual({ workspaceId: GARDEN, title: GARDEN_TITLE, matched: 3 })
    }
  }, 120_000)
})

/** Every statement run while `run` runs, with the rows it handed back; an iterator's rows are counted as they are read. */
function theStatementsOf(run: () => void): { sql: string; rows: number }[] {
  type Run = (this: { source: string }, ...params: unknown[]) => unknown
  // THE STATEMENTS' OWN PROTOTYPE, so a statement prepared before this runs and kept is counted too.
  const prototype = Object.getPrototypeOf(t.client.sqlite.prepare('SELECT 1')) as Record<string, Run>
  const ran: { sql: string; rows: number }[] = []
  const originals = new Map<string, Run>()
  for (const method of ['all', 'get', 'run', 'iterate']) {
    const call = prototype[method]!
    originals.set(method, call)
    prototype[method] = function (...params: unknown[]) {
      const got = call.apply(this, params)
      const one = { sql: this.source, rows: method === 'all' ? (got as unknown[]).length : method === 'get' ? Number(got !== undefined) : 0 }
      ran.push(one)
      if (method !== 'iterate') return got
      return (function* () {
        for (const row of got as Iterable<unknown>) {
          one.rows += 1
          yield row
        }
      })()
    }
  }
  try {
    run()
  } finally {
    for (const [method, call] of originals) prototype[method] = call
  }
  return ran
}

describe('7. the rows read whole', () => {
  // THE LAST CASE OF THE FILE, because it adds records that say the word.
  it('are as many with 300 more records that say it, and for the person they are the records sent', async () => {
    const { theSearchAnswer, theSearchAsk } = await import('../src/server/api/search.ts')
    const theRowsReadWhole = (actor: () => { type: string; id: string }): number => {
      const asked = theSearchAsk('default', { q: 'shelf', limit: '5' }, actor)
      let sent = -1
      const ran = theStatementsOf(() => {
        sent = theSearchAnswer(asked).results.length
      })
      expect(sent, 'the results sent').toBe(5)
      // A ROW READ WHOLE is a row of a statement that reads the records' every column, the owner's among them.
      return ran.filter((one) => one.sql.includes('from "records"') && one.sql.includes('"owner_id"')).reduce((sum, one) => sum + one.rows, 0)
    }
    const before = READERS.map((reader) => theRowsReadWhole(reader.actor))
    expect(before[0], 'the rows read whole for the person').toBe(5)
    copiesOf(aRow('one-more-shelf', at(30), 'One more shelf', null, {}), 299)
    expect(READERS.map((reader) => theRowsReadWhole(reader.actor)), 'the rows read whole with 300 more records that say it').toEqual(before)
  }, 120_000)
})
