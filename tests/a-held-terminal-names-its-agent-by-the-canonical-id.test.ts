// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A TERMINAL OPENED BEFORE A RE-MINT NAMES ITS AGENT BY THE CANONICAL ID AFTER IT, AND THE HOLDER IS NOT TOUCHED (item 30c
 * part 3, the holder reread; wave 13s, round 162).
 *
 * The terminal holder keeps each terminal's opener and agent as the server gave them when it opened, and it never
 * restarts, so a terminal opened before a re-mint names its agent by the old id. The server reads every terminal the
 * holder answers through one function, asTheOfficeReadsIt in src/server/lib/terminals.ts: each party of kind agent is the
 * canonical registry id its stored id names, through the filed aliases and never by a handle. A real holder runs for a
 * database of this test's own, and the office's own code runs in this process against it, as the typed-line test does
 * (tests/a-line-is-typed-for-somebody-else.test.ts). Each terminal is opened straight through the holder, with the ids a
 * server gave before the re-mint.
 *
 * The registry and the alias are tests/registry-alias-fixture.ts's: the old id is now the handle of another, live agent,
 * so a reading by handle would name the wrong agent. Every name, folder and value is made up.
 *
 *   1. Before any alias is filed, the office reads the list, the keeping, the resize and the watch answers exactly as the
 *      holder gives them.
 *   2. After the alias is filed, the list names the agent and the opener by the canonical id, and never the agent whose
 *      handle the old id is. Every other field is as the holder gives it.
 *   3. A person is not read, even one whose id is spelled like the old id, and an agent id that no row and no alias owns
 *      is kept as the holder holds it.
 *   4. The keeping, the resize and the watch answers name the canonical id too.
 *   5. The holder still holds the old id, and it is the same process as before the alias was filed.
 *   6. The agent's own terminals, as its profile reads them from the list, are found by its canonical id.
 *   7. A line kept after the alias is filed is written into a note that names the canonical id as the agent typed to, and
 *      the canonical agent's handle in its title.
 *   8. An alias the office cannot read refuses the list and the watch, rather than answer the old id. The test drops one
 *      trigger of its own database to file it.
 *
 * BEFORE THE CODE, on 31 October 2026, with src/server/lib/terminals.ts as it was: cases 2, 4, 6, 7 and 8 go red, and
 * cases 1, 3 and 5 stay green. In case 7 the keeping refuses the line, as the old id is the alias of one agent and the
 * handle of another.
 *
 * MUTATIONS, each alone after a control run, on 31 October 2026, each put back before the next (src/server/lib/terminals.ts):
 *   1. askTheHolderFor does not read the list's terminals: cases 2, 6, 7 and 8 go red.
 *   2. askTheHolderFor does not read an answer's one terminal: case 4 goes red, the keeping and the resize answers.
 *   3. watchATerminal does not read its first answer: cases 4 and 8 go red.
 *   4. every party is read, a person too: case 3 goes red.
 *   5. the opener is not read: cases 2 and 4 go red.
 *   6. the agent is not read: cases 2, 4, 6 and 7 go red.
 *   7. a party is read by the handle, as an arriving reference is: cases 1, 2, 3, 4, 6 and 7 go red. Before the alias,
 *      the old id is read as the agent whose handle it is; after it, the reading refuses the old id.
 *   8. an id that no alias owns is answered as no party: cases 1 and 3 go red.
 *   9. watchATerminal does not catch a reading that refuses: case 8 goes red, the watch never answering.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { theTerminalHolderLog, theTerminalHolderSocket } from '../src/config/the-terminal-holder.mjs'
import { THE_PERSON } from '../src/shared/person.ts'
import { KEPT_FROM_TERMINAL, TYPED_TO_AGENT, theAgentsTerminals, type TerminalParty, type TerminalReading } from '../src/shared/terminals.ts'
import { freshDb, type TestDb } from './helpers.ts'
import { fileSyntheticAlias, inventedRegistry, syntheticAlias } from './registry-alias-fixture.ts'
import { aPlace, groups, holder, startAHolder, stopEverything, until, untilTheScreenShows, type Place } from './terminal-holder-stand.ts'

let db: TestDb | undefined
let place: Place
let office: typeof import('../src/server/lib/terminals.ts')
let keeping: typeof import('../src/server/lib/terminal-keeping.ts')
let panes: typeof import('../src/server/lib/agent-pane.ts')
let aliases: typeof import('../src/server/lib/registry-aliases/index.ts')
let xdgBefore: string | undefined
let pidBefore: unknown

const OLD = syntheticAlias.aliasId
const CANONICAL = syntheticAlias.canonicalId
/** An agent id that no row and no alias owns. */
const NOBODY = 'an-id-that-names-nobody'

