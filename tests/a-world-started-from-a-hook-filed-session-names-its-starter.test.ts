// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WORLD STARTED FROM A SESSION THE HOOK FILED NAMES ITS STARTER. Problem nr56S4CEQCjl, half two.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS TRUE BEFORE
 * ---------------------------------------------------------------------------------------
 *
 * `whoHoldsTheOwnersAuthorityIn` (tools/isolated-mole-office.mjs) read the starter from the run's `data.servingAgent`
 * and from nothing else. A session the hook filed names its agent in `data.ranAs` — `[{ workspaceId, agentId }]`, the
 * agent's record id in that project — and carries no `servingAgent`. So a world a secretary started from her own
 * session had no starter, and only the secretaries held the owner's authority in it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 *   · a run with `ranAs` for the world's project and no `servingAgent` names the handle on that agent record;
 *   · `servingAgent` is still read first where a run carries it;
 *   · a `ranAs` entry for another project only names nobody, and says why;
 *   · a `ranAs` that points at a record which is not an agent's names nobody, and says why.
 *
 * It calls the function against a stand-in office, as tests/a-throwaway-world-never-asks-the-live-office.test.ts does.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THIS IS WRITTEN AGAINST, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * In `whoHoldsTheOwnersAuthorityIn`, put back the old `else` line, which only says the run does not say which agent
 * it works as, in place of the call to `theAgentTheRunRanAs` → "names the agent a hook-filed run ran as" goes red, and
 * so do the two cases that name nobody, because the old line gives neither of their reasons.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { whoHoldsTheOwnersAuthorityIn } from '../tools/isolated-mole-office.mjs'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

interface StandInOffice {
  api: string
  close: () => Promise<void>
  requests: string[]
}

/** Every record the stand-in office holds, by id, as `GET /api/records/:id` answers it. */
const RECORDS: Record<string, unknown> = {
  'a-hook-filed-run': { id: 'a-hook-filed-run', kind: 'session', data: { ranAs: [{ workspaceId: 'default', agentId: 'argusRecord1' }] } },
  'a-run-that-says-both': {
    id: 'a-run-that-says-both',
    kind: 'session',
    data: { servingAgent: 'builder-pb', ranAs: [{ workspaceId: 'default', agentId: 'argusRecord1' }] },
  },
  'a-run-of-another-project': { id: 'a-run-of-another-project', kind: 'session', data: { ranAs: [{ workspaceId: 'elsewhere', agentId: 'argusRecord1' }] } },
  'a-run-bound-to-a-note': { id: 'a-run-bound-to-a-note', kind: 'session', data: { ranAs: [{ workspaceId: 'default', agentId: 'aNote1' }] } },
  argusRecord1: { id: 'argusRecord1', kind: 'agent', data: { handle: THE_TEST_OFFICES_SECRETARY.handle } },
  aNote1: { id: 'aNote1', kind: 'note', data: { body: 'not an agent' } },
}

function standInOffice(): Promise<StandInOffice> {
  return new Promise((ok, bad) => {
    const requests: string[] = []
    const server: Server = createServer((req, res) => {
      req.resume()
      requests.push(`${req.method ?? 'GET'} ${req.url ?? ''}`)
      const say = (status: number, body: unknown): void => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(body))
      }
      const id = (req.url ?? '').startsWith('/api/records/') ? decodeURIComponent((req.url ?? '').slice('/api/records/'.length)) : null
      if (id !== null && RECORDS[id] !== undefined) return say(200, { record: RECORDS[id] })
      if (req.url === '/api/participants') return say(200, { agents: [{ handle: THE_TEST_OFFICES_SECRETARY.handle, role: 'secretary', retired: false }] })
      say(404, { error: 'the stand-in office was not told about ' + String(req.url) })
    })
    server.on('error', bad)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        bad(new Error('the stand-in office got no port'))
        return
      }
      ok({
        api: `http://127.0.0.1:${String(address.port)}`,
        close: () => new Promise((done) => server.close(() => done())),
        requests,
      })
    })
  })
}

describe('whoHoldsTheOwnersAuthorityIn, for a world shown to the person', () => {
  let office: StandInOffice

  afterEach(async () => {
    await office?.close()
  })

  it('names the agent a hook-filed run ran as, by the handle on its record', async () => {
    office = await standInOffice()
    const said = await whoHoldsTheOwnersAuthorityIn(true, 'a-hook-filed-run', office.api, 'default')
    expect(said.startedBy, said.problems.join('; ')).toBe(THE_TEST_OFFICES_SECRETARY.handle)
    expect(said.problems).toEqual([])
  })

  it('still reads servingAgent first where a run carries it', async () => {
    office = await standInOffice()
    const said = await whoHoldsTheOwnersAuthorityIn(true, 'a-run-that-says-both', office.api, 'default')
    expect(said.startedBy).toBe('builder-pb')
    expect(office.requests.some((r) => r.includes('argusRecord1')), office.requests.join('; ')).toBe(false)
  })

  it('names nobody from a ranAs entry for another project, and says why', async () => {
    office = await standInOffice()
    const said = await whoHoldsTheOwnersAuthorityIn(true, 'a-run-of-another-project', office.api, 'default')
    expect(said.startedBy).toBeNull()
    expect(said.problems.join(' ')).toContain('no ranAs entry for the project "default"')
  })

  it('names nobody when ranAs points at a record that is not an agent, and says why', async () => {
    office = await standInOffice()
    const said = await whoHoldsTheOwnersAuthorityIn(true, 'a-run-bound-to-a-note', office.api, 'default')
    expect(said.startedBy).toBeNull()
    expect(said.problems.join(' ')).toContain('not an agent record with a handle')
  })
})
