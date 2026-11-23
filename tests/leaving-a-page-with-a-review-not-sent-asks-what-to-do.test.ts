// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * LEAVING A PAGE WHOSE REVIEW HOLDS COMMENTS NOT SENT ASKS SEND, KEEP OR DISCARD, AND EACH ANSWER DOES WHAT IT SAYS.
 *
 * The owner's fourth detail for wave 13r round 15 (record 9BZZVKQxWV9Z): leaving the page by the app's own navigation, a
 * change of the address's hash, asks a question. It names how many comments the review holds and their recipient,
 * and offers Send, Keep and Discard. `LeaveQuestion` in src/web/components/agent/ReviewBar.tsx draws it.
 *
 * Each answer is checked on the server, not on the page: Keep leaves the review collecting with its comment, Discard
 * deletes the comment so it is no longer in the review, Send leaves the review no longer collecting, and Stay keeps
 * the person on the page with nothing changed.
 *
 * The question is drawn over the page whether or not the review column is open, and the page behind it is still the
 * page it asks about until the owner answers.
 *
 * Three-run proofs, using this whole file each time:
 * - The question's listener added after the router's: in src/web/components/agent/ReviewBar.tsx, `LeaveQuestion`,
 *   add `onHash` to the window from the effect instead of setting `leaveGuard`. The first case goes red.
 * - The question's sheet left out: in the same file, draw `''` where the question draws LEAVE_CSS. The first case goes
 *   red.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { createI18n } from '../src/shared/i18n.ts'
import { en } from '../src/shared/words/en.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const { t } = createI18n('en')
const HEADERS = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

let app: LiveApp
let kiln = ''

