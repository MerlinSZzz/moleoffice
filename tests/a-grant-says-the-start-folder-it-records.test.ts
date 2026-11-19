// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WAITING REGISTRATION KEEPS ITS NOTES FOLDER THROUGH THE PRESS, AND THE PRESS SAYS THE START FOLDER
 * IT RECORDS. Problems llG6MnA7sSz0 and xHp5rKVKkXRP.
 *
 * With the one-version window closed, a session that registers itself waits for the person's press.
 * What it said about itself is kept on the waiting row, and their press writes it on the agent record.
 * This file measures three things on the real server:
 *
 *   · `tools/register-myself.mjs --notes`, run as a process, reaches the agent record through the
 *     press; a relative folder is refused at the door, before a waiting row is written;
 *   · a waiting registration with a start folder: the waiting item and the admit-agent act say the
 *     press also records it, and the grant's note says it is recorded, in the one shared sentence;
 *   · without a start folder, none of the three says anything about one.
 *
 * MUTATIONS, each after a control run: leave the folder sentence out of the grant's note (red: the
 * third case); drop the door's `checkAgentNotes` call (red: the relative folder is written as a
 * waiting row).
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'register-myself.mjs')

/** A long folder that is neither the root nor a home, so an agent may register it. */
const FOLDER = '/tmp/mole-office-grant-folder-test/a-rather-long-folder-where-this-agents-own-sessions-start'

const AS_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

/** The words every one of the three places says about what a start folder does, for agent `h`, read from the one place that writes them. */
let whatItDoes: (h: string) => string

let t: TestDb
let app: FastifyInstance
let here = ''
let dir = ''

beforeAll(async () => {
  t = await freshDb()
  whatItDoes = (await import('../src/server/lib/selfregistration.ts')).whatAStartFolderDoes
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  here = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  dir = mkdtempSync(join(tmpdir(), 'mole-office-grant-folder-'))
  // THE WINDOW CLOSED, through its one writer, so every registration in this file waits for a press.
  const kw = await import('../src/server/lib/keywindow.ts')
  kw.closeTheKeyWindow({ kind: 'person', id: THE_PERSON })
})

afterAll(async () => {
  await app.close()
  t.close()
  rmSync(dir, { recursive: true, force: true })
})

/**
 * Run the real tool against this file's server. Asynchronously, because the server is in this process
 * and a synchronous child would stop it answering.
 */
function runTheTool(args: string[]): Promise<{ code: number | null; json: Record<string, unknown>; said: string }> {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: dir }
  delete env['MOLE_OFFICE_API']
  delete env['MOLE_OFFICE_WORKSPACE']
  delete env['MOLE_OFFICE_SESSION']
  delete env['MOLE_OFFICE_AGENT']
  return new Promise((ok) => {
    const child = spawn(process.execPath, [TOOL, ...args, '--workspace', 'default', '--api', here, '--json'], {
      cwd: REPO,
      env,
    })
    let out = ''
    let err = ''
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()))
    child.stderr.on('data', (chunk: Buffer) => (err += chunk.toString()))
    child.on('close', (code) => {
      let json: Record<string, unknown> = {}
      try {
        json = JSON.parse(out) as Record<string, unknown>
      } catch {
        json = {}
      }
      ok({ code, json, said: `${out}${err}` })
    })
  })
}

async function registerMyself(body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await fetch(`${here}/api/agents/register-myself`, {
    method: 'POST',
    headers: asAgent(String(body['handle'])),
    body: JSON.stringify(body),
  })
  const text = await res.text()
  return { status: res.status, json: JSON.parse(text) as Record<string, unknown>, text }
}

async function grant(requestId: string): Promise<{ status: number; json: Record<string, unknown>; text: string }> {
  const res = await app.inject({ method: 'POST', url: `/api/roles/requests/${requestId}/grant`, headers: AS_PERSON, payload: {} })
  return { status: res.statusCode, json: res.json() as Record<string, unknown>, text: res.body }
}

async function dataOf(recordId: string): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url: `/api/records/${recordId}`, headers: AS_PERSON })
  expect(res.statusCode, res.body.slice(0, 300)).toBe(200)
  return (res.json() as { record: { data: Record<string, unknown> } }).record.data
}

