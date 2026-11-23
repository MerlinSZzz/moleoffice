// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * MOLE OFFICE READS ITS OWN ID FROM ITS ROW, CRITERION I1.
 *
 * Cases: (1) today's sender; (2) a re-minted sender and the actor of a brought-back line loaded
 * before the re-mint; (3) child-finish and reply reminders each sent once, using two independent
 * live-record duplicate queries; (4) repeat participants migration; (5) the fixed office picture
 * and an ordinary agent's earlier-id generated default; (6) shared office classification and the
 * existing participant read used by the browser; (7) both routed-envelope tools use an id and a
 * malformed successful hold is released as an error; (8) two pool reads see a re-mint between them;
 * (9) a data-folder move notice and an upgrade notice filed after a re-mint are found as originals;
 * (10) the notice tools read the id from the row and refuse a notice whose sender is the handle.
 *
 * Mutations, each after green code and restored green: m1 returns the handle from the row reader;
 * m2 puts the handle in the child-finish duplicate query; m3 removes the migration's handle guard;
 * m4 restores avatarOfferedTo's old equality; m5 compares the handle in isMoleOffice; m6 restores
 * id: me.handle in the dsh hook; m7 captures the remind-me-later actor once at module load;
 * m8 makes the browser loader register the handle in place of the returned id; m10 keeps the pool's
 * office test from module load; m11 treats a malformed successful hold as a normal stop; m12 compares
 * a move notice's sender with the handle; m13 and m14 put the handle in the upgrade history query and
 * in the owner's notice query; m15 compares a tool's notice sender with the handle; m16 lets the
 * tools' id reader return the handle when the row cannot be read.
 * The waiter case executes its real takeOneAndDescribe body with deterministic transport replies.
 */
import { readFileSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { apiApp, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { localStamp } from '../src/shared/time.ts'
import { theLiveSessionTookIt } from '../src/shared/handles.ts'
import { messageBlock } from '../tools/dsh-hooks/office.mjs'
import { theMessageAnAgentReads, quotesOf, theRoutedLineFor, routedOf } from '../src/shared/messages.ts'

import { WHOLE_SUITE_RECEIPT_EXAMPLE } from '../src/shared/whole-suite-receipt.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'

let t: Pick<TestDb, 'api' | 'client' | 'file' | 'close'>
let app: Awaited<ReturnType<typeof apiApp>>['app']
let shared: typeof import('../src/shared/participants.ts')
let registry: typeof import('../src/server/lib/participants.ts')
let groups: typeof import('../src/server/lib/groups.ts')
let later: typeof import('../src/server/lib/remind-me-later.ts')
const owner = { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } as const
const headers = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': owner.id, 'x-mole-office-workspace': 'default' }

beforeEach(async () => {
  vi.resetModules()
  const dir = aTestDatabaseFolder('office-identity')
  const file = join(dir, 'panelx.db')
  process.env.MOLE_OFFICE_DB = file
  const client = await import('../src/server/db/client.ts')
  // Assert before any migration or fixture write, rather than after freshDb has migrated.
  expect(resolve(client.sqlite.name)).toBe(resolve(file))
  const { migrateInPlace } = await import('../src/server/db/migrate.ts')
  migrateInPlace(client.sqlite, resolve('drizzle'))
  const api = await import('../src/server/lib/records.ts')
  t = { client, api, file, close() { client.sqlite.close(); removeThisTestFolder(dir) } }
  shared = await import('../src/shared/participants.ts')
  registry = await import('../src/server/lib/participants.ts')
  groups = await import('../src/server/lib/groups.ts')
  later = await import('../src/server/lib/remind-me-later.ts')
  app = (await apiApp()).app
  await app.ready()
})
afterEach(async () => { await app?.close(); t?.close() })

function officeRow(): { id: string; handle: string; avatar: string } {
  return t.client.sqlite.prepare("SELECT id, handle, avatar_asset_id AS avatar FROM agents WHERE handle = 'mole-office' AND retired = 0").get() as { id: string; handle: string; avatar: string }
}

/** Only this test's synthetic database is re-minted; deferred children follow their parent. */
function remint(oldId = officeRow().id): string {
  const id = registry.newParticipantId()
  expect(id).toMatch(/^[A-Za-z0-9_-]{12}$/)
  const sql = t.client.sqlite
  const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"'
  sql.transaction(() => {
    sql.pragma('defer_foreign_keys = ON')
    sql.prepare('UPDATE agents SET id = ? WHERE id = ?').run(id, oldId)
    const tables = sql.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[]
    for (const table of tables) {
      const keys = sql.prepare(`PRAGMA foreign_key_list(${quote(table.name)})`).all() as { table: string; from: string; to: string }[]
      for (const key of keys) if (key.table === 'agents' && key.to === 'id') {
        sql.prepare(`UPDATE ${quote(table.name)} SET ${quote(key.from)} = ? WHERE ${quote(key.from)} = ?`).run(id, oldId)
      }
    }
  })()
  expect(sql.pragma('foreign_key_check')).toEqual([])
  return id
}
function dataOf(id: string): Record<string, any> { return t.api.getRecord(id)!.data }
function line(): string {
  return groups.writeASystemLineToOne(owner, 'default', SYSTEM_LINES.groupOpened('Synthetic group', 'This is an invented criterion fixture.'), { type: 'system', id: officeRow().id }).id
}
function agent(handle: string): ParticipantRef {
  t.api.createRecord({ workspaceId: 'default', kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' }, actor: t.api.HUMAN })
  return { kind: 'agent', id: (t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ? AND retired = 0').get(handle) as { id: string }).id }
}
/** A registered agent with a role and a running session, as the notice doors require of a writer. */
function keyed(handle: string, role: string) {
  const who = agent(handle)
  t.client.sqlite.prepare('UPDATE agents SET role = ? WHERE id = ?').run(role, who.id)
  const sessionId = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic notice run', data: { servingAgent: who.id, state: 'running', runtime: 'claude-code' }, actor: t.api.HUMAN }).id
  return { type: 'agent' as const, id: who.id, provedBy: 'an-agent-key' as const, keyHolder: who.id, sessionId }
}
async function readTheRoles(): Promise<void> {
  const { readTheRoleCards } = await import('../src/server/lib/roles.ts')
  readTheRoleCards({ guardActKeys: t.api.GOVERNANCE_GUARDS.flatMap(g => [g.actKey, g.personAct]) })
}
function pin(id: string) {
  const row = t.client.sqlite.prepare('SELECT content_hash FROM revisions WHERE record_id = ? AND seq = 1').get(id) as { content_hash: string }
  return { id, seq: 1 as const, contentHash: row.content_hash }
}
/** An ordinary upgrade announcement with its secretary approval and its green receipt. */
function upgradeAnnouncement(writer: ReturnType<typeof keyed>, secretary: ReturnType<typeof keyed>, n: number) {
  const notice = `Synthetic upgrade notice ${n}.`
  const note = t.api.createRecord({ workspaceId: 'default', kind: 'note', title: `Synthetic approval ${n}`, data: { body: notice }, actor: secretary })
  const evidence = t.api.createRecord({ workspaceId: 'default', kind: 'whole_suite_receipt', title: `Synthetic receipt ${n}`, data: { ...WHOLE_SUITE_RECEIPT_EXAMPLE, commit: 'b'.repeat(40) }, actor: writer })
  return { candidateTag: `stable-2026-10-20-identity-${n}`, baselineTag: `identity-baseline-${n}`, fromCommit: 'a'.repeat(40), toCommit: 'b'.repeat(40),
    tree: WHOLE_SUITE_RECEIPT_EXAMPLE.tree, notice, evidence: pin(evidence.id), noticeApproval: pin(note.id) }
}
async function parent(): Promise<{ session: string; who: ParticipantRef }> {
  const who = agent('identity-parent')
  const session = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic parent', data: { state: 'running', runtime: 'claude-code' }, actor: t.api.HUMAN }).id
  const held = await app.inject({ method: 'POST', url: '/api/handles/identity-parent/hold', headers, payload: { session, machine: 'synthetic-machine', runtime: 'claude-code' } })
  expect(held.statusCode, held.body).toBe(201)
  return { session, who }
}

it('1: writes the same sender on today’s data', () => {
  expect(dataOf(line()).sentBy).toEqual({ kind: 'agent', id: officeRow().id })
})
it('2: a loaded reminder writes the re-minted sender and actor without restart', () => {
  const source = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Synthetic reminder source', data: { body: 'Bring this back', to: [owner], lead: { target: { kind: 'page', route: '/messages' } } }, actor: t.api.HUMAN }).id
  const now = new Date()
  t.client.sqlite.prepare('UPDATE message_delivery SET remind_at = ? WHERE message_id = ?').run(localStamp(new Date(now.getTime() - 60_000)), source)
  const before = (t.client.sqlite.prepare('SELECT max(rowid) AS n FROM records').get() as { n: number }).n
  const id = remint()
  expect(dataOf(line()).sentBy).toEqual({ kind: 'agent', id })
  const brought = later.bringBackTheMessagesThatAreDue(now)
  expect(brought.failed).toEqual([])
  expect(brought.back).toHaveLength(1)
  const written = brought.back[0]!.line
  expect(dataOf(written).sentBy).toEqual({ kind: 'agent', id })
  expect(t.client.sqlite.prepare("SELECT actor_id AS id FROM changes WHERE record_id = ? AND op = 'create'").get(written)).toEqual({ id })
  const newRows = t.client.sqlite.prepare('SELECT data FROM records WHERE rowid > ?').all(before) as { data: string }[]
  expect(newRows.length).toBeGreaterThan(0)
  const storedIds = (value: unknown): unknown[] => value !== null && typeof value === 'object' ? Object.entries(value).flatMap(([key, val]) => key === 'id' ? [val] : storedIds(val)) : []
  for (const row of newRows) expect(storedIds(JSON.parse(row.data))).not.toContain('mole-office')
})
it('3: child-finish and reply notices each find their first live message after re-mint', async () => {
  const p = await parent()
  const child = t.api.createRecord({ workspaceId: 'default', kind: 'session', title: 'Synthetic child', data: { state: 'running', runtime: 'claude-code', parentAttachment: p.session }, actor: t.api.HUMAN }).id
  const worker = await import('../src/server/lib/worker.ts')
  const reply = await import('../src/server/lib/reply-reminder.ts')
  const id = remint()
  const by = { type: 'system', id } as const
  expect(worker.tellTheParentAChildFinished(child, by).written).toBe(true)
  const first = t.client.sqlite.prepare("SELECT data FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ?").get(child) as { data: string }
  expect(JSON.parse(first.data).sentBy).toEqual({ kind: 'agent', id })
  expect(worker.tellTheParentAChildFinished(child, by).written).toBe(false)
  const asked = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Synthetic unanswered question', data: { body: 'Please answer this invented question', to: [p.who] }, actor: t.api.HUMAN }).id
  const since = new Date(Date.now() - 60_000)
  t.client.sqlite.prepare("UPDATE message_delivery SET mark = 'seen', because = ?, at = ? WHERE message_id = ? AND recipient_id = ?").run(theLiveSessionTookIt(p.session), localStamp(new Date()), asked, p.who.id)
  const now = new Date(Date.now() + 24 * 60 * 60_000)
  expect(reply.sendTheReplyRemindersThatAreDue('default', now, since, by)).toEqual([asked])
  expect(reply.sendTheReplyRemindersThatAreDue('default', now, since, by)).toEqual([])
  expect((t.client.sqlite.prepare("SELECT count(*) AS n FROM records WHERE kind = 'message' AND json_extract(data, '$.aboutRun') = ?").get(child) as { n: number }).n).toBe(1)
})
it('4: a repeated participants migration keeps exactly the re-minted live row', async () => {
  const id = remint()
  const { migrateParticipants } = await import('../src/server/db/participants-migration.ts')
  expect(() => migrateParticipants(t.client.sqlite)).not.toThrow()
  expect(t.client.sqlite.prepare("SELECT id FROM agents WHERE handle = 'mole-office' AND retired = 0").all()).toEqual([{ id }])
})
it('5: the office keeps its picture and an earlier-id drawn default is still offered', async () => {
  const avatars = await import('../src/server/lib/avatars.ts')
  const before = officeRow()
  const pageBefore = await app.inject({ method: 'GET', url: '/api/participants/agent/mole-office', headers })
  expect(pageBefore.statusCode).toBe(200)
  const faceBefore = await app.inject({ method: 'GET', url: pageBefore.json().participant.avatarUrl, headers })
  expect(faceBefore.statusCode).toBe(200)
  const ordinary = agent('identity-picture')
  const drawing = shared.defaultAvatarAssetId(ordinary)
  t.client.sqlite.prepare('UPDATE agents SET avatar_asset_id = ? WHERE id = ?').run(drawing, ordinary.id)
  const drawingBefore = await app.inject({ method: 'GET', url: shared.avatarUrlFor(drawing), headers })
  expect(drawingBefore.statusCode).toBe(200)
  const ordinaryId = remint(ordinary.id)
  const id = remint()
  expect(officeRow()).toEqual({ ...before, id })
  const pageAfter = await app.inject({ method: 'GET', url: '/api/participants/agent/mole-office', headers })
  expect(pageAfter.statusCode, pageAfter.body).toBe(200)
  expect(pageAfter.json().participant.avatarUrl).toBe(pageBefore.json().participant.avatarUrl)
  const faceAfter = await app.inject({ method: 'GET', url: pageAfter.json().participant.avatarUrl, headers })
  expect(faceAfter.statusCode).toBe(faceBefore.statusCode)
  expect(faceAfter.headers['content-type']).toBe(faceBefore.headers['content-type'])
  expect(faceAfter.rawPayload.equals(faceBefore.rawPayload)).toBe(true)
  const drawingAfter = await app.inject({ method: 'GET', url: shared.avatarUrlFor(drawing), headers })
  expect(drawingAfter.statusCode).toBe(drawingBefore.statusCode)
  expect(drawingAfter.headers['content-type']).toBe(drawingBefore.headers['content-type'])
  expect(drawingAfter.rawPayload.equals(drawingBefore.rawPayload)).toBe(true)
  expect(avatars.avatarOfferedTo({ kind: 'agent', id }, before.avatar, avatars.avatarsOnOffer())).toBeNull()
  expect(avatars.avatarOfferedTo({ kind: 'agent', id: ordinaryId }, drawing, avatars.avatarsOnOffer())).toMatchObject(avatars.THE_DEFAULT_PICTURE)
  expect(avatars.avatarOfferedTo({ kind: 'agent', id: ordinaryId }, 'avatar-default-agent-unproved', avatars.avatarsOnOffer())).toBeNull()
})
it('6: the shared comparison and existing browser read recognise the row’s minted id', async () => {
  const other = agent('identity-other')
  const id = remint()
  expect(shared.isMoleOffice({ kind: 'agent', id })).toBe(true)
  expect(shared.isMoleOffice(other)).toBe(false)
  expect(shared.isMoleOffice({ kind: 'person', id })).toBe(false)
  const page = await app.inject({ method: 'GET', url: '/api/participants/agent/mole-office', headers })
  expect(page.statusCode, page.body).toBe(200)
  expect(page.json().participant.id).toBe(id)
  const { loadMoleOfficeId } = await import('../src/web/lib/mole-office.ts')
  await loadMoleOfficeId(async () => page.json())
  expect(shared.isMoleOffice({ kind: 'agent', id })).toBe(true)
  expect(shared.isMoleOffice({ kind: 'agent', id: 'mole-office' })).toBe(false)
})
it('7: both tool envelopes route to the id of an agent whose handle differs', async () => {
  const me = { id: 'aB3dE6gH9jKl', handle: 'identity-route' }
  const routed = [{ for: { kind: 'agent', id: 'missing-agent' }, because: 'Synthetic route', to: { kind: 'agent', id: me.id }, passedOver: [], line: 'This synthetic message was routed to the starter.' }]
  const message = { id: 'message-route', body: 'Synthetic words', routed }
  expect.soft(messageBlock(message, me)).toContain(routed[0]!.line)
  const source = readFileSync(new URL('../for-agents/hold-the-handle.mjs', import.meta.url), 'utf8')
  const start = source.indexOf('async function takeOneAndDescribe(')
  const end = source.indexOf('\n}\n', start) + 2
  expect(start).toBeGreaterThan(0)
  const ask = async () => ({ status: 200, body: { whoSentIt: 'Synthetic sender' } })
  const read = async (path: string) => path.startsWith('/api/records/') ? { status: 200, body: { record: { data: message } } } : { status: 200, body: {} }
  const run = new Function('AGENT', 'SESSION', 'theHeldAgent', 'ask', 'askWithRetries', 'whereThePicturesAre', 'theRoutedLineFor', 'theMessageAnAgentReads', 'quotesOf', 'routedOf', source.slice(start, end) + '\nreturn takeOneAndDescribe("message-route", false)')
  const described = await run(me.handle, 'session-route', { kind: 'agent', id: me.id }, ask, read, () => null, theRoutedLineFor, theMessageAnAgentReads, quotesOf, routedOf)
  expect(described.routedLine).toBe(routed[0]!.line)
  const releaseStart = source.indexOf('async function letGo(')
  const releaseEnd = source.indexOf('\n}\n', releaseStart) + 2
  const guardStart = source.indexOf('// THE HOLD HAS ANSWERED.')
  const guardEnd = source.indexOf('if (stopAfterHold !== null)', guardStart)
  expect(releaseStart).toBeGreaterThan(0)
  expect(guardEnd).toBeGreaterThan(guardStart)
  const releases: { path: string; body: unknown }[] = []
  let ended: { code: number; outcome: string } | undefined
  const malformed = new Function('ask', 'process', 'writeThenExit', `return (async () => {
    const AGENT = 'identity-route', SESSION = 'session-route', AGAIN = false, held = { body: { hold: {} } }
    let lettingGo = false, leaving = false, takingHold = true, stopAfterHold = null
    ${source.slice(releaseStart, releaseEnd)}
    ${source.slice(guardStart, guardEnd)}
  })()`)
  await expect(malformed(async (path: string, options: { body: string }) => {
    releases.push({ path, body: JSON.parse(options.body) })
    return { status: 200 }
  }, { stdout: { write() {} }, stderr: { write() {} } }, async (code: number, outcome: string) => {
    ended = { code, outcome }
    throw new Error('synthetic exit')
  })).rejects.toThrow('synthetic exit')
  expect(releases).toEqual([{ path: '/api/handles/identity-route/release', body: { session: 'session-route', because: 'the office did not name the held agent by id' } }])
  expect(ended).toEqual({ code: 1, outcome: 'error: the office did not name the held agent by id' })
})

it('8: a second pool read sorts the office’s new id after a re-mint', async () => {
  const messages = await import('../src/server/lib/messages.ts')
  const other = agent('identity-pool')
  const question = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Synthetic pool question', data: { body: 'An invented question', to: [other] }, actor: t.api.HUMAN }).id
  const notice = () => groups.writeASystemLineToOne(owner, 'default', SYSTEM_LINES.groupOpened('Synthetic pool notice', 'This is an invented pool fixture.'), { type: 'system', id: officeRow().id }, { message: question }).id
  const firstId = officeRow().id
  const directBefore = line()
  const aboutBefore = notice()
  const read = () => messages.theConversationsOfOnePool(messages.everyMessageOfTheProjects(messages.EVERY_PROJECT))
  const first = read()
  expect(first.between({ kind: 'agent', id: firstId }, owner).map(one => one.id)).toContain(directBefore)
  expect(first.between(owner, other).map(one => one.id)).toContain(aboutBefore)
  const id = remint()
  const directAfter = line()
  const aboutAfter = notice()
  const second = read()
  expect(second.between({ kind: 'agent', id }, owner).map(one => one.id)).toContain(directAfter)
  expect(second.between({ kind: 'agent', id: firstId }, owner).map(one => one.id)).not.toContain(directAfter)
  expect(second.between(owner, other).find(one => one.id === aboutAfter)?.sentBy).toEqual({ kind: 'agent', id })
})
it('9: a re-minted office files and finds its own move notice and upgrade notice', async () => {
  await readTheRoles()
  const writer = keyed('identity-notice-writer', 'worker'), secretary = keyed('identity-notice-secretary', 'secretary')
  const id = remint()
  const move = await import('../src/server/lib/stable-bootstrap-authority.ts')
  const upgrade = await import('../src/server/lib/stable-upgrade-notices.ts')
  const { dataFolderMoveBeforeText } = await import('../src/shared/stable-bootstrap-notices.ts')
  const scope = { version: 1 as const, action: 'stop-to-move-the-data-folder' as const, database: '/fixture/checkout/data/invented.db', checkout: '/fixture/checkout',
    port: 29991, targetFolder: '/fixture/private-data', targetMode: '700' as const, backup: { path: '/fixture/backup.db', sha256: Buffer.alloc(32, 7).toString('base64') } }
  const words = 'Made-up owner approves ' + JSON.stringify(scope), title = 'Made-up move approval'
  const said = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Made-up words', data: { body: words, to: [{ kind: 'agent', id: secretary.id }] }, actor: { ...t.api.HUMAN, provedBy: 'the-person-key' } })
  const decision = t.api.createRecord({ workspaceId: 'default', kind: 'decision', title, data: { decided_by: THE_TEST_OFFICES_OWNER.id, authority: 'the owner said so', authority_reference: said.id, because: words, extra: { stableBootstrapStop: scope } },
    actor: { ...secretary, warrant: { saidBy: THE_TEST_OFFICES_OWNER.id, words, where: 'message:' + said.id, when: localStamp(new Date()), for: [title] } } })
  const request = { scope, decision: pin(decision.id), sendId: 'identity-move' }
  const reserved = move.reserveDataFolderMoveAuthority('default', request, writer)
  const before = { kind: 'data-folder-move', stage: 'before', sendId: 'identity-move-before', announcement: { scope, decision: request.decision, reservation: reserved.reservation,
    evidence: request.decision, moveSendId: request.sendId, notice: dataFolderMoveBeforeText(scope) } }
  const moved = move.fileDataFolderMoveNotice('default', before, writer, () => ({ database: scope.database, repository: scope.checkout, port: scope.port, commit: 'a'.repeat(40) }))
  expect(moved.content.data.sentBy).toEqual({ kind: 'agent', id })
  expect(move.lookupDataFolderMoveNotice('default', before.sendId, writer)?.notice.original).toEqual(moved.original)
  expect(upgrade.hasOriginalUpgradeNoticeForOwner(owner.id, 'default')).toBe(true)
  const announcement = upgradeAnnouncement(writer, secretary, 1)
  const sent = upgrade.fileStableUpgradeNotice('default', { stage: 'before', sendId: 'identity-upgrade-before', announcement }, writer,
    () => ({ commit: announcement.fromCommit, repository: '/fixture/checkout', database: t.file, port: 29992 }))
  expect(sent.content.data.sentBy).toEqual({ kind: 'agent', id })
  expect(upgrade.lookupStableUpgradeNotice('default', 'identity-upgrade-before', writer).notice?.original).toEqual(sent.original)
  expect(upgrade.stableUpgradeHistory('default').entries.map(one => one.before)).toEqual([sent.original])
  expect(upgrade.hasOriginalUpgradeNoticeForOwner(owner.id, 'default')).toBe(true)
})

it('10: the notice tools read the office’s id from its row and refuse the handle as its sender', async () => {
  await readTheRoles()
  const writer = keyed('identity-tool-writer', 'worker'), secretary = keyed('identity-tool-secretary', 'secretary')
  const id = remint()
  const upgrade = await import('../src/server/lib/stable-upgrade-notices.ts')
  const tool = await import('../tools/stable/stable-upgrade-notices.mjs')
  const { versionOf } = await import('../src/server/lib/version.ts')
  const announcement = upgradeAnnouncement(writer, secretary, 2)
  const request = { stage: 'before' as const, sendId: 'identity-tool-before', announcement }
  const asked: string[] = []
  const reply = (status: number, body: string) => ({ status, body, cut: false, location: null })
  const transport = (read: (path: string) => Promise<ReturnType<typeof reply>>) => Object.assign(async (ask: { method: string; path: string; body?: unknown }) => {
    asked.push(`${ask.method} ${ask.path}`)
    if (ask.method === 'GET') return read(ask.path)
    const filed = upgrade.fileStableUpgradeNotice('default', ask.body, writer, () => ({ commit: announcement.fromCommit, repository: '/fixture/checkout', database: t.file, port: 29992 }))
    return reply(filed.replayed ? 200 : 201, JSON.stringify(filed))
  }, { identity: { agent: writer.id, session: writer.sessionId, project: 'default' } })
  const throughTheOffice = transport(async path => { const got = await app.inject({ method: 'GET', url: path, headers }); return reply(got.statusCode, got.body) })
  const folder = aTestDatabaseFolder('office-identity-journal')
  try {
    const journal = join(realpathSync(folder), 'notice.jsonl')
    const input = { api: 'http://fixture.invalid', request, serving: { commit: announcement.toCommit, repository: '/fixture/checkout', database: t.file, port: 29992 }, afterSendId: 'identity-tool-after', timeoutMs: 1000 }
    const filed = await tool.announceUpgrade({ ...input, path: journal }, { officeRequest: throughTheOffice })
    expect(asked).toEqual(['GET /api/participants/agent/mole-office', 'POST /api/office/upgrades/notice'])
    const receipt = readFileSync(journal, 'utf8').trim().split('\n').map(row => JSON.parse(row)).find(row => row.step === 'before-filed').receipt
    expect(receipt.original).toEqual(filed)
    expect(receipt.content.data.sentBy).toEqual({ kind: 'agent', id })
    const forged = structuredClone(receipt)
    forged.content.data.sentBy = { kind: 'agent', id: 'mole-office' }
    forged.original.contentHash = versionOf(forged.content)
    expect(tool.verifyNoticeReply(reply(201, JSON.stringify(forged)), request, 'default', 'mole-office').original).toEqual(forged.original)
    expect(() => tool.verifyNoticeReply(reply(201, JSON.stringify(forged)), request, 'default', id)).toThrow('does not prove the original system message')
    asked.length = 0
    const unread = transport(async () => reply(404, '{"error":"Synthetic missing row"}'))
    await expect(tool.announceUpgrade({ ...input, path: join(realpathSync(folder), 'unread.jsonl') }, { officeRequest: unread })).rejects.toThrow('registry row could not be read')
    expect(asked).toEqual(['GET /api/participants/agent/mole-office'])
  } finally { removeThisTestFolder(folder) }
})
