// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANE SAYS A REVIEW WAITS EXACTLY WHEN THE SERVER SAYS PRESSING SEND WOULD LEAVE SOMETHING WAITING.
 *
 * The server works out what a review waits for by one rule, and hands it over as `waitsFor` in the review. Before the
 * first send that list names every comment still to go, including the ones pressing Send will send. So the send plan
 * the pane reads carries the part of it that pressing Send would leave waiting, as `sendLeavesWaiting`: every comment
 * the review waits for, less each comment whose line says it will go. The heading over Send says "Waiting for comments
 * to be sent" exactly when that list names a comment, and "Send this review" when it names none.
 *
 * THE CASE IS ONE WHERE A RULE OF THE PANE'S OWN SAID SOMETHING ELSE. A review holds a comment that will go and a
 * comment that can no longer be found. The server says the review waits for the second one until somebody presses
 * "Remove from this review", and pressing Send never sends it. The pane's own rule looked only for a comment that was
 * the person's to answer or had no address that works, so it said "Send this review" over that review. The test then
 * presses "Remove from this review" in the pane, as the person does. The review then waits only for the comment that
 * will go, and the heading says "Send this review".
 *
 * THE PRESS IS MADE IN THE PANE, NOT THROUGH THE DOOR. The pane reads the plan again when it is told of a change, and
 * its own press tells it. A comment taken out through the door tells the pane nothing, and going to the address the
 * page is already at does not load the page again, so the pane went on drawing the earlier plan.
 *
 * Against a Mole Office of this test's own, in Chromium, with its database in a fresh temporary folder. The note, the
 * run and the comments are made up. The browser is paired, because the press must prove it is the person's.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createI18n } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { fakeTranscript, liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const t = createI18n('en').t

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const GOES = 'The pump curve on page two does not match the bench test.'
const LOST = 'This comment is deleted after collecting finished.'

let app: LiveApp
let aboutId: string
let reviewId: string
let goes: string
let lost: string

