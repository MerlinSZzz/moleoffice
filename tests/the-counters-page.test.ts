// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Criterion change: plan 7FEOshq3mBGG replaces ordinary empty sentences and hides machine details in normal mode.
/**
 * THE COUNTERS PAGE, DRAWN AND PRESSED. CRITERION CT8 OF design/counters/ACCEPTANCE.md.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, AND WHY IN TWO HALVES
 * ---------------------------------------------------------------------------------------
 *
 * `TheCounters` is a pure component: given a reading it draws every fact the criterion names —
 * the count, the amount and what it measures, each trigger with the one that holds marked, what
 * the counter does, when it last fired and which trigger held, when a timer is next due, whether
 * it is paused and why, and whether a firing was held back. The first half renders it with plain
 * data, with no server and no port, so a branch that draws the wrong words fails here.
 *
 * The second half drives a real browser against a real server. It files a counter through
 * `POST /api/counters`, adds to it, opens the page and one counter's rows, and presses Pause with
 * a reason, reading the door's own answer off the screen. The two halves are different claims:
 * one is about the drawing, the other is about the door behind the press.
 *
 * THE EMPTY LIST IS ITS OWN BRANCH. It draws the door's own `says` sentence and no counter rows;
 * a failed read draws `ErrorNote`, which is a different thing entirely.
 */

import { THE_TEST_OFFICES_OWNER, THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Page } from 'playwright'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { CounterReading } from '@shared/counters.ts'
import { createI18n, setWordLanguage } from '@shared/i18n.ts'
import { localStamp } from '@shared/time.ts'
import type { CountersReply } from '../src/web/api.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const en = createI18n('en')

// THE SHELL READS window.localStorage AT MODULE SCOPE, exactly as
// tests/shell-nav.test.ts describes. The counters page reads its heading from Sidebar's own
// declaration, so a window stand-in goes in before the page module is imported.
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
const { TheCounters } = await import('../src/web/pages/CountersPage.tsx')

// ============================================================================ plain data

/**
 * ONE COUNTER, DELIBERATELY CARRYING EVERY BRANCH THE PAGE CLAIMS.
 *
 * It has an amount and what it measures; a count trigger that holds right now and an amount trigger
 * that does not; a quiet trigger whose `since` is null, which is the office not knowing; a timer
 * whose next moment is named; a last firing whose trigger can be resolved; a pause with who, when
 * and why; and a held-back firing with its reason.
 */
const A_COUNTER: CounterReading = {
  id: 'cnt-fixture',
  title: 'Gripper trials',
  counts: 'Trials run on the gripper since the numbers were last read.',
  amountIs: 'changed files under src and tests',
  count: 7,
  amount: 12,
  since: '2026-09-24 08:00:00',
  createdBy: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id, name: THE_TEST_OFFICES_OWNER.name },
  createdAt: '2026-09-20 09:00:00',
  paused: {
    at: '2026-09-24 09:00:00',
    by: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id, name: THE_TEST_OFFICES_OWNER.name },
    because: 'The rig is being moved to the other bench.',
  },
  follows: [
    {
      event: 'landing',
      lane: `${THE_TEST_FIXTURE_ROOT}/checkout`,
      words:
        `Adds 1 every time something lands in ${THE_TEST_FIXTURE_ROOT}/checkout, with the number of changed files as the amount.`,
    },
  ],
  mayAdd: { anyone: false, who: [{ kind: 'person', id: THE_TEST_OFFICES_OWNER.id, name: THE_TEST_OFFICES_OWNER.name }] },
  mayChange: 'Whoever filed it, a secretary, and the owner.',
  triggers: [
    { kind: 'count', n: 3, words: 'Fires when the count reaches 3.', holdsNow: true },
    { kind: 'amount', m: 80, words: 'Fires when the amount reaches 80.', holdsNow: false },
    {
      kind: 'quiet',
      condition: 'merge-lane-idle',
      lane: `${THE_TEST_FIXTURE_ROOT}/checkout`,
      minutes: 20,
      since: null,
      words:
        `Fires when the count is at least 1 and nothing has been waiting in ${THE_TEST_FIXTURE_ROOT}/checkout for 20 minutes.`,
      holdsNow: false,
    },
    {
      kind: 'every',
      hours: 12,
      words:
        'Fires 12 hours after it last fired, and 12 hours after it was filed when it has never fired.',
      holdsNow: false,
    },
  ],
  action: {
    kind: 'task',
    title: 'Look at the gripper numbers',
    words: 'Files a task called "Look at the gripper numbers".',
  },
  atMostOnceEvery: 30,
  lastFiring: {
    seq: 5,
    what: 'firing',
    at: '2026-09-24 08:30:00',
    atInstant: '2026-09-24T08:30:00.000+01:00',
    by: null,
    event: null,
    count: 3,
    amount: 5,
    because: 'The count reached 3, and it fires at 3.',
    trigger: 0,
    answer: { kind: 'task', ids: ['t-1'], says: 'Task t-1 was filed, about this counter.', finished: true },
  },
  nextDue: {
    at: '2026-09-24 20:30:00',
    instant: '2026-09-24T20:30:00.000+01:00',
    trigger: 3,
    words:
      'Fires 12 hours after it last fired, and 12 hours after it was filed when it has never fired.',
  },
  heldBack: {
    at: '2026-09-24 09:30:00',
    reason:
      'The count reached 3, and it fires at 3. It was not fired: this counter fires at most once every 30 minutes.',
    until: '2026-09-24 10:00:00',
    untilInstant: '2026-09-24T10:00:00.000+01:00',
  },
}

