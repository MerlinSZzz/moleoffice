// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { GATES } from '../src/config/gates.mjs'
import { apiApp, freshDb, thePersonsKeyHeader, type TestDb } from './helpers.ts'
import { fakeReleasePolicyFixture, gateList } from './stable-release-policy-fixture.ts'
import { A_KEY_SHOWN_AS, THE_LONGEST_REPLY, askTheOffice, OFFICE_REQUEST } from '../tools/office-request.mjs'
import { answerOfficeMessage } from '../tools/office-mcp.mjs'
import { upgradeOfficeRequest } from '../tools/stable/stable-upgrade-notices.mjs'

// Variable imports keep this criterion checkpoint compilable before the implementation exists.
const policyModule = '../tools/stable/stable-release-policy.mjs'
const ENV = { MOLE_OFFICE_API: 'http://made-up-office.invalid', MOLE_OFFICE_AGENT: 'fixture-writer', MOLE_OFFICE_SESSION: 'fixture-run', MOLE_OFFICE_WORKSPACE: 'fixture-project' }
const GATE_READ = '/api/office/gates?gate=release-spacing'
const now = () => Date.parse('2026-10-15T12:00:00Z')
const refused = (words: string) => `Release policy refused: ${words}`

describe('the gate door answers one row', () => {
  let t: TestDb, app: FastifyInstance
  beforeAll(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() })
  afterAll(async () => { await app.close(); t.close() })

  // Mutation: answer the whole list for ?gate= as well, and no answer has a row.
  // Asking the server for every gate's row twice took about five seconds alone at load 4 on this machine, so the case
  // was given a minute instead of the five-second default. It now asks for the first row of each group in the whole
  // list, under each header set.
  it('answers the first row of each gate group as the whole list has it, with the same permission, and refuses an id no gate has by name', async () => {
    const asThePerson = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, ...thePersonsKeyHeader() }
    for (const headers of [{}, asThePerson]) {
      const whole = await app.inject({ method: 'GET', url: '/api/office/gates', headers })
      expect(whole.statusCode, whole.body).toBe(200)
      const list = whole.json()
      const rows = list.classes.flatMap((one: { groups: { rows: { id: string }[] }[] }) => one.groups.flatMap(group => group.rows))
      expect(rows.map((row: { id: string }) => row.id).sort()).toEqual(GATES.map(gate => gate.id).sort())
      // ONE ROW FROM EACH GROUP, the first of each class's group as the whole list gives it, so a group added later is read too.
      const theFirstOfEachGroup = list.classes.flatMap((one: { groups: { rows: { id: string }[] }[] }) => one.groups.flatMap(group => group.rows.slice(0, 1)))
      for (const row of theFirstOfEachGroup) {
        const one = await app.inject({ method: 'GET', url: `/api/office/gates?gate=${encodeURIComponent(row.id)}`, headers })
        expect(one.statusCode, one.body).toBe(200)
        // Every reply that is an object says whether permission narrowed it, so the one row's answer says it too.
        expect(one.json(), row.id).toEqual({ office: list.office, mayChange: list.mayChange, mayChangeThePersonsOwn: list.mayChangeThePersonsOwn, row, narrowedByPermission: list.narrowedByPermission })
      }
    }
    const unknown = await app.inject({ method: 'GET', url: '/api/office/gates?gate=made-up-gate', headers: asThePerson })
    expect(unknown.statusCode, unknown.body).toBe(404)
    expect(unknown.json()).toMatchObject({ code: 'gateReadUnknown', values: { id: 'made-up-gate' } })
    expect(unknown.json().error).toContain('made-up-gate')
  }, 60_000)
})

