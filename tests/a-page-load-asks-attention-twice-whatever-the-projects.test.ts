// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE LOAD OF HOME OR OF THE PROJECTS PAGE ASKS GET /api/attention TWICE, HOWEVER MANY PROJECTS THERE ARE.
 *
 * Round 23 of wave 13w. On a made-up office of the live size with nine projects, one first load of Home
 * asked eight times: the frame once for the project on screen, and Home once for each other project.
 * The Projects page asked the same eight, and asked the project on screen a second time, which the
 * browser joined to the frame's read only while nothing else had been written. Now:
 *
 *   - THE FRAME asks `shape=home` for the project on screen, once. The sidebar's count, the safety
 *     mark, Home's own project and the Projects page's card for it all draw that one reply;
 *   - HOME'S LATE OR STUCK AND THE PROJECT CARDS ask `shape=other-projects` once, under the project on
 *     screen, and draw every other project from that reply.
 *
 * This file loads each page on an office of three projects and counts the requests, and checks that what
 * the other projects hold is drawn: their rows in Late or stuck, and their counts on the cards. Home's key items,
 * the person's checklists and the forks he settled are each asked once for every project together, too.
 *
 * MUTATION PROOF, in the commit message: read each other project again under its own header, and both
 * counts go red; draw no other project from the one read, and both drawing checks go red; hand the cards
 * no frame reading, and the Projects page's card for the project on screen goes red.
 *
 * WHAT THIS CANNOT SEE: a second read identical to one still in flight. The browser joins it to the first
 * (`request` in src/web/api.ts) until a write or an event moves the generation, and on this quiet office
 * nothing does. That is how the Projects page's second read of the project on screen stayed hidden on a
 * quiet office and went out on a busy one. Reading the other projects again whenever the frame's state
 * changed was tried as a mutation here and stayed green for that reason.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Request } from 'playwright'
import { EVERY_PROJECT, PROJECTS_QUERY } from '../src/shared/across-projects.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const HERE = 'default'
const OTHERS = [
  { id: 'made-up-second', title: 'Made-up second project', blocked: 2 },
  { id: 'made-up-third', title: 'Made-up third project', blocked: 3 },
] as const

/** How long no attention request is open before a load counts as over, in milliseconds. */
const QUIET_MS = 1_500

let app: LiveApp

async function post(path: string, body: unknown, workspaceId: string = HERE): Promise<void> {
  const got = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-mole-office-workspace': workspaceId, 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON },
    body: JSON.stringify(body),
  })
  expect(got.status, await got.clone().text()).toBe(201)
}

beforeAll(async () => {
  app = await liveApp({ name: 'attention-twice-a-load', viewport: { width: 1440, height: 1000 }, workspace: HERE })
  for (const one of OTHERS) {
    await post('/api/workspaces', { id: one.id, title: one.title })
    for (let n = 0; n < one.blocked; n += 1) {
      await post('/api/records', { kind: 'task', title: `A made-up blocked task ${String(n + 1)} in ${one.title}`, data: { state: 'blocked' } }, one.id)
    }
  }
}, 240_000)

afterAll(async () => { await app?.stop() }, 60_000)

interface Asked { shape: string | null; workspaceId: string | undefined }