const agent = (id: string): TerminalParty => ({ kind: 'agent', id })
const person = (id: string): TerminalParty => ({ kind: 'person', id })

/** The terminals, each opened straight through the holder as a server opened it before the re-mint. */
let byTheAgent: TerminalReading
let byThePerson: TerminalReading
let spelledLikeTheOldId: TerminalReading
let byNobody: TerminalReading

async function openedBeforeTheRemint(who: TerminalParty, working: TerminalParty | null, keepingOn = false): Promise<TerminalReading> {
  const answer = await holder(place, {
    op: 'open',
    who,
    agent: working,
    project: 'default',
    command: '/bin/bash',
    args: ['--noprofile', '--norc'],
    folder: place.dir,
    env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: place.home, TERM: 'xterm-256color', HISTFILE: '/dev/null' },
    cols: 80,
    rows: 24,
    keeping: keepingOn,
  })
  const terminal = answer['terminal'] as TerminalReading
  groups.add(terminal.pid)
  return terminal
}

/** The holder's own list, read past the office. */
const theHoldersList = async (): Promise<TerminalReading[]> => (await holder(place, { op: 'list' }))['terminals'] as TerminalReading[]
/** The office's list, read through askTheHolderFor. */
const theOfficesList = async (): Promise<TerminalReading[]> => (await office.askTheHolderFor({ op: 'list' }))['terminals'] as TerminalReading[]
const one = (all: TerminalReading[], id: string): TerminalReading => {
  const found = all.find((each) => each.id === id)
  if (found === undefined) throw new Error(`terminal ${id} is not in the list`)
  return found
}
/** What the office's watch of a terminal answers first, the watch then stopped. */
async function theWatchedReading(id: string): Promise<TerminalReading> {
  const watched = await office.watchATerminal(id, () => {}, () => {})
  watched.stop()
  return watched.terminal
}

beforeAll(async () => {
  db = await freshDb()
  const database = process.env['MOLE_OFFICE_DB']
  if (database === undefined) throw new Error('freshDb named no database.')
  const made = aPlace('rr')
  place = { ...made, database, socket: theTerminalHolderSocket(database, made.env), log: theTerminalHolderLog(database, made.env) }
  xdgBefore = process.env['XDG_CONFIG_HOME']
  process.env['XDG_CONFIG_HOME'] = place.env.XDG_CONFIG_HOME
  await startAHolder(place)
  office = await import('../src/server/lib/terminals.ts')
  keeping = await import('../src/server/lib/terminal-keeping.ts')
  panes = await import('../src/server/lib/agent-pane.ts')
  aliases = await import('../src/server/lib/registry-aliases/index.ts')
  inventedRegistry(db)
  byTheAgent = await openedBeforeTheRemint(agent(OLD), agent(OLD))
  byThePerson = await openedBeforeTheRemint(person(THE_PERSON), agent(OLD))
  spelledLikeTheOldId = await openedBeforeTheRemint(person(OLD), null)
  byNobody = await openedBeforeTheRemint(agent(NOBODY), agent(NOBODY))
  pidBefore = (await holder(place, { op: 'hello' }))['pid']
}, 60_000)

afterAll(async () => {
  db?.close()
  await stopEverything()
  if (xdgBefore === undefined) delete process.env['XDG_CONFIG_HOME']
  else process.env['XDG_CONFIG_HOME'] = xdgBefore
}, 60_000)

describe('before any alias is filed', () => {
  it('1: the office reads the list, the keeping, the resize and the watch answers exactly as the holder gives them', async () => {
    expect(await theOfficesList()).toEqual(await theHoldersList())
    const kept = await office.askTheHolderFor({ op: 'keeping', terminal: byTheAgent.id, on: false })
    expect(kept['terminal']).toEqual(one(await theHoldersList(), byTheAgent.id))
    const resized = await office.askTheHolderFor({ op: 'resize', terminal: byTheAgent.id, cols: 81, rows: 25 })
    expect(resized['terminal']).toEqual(one(await theHoldersList(), byTheAgent.id))
    expect(await theWatchedReading(byTheAgent.id)).toEqual(one(await theHoldersList(), byTheAgent.id))
  })
})

