// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Actual child registration, records, report and Git seal under one synthetic secretary run key. */
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, freshDb, theOfficesKeyHeader, type TestDb } from './helpers.ts'
import { type AnAnswer, type ARequest } from '../tools/office-request.mjs'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theWordsNamingTheFolder } from '../src/config/sandbox-folder.mjs'
import { syntheticTrace } from './synthetic-submission-fixtures.ts'
import { SHIPPED_CHAPTER_NUMBERS } from '../src/shared/chapter-check.ts'

const modulePath = '../tools/main-suite-fix-round-author.mjs'
const implementation = () => import(modulePath)
let db: TestDb, server: Awaited<ReturnType<typeof apiApp>>, env: NodeJS.ProcessEnv
let root: string, options: any, intercept: ((request: ARequest, answer: AnAnswer) => AnAnswer) | null
let calls: ARequest[]
let serial = 0
async function officeRequest(request: ARequest): Promise<AnAnswer> {
  calls.push(request)
  // Exercise the runner's internal program transport; no raw reply or key is printed or retained.
  const runnerPath = '../tools/main-suite-fix-round.mjs'
  const { fixRoundProgramRequest } = await import(runnerPath)
  const answer = await fixRoundProgramRequest(request, { env, fetchImpl: async (url: string | URL | Request, init?: RequestInit) => {
    const at = new URL(String(url))
    const reply = await server.app.inject({ method: init?.method as 'GET' | 'POST' | 'PATCH', url: at.pathname + at.search,
      headers: init?.headers as Record<string, string>, ...(init?.body === undefined ? {} : { payload: String(init.body) }) })
    return new Response(reply.body, { status: reply.statusCode, headers: reply.headers as Record<string, string> })
  } })
  return intercept === null ? answer : intercept(request, answer)
}
const git = (cwd: string, ...args: string[]) => {
  const ran = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', '-C', cwd, ...args], { encoding: 'utf8', timeout: 15_000,
    env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } })
  if (ran.status !== 0) throw new Error(ran.stderr)
  return ran.stdout.trim()
}
async function ask(request: ARequest) {
  const answer = await officeRequest(request)
  expect(answer.status, answer.body).toBeLessThan(300)
  return JSON.parse(answer.body)
}
beforeAll(async () => {
  db = await freshDb()
  writeFileSync(join(dirname(db.file), 'keys.json'), JSON.stringify({ person: randomBytes(32).toString('hex'), office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  server = await apiApp()
})
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'fix-round-author-'))
  calls = []; intercept = null
  const handle = `fixture-fix-secretary-${++serial}`
  const agent = db.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up fix-round secretary',
    data: { handle, role: 'secretary', runtime: 'codex', state: 'active', startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } }, actor: db.api.HUMAN })
  const participants = await import('../src/server/lib/participants.ts')
  const id = participants.agentForRecord(agent.id)!.id
  const minted = await server.app.inject({ method: 'POST', url: '/api/records', headers: { ...theOfficesKeyHeader(), 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'mole-office/the-message-worker' },
    payload: { kind: 'session', title: 'Made-up controller run', data: { state: 'running', runtime: 'codex', servingAgent: handle, servingAgentId: id, startedByMoleOffice: true } } })
  expect(minted.statusCode, minted.body).toBe(201)
  const issuance = minted.json(), controller = issuance.record
  expect(typeof issuance.runKey.key === 'string').toBe(true)
  env = { MOLE_OFFICE_API: 'http://fixture-office.invalid', MOLE_OFFICE_AGENT: handle, MOLE_OFFICE_SESSION: controller.id,
    MOLE_OFFICE_WORKSPACE: 'default', MOLE_AGENT_KEY: issuance.runKey.key }
  // office-request's central header builder reads credentials from its process environment.
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value!)
  const sheriff = `fixture-fix-sheriff-${serial}`
  await ask({ method: 'POST', path: '/api/agents/started', body: { handle: sheriff, name: 'Made-up repair sheriff', role: 'supervisor', runtime: 'codex', noKey: true } })
  const clone = join(root, 'revert')
  mkdirSync(join(clone, 'work'), { recursive: true })
  git(clone, 'init', '-q', '-b', 'main')
  git(clone, 'config', 'user.name', 'Made-up code tool'); git(clone, 'config', 'user.email', 'fixture@example.invalid')
  writeFileSync(join(clone, 'work', 'change.txt'), 'Before made-up take-out.\n')
  git(clone, 'add', '.'); git(clone, 'commit', '-qm', 'Made-up base')
  const base = git(clone, 'rev-parse', 'HEAD')
  git(clone, 'switch', '-qc', 'takeout')
  writeFileSync(join(clone, 'work', 'change.txt'), 'After made-up take-out.\n')
  git(clone, 'commit', '-qam', 'Made-up verified revert')
  const problem = db.api.createRecord({ workspaceId: 'default', kind: 'problem', title: 'Made-up original red problem', data: { state: 'open' }, actor: db.api.HUMAN })
  // A synthetic container ledger row, read by the real Office sandbox guard; no container is launched.
  const container = `fixture-author-container-${serial}`
  db.client.sqlite.prepare("INSERT INTO session_resources (id,workspace_id,session_record_id,type,key,detail,registered_at,registered_by) VALUES (?,'default',?,'container',?,?,'2026-10-15 09:00:00','agent:fixture')")
    .run(container, controller.id, `mole-office-sandbox-${basename(root)}`, `Synthetic sandbox; ${theWordsNamingTheFolder(root)}`)
  git(root, 'clone', '--no-local', '-q', clone, join(root, 'repo'))
  db.api.patchRecord(controller.id, { dataPatch: { sandbox: { folder: root, container, template: 'mole-office-dev' }, workingDirectory: join(root, 'repo') } }, db.api.HUMAN)
  const brief = join(root, 'author-brief.md'), briefBytes = 'Synthetic no-model author: seal the exact verified take-out and await ordinary inspection.\n'
  writeFileSync(brief, briefBytes, { mode: 0o600 })
  options = { controllerSandbox: { folder: root, container }, authorBrief: { path: brief, sha256: createHash('sha256').update(briefBytes).digest('hex') }, identity: { agent: handle, run: controller.id, workspace: 'default' }, sheriff: { agent: sheriff }, env,
    author: { handle: `fixture-fix-author-${serial}`, name: 'Made-up automatic code author', workArea: ['work'] },
    prepared: { clone, base, commit: git(clone, 'rev-parse', 'HEAD'), tree: git(clone, 'rev-parse', 'HEAD^{tree}'), takesOut: ['fixture-cause'] },
    problem: problem.id, receipt: { recordId: `fixture-receipt-${serial}`, seq: 1, contentHash: 'a'.repeat(16) },
    journal: join(root, 'author.json') }
})
afterEach(() => { vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }) })
afterAll(async () => { await server.app.close(); db.close() })