describe('the release check reads its gate row through the request helper', () => {
  beforeEach(() => { vi.stubEnv('MOLE_AGENT_KEY', '') })
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

  /**
   * A release in spacing mode that passes at a spacing of 120 minutes, against a made-up office. `door` says how the
   * office answers a read of the gate list: 'new' answers the one row asked for, 'older' ignores the query and answers
   * the whole list. `padding` makes the whole list that many characters longer.
   */
  function aRelease(door: 'new' | 'older', padding: number) {
    const config = { stableCheckout: '/fixture/stable', database: '/fixture/office.db', servicePort: 29991,
      candidateTag: 'stable-2026-10-15-candidate', previousBaselineTag: 'stable-2026-10-14-baseline', targetCommit: 'b'.repeat(40),
      notice: 'Synthetic approved notice.', evidence: { recordId: 'fixture-receipt', seq: 1, contentHash: 'abcdef1234567890' }, noticeApproval: {} }
    const f = fakeReleasePolicyFixture({ config, baseline: 'a'.repeat(40), tree: 'e'.repeat(40), now })
    f.completedAfter('2026-10-15 10:00:00')
    const list = { ...gateList([{ id: 'release-spacing', value: '120', unreadable: null }]), padding: 'x'.repeat(padding) }
    const sent: string[] = []
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const asked = new URL(String(url))
      const path = asked.pathname + asked.search
      sent.push(path)
      if (JSON.stringify(init ?? {}).includes('longestReply')) throw new Error('The request carried longestReply to the office.')
      if (asked.pathname === '/api/office/gates') {
        const gate = asked.searchParams.get('gate')
        const row = list.classes.flatMap(one => one.groups.flatMap((group: { rows: { id: string }[] }) => group.rows)).find(one => one.id === gate)
        const body = door === 'new' && gate !== null
          ? { office: list.office, mayChange: list.mayChange, mayChangeThePersonsOwn: false, row, narrowedByPermission: null }
          : list
        return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      const answer = await f.officeRequest({ method: init?.method ?? 'GET', path })
      return new Response(answer.body, { status: answer.status, headers: { 'content-type': 'application/json' } })
    })
    const transport = upgradeOfficeRequest(ENV, 15_000)
    const raised: Array<{ path: string; longestReply: unknown }> = []
    const officeRequest = Object.assign(async (request: { method: string; path: string; longestReply?: number }) => {
      raised.push({ path: request.path, longestReply: request.longestReply })
      return transport(request)
    }, { identity: transport.identity })
    const verify = async () => (await import(policyModule)).verifyStableReleasePolicy({ config, baseline: 'a'.repeat(40), tree: 'e'.repeat(40) }, { officeRequest, now })
    return { verify, sent, raised, list }
  }

  // Mutation: read the bare list at the helper's own limit again, and the list is cut.
  it('reads the one row from a new door, though the whole list is past the cut', async () => {
    const r = aRelease('new', THE_LONGEST_REPLY)
    expect(JSON.stringify(r.list).length).toBeGreaterThan(THE_LONGEST_REPLY)
    expect((await r.verify()).spacing).toEqual({ minutes: 120, from: 'the-office', says: 'The office gives the spacing between stable releases as 120 minutes.' })
    expect(r.sent.filter(path => path.startsWith('/api/office/gates'))).toEqual([GATE_READ])
    // Only the read of the gate list raises the limit. Every other read goes at the helper's own.
    expect(r.raised.filter(one => one.longestReply !== undefined).map(one => one.path)).toEqual([GATE_READ])
    expect(r.raised.length).toBeGreaterThan(1)
  })

  // Mutation: drop the raised limit in the release check, drop it in the adapter, or have the helper ignore it, and
  // the older office's whole list is cut.
  it('reads an older door\'s whole list past the cut whole, under its raised limit', async () => {
    const r = aRelease('older', THE_LONGEST_REPLY)
    expect(JSON.stringify(r.list).length).toBeGreaterThan(THE_LONGEST_REPLY)
    expect((await r.verify()).spacing).toEqual({ minutes: 120, from: 'the-office', says: 'The office gives the spacing between stable releases as 120 minutes.' })
    expect(r.sent.filter(path => path.startsWith('/api/office/gates'))).toEqual([GATE_READ])
  })

  // Mutation: give the raised limit no end, and a list past it is read.
  it('refuses as cut an older door\'s whole list past the raised limit', async () => {
    const { THE_LONGEST_GATE_LIST } = await import(policyModule)
    expect(Number.isSafeInteger(THE_LONGEST_GATE_LIST) && THE_LONGEST_GATE_LIST > THE_LONGEST_REPLY).toBe(true)
    const r = aRelease('older', THE_LONGEST_GATE_LIST)
    await expect(r.verify()).rejects.toThrow(refused(`The office's answer to ${GATE_READ} was cut, so the release check cannot read it whole.`))
  })
})