describe('after the alias is filed', () => {
  beforeAll(async () => {
    await fileSyntheticAlias(db!)
    // THE OLD ID IS ANOTHER LIVE AGENT'S HANDLE, as the fixture made it, so a reading by handle names that agent.
    const other = db!.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(OLD) as { id: string } | undefined
    expect(other?.id).toBeDefined()
    expect(other?.id).not.toBe(CANONICAL)
  })

  it('2: the list names the agent and the opener by the canonical id, and every other field as the holder gives it', async () => {
    const read = await theOfficesList()
    const held = await theHoldersList()
    expect(one(read, byTheAgent.id)).toEqual({ ...one(held, byTheAgent.id), who: agent(CANONICAL), agent: agent(CANONICAL) })
    expect(one(read, byThePerson.id)).toEqual({ ...one(held, byThePerson.id), who: person(THE_PERSON), agent: agent(CANONICAL) })
  })

  it('3: a person is not read, and an agent id that no row and no alias owns is kept as the holder holds it', async () => {
    const read = await theOfficesList()
    const held = await theHoldersList()
    expect(one(read, spelledLikeTheOldId.id)).toEqual(one(held, spelledLikeTheOldId.id))
    expect(one(read, spelledLikeTheOldId.id).who).toEqual(person(OLD))
    expect(one(read, byNobody.id)).toEqual(one(held, byNobody.id))
    expect(one(read, byNobody.id).agent).toEqual(agent(NOBODY))
  })

  it('4: the keeping, the resize and the watch answers name the canonical id too', async () => {
    const kept = (await office.askTheHolderFor({ op: 'keeping', terminal: byTheAgent.id, on: false }))['terminal'] as TerminalReading
    const resized = (await office.askTheHolderFor({ op: 'resize', terminal: byTheAgent.id, cols: 82, rows: 26 }))['terminal'] as TerminalReading
    const watched = await theWatchedReading(byTheAgent.id)
    for (const reading of [kept, resized, watched]) {
      expect(reading.id).toBe(byTheAgent.id)
      expect([reading.who, reading.agent]).toEqual([agent(CANONICAL), agent(CANONICAL)])
    }
  })

  it('5: the holder still holds the old id, and it is the same process as before the alias was filed', async () => {
    const held = one(await theHoldersList(), byTheAgent.id)
    expect([held.who, held.agent]).toEqual([agent(OLD), agent(OLD)])
    expect((await holder(place, { op: 'hello' }))['pid']).toBe(pidBefore)
  })

  it("6: the agent's own terminals, as its profile reads them from the list, are found by its canonical id", async () => {
    const found = theAgentsTerminals(panes.asListed(await theOfficesList()), CANONICAL)
    expect(found.own.map((each) => each.id).sort()).toEqual([byTheAgent.id, byThePerson.id].sort())
  })

  it("7: a line kept after the alias is filed names the canonical id as the agent typed to, and the canonical agent's handle in its title", async () => {
    const kept = await openedBeforeTheRemint(person(THE_PERSON), agent(OLD), true)
    await holder(place, { op: 'write', terminal: kept.id, data: 'echo kept-after-the-alias\r' })
    await untilTheScreenShows(place, kept.id, 'kept-after-the-alias')
    const theNote = (): { title: string; data: string } | undefined =>
      db!.client.sqlite
        .prepare(`SELECT title, data FROM records WHERE kind = 'note' AND json_extract(data, '$.${KEPT_FROM_TERMINAL}') = ?`)
        .get(kept.id) as { title: string; data: string } | undefined
    const note = await until(
      async () => {
        await keeping.takeTheLines(kept.id, { type: 'human', id: THE_PERSON })
        return theNote()
      },
      (row) => row !== undefined,
      10_000,
    )
    expect(note, 'no note was written').toBeDefined()
    expect((JSON.parse(note!.data) as Record<string, unknown>)[TYPED_TO_AGENT]).toBe(CANONICAL)
    const handle = (db!.client.sqlite.prepare('SELECT handle FROM agents WHERE id = ?').get(CANONICAL) as { handle: string }).handle
    expect(note!.title).toContain(handle)
    expect(note!.title).not.toContain(OLD)
  })
})

describe('an alias the office cannot read', () => {
  beforeAll(() => {
    // MADE UNREADABLE ON PURPOSE, in this test's own database: a registry row under the old id, which the alias owns. The
    // trigger that refuses such a row is dropped first, so the reader's own refusal is what is proved.
    const sqlite = db!.client.sqlite
    sqlite.exec('DROP TRIGGER registry_aliases_reserve_insert')
    sqlite
      .prepare('INSERT INTO agents (id, name, handle, avatar_asset_id, created_at, retired) VALUES (?, ?, ?, ?, ?, ?)')
      .run(OLD, 'A row under the old id', 'a-row-under-the-old-id', 'synthetic-asset-a', '2026-01-03 00:00:00', 1)
  })

  it('8: refuses the list and the watch, rather than answer the old id', async () => {
    await expect(theOfficesList()).rejects.toBeInstanceOf(aliases.RegistryAliasError)
    await expect(theWatchedReading(byTheAgent.id)).rejects.toBeInstanceOf(aliases.RegistryAliasError)
  })
})
