// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANE SHOWS, BEFORE THE PRESS, ONE MESSAGE FOR EACH AGENT.
 *
 * A sent review goes as one message per recipient, each comment numbered in the order written with
 * what it was left on above its words. The person reads that grouping in the review pane before
 * pressing Send, drawn from the server's preview (GET /api/reviews/:id/send), which is worked out by
 * the same function the send writes with.
 *
 * Against a Mole Office of this test's own, in Chromium. The people, runs and notes are made up.
 * With REVIEW_MERGE_SHOTS naming a folder, it also saves pictures of the pane at four widths in
 * both looks, and at 1440 in Chinese.
 */

import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { fakeTranscript, liveApp, waitForThePage, type LiveApp } from './helpers.ts'

const PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const FIRST = 'The pump curve on page two does not match the bench test.'
const SECOND = 'The valve drawing still shows the old flange.'
const THIRD = 'Say which bench rig the pump numbers came from.'
const NOBODY = 'Somebody should check the seal material too.'

let app: LiveApp
let aboutId: string
let reviewId: string

async function post<T>(path: string, body: unknown): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** A run the office could pick up again, with a transcript this machine holds. */
async function aRun(title: string, externalId: string): Promise<string> {
  const logPath = fakeTranscript(externalId)
  const made = await post<{ record: { id: string } }>('/api/records', {
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
  app = await liveApp({ name: 'review-merge-preview', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const note = await post<{ record: { id: string } }>('/api/records', {
    kind: 'note',
    title: 'Coolant pump review notes',
    data: { body: 'Made-up notes about a coolant pump, its valve and its seal, for this test.' },
  })
  aboutId = note.record.id
  const target = { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } }
  const pump = await aRun('Pump bench work', 'ext-preview-pump')
  const valve = await aRun('Valve drawing work', 'ext-preview-valve')
  const review = await post<{ review: { id: string } }>('/api/reviews', { entry: target })
  reviewId = review.review.id
  // A COMMENT, AND THEN THE PRESS "choose who it is for", which is an ordinary patch of it.
  const comment = async (body: string, sessionId: string | null) => {
    const made = await post<{ record: { id: string } }>('/api/records', {
      kind: 'annotation',
      title: body.slice(0, 40),
      data: { body, context: target },
    })
    if (sessionId !== null) {
      const chose = await fetch(`${app.api}/api/records/${made.record.id}`, {
        method: 'PATCH',
        headers: PERSON,
        body: JSON.stringify({ dataPatch: { chosenRecipient: { kind: 'session', sessionId } } }),
      })
      expect(chose.ok, await chose.clone().text()).toBe(true)
    }
    await aSecondLater()
  }
  await comment(FIRST, pump)
  await comment(SECOND, valve)
  await comment(THIRD, pump)
  await comment(NOBODY, null)
  await post(`/api/reviews/${reviewId}/finish-collecting`, {})
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * Open the page the review is about, then the review pane and the review. The pane remembers it was
 * open, so a second visit may find the review already open, and pressing the switch again would
 * close it.
 */
async function openTheSendPreview(address: string): Promise<void> {
  await app.page.goto(address)
  await waitForThePage(app.page)
  const drawn = app.page.locator('[data-part="send-messages"]')
  const open = await drawn.waitFor({ timeout: 5_000 }).then(
    () => true,
    () => false,
  )
  if (open) return
  if ((await app.page.locator('.px-pane-list .px-rev-go').count()) === 0) await app.page.locator('.px-review-switch').click()
  await app.page.locator('.px-pane-list .px-rev-go').first().click()
  await drawn.waitFor({ timeout: 30_000 })
}

describe('the send preview in the review pane', () => {
  it('shows one message for each agent, numbered in the order written, and leaves out the comment nobody chose', async () => {
    await openTheSendPreview(`${app.site}/#/r/${aboutId}`)
    const messages = app.page.locator('[data-part="send-messages"] > .px-send-message')
    expect(await messages.count()).toBe(2)

    const toPump = messages.nth(0)
    expect(await toPump.locator('.px-send-to').innerText()).toBe('To Pump bench work: one message with 2 comments')
    const pumpComments = await toPump.locator('.px-send-carried .px-send-body').allInnerTexts()
    expect(pumpComments).toEqual([`“${FIRST}”`, `“${THIRD}”`])
    expect(await toPump.locator('.px-send-carried').evaluateAll((all) => all.map((li) => (li as HTMLLIElement).value))).toEqual([
      1, 2,
    ])
    expect(await toPump.locator('.px-send-carried .px-send-quote').first().innerText()).toContain('Coolant pump review notes')

    const toValve = messages.nth(1)
    expect(await toValve.locator('.px-send-to').innerText()).toBe('To Valve drawing work: one message with 1 comment')
    expect(await toValve.locator('.px-send-carried .px-send-body').allInnerTexts()).toEqual([`“${SECOND}”`])

    const grouped = await app.page.locator('[data-part="send-messages"]').innerText()
    expect(grouped).not.toContain(NOBODY)
    // THE COMMENT NOBODY CHOSE ANYBODY FOR IS STILL LISTED, in the line per comment below.
    expect(await app.page.locator('.px-send-list').innerText()).toContain(NOBODY)

    const shots = process.env['REVIEW_MERGE_SHOTS']
    if (shots !== undefined) {
      mkdirSync(shots, { recursive: true })
      const block = app.page.locator('[data-part="send-the-review"]')
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await app.page.setViewportSize({ width, height: 1000 })
          await app.page.emulateMedia({ colorScheme: theme })
          await block.scrollIntoViewIfNeeded()
          await app.page.screenshot({ path: join(shots, `send-preview-${String(width)}-${theme}.png`) })
        }
      }
      await app.page.setViewportSize({ width: 1440, height: 1000 })
      await openTheSendPreview(`${app.site}/?lang=zh#/r/${aboutId}`)
      expect(await app.page.locator('[data-part="send-messages"] .px-send-to').first().innerText()).toBe(
        '发给 Pump bench work：一条消息，含 2 条评论',
      )
      for (const theme of ['light', 'dark'] as const) {
        await app.page.emulateMedia({ colorScheme: theme })
        await app.page.locator('[data-part="send-the-review"]').scrollIntoViewIfNeeded()
        await app.page.screenshot({ path: join(shots, `send-preview-1440-${theme}-zh.png`) })
      }
    }
  }, 180_000)
})
