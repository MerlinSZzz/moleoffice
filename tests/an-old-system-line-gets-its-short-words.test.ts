// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A LINE MOLE OFFICE WROTE BEFORE THE SHORT ONES EXISTED GETS ITS SHORT WORDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED 5 SEPTEMBER 2026
 * ---------------------------------------------------------------------------------------
 *
 * Criterion M34 shortened what Mole Office WRITES, not what it DRAWS. A line written since carries
 * a few words in `body` and the whole sentence in `saidInFull`, and the conversation draws the body
 * with the sentence as its hover text. A line written before the change stored the long sentence as
 * its body and has no `saidInFull`, so the block draws three sentences and the hover is empty.
 *
 * The system messages were too long. The ones still long are the ones that were being read at the time.
 * Two of the six system lines in the owner's project. Problem `TGpaH7XhhPLJ`.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * 1. A row holding the long sentence and nothing behind it comes out holding the short words, with
 *    the sentence it stored kept exactly as it stands, in `saidInFull`.
 * 2. It is a merge and not a wholesale write, so the other fields on the row survive. The door
 *    refuses a wholesale one; this is what says the script does not ask for it.
 * 3. A shape whose short words hold a name that is not in its sentence is left alone and reported.
 *    Recovering those words would mean inventing a name.
 * 4. A line already carrying its sentence is not touched, and a second run writes nothing.
 */

import { execFileSync } from 'node:child_process'
import Database from 'better-sqlite3'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { liveApp, theOfficesOwnIdIn, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { SYSTEM_LINES, SYSTEM_LINE_TITLE } from '../src/shared/groups.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The shape whose sentence the two rows in the owner's corpus hold. */
const ENDED = SYSTEM_LINES.aRunWaitedAndEnded(10)
/** A shape whose short words carry a name the sentence does not, so it cannot be placed. */
const JOINED = SYSTEM_LINES.memberAdded(THE_TEST_OFFICES_SECRETARY.name, 'It opened the group.')

/** Who these lines are addressed to, kept so the merge can be measured against it. */
let theAgent: { kind: string; id: string }[] = []
let longOne = ''
let alreadyShort = ''
let cannotBePlaced = ''

async function file(title: string, data: unknown): Promise<string> {
  const made = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'message', title, data }),
  })
  // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed (decision 60sbc5I-bwKx).
  expect(made.status, await made.clone().text()).toBe(409)
  return ((await made.json()) as { record: { id: string } }).record.id
}

async function read(id: string): Promise<Record<string, unknown>> {
  const got = await fetch(`${app.api}/api/records/${id}`, { headers: AS_THE_OWNER })
  expect(got.status, await got.clone().text()).toBe(200)
  return ((await got.json()) as { record: { data: Record<string, unknown> } }).record.data
}

const TSX = join(process.cwd(), 'node_modules', '.bin', 'tsx')
const run = (dbFile: string, args: string[]): string =>
  execFileSync(TSX, ['scripts/shorten-the-system-lines-written-before-m34.ts', ...args], {
    encoding: 'utf8',
    env: { ...process.env, MOLE_OFFICE_DB: dbFile },
  })

