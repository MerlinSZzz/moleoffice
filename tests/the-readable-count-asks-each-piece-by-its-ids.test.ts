// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE READABLE COUNT ASKS EACH PIECE OF A READER'S MESSAGES BY ITS IDS. Wave 14c round 9.
 *
 * `theLiveMessagesOfAProjectAReaderIsAPartyTo` reads the reader's narrowing in pieces and keeps the messages of each
 * piece that are filed in the project or in its view. Asked through `filedInOrInTheViewOf`, SQLite built the list of
 * rowids of every record of the project and every message in its view once for each piece, through the project's
 * index. Each piece needs only its own rows, found by id.
 *
 * In a fresh office, one made-up agent is a party to a message filed in the project, one in the message centre that
 * comes into the project's view, one in the centre that does not, one filed in another project and one filed in the
 * project and deleted. Another is filed in the project and the agent is no party to it. A message filed in a project
 * is how an older office stored it, and no door writes one now, so it is written through the create door and then
 * moved. The answer is the first two, and the same set as `theMessagesThisReaderMayRead` keeps of the project's live
 * messages. The plan of each statement that reads a piece searches the records by id, reads no record through the
 * project's index and scans no record. This holds the plan and the answer, not the time.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const HERE = 'default'
const ELSEWHERE = 'made-up-elsewhere'
const AS_THE_OWNER = { type: 'human', id: THE_PERSON } as never
const TO_THE_PERSON: ParticipantRef = { kind: 'person', id: THE_PERSON }
const THE_AGENT = 'made-up-counted-agent'
const ANOTHER_AGENT = 'made-up-other-agent'

let t: TestDb

beforeEach(async () => {
  vi.stubEnv('MOLE_OFFICE_MESSAGE_WORKER', 'off')
  t = await freshDb()
})

afterEach(() => {
  t?.close()
  vi.unstubAllEnvs()
})

/** Register one agent through the create door, and give back the participant it answers to. */
async function anAgent(handle: string): Promise<ParticipantRef> {
  const { participantForActor } = await import('../src/server/lib/participants.ts')
  t.api.createRecord({ kind: 'agent', title: handle, workspaceId: HERE, data: { handle, runtime: 'claude-code', state: 'active' }, actor: AS_THE_OWNER })
  const who = participantForActor({ type: 'agent', id: handle })
  if (who === null) throw new Error(`the agent ${handle} was registered and no registry row answers to it`)
  return who
}

/** Write one message to the person as the agent with this handle, written in this project, and give back its id. */
function say(handle: string, body: string, project: string): string {
  return t.api.createRecord({ kind: 'message', title: body, workspaceId: project, data: { body, to: [TO_THE_PERSON] }, actor: { type: 'agent', id: handle } }).id
}

/** File a message the create door stored in the message centre in this project instead, as an older office stored it. */
function fileIn(project: string, id: string): string {
  t.client.sqlite.prepare('update records set workspace_id = ? where id = ?').run(project, id)
  return id
}

/** Capture the statements that read a piece of ids, and ask SQLite for each plan with the values they bound. */
function thePieceReadsDuring<T>(work: () => T): { answer: T; reads: { sql: string; values: unknown[]; plan: string[] }[] } {
  const ran: { sql: string; values: unknown[] }[] = []
  const prepare = t.client.sqlite.prepare.bind(t.client.sqlite)
  const spy = vi.spyOn(t.client.sqlite, 'prepare').mockImplementation(((source: string) => {
    const statement = prepare(source)
    if (!source.startsWith('select "id" from "records"') || !source.includes('"records"."id" in (')) return statement
    const all = statement.all.bind(statement) as (...values: unknown[]) => unknown
    ;(statement as unknown as Record<string, unknown>).all = (...values: unknown[]) => {
      ran.push({ sql: source, values })
      return all(...values)
    }
    return statement
  }) as never)
  const answer = ((): T => {
    try {
      return work()
    } finally {
      spy.mockRestore()
    }
  })()
  const reads = ran.map((one) => ({
    ...one,
    plan: (prepare(`EXPLAIN QUERY PLAN ${one.sql}`).all(...one.values) as { detail: string }[]).map((step) => step.detail),
  }))
  return { answer, reads }
}

it('the readable count asks each piece by its ids and keeps the messages of the project and its view', async () => {
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  const { aProjectCounted } = await import('../src/server/lib/records.ts')
  const { theLiveMessagesOfAProjectAReaderIsAPartyTo, theMessageReader, theMessagesThisReaderMayRead } = await import('../src/server/lib/messages.ts')
  createWorkspace({ id: ELSEWHERE, title: 'Another made-up project' })
  const agent = await anAgent(THE_AGENT)
  await anAgent(ANOTHER_AGENT)

  const filedInTheProject = fileIn(HERE, say(THE_AGENT, 'Filed in the project.', HERE))
  const inTheView = say(THE_AGENT, 'In the message centre and in the view of the project.', HERE)
  const notInTheView = say(THE_AGENT, 'In the message centre and in the view of another project.', ELSEWHERE)
  const filedElsewhere = fileIn(ELSEWHERE, say(THE_AGENT, 'Filed in another project.', ELSEWHERE))
  const deleted = say(THE_AGENT, 'Filed in the project and deleted.', HERE)
  t.api.deleteRecord(deleted, { type: 'agent', id: THE_AGENT })
  fileIn(HERE, deleted)
  const notItsOwn = fileIn(HERE, say(ANOTHER_AGENT, 'Filed in the project, and the counted agent is no party to it.', HERE))

  const reader = theMessageReader({ type: 'agent', id: THE_AGENT })
  expect(reader.readsEveryMessage, 'the agent reads every message').toBe(false)
  const projectsMessages = aProjectCounted(HERE).messageIds
  expect(new Set(projectsMessages), "the project's live messages").toEqual(new Set([filedInTheProject, inTheView, notItsOwn]))
  expect([notInTheView, filedElsewhere, deleted].filter((id) => projectsMessages.includes(id)), 'messages outside the project counted').toEqual([])

  const { answer, reads } = thePieceReadsDuring(() => theLiveMessagesOfAProjectAReaderIsAPartyTo(agent, HERE))
  expect(answer, "the agent's live messages of the project").toEqual(new Set([filedInTheProject, inTheView]))
  expect(answer, 'the messages the agent may read of the project').toEqual(theMessagesThisReaderMayRead(reader, projectsMessages))

  expect(reads.length, 'statements that read a piece of ids').toBeGreaterThan(0)
  for (const read of reads) {
    const said = `${read.plan.join('\n')}\nSQL: ${read.sql}\nvalues: ${JSON.stringify(read.values)}`
    for (const step of read.plan) {
      expect(step, said).not.toMatch(/records_live_idx/)
      expect(step, said).not.toMatch(/^SCAN (TABLE )?records( |$)/)
    }
    expect(read.plan.filter((step) => /^SEARCH records USING (COVERING )?INDEX sqlite_autoindex_records_1 \(id=\?\)/.test(step)), said).toHaveLength(1)
  }
})
