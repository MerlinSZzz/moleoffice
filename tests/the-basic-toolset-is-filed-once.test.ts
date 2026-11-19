// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BASIC TOOLSET IS FILED ONCE, WHOLE, AND NEVER MAKES A PLANNED TOOL LOOK BUILT.
 *
 * tools/file-the-basic-toolset.mjs files the first categories and entries of the toolset catalogue
 * (report i69HYz8BQhSx, blocks b-2 and b-4 to b-7) into one project through POST /api/records. This
 * file runs the real command against a test office, apiApp listening on a free port of its own. It
 * never talks to the live office.
 *
 * What it proves:
 *   - the first run files every category and every entry, and a second run skips all of it and
 *     files nothing;
 *   - every filed tool has its ten items, nothing on it is incomplete, and it carries its label;
 *   - every entry marked built names a file that exists in this checkout;
 *   - every door a page on a part of the office names is a door the office serves.
 */

import { spawn } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { CATEGORIES, ENTRIES } from '../tools/file-the-basic-toolset.mjs'
import { MANUAL_ITEMS } from '../src/shared/toolset.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { apiApp, freshDb, type TestDb } from './helpers.ts'

const TOOL = new URL('../tools/file-the-basic-toolset.mjs', import.meta.url).pathname
const HANDLE = 'toolset-filer'
const AS_AGENT = {
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': HANDLE,
  'x-mole-office-workspace': 'default',
}

let t: TestDb
let app: FastifyInstance
let api = ''
let run = ''

interface Ran {
  status: number | null
  stdout: string
  stderr: string
}

/** The filer as a child, asynchronously, so this process can answer its requests while it runs. */
function theFiler(): Promise<Ran> {
  return new Promise((done) => {
    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const name of ['MOLE_OFFICE_API', 'MOLE_OFFICE_WORKSPACE', 'MOLE_OFFICE_SESSION', 'MOLE_OFFICE_AGENT', 'MOLE_AGENT_KEY']) delete env[name]
    const child = spawn(process.execPath, [TOOL, '--api', api, '--workspace', 'default', '--as', HANDLE, '--session', run], { env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += String(chunk)))
    child.stderr.on('data', (chunk) => (stderr += String(chunk)))
    child.on('close', (status) => done({ status, stdout, stderr }))
  })
}

async function get(url: string): Promise<Record<string, unknown>> {
  const res = await app.inject({ method: 'GET', url, headers: AS_AGENT })
  expect(res.statusCode, res.body.slice(0, 400)).toBe(200)
  return res.json() as Record<string, unknown>
}

const count = (kind: string): number =>
  (t.client.sqlite.prepare('SELECT count(*) AS n FROM records WHERE kind = ? AND deleted_at IS NULL').get(kind) as { n: number }).n

let first: Ran
let second: Ran
let afterFirst: { categories: number; tools: number }

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as { port: number }).port)}`
  const registered = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id },
    payload: { handle: HANDLE, name: 'Toolset filer', role: 'worker' },
  })
  expect(registered.statusCode, registered.body).toBe(201)
  run = t.api.createRecord({
    workspaceId: 'default',
    kind: 'session',
    title: 'The run that files the toolset',
    data: { state: 'running' },
    actor: { type: 'agent', id: HANDLE },
  }).id
  first = await theFiler()
  afterFirst = { categories: count('tool_category'), tools: count('tool') }
  second = await theFiler()
}, 120_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('tools/file-the-basic-toolset.mjs', () => {
  it('files every category and every entry, and a second run skips all of it', () => {
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0)
    expect(first.stdout).toContain(`Filed ${String(CATEGORIES.length + ENTRIES.length)}:`)
    expect(afterFirst).toEqual({ categories: CATEGORIES.length, tools: ENTRIES.length })

    expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(0)
    expect(second.stdout).toContain('Filed 0:')
    expect(second.stdout).toContain(`Skipped ${String(CATEGORIES.length + ENTRIES.length)}:`)
    expect({ categories: count('tool_category'), tools: count('tool') }).toEqual(afterFirst)
  })

  it('files the categories as proposed when no decision is named', async () => {
    const list = await get('/api/toolset')
    const categories = list['categories'] as { name: string; confirmed: boolean }[]
    expect(categories.map((one) => one.name).sort()).toEqual(CATEGORIES.map((one) => one.name).sort())
    for (const category of categories) expect(category.confirmed, category.name).toBe(false)
  })

  it('gives every filed tool its ten items, with nothing incomplete', async () => {
    for (const entry of ENTRIES) {
      const page = await get(`/api/toolset/${entry.data.slug}`)
      expect(page['incomplete'], entry.data.slug).toEqual([])
      // AND ITS NAME AT READING LEVEL 1, written in the same run (chapter 10, rule 3).
      const stored = t.api.getRecord((page['tool'] as { id: string }).id)?.data as { shortForms?: { label?: { text?: string } } }
      expect(stored.shortForms?.label?.text, entry.data.slug).toBe(entry.label)
      const items = page['items'] as { n: number; holds: Record<string, unknown> }[]
      expect(items.map((item) => item.n)).toEqual(MANUAL_ITEMS.map((item) => item.n))
      for (const item of items) {
        for (const [key, value] of Object.entries(item.holds)) {
          if (key === 'copyOf') continue
          if (key === 'category' && entry.category === null) {
            expect(value, `${entry.data.slug}: a page on a part of the office names no category`).toBeNull()
            continue
          }
          expect(typeof value === 'string' && value.trim() !== '', `${entry.data.slug}: item ${String(item.n)}, ${key}`).toBe(true)
        }
      }
    }
  })

  it('names, for every entry marked built, a file that exists in this checkout', async () => {
    const list = await get('/api/toolset')
    const rows = [
      ...(list['categories'] as { tools: Record<string, unknown>[] }[]).flatMap((one) => one.tools),
      ...(list['withoutACategory'] as Record<string, unknown>[]),
      ...(list['partsOfTheOffice'] as Record<string, unknown>[]),
    ]
    expect(rows.length).toBe(ENTRIES.length)
    const built = rows.filter((row) => row['state'] === 'built')
    expect(built.length).toBeGreaterThan(0)
    for (const row of built) {
      expect(row['kept'], String(row['slug'])).toBe('in this repository')
      expect(row['locationFound'], `${String(row['slug'])} names ${String(row['location'])}`).toBe(true)
    }
  })

  it('names, on every page about a part of the office, only doors the office serves', async () => {
    const index = await get('/api')
    const served = new Set<string>()
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk)
      else if (value !== null && typeof value === 'object') {
        const one = value as Record<string, unknown>
        if (typeof one['method'] === 'string' && typeof one['path'] === 'string') served.add(`${one['method']} ${one['path']}`)
        Object.values(one).forEach(walk)
      }
    }
    walk(index)
    expect(served.size).toBeGreaterThan(100)
    for (const entry of ENTRIES.filter((one) => one.category === null)) {
      const named = [...String(entry.data.howToCall).matchAll(/\b(GET|POST|PATCH|PUT|DELETE) (\/api\/[^\s;,]+)/g)].map((m) => `${m[1]} ${m[2]}`)
      expect(named.length, entry.data.slug).toBeGreaterThan(0)
      for (const door of named) expect(served.has(door), `${entry.data.slug} names ${door}`).toBe(true)
    }
  })
})
