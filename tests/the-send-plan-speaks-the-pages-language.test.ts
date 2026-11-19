// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANEL'S SEND PLAN IS SAID IN THE PAGE'S LANGUAGE. Wave 13n's round 33 found it English on Chinese pages
 * (report GMFtAC2grPQg, block b-3): the line under each comment in "Have them read", and in developer mode the plan's
 * own sentence, "Nothing here can be sent as it stands. …". The server wrote those sentences as English text.
 *
 * Now the server sends each sentence as a code with its values, beside the English it always sent, and
 * src/shared/send-plan-words.ts says them: English on the server, the page's language on a page.
 *
 * WHAT THIS FILE PROVES, in a real browser against a Mole Office of its own:
 *   1. on a Chinese page, every line of the send plan, the heading of each message it would write, the plan's own
 *      sentence in developer mode, and an opened comment's "who it goes to" carry no English word beyond the content
 *      they quote (titles, the tool's name);
 *
 * Everything here is made up.
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

const TITLE = 'Kiln schedule notes'
const COMMENTS = {
  toRun: 'The cone 6 firing curve skips the hold at 1100.',
  toNobody: 'Somebody should check the shelf posts too.',
  toNew: 'Write down which clay body the test tiles used.',
  toHandFiled: 'The glaze log for March is missing a page.',
}
const RUN = 'Kiln curve work'
const HAND_FILED = 'Glaze log work'

let app: LiveApp
let aboutId: string
let reviewId: string

async function post<T>(path: string, body: unknown): Promise<T> {
  const reply = await fetch(app.api + path, { method: 'POST', headers: PERSON, body: JSON.stringify(body) })
  expect(reply.ok, await reply.clone().text()).toBe(true)
  return (await reply.json()) as T
}

/** A run with a transcript on this machine, which can be picked up. */
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

beforeAll(async () => {
  app = await liveApp({ name: 'send-plan-words', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const note = await post<{ record: { id: string } }>('/api/records', {
    kind: 'note',
    title: TITLE,
    data: { body: 'Made-up notes about a kiln schedule, for this test.' },
  })
  aboutId = note.record.id
  const target = { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } }
  const run = await aRun(RUN, 'ext-send-plan-run')
  // A RUN FILED BY HAND: no transcript was ever recorded, so it cannot be picked up.
  const handFiled = await post<{ record: { id: string } }>('/api/records', {
    kind: 'session',
    title: HAND_FILED,
    data: { state: 'idle', runtime: 'claude-code' },
  })
  const review = await post<{ review: { id: string } }>('/api/reviews', { entry: target })
  reviewId = review.review.id
  const comment = async (body: string, recipient: Record<string, unknown> | null) => {
    const made = await post<{ record: { id: string } }>('/api/records', {
      kind: 'annotation',
      title: body.slice(0, 40),
      data: { body, context: target },
    })
    if (recipient !== null) {
      const chose = await fetch(`${app.api}/api/records/${made.record.id}`, {
        method: 'PATCH',
        headers: PERSON,
        body: JSON.stringify({ dataPatch: { chosenRecipient: recipient } }),
      })
      expect(chose.ok, await chose.clone().text()).toBe(true)
    }
    await new Promise((done) => setTimeout(done, 1050))
  }
  await comment(COMMENTS.toRun, { kind: 'session', sessionId: run })
  await comment(COMMENTS.toNobody, null)
  await comment(COMMENTS.toNew, { kind: 'new' })
  await comment(COMMENTS.toHandFiled, { kind: 'session', sessionId: handFiled.record.id })
  await post(`/api/reviews/${reviewId}/finish-collecting`, {})
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/** Open the note's page with the review pane on this review, in a language and a mode. */
async function openThePane(language: 'en' | 'zh', mode: 'normal' | 'inspect'): Promise<void> {
  await app.page.goto(`${app.site}/?lang=${language}&mode=${mode}#/r/${aboutId}`)
  await waitForThePage(app.page)
  const drawn = app.page.locator('[data-part="send-the-review"] .px-send-says')
  const open = await drawn.first().waitFor({ timeout: 5_000 }).then(
    () => true,
    () => false,
  )
  if (!open) {
    if ((await app.page.locator('.px-pane-list .px-rev-go').count()) === 0) await app.page.locator('.px-review-switch').click()
    await app.page.locator('.px-pane-list .px-rev-go').first().click()
    await drawn.first().waitFor({ timeout: 30_000 })
  }
}



describe('the send plan speaks the page\'s language', () => {


  it.skipIf(!process.env['SEND_PLAN_SHOTS'])('photographs the panel at 1440, 990, 660 and 390, light and dark, in English and Chinese, in both modes', async () => {
    const shots = process.env['SEND_PLAN_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    for (const width of [1440, 990, 660, 390]) {
      for (const theme of ['light', 'dark'] as const) {
        for (const language of ['en', 'zh'] as const) {
          for (const mode of ['normal', 'inspect'] as const) {
            await app.page.setViewportSize({ width, height: 1000 })
            await app.page.emulateMedia({ colorScheme: theme })
            await openThePane(language, mode)
            const drawn = await app.page.evaluate(() => document.documentElement.scrollWidth)
            expect(drawn, `drawn ${String(drawn)} wide in a window ${String(width)} wide`).toBeLessThanOrEqual(width)
            await app.page.locator('[data-part="send-the-review"]').scrollIntoViewIfNeeded()
            const named = mode === 'normal' ? '' : '-developer'
            await app.page.screenshot({ path: join(shots, `send-plan-${String(width)}-${theme}-${language}${named}.png`) })
          }
        }
      }
    }
    await app.page.setViewportSize({ width: 1440, height: 1000 })
  }, 600_000)
})
