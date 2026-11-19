// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OPENCODE CONVERSATION GOES OUT WITH THE PROJECT DATA AND COMES BACK IN ANOTHER OFFICE.
 *
 * OpenCode 1.18.31 keeps its sessions in a SQLite database and reads or writes one session as the JSON
 * `opencode export <session>` prints and `opencode import <file>` accepts. This is a made-up database under a
 * made-up home, never a real OpenCode store and never the owner's home. The office exports its project data, a
 * second office imports that archive, and the copy is restored there and imported into a second made-up
 * OpenCode database. Neither store crosses two real machines.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const SOURCE_DB = 'made-up-source.db'
const TARGET_DB = 'made-up-target.db'
const SESSION = 'ses_madeup_opencode'
const SECRET = 'sk-ABCDEFGHIJKLMNOPQRSTUV'

const home = (name: string): string => mkdtempSync(join(tmpdir(), `conversation-sync-${name}-`))
const oldHome = process.env['HOME']
const oldData = process.env['XDG_DATA_HOME']
const oldDb = process.env['OPENCODE_DB']
let homeA = ''
let homeB = ''
let dataA = ''
let dataB = ''
let checkoutA = ''
let checkoutB = ''
let archive = ''
let t: TestDb
let app: FastifyInstance
let workspace = ''

beforeAll(async () => {
  homeA = home('office-a')
  homeB = home('office-b')
  dataA = join(homeA, 'data')
  dataB = join(homeB, 'data')
  checkoutA = join(homeA, 'project')
  checkoutB = join(homeB, 'project')
  mkdirSync(dataA, { recursive: true })
  mkdirSync(dataB, { recursive: true })
  mkdirSync(checkoutA, { recursive: true })
  mkdirSync(checkoutB, { recursive: true })
  process.env['HOME'] = homeA
  process.env['XDG_DATA_HOME'] = dataA
  process.env['OPENCODE_DB'] = SOURCE_DB

  const source = join(dataA, 'opencode', SOURCE_DB)
  mkdirSync(dirname(source), { recursive: true })
  const db = new Database(source)
  db.exec(`
    CREATE TABLE project (
      id text PRIMARY KEY, worktree text NOT NULL, vcs text, name text, sandboxes text NOT NULL,
      time_created integer NOT NULL, time_updated integer NOT NULL
    );
    CREATE TABLE session (
      id text PRIMARY KEY, project_id text NOT NULL, slug text NOT NULL, directory text NOT NULL,
      title text NOT NULL, version text NOT NULL, agent text, model text,
      cost real DEFAULT 0 NOT NULL, tokens_input integer DEFAULT 0 NOT NULL,
      tokens_output integer DEFAULT 0 NOT NULL, tokens_reasoning integer DEFAULT 0 NOT NULL,
      tokens_cache_read integer DEFAULT 0 NOT NULL, tokens_cache_write integer DEFAULT 0 NOT NULL,
      time_created integer NOT NULL, time_updated integer NOT NULL
    );
    CREATE TABLE message (
      id text PRIMARY KEY, session_id text NOT NULL, time_created integer NOT NULL,
      time_updated integer NOT NULL, data text NOT NULL
    );
    CREATE TABLE part (
      id text PRIMARY KEY, message_id text NOT NULL, session_id text NOT NULL,
      time_created integer NOT NULL, time_updated integer NOT NULL, data text NOT NULL
    );
  `)
  const at = Date.now()
  db.prepare('INSERT INTO project (id, worktree, vcs, name, sandboxes, time_created, time_updated) VALUES (?,?,?,?,?,?,?)').run(
    'prj_madeup',
    checkoutA,
    'git',
    'Made-up project',
    '[]',
    at,
    at,
  )
  db.prepare(
    'INSERT INTO session (id, project_id, slug, directory, title, version, agent, model, time_created, time_updated) VALUES (?,?,?,?,?,?,?,?,?,?)',
  ).run(
    SESSION,
    'prj_madeup',
    'made-up-session',
    checkoutA,
    'Made-up OpenCode run',
    '1.18.31',
    'build',
    JSON.stringify({ id: 'made-up', providerID: 'made-up', modelID: 'made-up' }),
    at,
    at,
  )
  const message = { id: 'msg_madeup', sessionID: SESSION, role: 'user', time: { created: at }, agent: 'build', model: { id: 'made-up', providerID: 'made-up', modelID: 'made-up' } }
  db.prepare('INSERT INTO message (id, session_id, time_created, time_updated, data) VALUES (?,?,?,?,?)').run(
    'msg_madeup',
    SESSION,
    at,
    at,
    JSON.stringify(message),
  )
  const part = {
    id: 'prt_madeup',
    sessionID: SESSION,
    messageID: 'msg_madeup',
    type: 'text',
    text: `The key is ${SECRET} and the folder is ${checkoutA}, under ${homeA}.`,
  }
  db.prepare('INSERT INTO part (id, message_id, session_id, time_created, time_updated, data) VALUES (?,?,?,?,?,?)').run(
    'prt_madeup',
    'msg_madeup',
    SESSION,
    at,
    at,
    JSON.stringify(part),
  )
  db.close()

  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  workspace = 'conversation-sync-opencode'
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    headers: human(),
    payload: { id: workspace, title: 'Conversation sync OpenCode' },
  })
  expect(made.statusCode, made.body).toBe(201)
  const run = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: human(),
    payload: {
      kind: 'session',
      title: 'Made-up OpenCode run',
      data: { state: 'finished', runtime: 'opencode', providerSession: SESSION, workingDirectory: checkoutA },
    },
  })
  expect(run.statusCode, run.body).toBe(201)
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
  if (archive !== '') removeThisTestFolder(archive)
  for (const folder of [homeA, homeB]) if (folder !== '') rmSync(folder, { recursive: true, force: true })
  if (oldHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = oldHome
  if (oldData === undefined) delete process.env['XDG_DATA_HOME']
  else process.env['XDG_DATA_HOME'] = oldData
  if (oldDb === undefined) delete process.env['OPENCODE_DB']
  else process.env['OPENCODE_DB'] = oldDb
})

