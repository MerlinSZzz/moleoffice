// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REVIEW PANE NAMES WHAT A COMMENT QUOTES IN WORDS. Problem F6-GRSXrBMtJ.
 *
 * One thing, in one browser against a Mole Office of this test's own:
 *
 * 1. The send preview's numbered quote line names the note by its title and shows no record id in
 *    Normal mode. Developer mode shows the ids beside the line.
 *
 * The note, the runs and the comments are made up. With REVIEW_WORDS_SHOTS naming a folder, it also
 * saves pictures of the pane at four widths in both looks, and at 1440 in Chinese.
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

const TITLE = 'Coolant pump review notes'
const FIRST = 'The pump curve on page two does not match the bench test.'
const SECOND = 'The valve drawing still shows the old flange.'
const THIRD = 'Say which bench rig the pump numbers came from.'
const NOBODY = 'Somebody should check the seal material too.'
const RUNS = ['Pump bench work', 'Valve drawing work']

let app: LiveApp
let aboutId: string

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

beforeAll(async () => {
  app = await liveApp({ name: 'review-words', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const note = await post<{ record: { id: string } }>('/api/records', {
    kind: 'note',
    title: TITLE,
    data: { body: 'Made-up notes about a coolant pump, its valve and its seal, for this test.' },
  })
  aboutId = note.record.id
  const target = { target: { kind: 'record', recordId: aboutId, workspaceId: 'default' }, place: { at: 'surface' } }
  const pump = await aRun(RUNS[0] ?? '', 'ext-words-pump')
  const valve = await aRun(RUNS[1] ?? '', 'ext-words-valve')
  const review = await post<{ review: { id: string } }>('/api/reviews', { entry: target })
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
    await new Promise((done) => setTimeout(done, 1050))
  }
  await comment(FIRST, pump)
  await comment(SECOND, valve)
  await comment(THIRD, pump)
  await comment(NOBODY, null)
  await post(`/api/reviews/${review.review.id}/finish-collecting`, {})
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * Open the page the review is about, then the review pane and the review. The pane remembers it was
 * open, so a second visit may find the review already open, and pressing the switch again would
 * close it.
 */
async function openThePane(address: string): Promise<void> {
  await app.page.goto(address)
  await waitForThePage(app.page)
  const drawn = app.page.locator('[data-part="send-messages"]')
  const open = await drawn.waitFor({ timeout: 5_000 }).then(
    () => true,
    () => false,
  )
  if (!open) {
    if ((await app.page.locator('.px-pane-list .px-rev-go').count()) === 0) await app.page.locator('.px-review-switch').click()
    await app.page.locator('.px-pane-list .px-rev-go').first().click()
    await drawn.waitFor({ timeout: 30_000 })
  }
  await app.page.locator('[data-part="have-them-read"] .px-org-head').waitFor({ timeout: 30_000 })
}

describe('the review pane', () => {
  it('names the note by its title in the quote line, with no id in Normal mode and the id in developer mode', async () => {
    await openThePane(`${app.site}/?mode=normal#/r/${aboutId}`)
    const quotes = await app.page.locator('[data-part="send-messages"] .px-send-quote').allInnerTexts()
    expect(quotes.length).toBe(3)
    for (const quote of quotes) {
      expect(quote).toBe(`On the note "${TITLE}"`)
      expect(quote).not.toContain(aboutId)
    }
    expect(await app.page.locator('[data-part="send-messages"]').innerText()).not.toContain(aboutId)
    expect(await app.page.locator('[data-part="send-quote-ids"]').count()).toBe(0)

    await openThePane(`${app.site}/?mode=inspect#/r/${aboutId}`)
    const ids = await app.page.locator('[data-part="send-quote-ids"]').allInnerTexts()
    expect(ids.length).toBe(3)
    for (const one of ids) expect(one).toContain(aboutId)
    const shots = process.env['REVIEW_WORDS_SHOTS']
    if (shots !== undefined) {
      mkdirSync(shots, { recursive: true })
      await app.page.locator('[data-part="send-messages"]').scrollIntoViewIfNeeded()
      await app.page.screenshot({ path: join(shots, 'send-preview-1440-light-developer.png') })
    }
  }, 180_000)
})
