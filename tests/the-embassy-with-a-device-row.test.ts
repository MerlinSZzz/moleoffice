// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON'S DEVICE ROW, PHOTOGRAPHED ON HIS CARD, WITH ITS REVOKE PRESS.
 *
 * Criterion D4, and chapter 6's rule: every screen is looked at at four widths and in both themes.
 * `tools/review.mjs` cannot photograph anything today (problem bfvKtNhVC4L5 — it cannot reach
 * `#/incident`), so this uses what Cluster C used for its own handbacks: a browser test that starts
 * its stack through `liveApp`, drives the real page in a real browser, and writes PNGs. The stack is
 * the test's own — no server of the worker's is started or left running.
 *
 * IT SEEDS THE ROW IT PHOTOGRAPHS, through the doors rather than by writing the table: a device asks
 * with POST /api/office/visitors, the owner confirms it, and the confirmation binds the device's
 * token as its key. Since design C of early idea B9 the row is on the owner's own person card and
 * not on the Embassy, and the card's row carries its revoke press. The Embassy draws no device row,
 * and that is asserted here too.
 *
 * THE PICTURES ARE TAKEN ONLY WHEN `P83_DEVICE_SHOTS` NAMES A DIRECTORY, the same shape the other
 * photographing tests use, so an ordinary run takes none. They go in this worktree's `.logs/`.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdirSync } from 'node:fs'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { apiApp, freshDb, liveApp, waitForThePage } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { WhatTheEmbassySays } from '../src/shared/worlds.ts'
import type { VisitorCredential } from '../src/shared/visitors.ts'
import type { WhatTheOfficeTrusts } from '../src/shared/trustedmachines.ts'

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const AS_AN_AGENT = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'a-device-that-is-not-the-person',
}