async function ask<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown, headers: Record<string, string> = PERSON): Promise<T> {
  const reply = await fetch(app.api + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  expect(reply.ok, `${method} ${path}: ${await reply.clone().text()}`).toBe(true)
  return (await reply.json()) as T
}

/** A run the office could pick up again, with a transcript this machine holds. */
async function aRun(title: string, externalId: string): Promise<string> {
  const logPath = fakeTranscript(externalId)
  const made = await ask<{ record: { id: string } }>('POST', '/api/records', {
    kind: 'session',
    title,
    data: {
      state: 'idle',
      runtime: 'claude-code',
      extra: {
        discovered: {
          tool: 'claude-code',
          externalId,
          logPath,
          resumeCommand: `claude --resume ${externalId}`,
          observedState: 'idle',
          stateReason: 'its log last grew 40 minutes ago and a process still names it',
          filesTouched: [],
          filesComplete: true,
          at: '2026-09-20 09:00:00',
        },
      },
    },
  })
  return made.record.id
}

const aSecondLater = () => new Promise((done) => setTimeout(done, 1050))

beforeAll(async () => {
  app = await liveApp({ name: 'the-pane-waits-by-the-server', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const note = await ask<{ record: { id: string } }>('POST', '/api/records', {
    kind: 'note',
    title: 'Coolant pump review notes',
    data: { body: 'Made-up notes about a coolant pump, for this test.' },
  })
  aboutId = note.record.id
  const target = { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } }
  const run = await aRun('Pump bench work', 'ext-pane-waits-pump')
  reviewId = (await ask<{ review: { id: string } }>('POST', '/api/reviews', { entry: target })).review.id
  const comment = async (body: string) => {
    const made = await ask<{ record: { id: string } }>('POST', '/api/records', {
      kind: 'annotation',
      title: body.slice(0, 40),
      data: { body, context: target },
    })
    await aSecondLater()
    return made.record.id
  }
  goes = await comment(GOES)
  await ask('PATCH', `/api/records/${goes}`, { dataPatch: { chosenRecipient: { kind: 'session', sessionId: run } } })
  lost = await comment(LOST)
  await ask('POST', `/api/reviews/${reviewId}/finish-collecting`, {})
  // DELETED AFTER COLLECTING FINISHED, so the review still holds the comment and can no longer find it.
  await ask('DELETE', `/api/records/${lost}`)
  // REMOVE FROM THIS REVIEW NEEDS THE PAIRED BROWSER.
  await app.page.goto(`${app.site}/#/pairing`)
  await waitForThePage(app.page)
  await app.page.getByRole('button', { name: t('g4.pairing.press'), exact: true }).click()
  await app.page.getByText(t('g4.pairing.paired'), { exact: true }).waitFor()
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

interface Detail {
  review: { state: string }
  waitsFor?: string[]
}

interface Plan {
  comments: { id: string; willGo: boolean; yoursToAnswer: boolean; wayOut?: string }[]
  sendLeavesWaiting?: string[]
}

/**
 * Open the page the review is about, then the review pane and the review, and wait until the send plan is drawn. The
 * pane remembers it was open, so a second visit may find the review already open, and pressing the switch again would
 * close it. The messages the plan would write are drawn only once the plan is read, so the heading is then the plan's.
 */
async function openTheSendBlock(): Promise<void> {
  await app.page.goto(`${app.site}/#/r/${aboutId}`)
  await waitForThePage(app.page)
  const drawn = app.page.locator('[data-part="send-the-review"] [data-part="send-messages"]')
  const open = await drawn.waitFor({ timeout: 5_000 }).then(
    () => true,
    () => false,
  )
  if (open) return
  if ((await app.page.locator('.px-pane-list .px-rev-go').count()) === 0) await app.page.locator('.px-review-switch').click()
  await app.page.locator('.px-pane-list .px-rev-go').first().click()
  await drawn.waitFor({ timeout: 30_000 })
}

/** The heading over Send, as the page draws it. */
function theHeading(): Promise<string | null> {
  return app.page.locator('[data-part="send-the-review"] > .px-org-head').textContent()
}

describe('the heading over Send in the review pane', () => {
  it('says the review waits exactly while the server says pressing Send would leave a comment waiting', async () => {
    // A COMMENT THAT CAN NO LONGER BE FOUND. The review waits for it, and its line names the press that takes it out.
    const held = await ask<Detail>('GET', `/api/reviews/${reviewId}`)
    expect(held.review.state).toBe('collected')
    expect([...(held.waitsFor ?? [])].sort()).toEqual([goes, lost].sort())
    const plan = await ask<Plan>('GET', `/api/reviews/${reviewId}/send`)
    expect(plan.comments.find((one) => one.id === goes)?.willGo).toBe(true)
    expect(plan.comments.find((one) => one.id === lost)).toMatchObject({ willGo: false, yoursToAnswer: false, wayOut: 'it-cannot-be-found' })
    await openTheSendBlock()
    expect(await theHeading()).toBe(t('review.delivery.waiting'))
    expect(plan.sendLeavesWaiting).toEqual([lost])

    // REMOVE FROM THIS REVIEW, PRESSED UNDER THE COMMENT IN THE OPEN PANE. What the press did is drawn under the
    // comment, and so is why it failed, so a refused press is named here and not as a heading that never changed.
    const wayOut = app.page.locator('[data-part="way-out"]')
    await wayOut.getByRole('button', { name: t('review.takeOut.remove'), exact: true }).click()
    await expect.poll(() => wayOut.textContent(), { timeout: 30_000 }).toContain(t('review.takeOut.removed'))
    // The review still waits for the comment that will go, and only for the press of Send.
    await expect.poll(() => theHeading(), { timeout: 30_000 }).toBe(t('review.pane.send.head'))
    const left = await ask<Detail>('GET', `/api/reviews/${reviewId}`)
    expect(left.review.state).toBe('collected')
    expect(left.waitsFor).toEqual([goes])
    expect((await ask<Plan>('GET', `/api/reviews/${reviewId}/send`)).sendLeavesWaiting).toEqual([])
  }, 180_000)
})
