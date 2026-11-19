// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GET /api/resources?pgid=<n> answers the rows of one process group, and only those.
 *
 * The data-folder move needs the rows of the office supervisor's group. The whole ledger of the owner's
 * office is longer than the 60,000 characters the request helper hands back, so a whole read came back cut
 * and the move refused. These tests make up a ledger longer than that cut and read one group through the
 * request helper itself.
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { askTheOffice, THE_LONGEST_REPLY } from '../tools/office-request.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { freshDb, type TestDb } from './helpers.ts'

type ResourcesLib = typeof import('../src/server/lib/resources.ts')
type OsProbe = ResourcesLib['LINUX_PROBE']
type OsProcess = NonNullable<ReturnType<OsProbe['processById']>>

const HUMAN = { type: 'human', id: THE_TEST_OFFICES_OWNER.id } as const
/** The group the reads below ask for. Every other group is there to make the ledger long. */
const GROUP = 4242
const OTHER_GROUPS = 120

let t: TestDb, res: ResourcesLib, app: FastifyInstance
const live = new Map<number, OsProcess>()

beforeEach(async () => {
  t = await freshDb()
  res = await import('../src/server/lib/resources.ts')
  const Fastify = (await import('fastify')).default
  const { installErrorHandling } = await import('../src/server/lib/http.ts')
  const { resourceRoutes } = await import('../src/server/api/resources.ts')
  app = Fastify({ logger: false })
  installErrorHandling(app)
  await app.register(resourceRoutes, { prefix: '/api' })
  await app.ready()
  live.clear()
  // A made-up machine. Nothing here reads or signals a real process.
  res.useOsProbe({
    platform: 'fake',
    processById: (pid: number) => live.get(pid) ?? null,
    processesInGroup: (pgid: number) => [...live.values()].filter((p) => p.pgid === pgid),
    listeningPorts: () => [],
    gpu: () => ({ available: true, processes: [] }),
    containers: () => ({ available: true, containers: [] }),
    locks: () => ({ files: [], unreadable: [] }),
    ownProcessGroup: () => 999_999,
    killProcessGroup: (pgid: number) => { for (const [pid, p] of live) if (p.pgid === pgid) live.delete(pid) },
    stopContainer: () => {},
  } as unknown as OsProbe)
})

afterEach(async () => {
  await app.close()
  t.close()
})

function run(title: string): string {
  return t.api.createRecord({ workspaceId: 'default', kind: 'session', title, data: { state: 'running', runtime: 'claude-code' }, actor: t.api.HUMAN }).id
}

/** A live made-up process in `pgid`, registered as a process row of `session`. */
function registered(session: string, pid: number, pgid: number) {
  live.set(pid, { pid, pgid, ppid: 1, command: `made-up process ${pid} ` + 'of a made-up office '.repeat(20), startedAt: '2026-10-19 09:00:00' })
  return res.registerResource({ workspaceId: 'default', sessionRecordId: session, type: 'process', key: String(pid), actor: HUMAN })
}

/** The office's answer as the request helper hands it to a tool, with its cut. */
function throughTheRequestHelper(path: string) {
  return askTheOffice({ method: 'GET', path }, {
    env: { MOLE_OFFICE_API: 'http://fixture.invalid', MOLE_OFFICE_AGENT: 'fixture-agent', MOLE_OFFICE_SESSION: 'fixture-run', MOLE_OFFICE_WORKSPACE: 'default' },
    fetchImpl: async (url: string | URL | Request) => {
      const asked = new URL(String(url))
      const answer = await app.inject({ method: 'GET', url: asked.pathname + asked.search })
      return new Response(answer.body, { status: answer.statusCode, headers: { 'content-type': 'application/json' } })
    },
  })
}

/** Mutation: drop the `pgid = ?` clause from readRows, and the whole ledger comes back cut. */
it('answers one group whole from a ledger longer than the request helper hands back', async () => {
  const office = run('made-up office run'), other = run('made-up other run')
  const wanted = [registered(office, GROUP, GROUP), registered(other, GROUP + 1, GROUP)]
  for (let n = 0; n < OTHER_GROUPS; n++) registered(other, 10_000 + n, 10_000 + n)

  const whole = await throughTheRequestHelper('/api/resources')
  expect(whole.status).toBe(200)
  expect(whole.cut, 'the made-up ledger must be longer than the cut').toBe(true)

  const one = await throughTheRequestHelper(`/api/resources?pgid=${GROUP}`)
  expect(one.status, one.body).toBe(200)
  expect(one.cut).toBe(false)
  expect(one.body.length).toBeLessThan(THE_LONGEST_REPLY)
  const rows = JSON.parse(one.body).resources
  expect(rows.map((r: any) => r.id).sort()).toEqual(wanted.map((r) => r.id).sort())
  expect(rows.every((r: any) => r.pgid === GROUP && r.type === 'process')).toBe(true)
})

/** Mutation: leave `includeReleased` or `sessionRecordId` out of the call that passes `pgid` on. */
it('combines the group with the session and with the released rows', async () => {
  const office = run('made-up office run'), other = run('made-up other run')
  const kept = registered(office, GROUP, GROUP), beside = registered(other, GROUP + 1, GROUP)
  registered(office, 5151, 5151)
  const closed = registered(office, GROUP + 2, GROUP)
  live.delete(GROUP + 2)
  await res.releaseResource(closed.id, { actor: HUMAN }, 'default')

  const ids = async (url: string) => {
    const answer = await app.inject({ method: 'GET', url })
    expect(answer.statusCode, answer.body).toBe(200)
    return (JSON.parse(answer.body).resources as any[]).map((r) => r.id).sort()
  }
  expect(await ids(`/api/resources?pgid=${GROUP}`)).toEqual([kept.id, beside.id].sort())
  expect(await ids(`/api/resources?pgid=${GROUP}&sessionRecordId=${office}`)).toEqual([kept.id])
  expect(await ids(`/api/resources?pgid=${GROUP}&includeReleased=true`)).toEqual([kept.id, beside.id, closed.id].sort())
  expect(await ids(`/api/resources?pgid=${GROUP}&sessionRecordId=${office}&includeReleased=true`)).toEqual([kept.id, closed.id].sort())
})

/** Mutation: accept any text for `pgid`, or let 0 and 1 through. */
it('refuses a group that is not a whole number of 2 or more, and names the parameter', async () => {
  for (const pgid of ['2', '42']) expect((await app.inject({ method: 'GET', url: `/api/resources?pgid=${pgid}` })).statusCode, pgid).toBe(200)
  for (const pgid of ['', 'abc', '0', '1', '-5', '1.5', '12x', '0x10', ' 42']) {
    const answer = await app.inject({ method: 'GET', url: `/api/resources?pgid=${encodeURIComponent(pgid)}` })
    expect(answer.statusCode, `pgid=${JSON.stringify(pgid)}: ${answer.body}`).toBe(400)
    expect(answer.body, pgid).toContain('pgid')
  }
})