async function ask<T>(method: string, path: string, body?: unknown): Promise<T> {
  const reply = await fetch(app.api + path, { method, headers: HEADERS, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

interface Detail {
  review: { id: string; state: string }
  members: { id: string; found: boolean }[]
  saved: { id: string }[]
}

/** A page with a review collecting on it, going to Kiln Keeper, holding one comment. */
async function aReview(title: string): Promise<{ about: string; review: string; comment: string }> {
  const about = (await ask<{ record: { id: string } }>('POST', '/api/records', { kind: 'note', title, data: { body: 'Two firings a week.' } })).record.id
  const target = { target: { kind: 'record', recordId: about, workspaceId: 'default' }, place: { at: 'surface' } }
  const review = (await ask<{ review: { id: string } }>('POST', '/api/reviews', { entry: target })).review.id
  await ask('POST', `/api/reviews/${review}/recipient`, { recipient: { kind: 'agent', agentId: kiln } })
  const comment = (await ask<{ record: { id: string } }>('POST', '/api/records', { kind: 'message', title: 'About the shelves', data: { body: 'The left shelf is cracked.', target } })).record.id
  return { about, review, comment }
}

/** Opens the page, leaves it by a change of the hash, and waits for the question. */
async function leave(about: string): Promise<void> {
  await app.page.goto(`${app.site}/#/r/${about}`)
  // A NEW LOAD OF THE PAGE, because the review was started by this test and not in this browser, and the browser reads
  // the list of collecting reviews again only when a change is made in it or the page is loaded.
  await app.page.reload()
  await waitForThePage(app.page)
  // THE QUESTION IS SET ONCE THE LIST OF COLLECTING REVIEWS HAS BEEN READ, which the ring around the page shows.
  await app.page.waitForTimeout(1000)
  await app.page.evaluate(() => { location.hash = '#/records' })
  await app.page.locator('[data-part="leave-question"]').waitFor({ timeout: 30_000 })
}

function question() {
  return app.page.locator('[data-part="leave-question"]')
}

beforeAll(async () => {
  app = await liveApp({ name: 'leave-question', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  kiln = (await ask<{ record: { id: string } }>('POST', '/api/records', { kind: 'agent', title: 'Kiln Keeper', data: { handle: 'kiln-keeper', runtime: 'claude-code', state: 'active' } })).record.id
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: en['g4.pairing.press'], exact: true }).click()
  await app.page.getByText(en['g4.pairing.paired'], { exact: true }).waitFor()
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('leaving a page whose review holds a comment not sent', () => {
  for (const changed of ['count', 'recipient', 'state'] as const) {
    it(`a later look draws a changed ${changed} in the open question without Send`, async () => {
      const { about, review } = await aReview(`Made-up kiln question, focus changes ${changed}`)
      let reads = 0
      const heard = (request: { method: () => string; url: () => string }) => {
        if (request.method() === 'GET' && new URL(request.url()).pathname === `/api/reviews/${review}`) reads += 1
      }
      try {
        await leave(about)
        await question().getByText(t('review.leave.recipient', { name: 'Kiln Keeper' }), { exact: true }).waitFor()
        if (changed === 'count') await ask('POST', '/api/records', { kind: 'message', title: 'Made-up focus comment', data: {
          body: 'Measure the other shelf as well.',
          target: { target: { kind: 'record', recordId: about, workspaceId: 'default' }, place: { at: 'surface' } },
        } })
        else if (changed === 'recipient') {
          const other = (await ask<{ record: { id: string } }>('POST', '/api/records', { kind: 'agent', title: 'Glaze Reader', data: { handle: 'glaze-question-focus', runtime: 'claude-code', state: 'active' } })).record.id
          await ask('POST', `/api/reviews/${review}/recipient`, { recipient: { kind: 'agent', agentId: other } })
        } else await ask('POST', `/api/reviews/${review}/abandon`)
        app.page.on('request', heard)
        const answered = app.page.waitForResponse(r => new URL(r.url()).pathname === '/api/reviews' && r.request().method() === 'GET')
        await app.page.evaluate(() => window.dispatchEvent(new Event('focus')))
        await answered
        if (changed === 'count') await question().getByRole('button', { name: en['review.b.send'].other.replace('{n}', '2'), exact: true }).waitFor({ timeout: 10_000 })
        if (changed === 'recipient') await question().getByText(t('review.leave.recipient', { name: 'Glaze Reader' }), { exact: true }).waitFor({ timeout: 10_000 })
        if (changed === 'state') await question().getByText('Abandoned', { exact: true }).waitFor({ timeout: 10_000 })
        expect(reads, 'one changed list causes one detail read').toBe(1)
        const quiet = app.page.waitForResponse(r => new URL(r.url()).pathname === '/api/reviews' && r.request().method() === 'GET')
        await app.page.evaluate(() => window.dispatchEvent(new Event('focus')))
        await quiet
        await app.page.waitForTimeout(300)
        expect(reads, 'a quiet look reads no detail').toBe(1)
        expect(app.page.url()).toContain(`#/r/${about}`)
        expect((await ask<Detail>('GET', `/api/reviews/${review}`)).review.state).toBe(changed === 'state' ? 'abandoned' : 'collecting')
      } finally {
        app.page.off('request', heard)
        if (await question().isVisible()) await question().getByRole('button', { name: en['review.leave.stay'], exact: true }).click()
        if ((await ask<Detail>('GET', `/api/reviews/${review}`)).review.state === 'collecting') await ask('POST', `/api/reviews/${review}/abandon`)
      }
    }, 120_000)
  }

  it('draws collecting finished when finishing succeeds and sending fails', async () => {
    const { about, review } = await aReview('Made-up kiln question, failed send after finish')
    const path = `**/api/reviews/${review}/send`
    try {
      await leave(about)
      await question().getByText(t('review.leave.recipient', { name: 'Kiln Keeper' }), { exact: true }).waitFor()
      await app.page.route(path, route => route.abort('failed'))
      await question().getByRole('button', { name: en['review.b.send'].one.replace('{n}', '1'), exact: true }).click()
      await expect.poll(async () => (await ask<Detail>('GET', `/api/reviews/${review}`)).review.state).toBe('collected')
      await question().getByText('Collecting finished', { exact: true }).waitFor({ timeout: 10_000 })
      expect(app.page.url()).toContain(`#/r/${about}`)
      const shots = process.env['REVIEW_QUESTION_SHOTS']
      if (shots) {
        for (const width of [1440, 990, 660, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await app.page.setViewportSize({ width, height: 1000 })
            await app.page.emulateMedia({ colorScheme: theme })
            await app.page.evaluate(value => { document.documentElement.dataset['theme'] = value }, theme)
            await app.page.screenshot({ path: `${shots}/question-failed-send-${String(width)}-${theme}.png` })
          }
        }
        await app.page.setViewportSize({ width: 1440, height: 1000 })
      }
    } finally {
      await app.page.unroute(path)
      if (await question().isVisible()) await question().getByRole('button', { name: en['review.leave.stay'], exact: true }).click()
      if ((await ask<Detail>('GET', `/api/reviews/${review}`)).review.state === 'collecting') await ask('POST', `/api/reviews/${review}/abandon`)
    }
  }, 120_000)

  for (const changed of ['count', 'recipient', 'state'] as const) {
    it(`Send reads again and draws a changed ${changed} without sending or leaving`, async () => {
      const { about, review } = await aReview(`Made-up kiln question, changed ${changed}`)
      try {
      await leave(about)
      await question().getByText(t('review.leave.recipient', { name: 'Kiln Keeper' }), { exact: true }).waitFor()
      if (changed === 'count') {
        await ask('POST', '/api/records', { kind: 'message', title: 'Made-up second comment', data: {
          body: 'The right shelf needs measuring too.',
          target: { target: { kind: 'record', recordId: about, workspaceId: 'default' }, place: { at: 'surface' } },
        } })
      } else if (changed === 'recipient') {
        const other = (await ask<{ record: { id: string } }>('POST', '/api/records', { kind: 'agent', title: 'Glaze Reader', data: { handle: 'glaze-question', runtime: 'claude-code', state: 'active' } })).record.id
        await ask('POST', `/api/reviews/${review}/recipient`, { recipient: { kind: 'agent', agentId: other } })
      } else await ask('POST', `/api/reviews/${review}/abandon`)
      await question().getByRole('button', { name: en['review.b.send'].one.replace('{n}', '1'), exact: true }).click()
      await question().getByText(t('review.b.changedNothingSent'), { exact: true }).waitFor({ timeout: 10_000 })
      expect(app.page.url()).toContain(`#/r/${about}`)
      const now = await ask<Detail>('GET', `/api/reviews/${review}`)
      expect(now.review.state).toBe(changed === 'state' ? 'abandoned' : 'collecting')
      if (changed === 'count') await question().getByRole('button', { name: en['review.b.send'].other.replace('{n}', '2'), exact: true }).waitFor()
      if (changed === 'recipient') await question().getByText(t('review.leave.recipient', { name: 'Glaze Reader' }), { exact: true }).waitFor()
      if (changed === 'state') await question().getByText('Abandoned', { exact: true }).waitFor()
      const shots = process.env['REVIEW_QUESTION_SHOTS']
      if (shots && changed === 'count') {
        mkdirSync(shots, { recursive: true })
        for (const width of [1440, 990, 660, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await app.page.setViewportSize({ width, height: 1000 })
            await app.page.emulateMedia({ colorScheme: theme })
            await app.page.evaluate(value => { document.documentElement.dataset['theme'] = value }, theme)
            await app.page.screenshot({ path: `${shots}/question-${String(width)}-${theme}.png` })
          }
        }
        await app.page.setViewportSize({ width: 1440, height: 1000 })
      }
      } finally {
        if (await question().isVisible()) await question().getByRole('button', { name: en['review.leave.stay'], exact: true }).click()
        if ((await ask<Detail>('GET', `/api/reviews/${review}`)).review.state === 'collecting') await ask('POST', `/api/reviews/${review}/abandon`)
      }
    }, 120_000)
  }

  it('names how many comments and their recipient', async () => {
    const { about } = await aReview('The kiln schedule, named')
    await leave(about)
    await question().getByText(en['review.leave.count'].one.replace('{n}', '1'), { exact: true }).waitFor()
    await question().getByText(t('review.leave.recipient', { name: 'Kiln Keeper' }), { exact: true }).waitFor()
    expect(app.page.url()).toContain(`#/r/${about}`)
    // DRAWN OVER THE PAGE, with the review column shut: its sheet once came only with the column, and without it the
    // question sat unstyled in the page's flow.
    const drawn = await question().evaluate((box) => ({
      scrim: getComputedStyle(box.parentElement as HTMLElement).position,
      onTop: box.contains(document.elementFromPoint(box.getBoundingClientRect().left + 8, box.getBoundingClientRect().top + 8)),
    }))
    expect(drawn).toEqual({ scrim: 'fixed', onTop: true })
    // THE PAGE BEHIND THE QUESTION IS STILL THE PAGE IT ASKS ABOUT, not the one the owner was going to.
    await app.page.getByText('The kiln schedule, named').first().waitFor({ timeout: 5_000 })
    expect(await app.page.getByRole('heading', { name: 'All records', exact: true }).count(), 'the page behind the question is the one the owner was going to').toBe(0)
    await question().getByRole('button', { name: en['review.leave.stay'], exact: true }).click()
    await question().waitFor({ state: 'detached' })
    expect(app.page.url(), 'Stay keeps the person on the page').toContain(`#/r/${about}`)
  }, 120_000)

  it('Keep goes on and leaves the comment in the review, which goes on collecting', async () => {
    const { about, review, comment } = await aReview('The kiln schedule, kept')
    await leave(about)
    await question().getByRole('button', { name: en['review.leave.keep'], exact: true }).click()
    await app.page.waitForURL(/#\/records/)
    const detail = await ask<Detail>('GET', `/api/reviews/${review}`)
    expect(detail.review.state).toBe('collecting')
    expect([...detail.members, ...detail.saved].map((one) => one.id)).toContain(comment)
  }, 120_000)

  it('Discard deletes the comment, so it is no longer in the review, and goes on', async () => {
    const { about, review, comment } = await aReview('The kiln schedule, discarded')
    await leave(about)
    await question().getByRole('button', { name: en['review.leave.discard'], exact: true }).click()
    await app.page.waitForURL(/#\/records/)
    const detail = await ask<Detail>('GET', `/api/reviews/${review}`)
    expect(detail.members.filter((one) => one.found).map((one) => one.id)).not.toContain(comment)
    const record = await ask<{ record: { deletedAt: string | null } }>('GET', `/api/records/${comment}?includeDeleted=true`)
    expect(record.record.deletedAt).not.toBeNull()
  }, 120_000)

  it('Send sends the review and goes on', async () => {
    const { about, review } = await aReview('The kiln schedule, sent')
    await leave(about)
    await question().getByRole('button', { name: en['review.b.send'].one.replace('{n}', '1'), exact: true }).click()
    await app.page.waitForURL(/#\/records/, { timeout: 60_000 })
    const detail = await ask<Detail>('GET', `/api/reviews/${review}`)
    expect(detail.review.state).not.toBe('collecting')
  }, 120_000)
})
