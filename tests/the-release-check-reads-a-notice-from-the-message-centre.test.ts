// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RELEASE CHECK READS A COMPLETED UPGRADE WHERE THE OFFICE FILES IT. Every message lives in the message centre, and its
 * mark says the project it was written in. The notices here are filed through the office's own
 * paths: the BEFORE by the notice function, with a synthetic identity for the stopped baseline process, and the AFTER through
 * the notice door, which reads the real serving socket, database and checkout. The receipts and approvals are synthetic.
 */
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { WHOLE_SUITE_RECEIPT_EXAMPLE } from '../src/shared/whole-suite-receipt.ts'
import { stableUpgradeNoticeResultSchema, type StableUpgradeNoticeRequest, type StableUpgradeNoticeResult } from '../src/shared/stable-upgrade-notices.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'
import { writtenInOf } from '../src/shared/messages.ts'
import { theClockZone } from '../src/shared/time.ts'
import { gateNamed } from '../src/config/gates.mjs'
import { THE_LONGEST_REPLY } from '../tools/office-request.mjs'
import { verifyStableReleasePolicy } from '../tools/stable/stable-release-policy.mjs'
import type { Actor } from '../src/server/lib/records.ts'

const OTHER = 'other-release-project'
const ORIGINAL = 'Release policy refused: The baseline is not a matching original completed AFTER.'
let t: TestDb
let app: FastifyInstance
let lib: typeof import('../src/server/lib/stable-upgrade-notices.ts')
let commit: string
let repository: string
let port: number
let number = 0
let pair: { before: StableUpgradeNoticeResult; after: StableUpgradeNoticeResult; candidateTag: string }
const ids = new Map<string, string>()
const keys = new Map<string, string>()
const runs = new Map<string, string>()
const personKey = randomBytes(32).toString('hex')
const ownerHeaders = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id, 'x-mole-office-key': personKey }
function headers(who: string, project = 'default') {
  return { 'x-mole-office-workspace': project, 'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': ids.get(who)!, 'x-mole-office-key': keys.get(who)!, 'x-mole-office-session': runs.get(`${who} ${project}`)! }
}
function actor(who: string, project = 'default'): Actor {
  return { type: 'agent', id: ids.get(who)!, keyHolder: ids.get(who)!, provedBy: 'an-agent-key', sessionId: runs.get(`${who} ${project}`)! }
}
function reference<S extends number = 1>(id: string, seq: S = 1 as S) {
  const r = t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? AND seq = ?').get(id, seq) as { content_hash: string }
  return { id, seq, contentHash: r.content_hash }
}
function receipt(target: string, project: string) {
  return t.api.createRecord({ kind: 'whole_suite_receipt', title: `Synthetic receipt ${++number}`, workspaceId: project,
    data: { ...WHOLE_SUITE_RECEIPT_EXAMPLE, commit: target }, actor: actor('controller', project) }).id
}
// The release check runs as a secretary, the one agent that may read a notice it is neither the sender nor a recipient of.
// Its reads are answered as the request helper answers them.
const officeRequest = Object.assign(async (request: { method: string; path: string; body?: unknown }) => {
  const reply = await app.inject({ method: request.method as 'GET', url: request.path, headers: headers('secretary'),
    ...(request.body === undefined ? {} : { payload: request.body as object }) })
  const cut = reply.body.length > THE_LONGEST_REPLY
  const location = reply.headers.location
  return { status: reply.statusCode, body: cut ? reply.body.slice(0, THE_LONGEST_REPLY) : reply.body, cut,
    location: typeof location === 'string' ? location : null }
}, { identity: { get project() { return 'default' }, get agent() { return ids.get('secretary')! }, get session() { return runs.get('secretary default')! } } })

/** A completed upgrade filed in `project`: its BEFORE by the stopped baseline process, its AFTER through the door. */
async function aCompletedUpgrade(project: string) {
  const n = ++number
  const notice = `Synthetic upgrade notice ${n}.`
  const note = t.api.createRecord({ kind: 'note', title: `Synthetic earlier approval ${n}`, workspaceId: project, data: { body: notice }, actor: actor('secretary', project) })
  const evidence = reference(receipt(commit, project))
  const announcement = { candidateTag: `stable-2026-10-23-synthetic-${n}`, baselineTag: `synthetic-older-${n}`, fromCommit: 'a'.repeat(40), toCommit: commit,
    tree: WHOLE_SUITE_RECEIPT_EXAMPLE.tree, notice, evidence, noticeApproval: reference(note.id) }
  const request: StableUpgradeNoticeRequest = { stage: 'before', sendId: `before-${n}`, announcement }
  const before = lib.fileStableUpgradeNotice(project, request, actor('controller', project), () => ({ commit: announcement.fromCommit, repository, database: t.file, port: 12345 }))
  const done = await app.inject({ method: 'POST', url: '/api/office/upgrades/notice', headers: headers('controller', project), payload: {
    stage: 'after', sendId: `after-${n}`, before: before.original,
    outcome: { state: 'completed', verification: { result: 'completed', evidence, serving: { commit, repository, database: t.file, port } } },
  } })
  expect(done.statusCode, done.body).toBe(201)
  return { before, after: stableUpgradeNoticeResultSchema.parse(done.json()), candidateTag: announcement.candidateTag }
}