/** The one-counter reply the page renders in the list. */
function oneCounter(): CountersReply {
  return {
    workspaceId: 'default',
    counters: [A_COUNTER],
    says: '1 counter, of which 0 are running and 1 paused.',
  }
}

/** The same counter with no amount and no timer due, so an absent fact is told from a drawn one. */
function aCountOnlyCounter(): CounterReading {
  return {
    ...A_COUNTER,
    id: 'cnt-plain',
    title: 'A counter that only counts',
    amountIs: null,
    amount: null,
    triggers: [{ kind: 'count', n: 3, words: 'Fires when the count reaches 3.', holdsNow: false }],
    nextDue: null,
    lastFiring: null,
    heldBack: null,
    paused: null,
  }
}

/** The same counter running, with its timer as its one trigger, so the due line is the whole sentence. */
function aTimerCounter(): CounterReading {
  return { ...A_COUNTER, id: 'cnt-timer', title: 'A counter on a timer', paused: null, triggers: [A_COUNTER.triggers[3]!] }
}

function draw(reading: CountersReply): string {
  return renderToStaticMarkup(h(TheCounters, { reading }))
}

// ============================================================================ the render

describe('the counters page draws what a counter is', () => {
  afterEach(() => setWordLanguage('en'))

  it('draws an empty project as the door’s own sentence and no rows', () => {
    const markup = draw({
      workspaceId: 'default',
      counters: [],
      says: 'This project has no counters. A counter counts something and does one thing when it has counted enough: file one with POST /api/counters.',
    })
    expect(markup).toContain('<span class="px-absent">—</span>')
    expect(markup).toContain('cnt-says')
    expect(markup).not.toContain('cnt-entry')
  })

  it('draws the count and the amount with what the amount measures', () => {
    const markup = draw(oneCounter())
    expect(markup).toContain('cnt-count">7<')
    expect(markup).toContain('cnt-amount')
    expect(markup).toContain('12')
    expect(markup).toContain('changed files under src and tests')
  })

  it('marks the trigger that holds now and leaves the rest unmarked', () => {
    const markup = draw(oneCounter())
    // The count trigger is the only one that holds, and it is the one drawn as holding.
    expect(markup).toContain('cnt-trigger cnt-holds')
    expect(markup).toContain('data-holds="true"')
    expect(markup).toContain('data-holds="false"')
    expect(markup).toContain('holds now')
    // The words of every trigger are the server's own, so the amount trigger says 80 and the timer
    // says 12 hours.
    expect(markup).toContain('Fires when the amount reaches 80.')
    expect(markup).toContain(en.t('g7a.counters.triggerEvery', { n: 12 }))
  })

  // THE DUE LINE IS READ WHOLE, IN BOTH LANGUAGES (wave 13q's round 33e). This case read only "Next due" and the
  // time, on the fixture counter, which is paused; since round 33d a paused counter's due line says it will not fire
  // and names no time, and the merge queue found the case red (entry qJxQVlwcdLSG). The three lines a person reads
  // are now each held as drawn: a time ahead, a time that has come, and a paused counter, which draws no due line.
  it('draws when a timer is next due', () => {
    const ahead = new Date()
    ahead.setHours(12, 0, 0, 0)
    ahead.setDate(ahead.getDate() + 23)
    const at = localStamp(ahead)
    const running = { ...aTimerCounter(), nextDue: { ...A_COUNTER.nextDue!, at, trigger: 0 } }
    for (const language of ['zh', 'en'] as const) {
      setWordLanguage(language)
      const markup = draw({ workspaceId: 'default', counters: [running], says: '1 counter, running.' })
      expect(markup, language).toContain(
        language === 'zh'
          ? `<p class="cnt-nextdue"><time dateTime="${at}">23 天后</time>下次触发。</p>`
          : `<p class="cnt-nextdue">Next due <time dateTime="${at}">in 23 days</time>.</p>`,
      )
    }
  })

  it('says a timer whose time has come is due now, not next due', () => {
    const due = { ...aTimerCounter(), nextDue: { ...A_COUNTER.nextDue!, trigger: 0 } }
    for (const language of ['zh', 'en'] as const) {
      setWordLanguage(language)
      const markup = draw({ workspaceId: 'default', counters: [due], says: '1 counter, running.' })
      expect(markup, language).toContain(
        language === 'zh'
          ? '<p class="cnt-nextdue"><time dateTime="2026-09-24 20:30:00">已到触发时间</time>。</p>'
          : '<p class="cnt-nextdue"><time dateTime="2026-09-24 20:30:00">Due now</time>.</p>',
      )
      expect(markup, language).not.toContain(language === 'zh' ? '下次触发' : 'Next due')
    }
  })

  // A PAUSED COUNTER DRAWS NO DUE LINE. Before, the line was a sentence saying it would not fire until it was resumed;
  // that sentence said what would happen, and the pause line below already says it is paused, so it is gone, as decided.
  it('draws no due line for a paused counter, and names no time', () => {
    for (const language of ['zh', 'en'] as const) {
      setWordLanguage(language)
      const markup = draw(oneCounter())
      expect(markup, language).not.toContain('cnt-nextdue')
      expect(markup, language).toContain('cnt-paused')
      expect(markup, language).not.toContain('dateTime="2026-09-24 20:30:00"')
    }
  })

  it('draws nothing for a next due moment when no trigger can name one', () => {
    const markup = draw({ workspaceId: 'default', counters: [aCountOnlyCounter()], says: '1 counter, running.' })
    expect(markup).not.toContain('cnt-nextdue')
  })

  it('draws the pause with who paused it, when, and why', () => {
    const markup = draw(oneCounter())
    expect(markup).toContain('cnt-paused')
    expect(markup).toContain('Paused')
    expect(markup).toContain(THE_TEST_OFFICES_OWNER.name)
    expect(markup).toContain('The rig is being moved to the other bench.')
  })

  it('draws a held-back firing with its reason', () => {
    const markup = draw(oneCounter())
    expect(markup).toContain('cnt-heldback')
    expect(markup).toContain('A firing was held back')
    expect(markup).not.toContain('this counter fires at most once every 30 minutes')
  })

  // Before, this was a sentence that also said the trigger therefore does not hold; the holds mark says that, so the
  // line is its state alone now, as decided.
  it('draws "Quiet since: not recorded" when nobody recorded when a quiet trigger’s spell began, and never guesses', () => {
    const markup = draw(oneCounter())
    expect(markup).toContain(en.t('countersPage.quietSinceNotRecorded'))
    expect(markup).not.toContain('long ago')
  })

  it('draws when it last fired and which trigger held', () => {
    const markup = draw(oneCounter())
    expect(markup).toContain('Last fired')
    expect(markup).toContain('Fires when the count reaches 3.')
  })
})

