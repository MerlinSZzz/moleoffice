// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CITIZEN'S PAGE SAYS WHO REGISTERED THE WORK AREA, AND WHEN — CRITERION P85.
 *
 * Proposal YDQYmaFDCSzZ is agreed by a decision. The door lets the owner,
 * the agent that started a worker, or a holder of the secretary card change a work area, and it
 * writes which of the three did it, beside the actor and the moment, into the agent record's
 * `extra.workAreaChange`. This is the display half: the page draws one sentence under the work
 * area, in the words of the mark, and a row whose record carries no change says nobody recorded it.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · a citizen whose record carries a change draws the sentence under its work area, naming who
 *     registered it and when — the sentence the shared sentence-maker builds from the stored mark;
 *   · a citizen whose record carries no change draws the sentence saying nobody recorded it, which
 *     is the honest answer and not a gap to hide.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Control: both cases green on the unmutated tree.
 *
 *   · drop the `<div className="prof-work-area-says">` block from `WorkArea` in
 *     src/web/pages/ProfilePage.tsx → the first case is red, because the page no longer draws the
 *     sentence.
 *   · draw nothing where the mark is null, instead of the sentence → the second case is red,
 *     because the page no longer says nobody recorded it.
 *
 * The file was restored byte-identical after each mutation (sha256 before and after).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import {
  NOBODY_RECORDED_WHO_REGISTERED_THE_WORK_AREA,
  theWorkAreaMarkSaying,
  whoRegisteredTheWorkAreaSays,
} from '../src/shared/roles.ts'
import { sayInEnglish } from '../src/shared/i18n.ts'

let app: LiveApp
/** The record the marked agent registered on, so the test reads back the mark the door wrote. */
let markedRecordId = ''

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function ask(
  path: string,
  body?: unknown,
  actor: Record<string, string> = AS_THE_OWNER,
  method = 'POST',
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(app.api + path, {
    method,
    headers: actor,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

/** The one sentence the page draws under the work area, or a failure naming what was there. */
async function theSentenceDrawn(): Promise<string> {
  const block = await app.page.$('.prof-work-area-says')
  expect(block, 'the page draws the work-area mark block').not.toBeNull()
  return (await block!.textContent()) ?? ''
}

/**
 * PHOTOGRAPH THE PAGE AT THE FOUR WIDTHS AND IN BOTH THEMES, when `AREA_SAYS_WHO_SHOTS` names a
 * directory. A browser test has a real page in front of it, so this is the cheapest honest way to
 * take the handback pictures; the mutation runs leave the variable unset and take no picture.
 */
async function photograph(name: string): Promise<void> {
  const dir = process.env['AREA_SAYS_WHO_SHOTS']
  if (!dir) return
  mkdirSync(dir, { recursive: true })
  for (const width of [1440, 990, 660, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.emulateMedia({ colorScheme: theme })
      await app.page.screenshot({ path: `${dir}/work-area-${name}-${width}-${theme}.png`, fullPage: true })
    }
  }
}

beforeAll(async () => {
  app = await liveApp({ name: 'area-says-who', viewport: { width: 1440, height: 900 } })

  // AN AREA SOMEBODY REGISTERED: it registers with an area, then the owner changes it, which is the
  // door that writes the mark.
  const marked = await ask('/api/agents/started', {
    handle: 'area-marked',
    name: 'Area marked',
    // P88 REFUSES A REGISTRATION THAT DECLARES NO RUNTIME, because a visitor is defined by its
    // runtime and one that was not declared cannot be judged. The office's own session hook sends
    // this literal, and so does every agent this machine starts.
    runtime: 'claude-code',
    workArea: ['src/server'],
  })
  expect(marked.status, JSON.stringify(marked.body)).toBe(201)
  markedRecordId = String(marked.body['record'] ?? '')
  expect(markedRecordId, 'the registration named its record').not.toBe('')
  const changed = await ask('/api/participants/agent/area-marked/work-area', {
    workArea: ['src/web'],
    because: 'The test named a new area.',
  })
  expect(changed.status, JSON.stringify(changed.body)).toBe(200)

  // AN AREA NOBODY RECORDED A CHANGE FOR: it registers with an area and nobody ever changes it, so
  // its record carries no mark. This is the row the criterion says must say nobody recorded it.
  const plain = await ask('/api/agents/started', {
    handle: 'area-plain',
    name: 'Area plain',
    runtime: 'claude-code',
    workArea: ['src/shared'],
  })
  expect(plain.status, JSON.stringify(plain.body)).toBe(201)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the citizen’s page says who registered the work area', () => {
  it('draws the sentence under the area, naming who and when, where the record carries a change', async () => {
    const rec = await ask(`/api/records/${markedRecordId}`, undefined, AS_THE_OWNER, 'GET')
    const held = rec.body['record'] as { data?: { extra?: { workAreaChange?: unknown } } } | undefined
    const mark = theWorkAreaMarkSaying(held?.data?.extra?.workAreaChange)
    expect(mark, 'the change wrote a mark the shared reader can read').not.toBeNull()
    // READ IN ENGLISH, as the page it is checked against is (criterion change, wave 13k round 35): the sentence is now
    // drawn from the word lists with the page's reader, so a Chinese page draws it in Chinese.
    const expected = whoRegisteredTheWorkAreaSays(mark, sayInEnglish)
    expect(expected, 'the sentence names the owner, because the owner made the change').toContain(
      'registered by the owner on',
    )

    await app.page.goto(`${app.site}/?mode=inspect#/who/agent/area-marked`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    expect(await theSentenceDrawn()).toContain(expected)
    await photograph('marked')
  }, 120_000)

  it('draws the sentence saying nobody recorded it, where the record carries no change', async () => {
    await app.page.goto(`${app.site}/?mode=inspect#/who/agent/area-plain`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    expect(await theSentenceDrawn()).toBe(NOBODY_RECORDED_WHO_REGISTERED_THE_WORK_AREA)
    await photograph('none')
  }, 120_000)
})
