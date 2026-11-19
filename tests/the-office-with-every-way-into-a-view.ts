// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SMALL THROWAWAY OFFICE WITH ONE MADE-UP MESSAGE FOR EACH WAY INTO A PROJECT'S VIEW AND EACH WAY OUT OF IT, AND A
 * SECRETARY. Made-up rows only.
 *
 * Round 65 of wave 13y. The office is the small office of the slowest reads (tests/the-office-of-the-slowest-reads.ts)
 * with more of the person's messages, a second project, and the made-up messages below. Two tests read it: where-you-stand
 * and the attention rule's read. Each compares an answer with one taken before a change, so the office is made in the
 * same way each time.
 */
import { THE_PERSON } from '../src/shared/person.ts'
import type { TestDb } from './helpers.ts'
import type { Shape, TheChatOffice } from './the-chat-office-of-the-live-shape.ts'
import { buildTheOfficeOfTheSlowestReads, type TheExtras } from './the-office-of-the-slowest-reads.ts'

// MORE THAN FIFTY MESSAGES FROM THE PERSON, so the brief's list of their words is long enough to be narrowed for an agent
// as the open loops' list is. With twenty, it was asked once at the old code too.
const SMALL: Shape = {
  agents: 40,
  retired: 10,
  theConversation: 20,
  otherContacts: 5,
  otherPersonMessages: 150,
  betweenAgents: 40,
  groups: 4,
  groupsWithThePerson: 2,
  membersPerGroup: 4,
  groupMessages: 60,
  officeLines: 10,
  sessions: 60,
  otherRecords: 50,
}
const SMALL_EXTRAS: TheExtras = { openRuns: 20, runsWithARecentRequest: 3, oldApiCalls: 10, comments: 5, liveResources: 10, releasedResources: 20 }

/** The second project, where some of the made-up messages are written. */
export const ELSEWHERE = 'made-up-elsewhere'

type Sqlite = TestDb['client']['sqlite']

/** Adds the second project and one made-up message for each way into the view of `default` and each way out. */
function addTheWaysIntoTheView(sqlite: Sqlite): void {
  sqlite
    .prepare('INSERT INTO workspaces (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(ELSEWHERE, 'Made-up elsewhere', '2026-09-01 09:00:00', '2026-09-01 09:00:00')
  const aRecordOfDefault = (sqlite.prepare(`select id from records where workspace_id = 'default' and kind <> 'session' order by id limit 1`).get() as { id: string }).id
  const aMessage = (sqlite.prepare(`select id from records where kind = 'message' order by id limit 1`).get() as { id: string }).id
  const add = sqlite.prepare(
    `insert into records (id, workspace_id, owner_id, created_at, updated_at, kind, title, summary, data, deleted_at, origin)
     values (?, ?, 'owner', ?, ?, 'message', ?, null, ?, ?, 'fixture')`,
  )
  const sentBy = { kind: 'person', id: THE_PERSON }
  const to = [{ kind: 'agent', id: 'made-up-nobody' }]
  const onARecord = (recordId: string, workspaceId?: string) => ({ target: { kind: 'record', recordId, ...(workspaceId === undefined ? {} : { workspaceId }) }, place: { at: 'surface' } })
  const ways: [string, Record<string, unknown>, string, string | null][] = [
    ['about default, written elsewhere', { aboutProject: 'default', writtenIn: { project: ELSEWHERE } }, 'message-centre', null],
    ['on a record of default, written elsewhere', { target: onARecord(aRecordOfDefault), writtenIn: { project: ELSEWHERE } }, 'message-centre', null],
    ['naming default, written elsewhere', { target: { target: { kind: 'project', workspaceId: 'default' }, place: { at: 'surface' } }, writtenIn: { project: ELSEWHERE } }, 'message-centre', null],
    ['on a message, written in default', { target: onARecord(aMessage, 'message-centre'), writtenIn: { project: 'default' } }, 'message-centre', null],
    ['on a message, written elsewhere', { target: onARecord(aMessage, 'message-centre'), writtenIn: { project: ELSEWHERE } }, 'message-centre', null],
    ['naming nothing, written elsewhere', { target: { place: { at: 'surface' } }, writtenIn: { project: ELSEWHERE } }, 'message-centre', null],
    ['naming nothing, written in default', { target: { place: { at: 'surface' } }, writtenIn: { project: 'default' } }, 'message-centre', null],
    ['a null target, written elsewhere', { target: null, writtenIn: { project: ELSEWHERE } }, 'message-centre', null],
    ['written in default, withdrawn', { writtenIn: { project: 'default' } }, 'message-centre', '2026-10-01 10:00:00'],
    ['filed in default itself', { writtenIn: { project: 'default' } }, 'default', null],
    ['with no sender, written in default', { writtenIn: { project: 'default' }, sentBy: null }, 'message-centre', null],
  ]
  sqlite.transaction(() => {
    ways.forEach(([what, data, workspace, deletedAt], i) => {
      const at = `2026-10-01 09:${String(10 + i).padStart(2, '0')}:00`
      add.run(`made-up-way-${String(i).padStart(2, '0')}`, workspace, at, at, `A made-up message ${what}`, JSON.stringify({ body: `A made-up message ${what}.`, to, sentBy, ...data }), deletedAt)
    })
  })()
}

/**
 * Builds the office in the database `sqlite` holds, with the clock already pinned to `THE_MEASURED_NOW`, and makes a
 * made-up agent the secretary by giving it the card that reads every message, read from the declaration.
 */
export async function buildTheOfficeWithEveryWayIntoAView(sqlite: Sqlite): Promise<{ office: TheChatOffice; secretary: { id: string; handle: string } }> {
  const office = buildTheOfficeOfTheSlowestReads(sqlite, THE_PERSON, SMALL, SMALL_EXTRAS)
  addTheWaysIntoTheView(sqlite)
  const { theRoleCards } = await import('../src/server/lib/roles.ts')
  const secretary = (sqlite.prepare(`select id, handle from agents where retired = 0 and id not in ('mole-office', ?) order by id limit 1`).get(office.theAgent) as { id: string; handle: string })
  sqlite.prepare('update agents set role = ? where id = ?').run(theRoleCards().elevation.onlyThisCardCanHoldIt, secretary.id)
  const { theSecretaries } = await import('../src/server/lib/secretariat.ts')
  if (!theSecretaries().some((one) => one.id === secretary.id)) throw new Error(`The made-up agent ${secretary.id} was given the secretary's card and is not a secretary.`)
  return { office, secretary }
}