it('files a real no-model child report and git seal while keeping its secretary controller key valid', async () => {
  const { fixRoundAuthorTick } = await implementation()
  const result = await fixRoundAuthorTick(options, { officeRequest })
  expect(result).toMatchObject({ status: 'pending-check', run: expect.any(String), report: expect.any(String), seal: expect.any(String) })
  const child = db.api.getRecord(result.run)!
  const { theSandboxTheOfficeVouchesFor } = await import('../src/server/lib/next-round.ts')
  expect(theSandboxTheOfficeVouchesFor(db.api.getRecord(options.identity.run)!)).toEqual({ ...options.controllerSandbox, instance: basename(root) })
  const filing = calls.find(one => one.path === '/api/records' && (one.body as any)?.kind === 'session')!.body as any
  expect(filing).toMatchObject({ askedBy: options.identity.run, brief: options.authorBrief.path, cutFrom: options.prepared.base })
  const entry = (db.api.getRecord(options.identity.run)!.data.workerRuns as any)[child.data.servingAgentId as string]
  expect(entry).toMatchObject({ state: 'started', byHand: true, askedBy: { session: options.identity.run },
    brief: { path: options.authorBrief.path, sha256: options.authorBrief.sha256 }, cut: { named: options.prepared.base, commit: options.prepared.base }, started: { run: result.run, runKeyId: (child.data.extra as any).runKeyId } })
  const stamp = await ask({ method: 'GET', path: `/api/records/${result.run}/revisions/2` })
  expect(stamp.content.data.extra.runKeyId).toBe((child.data.extra as any).runKeyId)
  expect(calls.some(one => one.path.endsWith('/hand-run'))).toBe(false)
  expect(child.data).toMatchObject({ state: 'finished', parentAttachment: options.identity.run, servingAgent: options.author.handle, workingDirectory: options.prepared.clone, sealedTip: result.seal })
  const seals = await import('../src/server/lib/sealed-tip.ts')
  expect(seals.readRunSeal(result.run)?.seal.git).toMatchObject({ commit: options.prepared.commit, forkBase: options.prepared.base })
  expect(db.api.getRecord(result.report)?.kind).toBe('report')
  const report = db.api.getRecord(result.report)!.data as any
  const rulesDigest = createHash('sha256').update(readFileSync(new URL('../src/config/rules/CODE.md', import.meta.url))).digest('base64')
  // The author reads every shipped chapter, so a card that names a role chapter finds it in the report.
  expect(report.chaptersRead).toEqual([...SHIPPED_CHAPTER_NUMBERS])
  expect(report.source.includes(rulesDigest)).toBe(true)
  expect((await ask({ method: 'GET', path: '/api/restore' })).agent.handle).toBe(options.identity.agent)
  expect(db.api.getRecord(options.identity.run)?.data.state).toBe('running')
  const before = calls.filter(one => one.method === 'POST' && one.path === '/api/records').length
  expect(await fixRoundAuthorTick(options, { officeRequest })).toMatchObject({ run: result.run, report: result.report, status: 'pending-check' })
  expect(calls.filter(one => one.method === 'POST' && one.path === '/api/records')).toHaveLength(before)
  // A synthetic inspector verdict travels through the real ordinary assembly and verdict doors.
  const inspector = db.api.createRecord({ workspaceId: 'default', kind: 'agent', title: 'Made-up independent inspector',
    data: { handle: `fixture-fix-inspector-${serial}`, role: 'inspector', runtime: 'codex', state: 'active', startedBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } }, actor: db.api.HUMAN })
  const participants = await import('../src/server/lib/participants.ts'), keys = await import('../src/server/lib/keys.ts')
  const inspectorKey = keys.makeAnAgentKey(participants.agentForRecord(inspector.id)!.id, null)
  const checkClone = join(root, 'check-clone')
  git(root, 'clone', '--no-local', '-q', options.prepared.clone, checkClone)
  const seal = seals.readRunSeal(result.run)!
  const read = { sealId: seal.id, sealHash: seal.seal.hash, sealKind: 'git', worktree: checkClone, tip: options.prepared.commit, ofItsOwn: true, says: 'Synthetic independent check; no model was started.' }
  const headers = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': `fixture-fix-inspector-${serial}`, 'x-mole-office-key': inspectorKey }
  const changes = [{ path: 'work/change.txt', changes: git(options.prepared.clone, 'diff', options.prepared.base, options.prepared.commit, '--', 'work/change.txt') }]
  const assembled = await server.app.inject({ method: 'POST', url: `/api/checks/${result.run}/assembled`, headers,
    payload: { changes, base: { ref: options.prepared.base, how: 'typed', says: 'Synthetic exact base.' }, read } })
  expect(assembled.statusCode, assembled.body).toBe(201)
  const released = await server.app.inject({ method: 'POST', url: `/api/checks/${result.run}`, headers, payload: {
    verdict: 'released', check: 'Synthetic independent fixture verdict.', chaptersRead: [...SHIPPED_CHAPTER_NUMBERS],
    traced: syntheticTrace(db, ['work/change.txt']), read,
  } })
  expect(released.statusCode, released.body).toBe(201)
  expect(await fixRoundAuthorTick(options, { officeRequest })).toMatchObject({ status: 'checked', run: result.run, seal: result.seal })
})

