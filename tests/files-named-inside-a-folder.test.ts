// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** A folder read names current references in this project without changing a record. */
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { apiApp, freshDb, writeDataBypassingTheGate, type TestDb } from './helpers.ts'

/**
 * EACH CASE ASKS ABOUT ITS OWN FOLDER. The door answers about the folder it is given and counts the
 * records that name it, so a folder per case keeps one case's records out of another case's answer
 * while the every-project readings stay every-project.
 */
let folder = '/test-worktrees/one'
let caseNumber = 0
const headers = { 'x-mole-office-workspace': 'default' }

let t: TestDb
let app: FastifyInstance

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(() => {
  caseNumber += 1
  folder = `/test-worktrees/one-case-${String(caseNumber)}`
})

function report(title: string, data: Record<string, unknown>, workspaceId = 'default') {
  const row = t.api.createRecord({ workspaceId, kind: 'report', title, actor: t.api.HUMAN })
  writeDataBypassingTheGate(t, row.id, data)
  return row
}

function ask(path = folder) {
  return app.inject({ method: 'GET', url: `/api/report-files/named-inside?folder=${encodeURIComponent(path)}`, headers })
}

it('returns inside blocks and stored facts, leaving outside, other-machine, deleted and older paths out', async () => {
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'elsewhere', title: 'Another test project' })
  const one = report('The kept report', {
    blocks: [{ id: 'picture', type: 'image', path: `${folder}//./picture.png`, alt: 'A picture' }],
    files: [{ path: `${folder}/facts.txt`, machine: ' ' }],
    nested: { path: `${folder}/on-another-machine.txt`, machine: 'another-machine' },
    unusable: [{ path: `${folder}/sub/../bad.txt` }, { path: 'relative.txt' }, { path: `${folder}/nul\0.txt` }],
  })
  report('A neighbour', { blocks: [{ path: `${folder}-neighbour/picture.png` }] })
  report('Elsewhere', { blocks: [{ path: `${folder}/elsewhere.png` }] }, 'elsewhere')
  const deleted = report('Deleted', { blocks: [{ path: `${folder}/deleted.png` }] })
  t.api.deleteRecord(deleted.id, t.api.HUMAN)
  const older = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: 'An older path',
    data: { summaryBlocks: [{ id: 'old', type: 'image', path: `${folder}/old.png`, alt: 'An older picture' }] }, actor: t.api.HUMAN })
  t.api.patchRecord(older.id, { dataPatch: { summaryBlocks: [{ id: 'now', type: 'text', text: 'The picture was replaced.' }] } }, t.api.HUMAN)

  const reply = await ask(`${folder}//./`)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json()).toMatchObject({ folder, records: [{ id: one.id, kind: 'report', title: one.title, paths: [
    { where: 'data.blocks[#picture].path', path: `${folder}//./picture.png` },
    { where: 'data.files[0].path', path: `${folder}/facts.txt` },
  ] }], leftOut: [], says: `1 readable record lists files inside ${folder}; 1 other live record names the folder or a path inside it; leftOut lists 0 readable records that name it only in places a rule sets aside.` })
  expect(reply.json().scope).toBe('Readable live records in this project name their stored paths. ' +
    'hiddenCount counts the other live records in every project that name this folder or a path inside it, including private messages and prose; no hidden record details are returned. ' +
    'Prose names the folder by its absolute path, or by a relative path of its last segments, such as out/run-one/log.txt or ./out/run-one for a folder ending in out/run-one; its last segment alone names it only when more path follows. ' +
    'leftOut lists each readable record that names the folder only in places a rule sets aside, with those places and the rule. ' +
    'The rules are about a run whose session gives this folder as its working directory, once that run has ended. ' +
    'They set aside its session\'s working directory; its session\'s theCheck.checkout.directory, only when no check was asked of the run (theCheck has no askedOf) or its check is settled: confirmed, closed unchecked or superseded; ' +
    'its seal\'s sealed directory, while a branch of the repository the seal is read in contains the sealed commit; ' +
    'and the start lines about it, starting.cutSays and launcher.says of a worker entry and launcher.says of a next round. ' +
    'Deleted records and older revisions are excluded. ' +
    'When the folder is the top of a git worktree, the door compares each record it lists or counts with the worktree\'s HEAD commit, which comparedWith gives. ' +
    'A folder inside is held by the commit when the commit holds it and nothing untracked or ignored is inside it. ' +
    'In prose, a path that holds a wildcard, ".." or "…", or that could be read as the name of another file in the same folder, is not compared. ' +
    'Each record is put in the first of these classes that fits it: notCompared, it names a path the office could not compare with the commit; ' +
    'anotherPath, it names an untracked or ignored path; aPathNotThere, it names a path that is no longer there; ' +
    'trackedFilesOnly, it names only paths the commit holds, and perhaps the folder itself; theFolderOnly, it names only the folder itself. ' +
    'names gives the class of each listed record, and hiddenCiters counts in each class the records hiddenCount counts. ' +
    'When the door does not compare, comparedWith and hiddenCiters are null, names is left out, and notComparedBecause says why.')
  const empty = await ask('/test-worktrees/empty')
  expect(empty.json()).toMatchObject({ records: [], leftOut: [], says: '0 readable records list files inside /test-worktrees/empty; 0 other live records name the folder or a path inside it; leftOut lists 0 readable records that name it only in places a rule sets aside.' })
})