const human = (): Record<string, string> => ({
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': workspace,
})

const anOpenCodeEnv = (homeFolder: string, data: string, database: string): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: homeFolder, XDG_DATA_HOME: data, OPENCODE_DB: database }
  for (const name of ['OPENCODE', 'OPENCODE_PID', 'OPENCODE_PERMISSION', 'OPENCODE_CONFIG', 'OPENCODE_CONFIG_DIR', 'OPENCODE_CONFIG_CONTENT']) delete env[name]
  return env
}

describe('an OpenCode conversation carried between two offices', () => {
  it('reads the made-up store, exports and imports the project, and restores into a second made-up store', async () => {
    const on = await app.inject({ method: 'POST', url: '/api/conversations/sync', headers: human(), payload: { enabled: true } })
    expect(on.statusCode, on.body).toBe(200)
    const ran = await app.inject({ method: 'POST', url: '/api/conversations/sync/run', headers: human() })
    expect(ran.statusCode, ran.body).toBe(200)
    const outcome = (ran.json() as { outcome: { synced: number; says: string } }).outcome
    expect(outcome.synced, outcome.says).toBe(1)

    const lines = (await app.inject({ method: 'GET', url: '/api/conversations/sync', headers: human() })).json() as {
      conversations: { runId: string; runtime: { word: string; known: boolean }; state: string }[]
    }
    const line = lines.conversations.find((one) => one.state === 'synced')
    expect(line?.runtime).toEqual({ word: 'opencode', known: true })
    const runId = line?.runId as string
    const copyReply = await app.inject({ method: 'GET', url: `/api/conversations/${runId}`, headers: human() })
    expect(copyReply.statusCode, copyReply.body).toBe(200)
    const copy = (copyReply.json() as { copy: { text: string; secretsRemoved: number; pathsMapped: number; source: string } }).copy
    expect(copy.text).toContain('Made-up OpenCode run')
    expect(copy.text).toContain('The key is')
    expect(copy.text).not.toContain(SECRET)
    expect(copy.text).not.toContain(checkoutA)
    expect(copy.text).toContain('<checkout:1>')
    expect(copy.text).toContain('<home>')
    expect(copy.secretsRemoved).toBeGreaterThan(0)
    expect(copy.pathsMapped).toBeGreaterThan(0)
    expect(copy.source).toContain('opencode export')
    const exportedCopy = JSON.parse(copy.text) as { info: { id: string }; messages: { parts: { text: string }[] }[] }
    expect(exportedCopy.info.id).toBe(SESSION)
    expect(exportedCopy.messages[0]?.parts[0]?.text).toContain('<checkout:1>')
    expect(exportedCopy.messages[0]?.parts[0]?.text).toContain('<home>')

    archive = aTestDatabaseFolder('conversation-sync-opencode-archive')
    const exporter = await import('../src/server/lib/export.ts')
    exporter.writeExport(archive)
    const second = await freshDb()
    try {
      const importer = await import('../src/server/lib/import.ts')
      const imported = importer.applyImport(archive)
      expect(imported.applied, JSON.stringify(imported.refusals ?? [])).toBe(true)
      const record = second.api.getRecord(runId)
      expect(record, 'the run did not come back').not.toBeNull()
      const stored = (record?.data as Record<string, unknown>)['conversationSync'] as { text?: string }
      expect(stored.text).toContain('<checkout:1>')
      expect(stored.text).not.toContain(checkoutA)

      const sync = await import('../src/server/lib/conversation-sync.ts')
      sync.setTheConversationSync(workspace, {
        enabled: true,
        paths: [
          { token: '<home>', original: homeA, mapped: homeB },
          { token: '<checkout:1>', original: checkoutA, mapped: checkoutB },
        ],
      })
      const restored = sync.restoreOneConversation(workspace, runId, { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, checkoutB)
      expect(existsSync(restored.installedAt), restored.installedAt).toBe(true)
      expect(restored.installedAt).toContain('opencode')
      expect(restored.folder).toBe(checkoutB)
      expect(restored.command).toContain('opencode import')
      expect(restored.command).toContain('opencode --session')
      const restoredText = readFileSync(restored.installedAt, 'utf8')
      expect(restoredText).not.toContain(checkoutA)
      expect(restoredText).not.toContain('<checkout:1>')
      expect(restoredText).not.toContain(SECRET)
      expect(restoredText).toContain(checkoutB)
      expect(() => JSON.parse(restoredText)).not.toThrow()

      const targetEnv = anOpenCodeEnv(homeB, dataB, TARGET_DB)
      const importedStore = spawnSync('opencode', ['import', restored.installedAt], { cwd: checkoutB, env: targetEnv, encoding: 'utf8', timeout: 30_000 })
      expect(importedStore.status, importedStore.stderr).toBe(0)
      const readBack = spawnSync('opencode', ['export', SESSION], { cwd: checkoutB, env: targetEnv, encoding: 'utf8', timeout: 30_000 })
      expect(readBack.status, readBack.stderr).toBe(0)
      expect(readBack.stdout).toContain(SESSION)
      expect(readBack.stdout).toContain('The key is')
      expect(readBack.stdout).toContain(checkoutB)
      expect(readBack.stdout).not.toContain(SECRET)
    } finally {
      second.close()
    }
  }, 120_000)
})
