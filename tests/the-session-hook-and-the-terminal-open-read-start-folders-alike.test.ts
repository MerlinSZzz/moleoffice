// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SESSION HOOK AND THE OPEN OF AN OFFICE TERMINAL READ THE SAME AGENT RECORDS FOR A START FOLDER. Wave 13s, round 205b.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 * Two places ask which agent records name a start folder:
 *
 *   · agentsStartingIn (src/server/lib/participants.ts), the session hook's reading, which names live agents only;
 *   · anotherAgentWhoseRecordNames (src/server/lib/terminal-agents.ts), which the open of an agent's own folder asks
 *     before it records the folder, and which counts a retired agent's record too.
 *
 * Both read through theAgentRecordsNamingTheStartFolder (src/server/lib/terminals/agent-records-naming-a-start-folder.ts).
 * The one case asks both over the same records, folder by folder, and expects one table of whom each names. Where both
 * name an agent it is the same agent. They differ only where each says why: a retired agent and a record no registry
 * row maps are named by the open and not by the hook, and the open does not name the asking agent itself.
 *
 * The open's answer is the words of a refusal, so the case reads only which agent or record those words name, and
 * copies no sentence the code defines.
 *
 * ---------------------------------------------------------------------------------------
 * RED BEFORE THE CODE, AND THE MUTATION, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Before the code, anotherAgentWhoseRecordNames was not exported, so the case is red with "is not a function".
 *
 * Control: the case green on the unmutated tree. The mutation:
 *
 *   · the open asks the shared reading with retired agents left out instead of counted → the retired row's open names
 *     nobody instead of the retired agent, and the case is red.
 *
 * The file was restored byte-identical after the mutation.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

/** A folder that is neither the root nor a home, so an agent may register it. Nothing is made on disk. */
const FOLDER = '/tmp/mole-office-start-folders-read-alike'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** File an agent record, with a start folder on it or none, and hand back the record id. */
async function anAgentStartingIn(handle: string, folder: string | null): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: AS_THE_OWNER,
    payload: {
      kind: 'agent',
      title: handle,
      data: { handle, state: 'active', runtime: 'claude-code', ...(folder === null ? {} : { startFolder: folder }) },
    },
  })
  expect(res.statusCode, res.body.slice(0, 400)).toBe(201)
  return (res.json() as { record: { id: string } }).record.id
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('the hook and the open read one start-folder reading', () => {
  it('names the same agent from both for every folder, and differs only for a retired agent, an unreadable record and the asker', async () => {
    const { agentForRecord, agentsStartingIn } = await import('../src/server/lib/participants.ts')
    const { anotherAgentWhoseRecordNames } = await import('../src/server/lib/terminal-agents.ts')
    const theAgentOf = (record: string): string => {
      const agent = agentForRecord(record)
      expect(agent, `the agent record ${record} maps to no agent`).not.toBe(null)
      return agent!.id
    }

    const live = theAgentOf(await anAgentStartingIn('sfa-live', `${FOLDER}/live`))
    const asker = theAgentOf(await anAgentStartingIn('sfa-asker', null))

    const retiredRecord = await anAgentStartingIn('sfa-retired', `${FOLDER}/retired`)
    const retired = theAgentOf(retiredRecord)
    const gone = await app.inject({
      method: 'PATCH',
      url: `/api/records/${retiredRecord}`,
      headers: AS_THE_OWNER,
      payload: { dataPatch: { state: 'retired', retiredBecause: 'It finished the work it was started for.' } },
    })
    expect(gone.statusCode, gone.body.slice(0, 300)).toBe(200)

    // A RECORD NO REGISTRY ROW MAPS, AND A DELETED RECORD, are planted in the database: no door makes either.
    const unmapped = await anAgentStartingIn('sfa-unmapped', `${FOLDER}/unmapped`)
    t.client.sqlite.prepare('DELETE FROM agent_records WHERE record_id = ?').run(unmapped)
    const deleted = await anAgentStartingIn('sfa-deleted', `${FOLDER}/deleted`)
    t.client.sqlite.prepare("UPDATE records SET deleted_at = datetime('now') WHERE id = ?").run(deleted)

    const asked: [string, string, string][] = [
      ['live', `${FOLDER}/live`, asker],
      ['live, with a trailing slash', `${FOLDER}/live/`, asker],
      ['live, asked by its own agent', `${FOLDER}/live`, live],
      ['retired', `${FOLDER}/retired`, asker],
      ['no registry row', `${FOLDER}/unmapped`, asker],
      ['deleted', `${FOLDER}/deleted`, asker],
      ['a subfolder of live', `${FOLDER}/live/src`, asker],
      ['nobody', `${FOLDER}/nobody`, asker],
    ]
    // WHOM THE OPEN'S ANSWER NAMES, of the agents and records this case made: null when it names nobody, and the whole
    // answer when it names none of them, so a stranger shows in the table instead of passing as nobody.
    const made = [live, asker, retired, unmapped, deleted]
    const whomItNames = (answer: string | null): string | null =>
      answer === null ? null : (made.find((id) => answer.includes(id)) ?? answer)
    const answered = Object.fromEntries(
      asked.map(([row, folder, by]) => [
        row,
        { hook: agentsStartingIn(folder).map((one) => one.id), open: whomItNames(anotherAgentWhoseRecordNames(folder, by)) },
      ]),
    )

    // MUTATION: the open asks with retired agents left out, and the retired row's open names nobody.
    expect(answered).toEqual({
      live: { hook: [live], open: live },
      'live, with a trailing slash': { hook: [live], open: live },
      'live, asked by its own agent': { hook: [live], open: null },
      retired: { hook: [], open: retired },
      'no registry row': { hook: [], open: unmapped },
      deleted: { hook: [], open: null },
      'a subfolder of live': { hook: [], open: null },
      nobody: { hook: [], open: null },
    })
  })
})
