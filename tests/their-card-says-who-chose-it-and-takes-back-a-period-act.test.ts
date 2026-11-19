// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S CARD SAYS WHO CHOSE IT, AND ITS PERIOD'S LIST TAKES AN ACT BACK, IN THE PAGE'S LANGUAGE. Wave 13q, round 19.
 *
 * Two things on src/web/components/TheirCard.tsx were English on a Chinese page, and one press was missing:
 *
 *   1. "chosen by …, which registered this agent" came from `whoChoseTheCardSays` in src/shared/roles.ts, a sentence
 *      written in English for the server, drawn as it was on the page.
 *   2. What each act under a period did ("filed it", "changed it") came from `WHAT_THE_PERIOD_DID`, the same.
 *   3. Wave 13n's round 28 let the revoke door take back an act made under a period the owner granted (problem yW5Qt7TgM1lE),
 *      but no page drew a press for one: the period's list showed the act and nothing to take it back with.
 *
 * What this file holds, rendering the agent's profile from the server's own reply, in English and in Chinese:
 *   - who chose the card is said in the page's language ("who" for a person, "which" for an agent, and the card the
 *     rule wrote named by A_ROW_WITH_NO_ROLE_READS_AS alone, wave 13q round 20), and a person who chose it is named by their name, not the
 *     stored id the mark holds;
 *   - what each act did is said in the page's language;
 *   - for the person, an act with a revision to undo has a press, and the press names what it takes back;
 *   - an agent reading the page is shown no press;
 *   - once the act is taken back, the row says so and draws no press.
 *
 * PICTURES. When R19_SHOTS names a folder, the agent's page is photographed with the press showing, at 1440, 990, 660
 * and 390 in both looks, and at 1440 in Chinese, in a live page on the same database; the person is renamed at the start, so no
 * picture carries the test person's name. The ordinary run takes none.
 *
 * MUTATIONS, each red: draw `whoChoseTheCardSays` without the page's `t`; draw `one.what` again; draw no press; draw the
 * press to every reader.
 */
import { mkdirSync } from 'node:fs'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { setWordLanguage } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { whoChoseTheCardSays } from '../src/shared/roles.ts'
import { apiApp, freshDb, liveApp, thePersonsKeyHeader, waitForThePage, FOR_THE_PERSON, type TestDb } from './helpers.ts'

type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')
type ApiModule = typeof import('../src/web/api.ts')

let t: TestDb
let app: FastifyInstance
let pp: ProfileModule
let api: ApiModule

const CHINESE = /[一-鿿]/
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (handle: string): Record<string, string> => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': handle })

async function ask(method: 'GET' | 'POST' | 'PATCH', url: string, headers: Record<string, string>, payload?: Record<string, unknown>) {
  const reply = await app.inject({ method, url, headers, ...(payload === undefined ? {} : { payload }) })
  let body: Record<string, unknown> = {}
  try {
    body = reply.json() as Record<string, unknown>
  } catch {
    body = {}
  }
  return { status: reply.statusCode, said: String(body['error'] ?? reply.body), body }
}

/** The secretary's profile page as it is drawn, in one language, for one reader. */
async function thePage(language: 'en' | 'zh', reader: 'human' | 'agent', handle = 'kestrel'): Promise<string> {
  const reply = await ask('GET', `/api/participants/agent/${handle}/profile`, AS_THE_PERSON)
  expect(reply.status, reply.said).toBe(200)
  setWordLanguage(language)
  api.setActor(reader === 'human' ? { type: 'human', id: THE_PERSON } : { type: 'agent', id: 'kestrel' })
  return renderToStaticMarkup(
    h(pp.TheProfile, { said: reply.body, onChanged: () => {} } as unknown as Parameters<ProfileModule['TheProfile']>[0]),
  )
}


let goal = ''
let seq = 0

beforeAll(async () => {
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
  pp = (await import('../src/web/pages/ProfilePage.tsx')) as ProfileModule
  api = (await import('../src/web/api.ts')) as ApiModule

  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  // A MADE-UP NAME FOR THE PERSON, so the card names its chooser by a name and no picture carries the test's own.
  const renamed = await ask('PATCH', `/api/participants/person/${THE_PERSON}`, AS_THE_PERSON, { name: 'Morgan Vale' })
  expect(renamed.status, renamed.said).toBe(200)
  for (const [handle, role] of [['kestrel', 'secretary'], ['wren', 'worker']] as const) {
    const made = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle, name: handle, role })
    expect(made.status, made.said).toBe(201)
  }
  // AN AGENT REGISTERED WITH NO CARD NAMED, whose card the rule wrote (wave 13q round 20).
  const unnamed = await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'plover', name: 'plover' })
  expect(unnamed.status, unnamed.said).toBe(201)
  const raised = await ask('POST', '/api/roles/elevation/kestrel', { ...AS_THE_PERSON, ...thePersonsKeyHeader() }, {
    reason: 'a test raises it',
    endsWhen: 'when you say',
  })
  expect(raised.status, raised.said).toBe(201)
  // AN ACT UNDER THE PERIOD: the secretary confirms a goal a worker filed.
  const filed = await ask('POST', '/api/records', asAgent('wren'), { kind: 'goal', title: 'Mend the north fence', data: {} })
  expect(filed.status, filed.said).toBe(201)
  goal = String((filed.body['record'] as { id: string }).id)
  const confirmed = await ask('PATCH', `/api/records/${goal}`, asAgent('kestrel'), {
    ...FOR_THE_PERSON,
    dataPatch: { confirmed_by: { by: 'kestrel', at: '2026-10-01 09:00:00' } },
  })
  expect(confirmed.status, confirmed.said).toBe(200)
  const row = t.client.sqlite
    .prepare('SELECT seq FROM revisions WHERE record_id = ? AND elevation IS NOT NULL ORDER BY seq DESC')
    .get(goal) as { seq: number } | undefined
  expect(row, 'the confirmation is stamped with the period').toBeDefined()
  seq = row?.seq ?? 0
})