// ============================================================================ the browser

const AS_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

let app: LiveApp
let page: Page

beforeAll(async () => {
  app = await liveApp({ name: 'counters-page', viewport: { width: 1440, height: 1000 } })
  page = app.page
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

async function callApi<T>(
  path: string,
  init: { method?: string; body?: unknown; as?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(`${app.api}${path}`, {
    method: init.method ?? 'GET',
    headers: init.as ?? AS_PERSON,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} answered ${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

/** The page, opened fresh so a previous visit's state is not carried over. */
async function openAddress(address: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`${app.site}/${address}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

describe('the counters page in a real browser', () => {
  it('says a project with no counters has none, before anything is filed', async () => {
    await openAddress('#/counters')
    expect(await page.locator('.cnt-says').innerText()).toBe('—')
    expect(await page.locator('.cnt-entry').count()).toBe(0)
  }, 120_000)

  it('files a counter, adds to it, and reads the page and one counter’s rows', async () => {
    // A REGISTERED AGENT FILES IT, because the door keeps who filed it and refuses a caller no
    // registry holds. The handles are unique to this file.
    await callApi('/api/agents/started', {
      method: 'POST',
      body: { handle: 'counters-page-keeper', name: 'The counters page keeper' },
    })
    const asKeeper = {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'counters-page-keeper',
      'x-mole-office-workspace': 'default',
    }
    const made = await callApi<{ counter: { id: string } }>('/api/counters', {
      method: 'POST',
      as: asKeeper,
      body: {
        title: 'Gripper trials for the counters page',
        counts: 'Trials run on the gripper while the counters page is being read.',
        triggers: [{ kind: 'count', n: 5 }],
        action: { kind: 'task', title: 'Look at the gripper numbers' },
      },
    })
    const id = made.counter.id

    // TWO ADDITIONS, so the page has a standing count and the opened counter has rows.
    for (const because of ['The first trial on the gripper.', 'The second trial on the gripper.']) {
      await callApi(`/api/counters/${encodeURIComponent(id)}/add`, {
        method: 'POST',
        as: asKeeper,
        body: { by: 1, because },
      })
    }
    // ONE CHANGE WITH A REASON, so the opened counter has a change to draw with who, when and why.
    await callApi(`/api/counters/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      as: asKeeper,
      body: { triggers: [{ kind: 'count', n: 6 }], because: 'The trigger moved to six trials.' },
    })

    // THE LIST: the counter is named and its standing count is drawn.
    await openAddress('#/counters')
    expect(await page.locator('.cnt-entry').count()).toBe(1)
    expect(await page.locator('.cnt-name').innerText()).toContain('Gripper trials for the counters page')
    expect(await page.locator('.cnt-count').first().innerText()).toBe('2')

    // ONE COUNTER OPENED: its rows newest first, and its change with the reason it was made.
    await openAddress(`#/counters/${encodeURIComponent(id)}`)
    expect(await page.locator('.cnt-row').count()).toBe(2)
    expect(await page.locator('.cnt-row').first().innerText()).toContain('The second trial on the gripper.')
    expect(await page.locator('.cnt-row').last().innerText()).toContain('The first trial on the gripper.')
    expect(await page.locator('.cnt-change').count()).toBe(1)
    expect(await page.locator('.cnt-change').innerText()).toContain('The trigger moved to six trials.')
  }, 240_000)

  it('asks for a reason before pausing, and draws the door’s own answer', async () => {
    // THIS CASE FILES ITS OWN COUNTER, so it proves the press on its own and not on the order the
    // cases above happen to run in.
    await callApi('/api/agents/started', {
      method: 'POST',
      body: { handle: 'counters-page-pauser', name: 'The counters page pauser' },
    })
    const asPauser = {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'counters-page-pauser',
      'x-mole-office-workspace': 'default',
    }
    const made = await callApi<{ counter: { id: string } }>('/api/counters', {
      method: 'POST',
      as: asPauser,
      body: {
        title: 'Gripper pause fixture',
        counts: 'Trials run on the gripper before the pause press is looked at.',
        triggers: [{ kind: 'count', n: 5 }],
        action: { kind: 'task', title: 'Look at the gripper numbers after the pause' },
      },
    })
    const id = made.counter.id
    await callApi(`/api/counters/${encodeURIComponent(id)}/add`, {
      method: 'POST',
      as: asPauser,
      body: { by: 1, because: 'One trial before the pause press.' },
    })

    await openAddress(`#/counters/${encodeURIComponent(id)}`)
    // NOTHING TO TYPE INTO WHILE READING: the box is inside a closed fold.
    expect(await page.locator('.cnt-because').count()).toBe(1)
    expect(await page.locator('.cnt-because').isVisible()).toBe(false)

    await page.locator('.cnt-fold-sum').first().click()
    await page.locator('.cnt-because').fill('The rig is being moved, so nothing should fire.')
    await page.getByRole('button', { name: 'Pause it' }).first().click()
    await page.waitForSelector('.cnt-said', { timeout: 30_000 })
    expect(await page.locator('.cnt-said').innerText()).toContain('is paused')

    // AND AN AGENT’S RESUME IS REFUSED IN THE DOOR’S OWN WORDS, with nothing written. The agent is
    // registered, so the refusal that comes back is the counter’s own rule about who may change it
    // rather than the general refusal of an unregistered writer.
    await callApi('/api/agents/started', {
      method: 'POST',
      body: { handle: 'counters-page-stranger', name: 'The counters page stranger' },
    })
    await page.evaluate(() => {
      window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'counters-page-stranger' }))
    })
    try {
      await openAddress(`#/counters/${encodeURIComponent(id)}`)
      await page.locator('.cnt-fold-sum').first().click()
      await page.locator('.cnt-because').fill('An agent asking to resume this counter.')
      await page.getByRole('button', { name: 'Resume it' }).first().click()
      await page.waitForSelector('.cnt-presses .px-error', { timeout: 30_000 })
      expect(await page.locator('.cnt-presses .px-error').innerText()).toContain('a secretary, or the owner may resume it')
      const still = await callApi<{ counter: { paused: unknown } }>(`/api/counters/${encodeURIComponent(id)}`)
      expect(still.counter.paused, 'an agent’s press resumed the counter').not.toBeNull()
    } finally {
      await page.evaluate(() => {
        window.localStorage.removeItem('mole-office.actor')
      })
    }
  }, 240_000)
})
