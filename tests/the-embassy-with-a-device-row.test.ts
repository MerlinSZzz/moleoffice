// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE EMBASSY WITH A PERSON'S DEVICE ROW, PHOTOGRAPHED; ITS REVOKE PRESS IS ON THE CREDENTIAL PAGE.
 *
 * Criterion D4, and chapter 6's rule: every screen is looked at at four widths and in both themes.
 * `tools/review.mjs` cannot photograph anything today (problem bfvKtNhVC4L5 — it cannot reach
 * `#/incident`), so this uses what Cluster C used for its own handbacks: a browser test that starts
 * its stack through `liveApp`, drives the real page in a real browser, and writes PNGs. The stack is
 * the test's own — no server of the worker's is started or left running.
 *
 * IT SEEDS THE ROW IT PHOTOGRAPHS, through the doors rather than by writing the table: a device asks
 * with POST /api/office/visitors, the owner confirms it, and the confirmation binds the device's
 * token as its key. The row then carries the device word, which is what the picture is for. Its
 * revoke press is on the credential page the row opens, by a decision on question 15. So
 * the row draws none, and that is asserted here too.
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

describe('the Embassy with a person’s device row and its revoke press', () => {
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

        await live.page.goto(`${live.site}/#/embassy`, { timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        // THE ROW IS A DEVICE, AND ITS PRESS IS ON ITS OWN PAGE, NOT ON THE ROW, as question 15 of report
        // n9Mjk3c_sJRu says. The picture shows the row; the credential page has the
        // press.
        await live.page.getByText(`${THE_TEST_OFFICES_OWNER.id}-macbook`).first().waitFor()
        const drawn = await live.page.content()
        expect(drawn).toContain('data-device="yes"')
        expect(drawn).not.toContain('Revoke key')

        for (const width of [1440, 1024, 768, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await live.page.setViewportSize({ width, height: 1000 })
            await live.page.emulateMedia({ colorScheme: theme })
            await live.page.screenshot({
              path: `${shots}/p83-device-embassy-${String(width)}-${theme}.png`,
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
   * THE BLOCK WITH BOTH KINDS WAITING IN IT, LOOKED AT. Chapter 6's first rule, and the reason the
   * sentence moved onto the card: a block can hold a device and an agent at the same time, so the
   * page has to be looked at with both present at every width and in both themes.
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

        await live.page.goto(`${live.site}/#/embassy`, { timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        await live.page.getByText(`${THE_TEST_OFFICES_OWNER.id}-macbook`).first().waitFor()
        await live.page.getByText('Codex on Loquat').first().waitFor()

        for (const width of [1440, 1024, 768, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await live.page.setViewportSize({ width, height: 1000 })
            await live.page.emulateMedia({ colorScheme: theme })
            await live.page.screenshot({
              path: `${shots}/waiting-embassy-${String(width)}-${theme}.png`,
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
})

/**
 * THE WAITING ROW SAYS WHAT IT IS — A DEVICE OR AN AGENT.
 *
 * Criterion D2 and the ruling: the sentence above the block called every waiting credential
 * "this agent", and one block can hold a device and an agent at once. It is drawn on each card now,
 * with the credential's own word. This seeds both through the ask door and reads the words off the
 * drawn page, so a single sentence above the list cannot pass.
 */
describe('the waiting row says what it is', () => {
  it('calls a waiting device a device and a waiting agent an agent, on their own rows', async () => {
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

      const deviceSays = ep.EMBASSY_WORDS.waitingSays(ep.EMBASSY_WORDS.device)
      const agentSays = ep.EMBASSY_WORDS.waitingSays(ep.EMBASSY_WORDS.agent)
      expect(page, 'the device row says device').toContain(deviceSays)
      expect(page, 'the agent row says agent').toContain(agentSays)
      // Plan 7FEOshq3mBGG keeps the row short; refusal is in its question.
      expect(deviceSays).toBe('This device can join once you let it in.')
      expect(agentSays).toBe('This agent can join once you let it in.')
      // ONE SENTENCE PER ROW, so a single sentence drawn above the list cannot satisfy this.
      expect(page.split('can join once you let it in.').length - 1, 'a sentence on each of the two rows').toBe(2)
      // The question and the act are proved in embassy-pages-in-three-languages.test.ts.
    } finally {
      await app.close()
      t.close()
    }
  })
})