it('refuses relative, climbing, NUL and missing folders with the folder code', async () => {
  for (const path of ['relative', `${folder}/../two`, `${folder}/bad\0`, '']) {
    const reply = await ask(path)
    expect(reply.statusCode, path).toBe(400)
    expect(reply.json()).toMatchObject({ code: 'reportFilesFolderUnusable', values: {} })
  }
  const absent = await app.inject({ method: 'GET', url: '/api/report-files/named-inside', headers })
  expect(absent.statusCode).toBe(400)
  expect(absent.json().code).toBe('reportFilesFolderUnusable')
})

it('leaves the record count and every record version unchanged', async () => {
  report('A reference to keep', { blocks: [{ path: `${folder}/source.ts` }] })
  const snapshot = () => t.api.listRecords({ workspaceId: 'default', includeDeleted: true })
    .map((row) => ({ id: row.id, version: t.api.versionOf(row) })).sort((a, b) => a.id.localeCompare(b.id))
  const before = snapshot()
  expect(before.length).toBeGreaterThan(0)
  const reply = await ask()
  expect(reply.statusCode, reply.body).toBe(200)
  expect(snapshot()).toEqual(before)
})

it('leaves a message the caller may not read out of the answer', async () => {
  const agents: Record<string, string> = {}
  for (const handle of ['test-sender', 'test-recipient', 'test-stranger']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers,
      payload: { handle, name: handle, role: 'worker' } })
    expect(made.statusCode, made.body).toBe(201)
    agents[handle] = made.json().agent.id as string
  }
  const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'A private file',
    actor: { type: 'agent', id: 'test-sender' },
    data: { body: 'Only the recipient may read this.', to: [{ kind: 'agent', id: agents['test-recipient'] }] } })
  writeDataBypassingTheGate(t, message.id, { ...message.data, pictures: [
    { id: 'private-picture', type: 'image', path: `${folder}/private.png`, alt: 'Private' },
  ] })
  const readAs = (id: string) => app.inject({ method: 'GET', url: `/api/report-files/named-inside?folder=${folder}`,
    headers: { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id } })
  const hidden = await readAs('test-stranger')
  expect(hidden.statusCode, hidden.body).toBe(200)
  expect(hidden.json().records).toEqual([])
  expect(hidden.body).not.toContain(message.id)
  const shown = await readAs('test-recipient')
  expect(shown.statusCode, shown.body).toBe(200)
  expect(shown.json().records).toEqual([{ id: message.id, kind: 'message', title: message.title,
    paths: [{ where: 'data.pictures[#private-picture].path', path: `${folder}/private.png` }] }])
})

it('counts hidden private prose and message-centre references without returning their identities', async () => {
  const agents: Record<string, string> = {}
  for (const handle of ['hidden-sender', 'hidden-recipient', 'hidden-stranger']) {
    const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, role: 'worker' } })
    expect(made.statusCode, made.body).toBe(201); agents[handle] = made.json().agent.id
  }
  const message = t.api.createRecord({ workspaceId: 'default', kind: 'message', title: 'Synthetic private reference', actor: { type: 'agent', id: 'hidden-sender' },
    data: { body: `Synthetic private evidence is in ${folder}/evidence.txt.`, to: [{ kind: 'agent', id: agents['hidden-recipient'] }] } })
  const reply = await app.inject({ method: 'GET', url: `/api/report-files/named-inside?folder=${folder}`,
    headers: { ...headers, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'hidden-stranger' } })
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json()).toMatchObject({ records: [], hiddenCount: 1 })
  for (const secret of [message.id, message.title, 'evidence.txt', agents['hidden-recipient']!]) expect(reply.body).not.toContain(secret)
})

