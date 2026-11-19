// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN ENTRY THE OFFICE SUBMITTED IS WORDED ALIKE ON THE QUEUE PAGE AND ON ITS OWN PAGE (wave 13u round 98, item 34). The
 * office submits a sealed round of a line that is turned on, as its own writer. The queue page's row said the office
 * sent it for a sealed round, and the entry's own page named the office with the word every page gives that writer.
 * Both were true, in different words. The entry's page now gives the row's words, and the office's writer keeps its
 * word everywhere else.
 *
 * Both are drawn here with no server, from one made-up entry the office submitted: the queue page from a reply of
 * GET /api/merge-queue that holds it, and the panel of the entry's own page from the same entry as a record. The case
 * compares the words each draws for who submitted it. tests/a-merge-entrys-page-names-its-submitter.test.ts reads the
 * entry's own page in a real office.
 *
 * WHAT WOULD MAKE IT GO RED, each run after a control run and restored; the round's report says the results.
 *   the panel names the office with `writerNamed` again, in src/web/components/MergeQueueSubmitter.tsx
 *   the queue page's row stops reading the one answer to whether the office submitted an entry, in
 *   src/web/pages/MergeQueuePage.tsx
 */
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, expect, it } from 'vitest'
import { sayInEnglish } from '../src/shared/i18n.ts'
import type { MergeQueueReply } from '../src/shared/merge-queue-page.ts'
import { THE_OFFICE_WRITER_ID } from '../src/shared/participants.ts'
import type { PanelRecord } from '../src/shared/types.ts'

const LANE = '/tmp/made-up-queue-lane'
const ENTRY = 'made-up-entry-the-office-sent'
const BY_THE_OFFICE = { kind: 'agent', id: THE_OFFICE_WRITER_ID }

let queuePage: typeof import('../src/web/pages/MergeQueuePage.tsx')
let panel: typeof import('../src/web/components/MergeQueueSubmitter.tsx')

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage when it is imported. This is the smallest stand-in that lets the pages
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
  queuePage = await import('../src/web/pages/MergeQueuePage.tsx')
  panel = await import('../src/web/components/MergeQueueSubmitter.tsx')
})

/** A reply of GET /api/merge-queue with one free lane, holding one waiting entry the office submitted. Made up. */
function aReply(): MergeQueueReply {
  return {
    lanes: [{
      lane: LANE,
      occupiedBy: null,
      entries: [{
        id: ENTRY,
        title: 'A made-up entry the office sent',
        state: 'submitted',
        lane: LANE,
        occupies: null,
        submittedAt: '2026-10-08 09:00:00',
        submittedBy: BY_THE_OFFICE,
        machine: {},
      }],
    }],
    emergencyPushes: [],
    says: '1 entry in 1 lane; 0 lanes are held right now.',
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
      lanes: [{ lane: LANE, bus: null, order: [ENTRY], movable: [] }],
      movers: {},
      pressers: {},
      // THE OFFICE'S WRITER HAS NO REGISTRY ROW, so the server sends null for it, as it does for any id it cannot name.
      submitters: { [ENTRY]: null },
      names: { [ENTRY]: { wave: '13u', work: 'made-up work' } },
    },
  }
}

/** The text of one element of static markup, found by the attribute it carries, with the entities React writes undone. */
function theTextOf(html: string, attribute: string): string[] {
  return [...html.matchAll(new RegExp(`<[a-z]+ [^>]*${attribute}="[^"]*"[^>]*>([^<]*)<`, 'gu'))].map((one) =>
    one[1]!.replace(/&#x27;/gu, "'").replace(/&quot;/gu, '"').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&amp;/gu, '&').trim(),
  )
}

it("gives an entry the office submitted the same words on its own page as its row on the queue page", () => {
  const queue = renderToStaticMarkup(h(queuePage.TheMergeQueue, { reply: aReply(), now: new Date(2026, 9, 8, 12, 0, 0) }))
  // The panel reads only the entry's data, so the record is made up as far as that and no further.
  const record = { id: ENTRY, kind: 'merge_entry', data: { submittedBy: BY_THE_OFFICE } } as unknown as PanelRecord
  const own = renderToStaticMarkup(h(panel.TheSubmitterOnItsPage, { record, participants: { people: [], agents: [] }, sections: () => ({ surface: null }) }))
  const onTheQueue = theTextOf(queue, 'data-by')
  const onItsPage = theTextOf(own, 'data-entry-submitter')
  expect(onTheQueue, 'the queue page names who sent the entry once').toHaveLength(1)
  expect(onItsPage, "the entry's own page names who submitted it once").toHaveLength(1)
  expect(onItsPage[0], "the entry's own page says what its row on the queue page says").toBe(onTheQueue[0])
  expect(onTheQueue[0], "the queue page's row keeps its words").toBe(sayInEnglish('mergeQueuePage.submitterTheOffice'))
})