beforeAll(async () => {
  app = await liveApp({ name: 'old-system-lines', viewport: { width: 1440, height: 900 } })

  // A LINE MOLE OFFICE WRITES IS ADDRESSED TO SOMEBODY ELSE, never to whoever wrote it, so these
  // rows are addressed to an agent. A row addressed to the writer is refused by the door.
  const agent = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({
      kind: 'agent',
      title: 'The listening agent',
      data: { handle: 'listening-agent', runtime: 'claude-code', state: 'active' },
    }),
  })
  expect(agent.status, await agent.clone().text()).toBe(201)
  const registry = await fetch(`${app.api}/api/participants/agent/listening-agent`, { headers: AS_THE_OWNER })
  const toTheAgent = [
    { kind: 'agent', id: ((await registry.json()) as { participant: { id: string } }).participant.id },
  ]
  theAgent = toTheAgent

  // THE STATE THE OLD WRITER LEFT BEHIND: the long sentence as the body, nothing behind it, and the
  // other fields a system line carries beside it so the merge can be measured.
  longOne = await file(SYSTEM_LINE_TITLE, {
    body: ENDED.said ?? '',
    to: toTheAgent,
    aboutRun: 'a-run-that-ended',
  })
  cannotBePlaced = await file(SYSTEM_LINE_TITLE, { body: JOINED.said ?? '', to: toTheAgent })
  alreadyShort = await file(SYSTEM_LINE_TITLE, {
    body: ENDED.line,
    saidInFull: ENDED.said ?? '',
    to: toTheAgent,
  })
  // AND SENT BY MOLE OFFICE, as every line the office wrote is: the old rows carry `sentBy` Mole Office. No request may
  // name Mole Office as its sender, so this fixture writes it into the test's own database. It matters since a
  // decision: nobody may change a notice from Mole Office through a request. The
  // script changes these as the office's own lines (`THE_OFFICES_OWN_LINE`), which it may do only to a line the office
  // sent. The sender is the id the office's own row holds in this database, which a fresh office draws new each time.
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const sentBy = JSON.stringify({ kind: 'agent', id: theOfficesOwnIdIn(db) })
    const setSender = db.prepare("UPDATE records SET data = json_set(data, '$.sentBy', json(?)) WHERE id = ?")
    for (const id of [longOne, cannotBePlaced, alreadyShort]) setSender.run(sentBy, id)
  } finally {
    db.close()
  }
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('before anything is run', () => {
  it('draws a full sentence with nothing behind it, which is the symptom', async () => {
    const held = await read(longOne)
    expect(held['body'], 'the row under test does not hold the long sentence').toBe(ENDED.said)
    expect(held['saidInFull'], 'the row under test already has a sentence behind it').toBeUndefined()
  })
})

describe('the script', () => {
  it('says what it would do without writing anything', async () => {
    const said = run(join(app.dir, 'panelx.db'), [])
    expect(said, 'the dry run does not name the row it would shorten').toContain(longOne)
    expect(said, 'the dry run does not say what the row would become').toContain(ENDED.line)
    expect(said, 'the dry run wrote something').toContain('Nothing was written')
    expect((await read(longOne))['body'], 'the dry run changed a row').toBe(ENDED.said)
  }, 120_000)

  it('puts the short words on the row and keeps the sentence behind them', async () => {
    const did = run(join(app.dir, 'panelx.db'), ['--do-it'])
    expect(did, 'the run does not say how many it shortened').toContain('1 line(s) shortened')
    const held = await read(longOne)
    expect(held['body'], 'the row does not draw the short words').toBe(ENDED.line)
    expect(held['saidInFull'], 'the sentence the row held was not kept').toBe(ENDED.said)
  }, 120_000)

  it('leaves the row’s other fields exactly as they were, because it merges', async () => {
    const held = await read(longOne)
    expect(held['aboutRun'], 'a field the script never mentioned was emptied').toBe('a-run-that-ended')
    expect(held['to'], 'who the line was to was emptied').toEqual(theAgent)
  })

  it('leaves alone a sentence no shape can be placed from, rather than inventing a name', async () => {
    const held = await read(cannotBePlaced)
    expect(held['body'], 'a name was invented for a line that does not carry one').toBe(JOINED.said)
    expect(held['saidInFull'], 'a line that could not be placed was written to anyway').toBeUndefined()
  })

  it('leaves a line that already carries its sentence alone', async () => {
    const held = await read(alreadyShort)
    expect(held['body']).toBe(ENDED.line)
    expect(held['saidInFull']).toBe(ENDED.said)
  })

  it('writes nothing on a second run over the rows it can place', async () => {
    const twice = run(join(app.dir, 'panelx.db'), ['--do-it'])
    expect(twice, 'a second run shortened something again').toContain('0 line(s) shortened')
  }, 120_000)
})