/** The next release's approval, with the given completed AFTER as its baseline. */
function theNextRelease(after: StableUpgradeNoticeResult, baselineTag: string) {
  const n = ++number
  const notice = `Synthetic next upgrade notice ${n}.`
  const target = commit === 'b'.repeat(40) ? 'c'.repeat(40) : 'b'.repeat(40)
  const evidence = reference(receipt(target, 'default'))
  const note = t.api.createRecord({ kind: 'note', title: `Synthetic approval ${n}`, workspaceId: 'default', data: { body: notice }, actor: actor('secretary') })
  const candidateTag = `stable-2026-10-24-synthetic-${n}`
  const serving = { commit, repository, database: t.file, port }
  // Past every spacing the gate allows, so the spacing never decides these cases.
  const spacing = gateNamed('release-spacing').positions
  if (spacing.kind !== 'number') throw new Error('The spacing between stable releases is declared without a number.')
  const checked = Date.now() + (spacing.most + 1) * 60_000
  const stableReleaseAuthorization = { version: 1, mode: 'spacing', reason: 'Synthetic release approval.', timeZone: theClockZone(),
    candidateTag, baselineTag, fromCommit: commit, toCommit: target, tree: WHOLE_SUITE_RECEIPT_EXAMPLE.tree, evidence, serving,
    validFrom: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(checked + 60 * 60_000).toISOString(),
    baselineSource: { kind: 'completed-after', after: after.original } }
  t.api.patchRecord(note.id, { dataPatch: { extra: { stableReleaseAuthorization } } }, actor('secretary'))
  const config = { candidateTag, previousBaselineTag: baselineTag, targetCommit: target, notice, noticeApproval: reference(note.id, 2),
    evidence: { recordId: evidence.id, seq: evidence.seq, contentHash: evidence.contentHash },
    stableCheckout: repository, database: t.file, servicePort: port }
  return () => verifyStableReleasePolicy({ config, baseline: commit, tree: WHOLE_SUITE_RECEIPT_EXAMPLE.tree }, { officeRequest, now: () => checked })
}

async function placement(id: string) {
  const reply = await officeRequest({ method: 'GET', path: `/api/records/${id}` })
  expect(reply.status, reply.body).toBe(200)
  const { record } = JSON.parse(reply.body) as { record: { workspaceId: string; data: Record<string, unknown> } }
  return { workspaceId: record.workspaceId, writtenIn: writtenInOf(record.data)?.project }
}

beforeAll(async () => {
  t = await freshDb()
  writeFileSync(join(dirname(t.file), 'keys.json'), JSON.stringify({ person: personKey, office: randomBytes(32).toString('hex'), providers: {} }), { mode: 0o600 })
  const settings = await import('../src/config/settings.mjs')
  ;({ commit, repository } = settings.theServingInstall())
  const webDir = join(dirname(t.file), 'synthetic-web')
  mkdirSync(webDir)
  const { writeTheBuildStamp } = await import('../src/config/build-stamp.mjs')
  writeTheBuildStamp(webDir, { commit })
  const { buildApp } = await import('../src/server/index.ts')
  app = (await buildApp({ production: false, webDir, webAppUrl: 'http://fixture.invalid', logLevel: false })).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  port = (app.server.address() as AddressInfo).port
  const { theRoleCards } = await import('../src/server/lib/roles.ts')
  const card = theRoleCards().elevation.onlyThisCardCanHoldIt
  for (const who of ['controller', 'secretary']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers: ownerHeaders,
      payload: { handle: `release-${who}`, name: `Synthetic ${who}`, role: who === 'secretary' ? card : 'worker' } })
    expect(made.statusCode, made.body).toBe(201)
    const data = made.json() as { agent: { id: string }; whatToGiveIt: { key: string } }
    ids.set(who, data.agent.id); keys.set(who, data.whatToGiveIt.key)
  }
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: OTHER, title: 'Synthetic other project' })
  for (const project of ['default', OTHER]) {
    for (const who of ['controller', 'secretary']) {
      runs.set(`${who} ${project}`, t.api.createRecord({ workspaceId: project, kind: 'session', title: `Synthetic ${who} run`,
        data: { state: 'running', servingAgent: ids.get(who) }, actor: t.api.HUMAN }).id)
    }
  }
  lib = await import('../src/server/lib/stable-upgrade-notices.ts')
  pair = await aCompletedUpgrade('default')
})
afterAll(async () => { await app?.close(); t?.close() })

it('takes a completed AFTER and its BEFORE from the message centre as the baseline when both were written in this project', async () => {
  for (const notice of [pair.before, pair.after]) expect(await placement(notice.original.id)).toEqual({ workspaceId: MESSAGE_CENTRE, writtenIn: 'default' })
  const result = await theNextRelease(pair.after, pair.candidateTag)()
  expect(result.baselineSource).toEqual({ kind: 'completed-after', after: pair.after.original })
})

it('refuses a notice in the message centre whose current mark names another project, or no project', async () => {
  const check = theNextRelease(pair.after, pair.candidateTag)
  const rows = t.client.sqlite.prepare('SELECT data FROM records WHERE id = ?')
  const write = t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?')
  for (const notice of [pair.after, pair.before]) {
    const id = notice.original.id
    const held = (rows.get(id) as { data: string }).data
    const data = JSON.parse(held) as Record<string, unknown>
    for (const writtenIn of [{ project: OTHER }, undefined]) {
      write.run(JSON.stringify({ ...data, writtenIn }), id)
      try {
        expect((await placement(id)).writtenIn).toBe(writtenIn?.project)
        await expect(check()).rejects.toThrow(ORIGINAL)
      } finally { write.run(held, id) }
    }
  }
  await expect(check()).resolves.toMatchObject({ baselineSource: { kind: 'completed-after', after: pair.after.original } })
})

it('refuses a completed upgrade written in another project as this project\'s baseline', async () => {
  const other = await aCompletedUpgrade(OTHER)
  for (const notice of [other.before, other.after]) expect(await placement(notice.original.id)).toEqual({ workspaceId: MESSAGE_CENTRE, writtenIn: OTHER })
  await expect(theNextRelease(other.after, other.candidateTag)()).rejects.toThrow(ORIGINAL)
})
