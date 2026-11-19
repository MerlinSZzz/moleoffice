// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE LAST CONVERSATION BETWEEN AGENTS IS NOT CUT IN HALF BY "SHOW MORE".
 *
 * The between-agents list is a scroller with the Show more press directly under it. The press took
 * its place at the very edge of the list, so the ninth row's project tag was clipped by the list at
 * that same edge: seven pixels of an eighteen-pixel tag stayed drawn under the press's top border,
 * and a person could not read it. A list that ends where a press begins needs a gap, so the last
 * row the list shows is either whole or wholly out of sight.
 *
 * The office here has eight made-up agents with long names, so twenty-eight conversations are more
 * than one page of twenty-five, and every row is tall enough to wrap. The rows and names are made up.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp

const AS_THE_OWNER = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const AGENTS = Array.from({ length: 8 }, (_, i) => {
  const number = String(i + 1).padStart(2, '0')
  return { handle: `pair-agent-${number}`, name: `Pair ${number} is long here and here and here and here and here!!` }
})

async function post(headers: Record<string, string>, body: unknown, expected = 201): Promise<void> {
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify(body) })
  expect(made.status, await made.clone().text()).toBe(expected)
}

beforeAll(async () => {
  app = await liveApp({ name: 'between-agents-show-more-clear', viewport: { width: 390, height: 1000 } })
  for (const one of AGENTS) {
    await post(AS_THE_OWNER, { kind: 'agent', title: one.name, data: { handle: one.handle, runtime: 'claude-code', state: 'active' } })
  }
  let pairs = 0
  for (let i = 0; i < AGENTS.length; i += 1) {
    for (let j = i + 1; j < AGENTS.length; j += 1) {
      pairs += 1
      const from = AGENTS[i]!
      const to = AGENTS[j]!
      // Nothing holds the made-up agents in the test office, so the office stores each message, routes it and
      // answers 409. The message is stored all the same, and the list draws its conversation.
      await post(
        { ...AS_THE_OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': from.handle },
        {
          kind: 'message',
          title: `A made-up message in pair ${String(pairs)}`,
          data: { body: `Pair ${String(pairs)} says the east shed is ready.`, to: [{ kind: 'agent', id: to.handle }] },
        },
        409,
      )
    }
  }
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

it('leaves a gap between the list’s foot and Show more, so no tag is cut under the press', async () => {
  await app.page.goto(`${app.site}/?lang=en#/`)
  await waitForThePage(app.page, 30_000)
  await app.page.click('.px-chat-circle')
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  await app.page.click('.px-chat-tab[data-tab="between"]')
  const more = app.page.locator('.px-chat-between-more')
  await more.waitFor({ timeout: 20_000 })

  const geometry = await app.page.evaluate(() => {
    const button = document.querySelector<HTMLElement>('.px-chat-between-more')
    if (button === null) return { why: 'Show more is not drawn', gap: null, tagCount: 0 }
    const list = button.previousElementSibling
    if (!(list instanceof HTMLElement) || !list.classList.contains('px-chat-list')) {
      return { why: 'the list is not directly above Show more', gap: null, tagCount: 0 }
    }
    const listBox = list.getBoundingClientRect()
    return {
      why: null,
      gap: button.getBoundingClientRect().top - listBox.bottom,
      tagCount: list.querySelectorAll('.px-chat-project-mark').length,
    }
  })

  expect(geometry.why, 'Show more does not follow a between-agents list').toBe(null)
  expect(geometry.tagCount, 'the made-up conversations carry no project tag to measure').toBeGreaterThan(0)
  expect(geometry.gap, 'Show more is drawn at the list’s own edge, so the last tag is cut under it').toBeGreaterThanOrEqual(4)
}, 120_000)
