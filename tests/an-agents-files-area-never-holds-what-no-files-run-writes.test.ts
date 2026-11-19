// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S FILES AREA NEVER HOLDS WHAT NO FILES RUN MAY WRITE, and it is set only by the owner, the agent's starter
 * or a secretary, with a reason the record keeps. Acceptance finding 52 (report EnJvvsDTF_Dx, block f-52), on the
 * design two secretaries approved on 23 September 2026 (messages Yzb2Vd-cKicN and 1bbshFyI-jfU): each folder is
 * resolved with every link followed at registration, and refused when it is `/`, a home or a folder that holds one,
 * inside the office's data folder or holding it, or inside a git working tree. One secretary's reason for the last: the
 * folder his runs land in was once a link into a working tree deployed to a robot.
 *
 * A hidden folder under a home (~/.ssh, ~/.config, ~/.claude) is refused too; that case is proved on the reader
 * itself in tests/a-files-run-lands-only-inside-its-files-area.test.ts, since a test does not make folders in a
 * real home.
 *
 * MUTATION PROOF, 23 September 2026, each alone in src/server/lib/participants.ts: the check for a folder that holds
 * a home left out, and the case of the folder above the home goes red; the git working tree check left out, and the
 * repository case goes red; the data folder check left out, and its case goes red.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let t: TestDb
let app: FastifyInstance
let participants: typeof import('../src/server/lib/participants.ts')
const made: string[] = []

const as = (type: 'agent' | 'human', id: string) => ({
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': type,
  'x-mole-office-actor-id': id,
})
const asPerson = as('human', THE_PERSON)
const asSupervisor = as('agent', 'super-f')
const asStranger = as('agent', 'a-stranger')

async function register(folders: string[], by: Record<string, string> = asPerson) {
  const r = await app.inject({ method: 'POST', url: '/api/participants/agent/worker-f/files-area', headers: by, payload: { filesArea: folders, because: 'synthetic: where its files runs land' } })
  return { status: r.statusCode, body: r.json() as Record<string, any>, raw: r.body }
}

/** A folder outside this checkout and outside every home, removed after the file. */
function aFolder(prefix: string): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `a-files-area-${prefix}-`)))
  made.push(dir)
  return dir
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  participants = await import('../src/server/lib/participants.ts')
  const started = async (by: Record<string, string>, payload: Record<string, unknown>) => {
    const r = await app.inject({ method: 'POST', url: '/api/agents/started', headers: by, payload })
    expect(r.statusCode, r.body).toBe(201)
  }
  await started(asPerson, { handle: 'super-f', name: 'Super F', role: 'supervisor' })
  await started(asSupervisor, { handle: 'worker-f', name: 'Worker F', role: 'worker', workArea: ['work'] })
  await started(asPerson, { handle: 'a-stranger', name: 'A Stranger' })
}, 60_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

describe("an agent's files area", () => {
  it('keeps each folder as written and as resolved, with who set it, how, when and why', async () => {
    const real = aFolder('runs')
    const link = join(aFolder('link'), 'runs')
    symlinkSync(real, link)
    const r = await register([link], asSupervisor)
    expect(r.status, r.raw).toBe(200)
    expect(r.body['filesArea']).toEqual([{ written: link, resolved: real }])
    const agent = participants.agentByHandle('worker-f')!
    const record = t.api.getRecord(participants.recordForAgentIn(agent.id, 'default')!)
    const change = (record?.data['extra'] as Record<string, any> | undefined)?.['filesAreaChange']
    // The supervisor asked by its handle; the change keeps its registry id, which is not the handle.
    const supervisor = participants.agentByHandle('super-f')!
    expect(change).toMatchObject({ by: { type: 'agent', id: supervisor.id }, how: 'a-starter', because: 'synthetic: where its files runs land', after: [{ written: link, resolved: real }] })
  })

  it('is set by nobody else: an agent that neither started it nor holds the secretary card is refused', async () => {
    const r = await register([aFolder('stranger')], asStranger)
    expect(r.status, r.raw).toBe(403)
    expect(r.raw).toContain('Nothing was written.')
  })

  it('refuses a folder written relative, or one that is not there', async () => {
    const relative = await register(['runs'])
    expect(relative.status).toBe(400)
    expect(relative.raw).toContain('a files area is absolute folders, written plainly')
    const missing = await register([join(aFolder('gone'), 'not-there')])
    expect(missing.status).toBe(400)
    expect(missing.raw).toContain('it is not a folder on this machine')
  })

  it('refuses the root of the machine, a home, and a folder that holds a home', async () => {
    const root = await register(['/'])
    expect(root.status).toBe(400)
    expect(root.raw).toContain('it resolves to the root of the machine')
    const home = realpathSync(homedir())
    const itself = await register([home])
    expect(itself.status).toBe(400)
    expect(itself.raw).toContain(`it resolves to the home folder ${home} itself`)
    const above = dirname(home)
    const holding = await register([above])
    expect(holding.status).toBe(400)
    expect(holding.raw).toContain(above === '/' ? 'it resolves to the root of the machine' : `which holds the home folder ${home}`)
  })

  it("refuses the office's own data folder, and a folder that holds it", async () => {
    const data = realpathSync(dirname(String(process.env['MOLE_OFFICE_DB'])))
    const inside = await register([data])
    expect(inside.status).toBe(400)
    expect(inside.raw).toContain(`inside the office's own data folder ${data}`)
    const holding = await register([dirname(data)])
    expect(holding.status).toBe(400)
    expect(holding.raw).toContain(`which holds the office's own data folder ${data}`)
  })

  it('refuses a folder inside a git working tree, even through a link, since files of a repository go through the git lane', async () => {
    const repository = aFolder('a-repository')
    execFileSync('git', ['init', '-q', repository])
    mkdirSync(join(repository, 'runs'))
    const direct = await register([join(repository, 'runs')])
    expect(direct.status).toBe(400)
    expect(direct.raw).toContain(`inside the git working tree ${repository}`)
    const link = join(aFolder('into-a-tree'), 'runs')
    symlinkSync(join(repository, 'runs'), link)
    const linked = await register([link])
    expect(linked.status).toBe(400)
    expect(linked.raw).toContain(`it resolves to ${join(repository, 'runs')}, inside the git working tree ${repository}`)
  })
})