/** What the person reads about one waiting row before they press: the waiting item and the act. */
async function whatTheyReadAbout(requestId: string): Promise<{ item: string; act: string }> {
  const waiting = await app.inject({ method: 'GET', url: '/api/waiting', headers: AS_PERSON })
  expect(waiting.statusCode, waiting.body.slice(0, 300)).toBe(200)
  const item = (waiting.json() as { items: { id: string }[] }).items.find((one) => one.id === requestId)
  expect(item, `no waiting item for ${requestId}`).toBeDefined()
  const needs = await app.inject({ method: 'GET', url: '/api/needs-you', headers: AS_PERSON })
  expect(needs.statusCode, needs.body.slice(0, 300)).toBe(200)
  const act = (needs.json() as { actions: { recordId: string; act: string; because: string }[] }).actions.find(
    (one) => one.recordId === requestId,
  )
  expect(act?.act).toBe('admit-agent')
  return { item: JSON.stringify(item), act: String(act?.because) }
}

describe('a waiting registration keeps its notes folder through the press', () => {
  it('register-myself --notes waits, and the press writes the folder on the agent record', async () => {
    const notes = join(dir, 'notes of the waiting one')
    const run = await runTheTool(['--handle', 'gf-notes', '--name', 'Notes while waiting', '--dir', dir, '--notes', notes])
    expect(run.code, run.said).toBe(0)
    expect(run.json['waiting'], run.said).toBe(true)
    const granted = await grant(String(run.json['request']))
    expect(granted.status, granted.text).toBe(201)
    expect((await dataOf(String(granted.json['agentRecord'])))['notes']).toBe(notes)
  })

  it('refuses a relative notes folder at the door, before any waiting row is written', async () => {
    const said = await registerMyself({ handle: 'gf-relative', name: 'Relative notes', workingDirectory: dir, notes: 'my-notes' })
    expect(said.status, said.text).toBe(400)
    expect(String(said.json['error'])).toContain('"notes" is "my-notes", which is not an absolute path.')
    const rows = t.client.sqlite
      .prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'role_request' AND title = ?")
      .get('gf-relative registers itself') as { n: number }
    expect(rows.n).toBe(0)
  })
})

describe('the press says the start folder it records', () => {
  it('says it in the waiting item, the admit-agent act and the grant note, and the reply names it', async () => {
    const h = 'gf-folder'
    const said = await registerMyself({ handle: h, name: 'With a start folder', workingDirectory: dir, startFolder: FOLDER })
    expect(said.status, said.text).toBe(202)
    const requestId = String(said.json['request'])

    const before = `Admitting it also records "${FOLDER}" as its start folder. ${whatItDoes(h)}`
    const read = await whatTheyReadAbout(requestId)
    expect(read.item).toContain(JSON.stringify(before).slice(1, -1))
    expect(read.act).toContain(before)

    const granted = await grant(requestId)
    expect(granted.status, granted.text).toBe(201)
    expect(String(granted.json['note'])).toContain(`"${FOLDER}" is recorded as its start folder. ${whatItDoes(h)}`)
    expect(granted.json['startFolder']).toBe(FOLDER)
    expect((await dataOf(String(granted.json['agentRecord'])))['startFolder']).toBe(FOLDER)
  })

  it('says nothing about a start folder when the registration names none', async () => {
    const h = 'gf-no-folder'
    const said = await registerMyself({ handle: h, name: 'Made-up agent with no folder', workingDirectory: dir })
    expect(said.status, said.text).toBe(202)
    const requestId = String(said.json['request'])

    const read = await whatTheyReadAbout(requestId)
    expect(read.item).not.toContain('start folder')
    expect(read.act).not.toContain('start folder')
    expect(read.act).not.toContain('start hook')

    const granted = await grant(requestId)
    expect(granted.status, granted.text).toBe(201)
    expect(String(granted.json['note'])).not.toContain('start folder')
    expect(String(granted.json['note'])).not.toContain('start hook')
    expect(granted.json['startFolder']).toBeNull()
  })
})
