// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT MADE BY THE START A NEW AGENT PRESS SAYS WHY IT WAS STARTED IN THE PAGE'S LANGUAGE, NAMING THE OLD AGENT.
 * Wave 13k round 39, piece 4, after wave 13n's round 37.
 *
 * The press stores "Started because "<handle>" could not be reached. …" in English as the new agent's summary, and
 * writes the facts beside it in `data.branchedFrom` (type BranchedFrom in src/shared/kinds.ts). A Chinese page drew
 * the English. src/shared/branched-agent.ts draws the sentence from the facts in the page's language.
 *
 * WHAT IS CLAIMED:
 *
 *   2. A summary somebody rewrote is drawn as written, in both languages.
 *   3. Developer mode draws the stored English.
 *
 * MADE-UP RECORDS, in a fresh test database: an old agent, and two agents branched from it.
 *
 * MUTATIONS, each after a control run (the commit that added this file names the logs):
 *   - src/web/pages/RecordPage.tsx: the summary line drawing the stored summary always. Case 1 goes red.
 *   - src/web/pages/RecordPage.tsx: developer mode drawing the page's sentence too. Case 3 goes red.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { theStoredBranchedSummary } from '../src/shared/branched-agent.ts'
import type { PanelRecord } from '../src/shared/types.ts'

type Page = typeof import('../src/web/pages/RecordPage.tsx')
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
    page: (await import('../src/web/pages/RecordPage.tsx')) as Page,
    i18n: await import('../src/shared/i18n.ts'),
    mode: await import('../src/web/lib/mode.ts'),
  }
}

async function read<T>(url: string): Promise<T> {
  const reply = await app.inject({ method: 'GET', url, headers: AS_THE_PERSON })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as T
}

/** The record page's header as the page draws it, with what the server answered for it. */
async function drawn(id: string, language: 'en' | 'zh', inspect = false): Promise<{ html: string; t: I18n['t'] }> {
  const { page, i18n, mode } = await boot()
  i18n.setWordLanguage(language)
  mode.setMode(inspect ? 'inspect' : 'normal')
  const record = (await read<{ record: PanelRecord }>(`/api/records/${id}`)).record
  const participants = await read<Record<string, unknown>>('/api/participants')
  // THE HEADER, which draws the summary line under the title.
  const html = renderToStaticMarkup(
    h(page.RecordHead, {
      record,
      incomplete: [],
      deleted: false,
      editing: false,
      busy: false,
      projects: [],
      relations: [],
      participants,
      onSaved: () => {},
      onDelete: async () => {},
    } as never),
  )
  return { html, t: i18n.t }
}

/** The summary line's words, without the label before them. */
function theSummaryLine(html: string): string {
  const line = /<p class="rp-lede[^"]*"[^>]*>([\s\S]*?)<\/p>/u.exec(html)
  expect(line, 'the page draws a summary line').not.toBeNull()
  return line![1]!.replace(/<span class="rp-lede-tag"[^>]*>[\s\S]*?<\/span>/u, '').replace(/<[^>]+>/gu, '')
    .replace(/&quot;/gu, '"').replace(/&#x27;/gu, "'").trim()
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

describe('why a branched agent was started', () => {

  it('1. in Chinese, with no English of it', async () => {
    const { html, t: say } = await drawn(branched, 'zh')
    const line = theSummaryLine(html)
    expect(line).toContain(OLD_NAME)
    expect(line).toContain(`“${OLD_HANDLE}”`)
    expect(line).toContain(say('agentBranched.summary', { who: '' }).slice(0, 4))
    expect(line).not.toContain('Started because')
    expect(line).not.toContain('could not be reached')
  })

  it.each(['en', 'zh'] as const)('%s: 2. a rewritten summary is drawn as written', async (language) => {
    const { html } = await drawn(rewritten, language)
    expect(theSummaryLine(html)).toBe(REWRITTEN)
  })

  it('3. developer mode draws the stored English', async () => {
    const { html } = await drawn(branched, 'zh', true)
    expect(theSummaryLine(html)).toBe(theStoredBranchedSummary(OLD_HANDLE))
  })

})
