// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY SAYS WHY A VISITOR UNDER A TAKEN HANDLE IS NOT LET IN. Problem z-9zXhVeAPvA.
 *
 * The confirm door refuses a credential whose handle already names an agent here, and it writes
 * nothing. The person meets that refusal on the Embassy, when they press Let it in on the card. The
 * card draws the server's own sentence in its fault line, as it does for every refusal, so the
 * sentence is drawn on a page. This file presses the button in a real browser and reads the page:
 * the sentence names the agent, the card is still waiting, and the credential is still pending.
 *
 * THE PICTURES ARE TAKEN ONLY WHEN `VISITOR_REFUSAL_SHOTS` NAMES A DIRECTORY, the same shape the
 * other photographing tests use, so an ordinary run takes none. Chapter 6: 1440, 990, 660 and 390,
 * light and dark.
 *
 * THE MUTATION THAT TURNS THIS RED, WITH A CONTROL RUN FIRST: in src/server/api/visitors.ts, the
 * confirm route, drop the `throw` after `whyAVisitorMayNotTakeThisHandle` → the press answers 500
 * with a different sentence and the card's fault line does not name the agent.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'

import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { EMBASSY_WORDS } from '../src/web/pages/EmbassyPage.tsx'

let app: LiveApp
let page: Page
let credentialId = ''
let localId = ''

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
  app = await liveApp({ name: 'taken-handle-refused', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  page = app.page
  // THE VISITOR ASKS FIRST, while the handle is free, and a local agent takes the handle afterwards.
  // That is the order the ask door cannot catch and the confirm door must.
  const asked = await post('/api/office/visitors', {
    handle: 'late-taken',
    name: 'The visitor late-taken',
    role: 'worker',
    conversationPath: '/tmp/late-taken.jsonl',
  })
  credentialId = (asked.credential as { id: string }).id
  const local = await post('/api/agents/started', {
    handle: 'late-taken',
    name: 'Late taken',
    runtime: 'claude-code',
    role: 'worker',
  })
  localId = (local.agent as { id: string }).id
  await page.goto(`${app.site}/#/embassy`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

describe('pressing Let it in on a visitor whose handle an agent here already bears', () => {
  it('draws the refusal naming the agent, and the card stays waiting', async () => {
    await page.getByText('The visitor late-taken').first().waitFor()
    await page.getByRole('button', { name: EMBASSY_WORDS.confirm }).click()
    const refusal = page.getByText('already names an agent here').first()
    await refusal.waitFor({ timeout: 20_000 })
    const drawn = (await refusal.textContent()) ?? ''
    expect(drawn).toContain(`Late taken (${localId}): a live agent bears it as its handle`)
    expect(drawn).toContain('Nothing was confirmed')
    expect(
      await page.evaluate(() => document.querySelectorAll('[data-target$="embassy.asking"]').length),
      'the card is still waiting',
    ).toBe(1)
    const one = (await (
      await fetch(`${app.api}/api/office/visitors/${credentialId}`, { headers: AS_THE_PERSON })
    ).json()) as { credential: { standing: string } }
    expect(one.credential.standing, 'and the credential is still pending').toBe('pending')

    const shots = process.env['VISITOR_REFUSAL_SHOTS']
    if (shots !== undefined && shots !== '') {
      mkdirSync(shots, { recursive: true })
      for (const width of [1440, 990, 660, 390]) {
        for (const theme of ['light', 'dark'] as const) {
          await page.setViewportSize({ width, height: 1000 })
          await page.emulateMedia({ colorScheme: theme })
          await page.screenshot({ path: `${shots}/embassy-taken-handle-${String(width)}-${theme}.png`, fullPage: true })
        }
      }
    }
  }, 120_000)
})