it('reconciles a child filing whose response was lost and never files a duplicate session', async () => {
  const { fixRoundAuthorTick } = await implementation()
  let dropped = false
  intercept = (request, answer) => {
    if (!dropped && request.method === 'POST' && request.path === '/api/records' && (request.body as any).kind === 'session' && answer.status === 201) {
      dropped = true; throw new Error('Made-up lost filing response')
    }
    return answer
  }
  await expect(fixRoundAuthorTick(options, { officeRequest })).rejects.toThrow('lost filing response')
  const kept = JSON.parse(readFileSync(options.journal, 'utf8'))
  expect(kept.actions.session).toMatchObject({ state: 'planned', request: { body: { askedBy: options.identity.run, brief: options.authorBrief.path, cutFrom: options.prepared.base } } })
  expect(Buffer.from(kept.brief.base64, 'base64')).toEqual(readFileSync(options.authorBrief.path))
  expect(kept.brief.sha256).toBe(options.authorBrief.sha256)
  intercept = null
  const result = await fixRoundAuthorTick(options, { officeRequest })
  expect(result.status).toBe('pending-check')
  expect(calls.filter(one => one.method === 'POST' && one.path === '/api/records' && (one.body as any).kind === 'session')).toHaveLength(1)
})

it('refuses a non-secretary or a sheriff started by another identity before author mutations', async () => {
  const { fixRoundAuthorTick } = await implementation()
  options.sheriff.agent = options.identity.agent
  const before = calls.length
  await expect(fixRoundAuthorTick(options, { officeRequest })).rejects.toThrow('registered starter')
  expect(calls.slice(before).every(one => one.method === 'GET')).toBe(true)
  options.sheriff.agent = `fixture-fix-sheriff-${serial}`
  const participants = await import('../src/server/lib/participants.ts')
  const agent = participants.agentByHandle(options.identity.agent)!
  const mapping = db.client.sqlite.prepare('SELECT record_id AS id FROM agent_records WHERE agent_id = ?').get(agent.id) as { id: string }
  db.api.patchRecord(mapping.id, { dataPatch: { role: 'worker' } }, db.api.HUMAN)
  await expect(fixRoundAuthorTick(options, { officeRequest })).rejects.toThrow('active secretary')
})

