// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A START FOLDER NAMES ONE LIVE AGENT, OR IT NAMES NOBODY. This is part (c) of a decision.
 *
 * ---------------------------------------------------------------------------------------
 * THE DANGER THIS READ IS BUILT AGAINST
 * ---------------------------------------------------------------------------------------
 *
 * A folder is shared. Measured on 24 September 2026: one folder held ten session records
 * of eight conversations and only one of them was the secretary's. So the read below answers the FACTS — every
 * live agent registered as starting in exactly that folder, and for each the live session it is
 * already answering in — and never a choice. `GET /api/onboarding?directory=` carries it, which is the
 * read the session hook already makes.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 *   · one agent registered at a folder is the one entry for it;
 *   · two agents at one folder are BOTH listed, and the read picks neither;
 *   · a retired agent is not live and is not listed;
 *   · a subfolder of a registered folder matches nothing: the match is the exact folder;
 *   · a folder no agent could be registered in — a home folder — is an empty list with the reason;
 *   · a read with no directory answers `agents: null`, because nothing was looked up, which is a
 *     different answer from nobody being there.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: every case green on the unmutated tree. Each mutation is one line of `agentsStartingIn` in
 * src/server/lib/participants.ts, of the shared reading it asks in
 * src/server/lib/terminals/agent-records-naming-a-start-folder.ts, or of the rule that reading reads in
 * src/config/start-folder.mjs.
 *
 *   · match by containment instead of equality in `theSameStartFolder` → the subfolder case is red.
 *   · answer only the first entry found → the two-agents case is red.
 *   · drop the `agent.retired === true` skip in `theAgentRecordsNamingTheStartFolder` → the retired case is red.
 *
 * The file was restored byte-identical after each mutation (sha256 before and after).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { homedir } from 'node:os'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance

/** A folder that is neither the root nor a home, so an agent may register it. */
const FOLDER = '/tmp/mole-office-one-live-agent'

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** What the onboarding read says about the folder it was asked about. */
interface StartFolderReading {
  directory: string | null
  agents: { handle: string; answeringIn: string | null }[] | null
  note: string
}

/** File an agent record with a start folder on it, and hand back the record id. */
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

/** The start-folder half of the onboarding read, for one directory or for none. */
async function theReading(directory: string | null): Promise<StartFolderReading> {
  const url = directory === null ? '/api/onboarding' : `/api/onboarding?directory=${encodeURIComponent(directory)}`
  const res = await app.inject({ method: 'GET', url })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  return (res.json() as { startFolder: StartFolderReading }).startFolder
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

describe('the read answers every live agent registered as starting in exactly this folder', () => {
  it('answers one entry for the one agent registered there, and says nobody is answering as it', async () => {
    await anAgentStartingIn('sfr-alone', `${FOLDER}/alone`)
    const said = await theReading(`${FOLDER}/alone`)
    expect(said.directory).toBe(`${FOLDER}/alone`)
    expect(said.agents?.map((one) => one.handle)).toEqual(['sfr-alone'])
    // NOBODY HOLDS ITS HANDLE IN THIS DATABASE, so the record of a live session it answers in is null.
    // The hook's own rule reads that field; the answering case is measured in the hook's test file.
    expect(said.agents?.[0]?.answeringIn).toBe(null)
    expect(said.note).toContain('1 live agent registered this exact folder')
  })

  it('lists both agents when two registered one folder, and picks neither', async () => {
    await anAgentStartingIn('sfr-two-a', `${FOLDER}/shared`)
    await anAgentStartingIn('sfr-two-b', `${FOLDER}/shared`)
    const said = await theReading(`${FOLDER}/shared`)
    // BOTH, IN A STABLE ORDER. MUTATION: answer only the first entry found and this is one handle.
    expect(said.agents?.map((one) => one.handle)).toEqual(['sfr-two-a', 'sfr-two-b'])
    expect(said.note).toContain('2 live agents registered this exact folder')
    // AND THE READ CHOOSES NEITHER. It carries no field naming one, because choosing is the hook's act
    // and the hook is what knows whether the session it is filing for is the one already answering.
    expect(said).not.toHaveProperty('names')
    expect(said).not.toHaveProperty('chosen')
  })

  it('leaves out a retired agent, because a retired agent is not live', async () => {
    const record = await anAgentStartingIn('sfr-retired', `${FOLDER}/retired`)
    expect((await theReading(`${FOLDER}/retired`)).agents?.map((one) => one.handle)).toEqual(['sfr-retired'])
    const gone = await app.inject({
      method: 'PATCH',
      url: `/api/records/${record}`,
      headers: AS_THE_OWNER,
      payload: { dataPatch: { state: 'retired', retiredBecause: 'It finished the work it was started for.' } },
    })
    expect(gone.statusCode, gone.body.slice(0, 300)).toBe(200)
    // MUTATION: drop the retired filter and this is one handle instead of none.
    const said = await theReading(`${FOLDER}/retired`)
    expect(said.agents).toEqual([])
    expect(said.note).toBe('No live agent is registered as starting in this folder.')
  })

  it('matches the exact folder and never a subfolder of it', async () => {
    await anAgentStartingIn('sfr-exact', `${FOLDER}/exact`)
    expect((await theReading(`${FOLDER}/exact`)).agents?.map((one) => one.handle)).toEqual(['sfr-exact'])
    // MUTATION: match by containment and this is one handle instead of none. The folder below a
    // registered one is the ordinary case — a session started in a subdirectory of somebody's project —
    // and naming the agent there is how one agent's name reaches other people's sessions.
    expect((await theReading(`${FOLDER}/exact/src/deep`)).agents).toEqual([])
    // AND NEVER THE FOLDER ABOVE IT EITHER.
    expect((await theReading(FOLDER)).agents).toEqual([])
  })

  it('answers an empty list and the reason for a folder no agent could be registered in', async () => {
    const said = await theReading(homedir())
    expect(said.agents).toEqual([])
    expect(said.note).toContain('No agent can be registered as starting in this folder.')
    expect(said.note).toContain('home folder')
  })

  it('answers no list at all when no directory was named, which is not the same as nobody', async () => {
    const said = await theReading(null)
    expect(said.directory).toBe(null)
    // NULL AND NOT AN EMPTY LIST. An agent told "nobody is registered here" when no folder was asked
    // about would read an absence of looking as a fact about a folder.
    expect(said.agents).toBe(null)
    expect(said.note).toContain('No directory was named')
  })
})