describe('the request helper cuts at its own limit unless one read raises it', () => {
  beforeEach(() => { vi.stubEnv('MOLE_AGENT_KEY', '') })
  afterEach(() => { vi.unstubAllEnvs() })
  const long = 'x'.repeat(THE_LONGEST_REPLY * 2)
  const asked: string[] = []
  const fetchImpl = (async (url: string | URL | Request) => { asked.push(String(url)); return new Response(long, { status: 200 }) }) as typeof fetch
  // The options are built apart from the call, so this criterion checkpoint compiles before the helper declares longestReply.
  const raisedTo = (longestReply: number) => ({ env: ENV, fetchImpl, longestReply })

  // Mutation: let a limit below the helper's own through, and it is used.
  it('cuts at its own limit by default, reads a raised limit whole, and refuses a lower one without sending', async () => {
    const plain = await askTheOffice({ method: 'GET', path: '/api/made-up' }, { env: ENV, fetchImpl })
    expect(plain.cut).toBe(true)
    expect(plain.body).toHaveLength(THE_LONGEST_REPLY)
    const raised = await askTheOffice({ method: 'GET', path: '/api/made-up' }, raisedTo(long.length))
    expect(raised.cut).toBe(false)
    expect(raised.body).toBe(long)
    asked.length = 0
    for (const longestReply of [THE_LONGEST_REPLY - 1, THE_LONGEST_REPLY + 0.5, Number.POSITIVE_INFINITY]) {
      await expect(askTheOffice({ method: 'GET', path: '/api/made-up' }, raisedTo(longestReply)), String(longestReply)).rejects.toThrow('The longest reply was refused, and nothing was sent')
    }
    expect(asked).toEqual([])
  })

  // The keys are replaced over the whole reply, and only then is it cut, at a raised limit as at the helper's own.
  // Mutation: cut the reply before its keys are replaced, and the half of the key before the limit is handed back.
  it('replaces a key that straddles the release check\'s raised limit whole, and only then cuts', async () => {
    const { THE_LONGEST_GATE_LIST } = await import(policyModule)
    expect(Number.isSafeInteger(THE_LONGEST_GATE_LIST) && THE_LONGEST_GATE_LIST > THE_LONGEST_REPLY).toBe(true)
    // A made-up key, 64 hex characters, starting 32 characters before the limit, so the limit falls in its middle.
    const key = '0123456789abcdef'.repeat(4)
    const before = 'x'.repeat(THE_LONGEST_GATE_LIST - 32)
    const straddling = (async () => new Response(before + key + 'x'.repeat(100), { status: 200 })) as typeof fetch
    const options = { env: ENV, fetchImpl: straddling, longestReply: THE_LONGEST_GATE_LIST }
    const answer = await askTheOffice({ method: 'GET', path: '/api/made-up' }, options)
    expect(answer.cut).toBe(true)
    expect(answer.body).toHaveLength(THE_LONGEST_GATE_LIST)
    expect(answer.body.startsWith(before + A_KEY_SHOWN_AS)).toBe(true)
    expect(answer.body, 'part of a key that straddled the raised limit was handed back').not.toMatch(/[0-9A-Fa-f]{8}/)
  })

  it('cuts office_request at its own limit, whatever its arguments say', async () => {
    const answer = await answerOfficeMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: OFFICE_REQUEST, arguments: { method: 'GET', path: '/api/made-up', fields: 'whole', longestReply: long.length } } }, { env: ENV, fetchImpl }) as { result: { content: { text: string }[] } }
    expect(answer.result.content[0]!.text).toContain(`(The rest of the reply, past ${THE_LONGEST_REPLY} characters, is not shown.)`)
  })
})