/** Opens the page fresh, and answers every GET /api/attention it asked until none was open for QUIET_MS. */
async function attentionReadsOfOneLoad(hash: string): Promise<Asked[]> {
  const page = app.page
  const asked: Asked[] = []
  const open = new Set<Request>()
  let lastMove = Date.now()
  const onRequest = (request: Request): void => {
    const url = new URL(request.url())
    if (url.pathname !== '/api/attention') return
    asked.push({ shape: url.searchParams.get('shape'), workspaceId: request.headers()['x-mole-office-workspace'] })
    open.add(request)
    lastMove = Date.now()
  }
  const onEnd = (request: Request): void => {
    if (open.delete(request)) lastMove = Date.now()
  }
  page.on('request', onRequest)
  page.on('requestfinished', onEnd)
  page.on('requestfailed', onEnd)
  try {
    await page.goto(`${app.site}/?load=${String(Date.now())}${hash}`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const until = Date.now() + 60_000
    while (open.size > 0 || asked.length === 0 || Date.now() - lastMove < QUIET_MS) {
      if (Date.now() > until) throw new Error(`the attention reads did not end: ${JSON.stringify(asked)}`)
      await page.waitForTimeout(100)
    }
  } finally {
    page.removeListener('request', onRequest)
    page.removeListener('requestfinished', onEnd)
    page.removeListener('requestfailed', onEnd)
  }
  return asked
}

/** The two reads every load makes, in the order they are sorted here. */
const TWO_READS: Asked[] = [
  { shape: 'home', workspaceId: HERE },
  { shape: 'other-projects', workspaceId: HERE },
]

function sorted(asked: Asked[]): Asked[] {
  return [...asked].sort((a, b) => String(a.shape).localeCompare(String(b.shape)))
}

describe('one load of a page that draws every project', () => {
  it('Home asks the project on screen once and every other project in one read', async () => {
    const asked = await attentionReadsOfOneLoad('#/')
    expect(sorted(asked), JSON.stringify(asked)).toEqual(TWO_READS)
    // WHAT THE OTHER PROJECTS HOLD IS DRAWN, from that one read: their blocked tasks in Late or stuck.
    const late = app.page.locator('[data-home-section="late"]')
    // Late or stuck is one number, and pressing it opens its list.
    await late.locator('summary').click({ timeout: 20_000 })
    for (const one of OTHERS) {
      await expect.poll(() => late.locator('.hm-alarm-row .hm-row-meta', { hasText: one.title }).count(), { timeout: 20_000 }).toBeGreaterThan(0)
    }
  }, 180_000)

  it('Home asks its key items, his checklists and his decisions once each, for every project in one read', async () => {
    const asked: URL[] = []
    const HOMES_OWN = ['/api/key-items', '/api/checklists', '/api/figures/my-decisions']
    const onRequest = (request: Request): void => {
      const url = new URL(request.url())
      // A checklist read that names an owner is the sidebar's, not Home's.
      // The checklists window's read names none, and Home's checklist count and the window share that one read.
      if (HOMES_OWN.includes(url.pathname) && !url.searchParams.has('owner')) asked.push(url)
    }
    app.page.on('request', onRequest)
    try {
      await attentionReadsOfOneLoad('#/')
      await app.page.locator('[data-home-section="keyItems"]').waitFor({ timeout: 30_000 })
      await app.page.locator('[data-home-section="myDecisionTime"]').waitFor({ timeout: 30_000 })
    } finally {
      app.page.removeListener('request', onRequest)
    }
    expect(asked.map((url) => url.pathname).sort(), asked.map(String).join(' ')).toEqual([...HOMES_OWN].sort())
    for (const url of asked) {
      expect(url.searchParams.get(PROJECTS_QUERY), `${url.pathname} is asked for every project at once`).toBe(url.pathname === '/api/key-items' ? 'every' : EVERY_PROJECT)
    }
  }, 180_000)

  it('the Projects page asks the project on screen once, the frame\'s read, and every other project in one read', async () => {
    const asked = await attentionReadsOfOneLoad('#/projects')
    expect(sorted(asked), JSON.stringify(asked)).toEqual(TWO_READS)
    // EVERY CARD DRAWS ITS OPEN COUNT, the project on screen's from the frame's read and the others' from the one read.
    const cards = app.page.locator('.hm-project-card')
    await expect.poll(() => cards.count(), { timeout: 20_000 }).toBe(1 + OTHERS.length)
    for (const one of OTHERS) {
      const open = cards.filter({ hasText: one.title }).locator('[data-home-project-count="open"]')
      await expect.poll(async () => (await open.innerText()).trim(), { timeout: 20_000 }).toBe(String(one.blocked))
    }
    const here = app.page.locator('.hm-project-card[aria-current="page"] [data-home-project-count="open"]')
    await expect.poll(async () => (await here.innerText()).trim(), { timeout: 20_000 }).toMatch(/^\d+$/)
  }, 180_000)
})
