// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A THROWAWAY WORLD NEVER ASKS THE LIVE OFFICE FOR ITS SECRETARIES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS MEASURED, IN THE SANDBOX V1 SMOKE TEST
 * ---------------------------------------------------------------------------------------
 *
 * INTEGRATION.md (sandbox v1 handback), section 7, issue 1: `tools/isolated-mole-office.mjs start`
 * asked `whoHoldsTheOwnersAuthorityIn` who the office's secretaries are — a real HTTP request to
 * `officeApi + '/api/participants'` — for EVERY world, including one started with a bare
 * `start <name>` that nobody will ever be shown. `officeApi` defaults to `theApi()`, which without
 * `MOLE_OFFICE_API` set is the live office, on the configured port. A world nobody is being asked to look at has no
 * reason to hold the owner's authority for anybody, so it had no reason to ask a live office
 * anything either — and in a worktree, that default IS the person's own office.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES
 * ---------------------------------------------------------------------------------------
 *
 *   · `showToThePerson: false` makes NO request to the office at all — the stand-in office records
 *     zero requests — and says why in `problems`, which is a real answer ("never asked") rather than
 *     a guessed empty list that reads the same as "asked, and there are none";
 *   · `showToThePerson: true` still asks as before: the run is read for its starter and
 *     `/api/participants` is read for the secretaries, both against the office it was told about.
 *
 * IT CALLS `whoHoldsTheOwnersAuthorityIn` DIRECTLY, the way `copyDatabase` is already tested
 * directly in tests/a-worlds-copy-carries-no-key-hashes.test.ts: what is under test is the rule the
 * function carries, not the minute `start` takes to copy a database and bring two servers up.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THIS IS WRITTEN AGAINST, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Take the `if (!showToThePerson) return said` guard out of `whoHoldsTheOwnersAuthorityIn`
 * (tools/isolated-mole-office.mjs) → the "asks nothing" case goes red, because the stand-in office
 * then receives the participants request it should never have been sent.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { whoHoldsTheOwnersAuthorityIn } from '../tools/isolated-mole-office.mjs'

interface StandInOffice {
  api: string
  close: () => Promise<void>
  requests: string[]
}

/** A stand-in office that answers every door `whoHoldsTheOwnersAuthorityIn` might knock on, and records each one. */
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
      if (req.url === '/api/records/a-real-run') {
        return say(200, { record: { id: 'a-real-run', data: { servingAgent: 'builder-of-this-world' } } })
      }
      if (req.url === '/api/participants') {
        return say(200, { agents: [{ handle: THE_TEST_OFFICES_SECRETARY.handle, role: 'secretary', retired: false }] })
      }
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

describe('whoHoldsTheOwnersAuthorityIn, called for a world nobody is being asked to look at', () => {
  let office: StandInOffice

  afterEach(async () => {
    await office?.close()
  })

  it('asks the office nothing, and says why rather than reporting a guessed empty list', async () => {
    office = await standInOffice()

    const said = await whoHoldsTheOwnersAuthorityIn(false, null, office.api, 'default')

    expect(office.requests, 'a throwaway world contacted the office').toEqual([])
    expect(said.startedBy).toBeNull()
    expect(said.secretaries).toEqual([])
    expect(said.problems.join(' '), 'it does not stay silent about why').toContain('not shown to the person')
  })

  it('still asks the office when the world IS shown to the person, and finds the secretary', async () => {
    office = await standInOffice()

    const said = await whoHoldsTheOwnersAuthorityIn(true, 'a-real-run', office.api, 'default')

    expect(office.requests.some((r) => r.includes('/api/records/a-real-run')), office.requests.join('; ')).toBe(true)
    expect(office.requests.some((r) => r.includes('/api/participants')), office.requests.join('; ')).toBe(true)
    expect(said.startedBy).toBe('builder-of-this-world')
    expect(said.secretaries).toEqual([THE_TEST_OFFICES_SECRETARY.handle])
    expect(said.problems).toEqual([])
  })
})