it('refuses missing hand inputs and changed retained brief bytes before another author mutation', async () => {
  const { fixRoundAuthorTick } = await implementation()
  for (const extra of [{ controllerSandbox: undefined }, { authorBrief: undefined }, { authorBrief: { ...options.authorBrief, sha256: '0'.repeat(64) } }]) {
    calls = []
    await expect(fixRoundAuthorTick({ ...options, ...extra }, { officeRequest })).rejects.toThrow(/sandbox|brief/i)
    expect(calls.filter(one => one.method !== 'GET')).toEqual([])
  }
  const first = await fixRoundAuthorTick(options, { officeRequest })
  writeFileSync(options.authorBrief.path, 'Changed synthetic instructions.\n')
  calls = []
  await expect(fixRoundAuthorTick(options, { officeRequest })).rejects.toThrow(/brief/i)
  expect(calls.filter(one => one.method !== 'GET')).toEqual([])
  expect(db.api.getRecord(first.run)!.data.state).toBe('finished')
})

it('preserves the ordinary Office refusal when the controller sandbox has no matching ledger row', async () => {
  const { fixRoundAuthorTick } = await implementation()
  db.client.sqlite.prepare('DELETE FROM session_resources WHERE id = ?').run(options.controllerSandbox.container)
  const { theSandboxTheOfficeVouchesFor } = await import('../src/server/lib/next-round.ts')
  expect(theSandboxTheOfficeVouchesFor(db.api.getRecord(options.identity.run)!)).toBeNull()
  await expect(fixRoundAuthorTick(options, { officeRequest })).rejects.toThrow('was not accepted (403)')
  const filing = calls.find(one => one.path === '/api/records' && (one.body as any)?.kind === 'session')!.body as any
  expect(filing).toMatchObject({ askedBy: options.identity.run, brief: options.authorBrief.path, cutFrom: options.prepared.base })
  expect(db.api.listRecords({ workspaceId: 'default', kind: 'session' }).filter(one => one.data.servingAgent === options.author.handle)).toEqual([])
})

it('refuses altered original creation facts or hand-start correlation after a lost child response', async () => {
  const { fixRoundAuthorTick } = await implementation()
  let child = ''
  intercept = (request, answer) => {
    if (request.path === '/api/records' && (request.body as any)?.kind === 'session' && answer.status === 201) {
      child = JSON.parse(answer.body).record.id; throw new Error('Synthetic lost child response')
    }
    return answer
  }
  await expect(fixRoundAuthorTick(options, { officeRequest })).rejects.toThrow('lost child response')
  for (const changed of ['creation', 'hand']) {
    intercept = (request, answer) => {
      const body = JSON.parse(answer.body)
      if (changed === 'creation' && request.path === `/api/records/${child}/revisions/1`) body.who.sessionId = 'another-run'
      if (changed === 'hand' && request.path === `/api/records/${options.identity.run}`) {
        const worker = db.api.getRecord(child)!.data.servingAgentId as string
        body.record.data.workerRuns[worker].brief.sha256 = '0'.repeat(64)
      }
      return { ...answer, body: JSON.stringify(body) }
    }
    calls = []
    await expect(fixRoundAuthorTick(options, { officeRequest })).rejects.toThrow(/original|correlation|match/i)
    expect(calls.filter(one => one.method !== 'GET')).toEqual([])
  }
  intercept = null
  expect(await fixRoundAuthorTick(options, { officeRequest })).toMatchObject({ run: child, status: 'pending-check' })
})