describe('a person’s device row on his card, and its revoke press', () => {
  it.skipIf(!process.env['P83_DEVICE_SHOTS'])(
    'photographs the device row and its press at 1440, 1024, 768 and 390 in both themes',
    async () => {
      const shots = process.env['P83_DEVICE_SHOTS'] as string
      mkdirSync(shots, { recursive: true })
      const live = await liveApp({
        name: 'p83-device-photos',
        viewport: { width: 1440, height: 1000 },
        workspace: 'default',
      })
      try {
        // A DEVICE ASKS, THE OWNER CONFIRMS: the two doors, not a seeded row.
        const asked = await fetch(`${live.api}/api/office/visitors`, {
          method: 'POST',
          headers: AS_AN_AGENT,
          body: JSON.stringify({ device: `${THE_TEST_OFFICES_OWNER.id}-macbook` }),
        })
        const askedText = await asked.text()
        expect(asked.status, askedText).toBe(201)
        const issued = JSON.parse(askedText) as { credential: { id: string } }
        const confirmed = await fetch(`${live.api}/api/office/visitors/${issued.credential.id}/confirm`, {
          method: 'POST',
          headers: AS_THE_PERSON,
          body: '{}',
        })
        const confirmedText = await confirmed.text()
        expect(confirmed.status, confirmedText).toBe(200)

        // THE EMBASSY DRAWS NO DEVICE ROW: the device is on his card, design C of early idea B9.
        await live.page.goto(`${live.site}/#/embassy`, { timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        await live.page.locator('.emb-row').first().waitFor()
        expect(await live.page.content()).not.toContain('data-device="yes"')
        // THE ROW IS ON HIS CARD, WITH ITS PRESS. The picture shows the row and the press.
        const { hisBrowserPath } = await import('../src/web/components/router.tsx')
        await live.page.goto(`${live.site}/#${hisBrowserPath(issued.credential.id)}`, { timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        const row = live.page.locator(`[data-browser="${issued.credential.id}"]`)
        await row.getByText(`${THE_TEST_OFFICES_OWNER.id}-macbook`).first().waitFor()
        const { en } = await import('../src/shared/words/en.ts')
        expect(await row.getByRole('button', { name: en['embassyKeys.revokeOwn'], exact: true }).count()).toBe(1)

        for (const width of [1440, 1024, 768, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await live.page.setViewportSize({ width, height: 1000 })
            await live.page.emulateMedia({ colorScheme: theme })
            await live.page.screenshot({
              path: `${shots}/p83-device-card-${String(width)}-${theme}.png`,
              fullPage: true,
            })
          }
        }
      } finally {
        await live.stop()
      }
    },
    300_000,
  )

  /**
   * BOTH KINDS WAITING, LOOKED AT. Chapter 6's first rule. Since design C of early idea B9 the device
   * waits on his card and the agent on the Embassy, so each page is looked at with its own waiting
   * card at every width and in both themes.
   */
  it.skipIf(!process.env['DWH_WAITING_SHOTS'])(
    'photographs a waiting device and a waiting agent at 1440, 1024, 768 and 390 in both themes',
    async () => {
      const shots = process.env['DWH_WAITING_SHOTS'] as string
      mkdirSync(shots, { recursive: true })
      const live = await liveApp({
        name: 'dwh-waiting-photos',
        viewport: { width: 1440, height: 1000 },
        workspace: 'default',
      })
      try {
        // A DEVICE AND AN AGENT, BOTH WAITING, through the ask door. The device asks for no card and
        // the agent asks as a worker, so the two rows the picture needs are different shapes.
        const device = await fetch(`${live.api}/api/office/visitors`, {
          method: 'POST',
          headers: AS_AN_AGENT,
          body: JSON.stringify({ device: `${THE_TEST_OFFICES_OWNER.id}-macbook` }),
        })
        expect(device.status, await device.text()).toBe(201)
        const agent = await fetch(`${live.api}/api/office/visitors`, {
          method: 'POST',
          headers: AS_AN_AGENT,
          body: JSON.stringify({
            handle: 'codex-on-loquat',
            name: 'Codex on Loquat',
            role: 'worker',
            conversationPath: '/tmp/codex-on-loquat.jsonl',
          }),
        })
        expect(agent.status, await agent.text()).toBe(201)

        const { whoPath } = await import('../src/web/components/router.tsx')
        for (const [page, path, waiting] of [
          ['embassy', '/embassy', 'Codex on Loquat'],
          ['card', whoPath('person', THE_PERSON), `${THE_TEST_OFFICES_OWNER.id}-macbook`],
        ] as const) {
          await live.page.goto(`${live.site}/#${path}`, { timeout: 60_000 })
          await waitForThePage(live.page, 60_000)
          await live.page.locator('.emb-asking-card').getByText(waiting).first().waitFor()
          for (const width of [1440, 1024, 768, 390]) {
            for (const theme of ['light', 'dark'] as const) {
              await live.page.setViewportSize({ width, height: 1000 })
              await live.page.emulateMedia({ colorScheme: theme })
              await live.page.screenshot({
                path: `${shots}/waiting-${page}-${String(width)}-${theme}.png`,
                fullPage: true,
              })
            }
          }
        }
      } finally {
        await live.stop()
      }
    },
    300_000,
  )
})

/**
 * EACH WAITING CREDENTIAL HAS A CARD OF ITS OWN — A DEVICE AND AN AGENT.
 *
 * Criterion D2 and the ruling: the sentence above the block called every waiting credential
 * "this agent", and one block can hold a device and an agent at once. Each card then drew its own
 * sentence, "This device can join once you let it in." or the same for an agent. The page draws no
 * sentence on what a press does now, as decided, so this asks for what each card still draws: a
 * card for each credential, each with both presses. It seeds both through the ask door and reads
 * the cards off the drawn pages, so one block for both cannot pass.
 *
 * SINCE DESIGN C OF EARLY IDEA B9 THE TWO WAIT IN TWO PLACES: the agent on the Embassy, and the
 * device in the part of his card that holds his browsers. Each is still a card of its own with both
 * presses.
 */
describe('the waiting rows', () => {
  it('draws a waiting device and a waiting agent each on a card of its own, with both presses on each', async () => {
    const t = await freshDb()
    const app = (await apiApp()).app
    await app.ready()
    try {
      const asked = await app.inject({
        method: 'POST',
        url: '/api/office/visitors',
        headers: AS_AN_AGENT,
        payload: { device: `${THE_TEST_OFFICES_OWNER.id}-waiting-book` },
      })
      expect(asked.statusCode, asked.body).toBe(201)
      const worker = await app.inject({
        method: 'POST',
        url: '/api/office/visitors',
        headers: AS_AN_AGENT,
        payload: {
          handle: 'a-waiting-worker',
          name: 'A waiting worker',
          role: 'worker',
          conversationPath: '/tmp/a-waiting-worker.jsonl',
        },
      })
      expect(worker.statusCode, worker.body).toBe(201)

      const said = await app.inject({ method: 'GET', url: '/api/office/embassy', headers: AS_THE_PERSON })
      expect(said.statusCode, said.body).toBe(200)
      const ep = await import('../src/web/pages/EmbassyPage.tsx')
      const page = renderToStaticMarkup(h(ep.TheEmbassy, { said: said.json() as WhatTheEmbassySays }))
      const listed = await app.inject({ method: 'GET', url: '/api/office/visitors', headers: AS_THE_PERSON })
      expect(listed.statusCode, listed.body).toBe(200)
      const trusted = await app.inject({ method: 'GET', url: '/api/office/trusted-machines', headers: AS_THE_PERSON })
      expect(trusted.statusCode, trusted.body).toBe(200)
      const part = await import('../src/web/components/YourBrowsersAndMachines.tsx')
      const card = renderToStaticMarkup(h(part.TheBrowsersAndMachines, {
        visitors: { status: 'ready', value: (listed.json() as { credentials: VisitorCredential[] }).credentials },
        trusted: { status: 'ready', value: trusted.json() as WhatTheOfficeTrusts },
        thisBrowser: null,
        row: null,
        onChanged: () => {},
      }))

      // ONE CARD PER CREDENTIAL, so a single block drawn above the list cannot satisfy this.
      const onTheEmbassy = page.split('<li class="emb-row emb-asking-card"').slice(1)
      const onHisCard = card.split('<li class="emb-row emb-asking-card"').slice(1)
      expect(onTheEmbassy, 'the agent on the Embassy').toHaveLength(1)
      expect(onTheEmbassy.filter((one) => one.includes('>A waiting worker</a>')), 'on a card of its own').toHaveLength(1)
      expect(onHisCard, 'the device on his card').toHaveLength(1)
      expect(onHisCard[0], 'on a card of its own').toContain(`${THE_TEST_OFFICES_OWNER.id}-waiting-book`)
      for (const card of [...onTheEmbassy, ...onHisCard]) {
        expect(card, 'the press that lets it in').toContain(ep.EMBASSY_WORDS.confirm)
        expect(card, 'the press that refuses it').toContain(ep.EMBASSY_WORDS.refuse)
      }
      // The question and the act are proved in embassy-pages-in-three-languages.test.ts.
    } finally {
      await app.close()
      t.close()
    }
  })
})
