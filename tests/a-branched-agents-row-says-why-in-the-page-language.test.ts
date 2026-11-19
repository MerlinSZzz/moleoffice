// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A BRANCHED AGENT'S ROW ON ALL RECORDS SAYS WHY IT WAS STARTED IN THE PAGE'S LANGUAGE, NAMING THE OLD AGENT.
 * Row 55 of report rFBoQG6mAEI0, settled by looking at the All records page in round 44.
 *
 * The agent's own page drew the sentence from `data.branchedFrom` in the page's language since wave 13k's round 39
 * (tests/a-branched-agent-says-why-in-the-page-language.test.ts). Its row on All records still drew the English the
 * server stores, naming the old agent by its bare handle, on a Chinese page too. `summaryOnARow` in
 * src/web/pages/RecordsPage.tsx now asks the same reader the record page asks.
 *
 * WHAT IS CLAIMED:
 *
 *   4. Developer mode draws the stored English.
 *
 * MADE-UP RECORDS, in a fresh test database: an old agent, and two agents branched from it.
 *
 * WHAT WOULD MAKE EACH CASE GO RED
 *   developer mode draws the page's sentence too               → case 4
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theStoredBranchedSummary } from '../src/shared/branched-agent.ts'
import type { PanelRecord } from '../src/shared/types.ts'

type Page = typeof import('../src/web/pages/RecordsPage.tsx')
type I18n = typeof import('../src/shared/i18n.ts')
type Mode = typeof import('../src/web/lib/mode.ts')

const HUMAN = { type: 'human', id: THE_PERSON } as const
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const OLD_HANDLE = 'made-up-old-builder'
const OLD_NAME = 'Made-up Old Builder'
const REWRITTEN = 'A made-up summary somebody wrote over the sentence the press stored.'

let t: TestDb
let app: FastifyInstance
let branched = ''
let rewritten = ''

/** A window, so the browser modules load under `renderToStaticMarkup`. */
async function boot(): Promise<{ page: Page; i18n: I18n; mode: Mode }> {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  vi.resetModules()
  return {
    page: (await import('../src/web/pages/RecordsPage.tsx')) as Page,
    i18n: await import('../src/shared/i18n.ts'),
    mode: await import('../src/web/lib/mode.ts'),
  }
}

async function read<T>(url: string): Promise<T> {
  const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as T
}

/** The row's summary words as All records draws them, with or without the registry. */
async function theRowsSummary(id: string, language: 'en' | 'zh', options: { inspect?: boolean; registry?: boolean } = {}): Promise<string> {
  const { page, i18n, mode } = await boot()
  i18n.setWordLanguage(language)
  const drawnIn = options.inspect === true ? 'inspect' : 'normal'
  mode.setMode(drawnIn)
  // THE ROW AS ALL RECORDS IS SENT IT: the light shape of the list, which is the cut the page reads, not the whole
  // record. A light row that drops `data.branchedFrom` is how the row stayed English after the page could read it.
  const listed = await read<{ records: (PanelRecord & { incompleteCount: number })[] }>('/api/records?kind=agent&shape=light&limit=25')
  const record = listed.records.find((one) => one.id === id)
  expect(record, 'the light list carries the agent').toBeDefined()
  const agents = options.registry === false ? null : (await read<{ agents: unknown[] }>('/api/participants')).agents
  const html = renderToStaticMarkup(
    h(
      'table',
      null,
      h(
        'tbody',
        null,
        h(page.CatalogueRow as never, {
          record,
          columns: page.columnsFor(drawnIn),
          mode: drawnIn,
          agents,
        } as never),
      ),
    ),
  )
  const cell = /<span class="rec-cell-summary">([\s\S]*?)<\/span>/u.exec(html)
  expect(cell, 'the row draws a summary').not.toBeNull()
  return cell![1]!.replace(/&quot;/gu, '"').replace(/&#x27;/gu, "'")
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  t.api.createRecord({
    workspaceId: 'default',
    kind: 'agent',
    title: OLD_NAME,
    data: { handle: OLD_HANDLE, runtime: 'claude-code', state: 'active' },
    actor: HUMAN,
  })
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(OLD_HANDLE) as { id: string } | undefined
  expect(row, 'the registry holds the old agent').toBeDefined()
  const from = { agent: row!.id, handle: OLD_HANDLE }
  for (const [handle, summary] of [
    ['made-up-new-builder', theStoredBranchedSummary(OLD_HANDLE)],
    ['made-up-other-builder', REWRITTEN],
  ] as const) {
    const id = t.api.createRecord({
      workspaceId: 'default',
      kind: 'agent',
      title: `A made-up agent, ${handle}`,
      summary,
      data: { handle, runtime: 'claude-code', state: 'active', branchedFrom: from },
      actor: HUMAN,
    }).id
    if (summary === REWRITTEN) rewritten = id
    else branched = id
  }
}, 120_000)

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("a branched agent's row on All records", () => {


  it.each(['en', 'zh'] as const)('%s: 2. before the registry answers, names the old agent by its handle in the page language', async (language) => {
    const said = await theRowsSummary(branched, language, { registry: false })
    expect(said).toContain(language === 'en' ? `"${OLD_HANDLE}"` : `“${OLD_HANDLE}”`)
    expect(said).not.toContain(OLD_NAME)
    if (language === 'zh') expect(said).not.toContain('Started because')
  })

  it.each(['en', 'zh'] as const)('%s: 3. a rewritten summary is drawn as written', async (language) => {
    expect(await theRowsSummary(rewritten, language)).toBe(REWRITTEN)
  })

  it('4. developer mode draws the stored English', async () => {
    expect(await theRowsSummary(branched, 'zh', { inspect: true })).toBe(theStoredBranchedSummary(OLD_HANDLE))
  })
})