it('counts other-project and replaced live references, excluding deleted records', async () => {
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'hidden-project', title: 'Synthetic hidden project' })
  const other = report('Synthetic other-project prose', { blocks: [{ type: 'text', text: `Kept in ${folder}/other.txt` }] }, 'hidden-project')
  const old = t.api.createRecord({ workspaceId: 'default', kind: 'decision', title: 'Synthetic replaced reference', data: { option_taken: `Use ${folder}/old.txt` }, actor: t.api.HUMAN })
  t.api.createRecord({ workspaceId: 'default', kind: 'decision', title: 'Synthetic replacement', data: { option_taken: 'No file path', replaces: [old.id] }, actor: t.api.HUMAN })
  const deleted = report('Synthetic deleted reference', { path: `${folder}/deleted.txt` }, 'hidden-project'); t.api.deleteRecord(deleted.id, t.api.HUMAN)
  const reply = await ask()
  expect(reply.json()).toMatchObject({ records: [], hiddenCount: 2 })
  for (const secret of [other.id, other.title, old.id, old.title, deleted.id]) expect(reply.body).not.toContain(secret)
})

it('counts a record in another project that writes a letter of the last segment as an escape', async () => {
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'escaped-project', title: 'Synthetic escaped-letter project' })
  const escaped = report('Synthetic escape in another project', {}, 'escaped-project')
  t.client.sqlite.prepare('UPDATE records SET data = ? WHERE id = ?').run(
    JSON.stringify({ text: `Synthetic evidence is in ${folder}/escaped.txt.` }).replace('one', 'on\\u0065'),
    escaped.id,
  )
  const reply = await ask()
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json().hiddenCount, `the escaped record was not counted: ${reply.body}`).toBe(1)
})

it('reads only the records that could name a folder no seeded record names', async () => {
  const asked = '/test-worktrees/a-folder-named-once'
  for (let index = 0; index < 40; index++) {
    report(`Synthetic unrelated report ${String(index)}`, { text: `Synthetic notes, nothing stored under /test-worktrees/another-folder-${String(index)}.` })
  }
  const naming = report('Synthetic folder-naming report', { blocks: [{ id: 'evidence', type: 'image', path: `${asked}/evidence.txt` }] })
  const { theRecordsThatCouldNameIt } = await import('../src/server/api/reportfiles.ts')
  const condition = theRecordsThatCouldNameIt(asked)
  expect(condition, 'the condition the door narrows by').toBeDefined()
  const kept = t.api.listRecords({ workspaceId: t.api.ACROSS_WORKSPACES, includeDeleted: false, alsoWhere: condition })
  expect(kept.map((record) => record.id), `the records kept: ${kept.map((record) => record.title).join(', ')}`).toContain(naming.id)
  expect(kept.length, `the records kept: ${kept.map((record) => record.title).join(', ')}`).toBeLessThan(5)
  const reply = await ask(asked)
  expect(reply.statusCode, reply.body).toBe(200)
  expect(reply.json().records.map((record: { id: string }) => record.id), `the door’s records: ${reply.body}`).toContain(naming.id)
})

it('matches a hidden folder on a path boundary and never counts its neighbour', async () => {
  const { createWorkspace } = await import('../src/server/lib/workspaces.ts')
  createWorkspace({ id: 'boundary-project', title: 'Synthetic boundary project' })
  report('Synthetic boundary paths', { text: `Stored in ${folder}-neighbour/evidence.txt and ${folder}extra/file.txt and ${folder}.txt` }, 'boundary-project')
  expect((await ask()).json()).toMatchObject({ records: [], hiddenCount: 0 })
  report('Synthetic exact folder mention', { text: `Keep ${folder}.` }, 'boundary-project')
  expect((await ask()).json()).toMatchObject({ records: [], hiddenCount: 1 })
})
