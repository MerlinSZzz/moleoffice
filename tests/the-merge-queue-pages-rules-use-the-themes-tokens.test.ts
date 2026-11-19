// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { MergeQueueReply, QueueEntryRow } from '../src/shared/merge-queue-page.ts'
import { drawInABrowser, PALETTES, type Drawn } from './what-the-browser-draws.ts'
const LANE = '/tmp/made-up-queue-lane'

let page: typeof import('../src/web/pages/MergeQueuePage.tsx')

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage when it is imported. This is the smallest stand-in that lets the page
  // load; nothing in it is under test.
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
  const i18n = await import('../src/shared/i18n.ts')
  i18n.setWordLanguage('en')
  page = await import('../src/web/pages/MergeQueuePage.tsx')
})

/** A reply of GET /api/merge-queue with one free lane of two waiting entries. Made up for this case. */
function aReply(): MergeQueueReply {
  const ids = ['made-up-entry-first', 'made-up-entry-second']
  const entries: QueueEntryRow[] = ids.map((id) => ({
    id,
    title: `A made-up entry ${id}`,
    state: 'submitted',
    lane: LANE,
    occupies: null,
    submittedAt: '2026-10-08 09:00:00',
    submittedBy: { kind: 'agent', id: 'made-up-submitter' },
    machine: {},
  }))
  return {
    lanes: [{ lane: LANE, occupiedBy: null, entries }],
    emergencyPushes: [],
    says: '2 entries in 1 lane; 0 lanes are held right now.',
    workspaceId: 'default',
    speed: {
      at: '2026-10-08 12:00:00',
      since: '2026-10-07 12:00:00',
      landed: 0,
      landedUnreadable: 0,
      buses: { ran: 0, aboardEach: null, unreadable: 0 },
      judgedToLanded: { medianMinutes: null, measured: 0, unreadable: 0 },
    },
    page: {
      lanes: [{ lane: LANE, bus: null, order: ids, movable: [] }],
      movers: {},
      pressers: {},
      submitters: Object.fromEntries(ids.map((id) => [id, 'made-up-submitter'])),
      names: Object.fromEntries(ids.map((id) => [id, { wave: '13p', work: `made-up work ${id}` }])),
    },
  }
}

let drawn: Drawn | undefined

afterAll(async () => {
  await drawn?.close()
})

it('draws a solid rule above each row and round each chip, in the border colour of every palette', async () => {
  const html = renderToStaticMarkup(h(page.TheMergeQueue, { reply: aReply(), now: new Date(2026, 9, 8, 12, 0, 0) }))
  drawn = await drawInABrowser(`<style>${page.MERGE_QUEUE_CSS}</style>${html}<span id="the-border-colour" style="color: var(--border)">.</span>`)
  expect(PALETTES.length, 'the token sheet holds palettes').toBeGreaterThan(1)
  for (const palette of PALETTES) {
    await drawn.palette(palette)
    const border = await drawn.styleOf('#the-border-colour', 'color')
    for (const [selector, side] of [['.mq-row', 'top'], ['.mq-chip', 'left']] as const) {
      const at = `${palette}: ${selector}`
      expect(await drawn.styleOf(selector, `border-${side}-style`), at).toBe('solid')
      expect(await drawn.styleOf(selector, `border-${side}-width`), at).not.toBe('0px')
      expect(await drawn.styleOf(selector, `border-${side}-color`), at).toBe(border)
    }
  }
}, 120_000)