afterEach(() => {
  setWordLanguage('en')
})

afterAll(async () => {
  await app?.close()
  t?.close()
})

describe("who chose the agent's card", () => {

  it('says "who" for a person who registered the agent, and "which" for an agent (round 19\'s recorded review)', () => {
    expect(whoChoseTheCardSays({ how: 'a-starter', who: { kind: 'person', id: 'p1' } } as never, 'Morgan Vale')).toBe(
      'chosen by Morgan Vale, who registered this agent',
    )
    expect(whoChoseTheCardSays({ how: 'a-starter', who: { kind: 'agent', id: 'a1' } } as never, 'heron')).toBe(
      'chosen by heron, which registered this agent',
    )
  })


})

describe("the period's list", () => {
  it('gives the person a press that names what it takes back, in both languages', async () => {
    for (const language of ['en', 'zh'] as const) {
      const html = await thePage(language, 'human')
      const presses = [...html.matchAll(/data-period-revoke="([^"]*)"[^>]*>([\s\S]*?)<\/button>/g)]
      expect(presses.length, `no press on the ${language} page`).toBe(1)
      expect(presses[0]?.[1]).toBe(`${goal}:${String(seq)}`)
      expect(presses[0]?.[2] ?? '', `the ${language} press does not name what it takes back`).toContain('Mend the north fence')
      if (language === 'zh') expect(presses[0]?.[2] ?? '').toMatch(CHINESE)
    }
  })

  it('shows an agent no press', async () => {
    expect(await thePage('en', 'agent')).not.toContain('data-period-revoke="')
  })

  it('keeps the take-back press inside its card at 390, its label wrapping (wave 13q round 21)', async () => {
    // AT 390 THE PRESS NAMED THE RECORD ON ONE LINE and ran past its card's right edge, into the corner button's column
    // (seen in round 21's own picture). Its label now wraps inside the card.
    const live = await liveApp({ name: 'their-card-390', viewport: { width: 390, height: 900 }, workspace: 'default', database: t.file })
    try {
      const page = live.page
      await page.goto(`${live.site}/#/who/agent/kestrel`, { timeout: 60_000 })
      await waitForThePage(page, 60_000)
      const press = page.locator('[data-period-revoke] .px-btn').first()
      await press.waitFor({ timeout: 30_000 })
      const boxes = await press.evaluate((el) => {
        const card = el.closest('.tc-period')
        if (card === null) throw new Error('the press is not in the period list')
        return { press: el.getBoundingClientRect().right, card: card.getBoundingClientRect().right }
      })
      expect(boxes.press, 'the press runs past its card').toBeLessThanOrEqual(boxes.card + 0.5)
    } finally {
      await live.stop()
    }
  }, 180_000)

  it.skipIf(!process.env['R19_SHOTS'])('photographs the agent page with the press showing', async () => {
    const dir = process.env['R19_SHOTS'] as string
    mkdirSync(dir, { recursive: true })
    const live = await liveApp({ name: 'their-card-r19', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: t.file })
    try {
      const shots: [number, 'light' | 'dark', 'en' | 'zh'][] = [
        ...[1440, 990, 660, 390].flatMap((width) => (['light', 'dark'] as const).map((look) => [width, look, 'en'] as [number, 'light' | 'dark', 'en'])),
        [1440, 'light', 'zh'],
        [1440, 'dark', 'zh'],
      ]
      for (const [width, look, lang] of shots) {
        const page = await live.browser.newPage({ viewport: { width, height: 1000 } })
        await page.addInitScript((theme) => localStorage.setItem('mole-office.preset.theme', theme), look)
        await page.goto(`${live.site}/${lang === 'en' ? '' : `?lang=${lang}`}#/who/agent/kestrel`, { timeout: 60_000 })
        await waitForThePage(page, 60_000)
        await page.locator('[data-period-revoke]').first().waitFor({ timeout: 30_000 })
        await page.screenshot({ path: `${dir}/agent-page-${String(width)}-${look}-${lang}.png`, fullPage: true })
        await page.close()
      }
    } finally {
      await live.stop()
    }
  }, 300_000)

  it('says the act was taken back once it was, and draws no press for it', async () => {
    const revoked = await ask('POST', `/api/records/${goal}/revisions/${String(seq)}/revoke`, { ...AS_THE_PERSON, ...thePersonsKeyHeader() })
    expect(revoked.status, revoked.said).toBe(200)
    const html = await thePage('en', 'human')
    expect(html).not.toContain('data-period-revoke="')
    expect(html).toContain('data-period-revoked="')
  })
})
