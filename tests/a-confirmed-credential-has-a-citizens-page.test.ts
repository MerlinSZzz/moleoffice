// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CONFIRMED CREDENTIAL LEADS TO A CITIZEN'S PAGE THAT ANSWERS. Problem dOhkq6Nrbq2b, closed.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT HAPPENED, AND WHAT WAS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * A credential was confirmed at the Embassy, the row it produced was pressed, and the page said the agent
 * did not exist. perm-5a fixed the half that was about the row vanishing and drew the card from the
 * credential; the other half stayed open, and it is this: a confirm wrote only the credential's
 * standing, so there was no registry row and no agent record for the page to read.
 *
 * MEASURED BEFORE THIS BRANCH, 8 September 2026: `GET /api/participants/agent/codex-far` answered
 * 404 with "No agent in this installation answers to codex-far" both before the confirm and after
 * it, and `GET /api/participants` did not hold the handle at all.
 *
 * THIS FILE IS IN A REAL BROWSER, because the problem was about a page rather than about a reply.
 * The reply is measured next door, in
 * tests/a-confirmed-credential-carries-the-card-it-asked-for.test.ts.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   In src/server/api/visitors.ts, have the confirm route not call `theCitizenAConfirmMakes` → the
 *   page says the agent does not exist, exactly as it did before this branch.
 */

import { THE_TEST_FIXTURE_ROOT } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { PROFILE_SEGMENT } from '../src/shared/profile.ts'

let app: LiveApp
let page: Page

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const reply = await fetch(`${app.api}${path}`, {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: JSON.stringify(body),
  })
  const said = (await reply.json()) as Record<string, unknown>
  expect(reply.status, JSON.stringify(said).slice(0, 300)).toBeLessThan(300)
  return said
}

beforeAll(async () => {
  // THIS FILE IS ABOUT WHAT IS INSIDE A REPORT'S BODY, SO IT SAYS WHICH LEVEL IT READS AT.
  // The owner's act 3a of 15 September 2026 made a record page open at the
  // conclusion, where the body holds the summary and nothing else, so a test that measures a
  // diagram, a picture, a mark, a tab stop or a panel inside the writing found an empty body and
  // waited for a selector that would never appear. `opensAt` writes the reader's own stored
  // choice before the page loads, so this file is about its own subject again and not about the
  // level a page opens at. That level has its own test in
  // tests/a-reader-goes-no-lower-than-conclusion.test.ts, which stores nothing.
  app = await liveApp({ opensAt: 'full', name: 'confirmed-has-a-page', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  const asked = await post('/api/office/visitors', {
    handle: 'codex-far',
    name: 'Codex on loquat',
    role: 'supervisor',
    conversationPath: `${THE_TEST_FIXTURE_ROOT}/.claude/projects/loquat/codex-far.jsonl`,
    runtime: 'codex',
  })
  const credential = asked.credential as { id: string }
  await post(`/api/office/visitors/${credential.id}/confirm`, {})
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('the page a confirmed credential leads to', () => {
  it('draws the citizen rather than saying the agent does not exist', async () => {
    await page.goto(`${app.site}/#/${PROFILE_SEGMENT}/agent/codex-far`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const said = await page.evaluate(() => ({
      text: document.querySelector('main')?.textContent ?? '',
      faults: document.querySelectorAll('.fault').length,
    }))
    expect(said.text, 'the name the credential asked for').toContain('Codex on loquat')
    expect(said.text, 'and it does not say the agent is missing').not.toContain('does not exist')
    expect(said.text).not.toContain('No agent in this installation answers')
    expect(said.faults, 'and the page did not stop while it was being drawn').toBe(0)
  })

  it('draws the card the credential asked for, and who gave it', async () => {
    const text = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    expect(text, 'the card asked for').toContain('supervisor')
    expect(text, 'and that the owner gave it when the owner confirmed').toContain('credential')
  })

  it('is reached from the Embassy row', async () => {
    // THE CITIZEN'S PAGE IS ADDRESSED BY ITS REGISTRY ID, which since the mint is not its handle.
    const citizen = (await (await fetch(`${app.api}/api/participants/agent/codex-far`, { headers: AS_THE_PERSON })).json()) as {
      participant: { id: string }
    }
    const id = citizen.participant.id
    await page.goto(`${app.site}/#/embassy`, { timeout: 60_000 })
    await waitForThePage(page, 60_000)
    const href = await page.evaluate(
      (wanted) =>
        [...document.querySelectorAll('a')]
          .map((one) => one.getAttribute('href') ?? '')
          .find((one) => one.includes(wanted)) ?? null,
      id,
    )
    expect(href, 'the Embassy has a press that opens the citizen').toContain(id)
  })
})
