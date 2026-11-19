// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S PAGE PUTS THE TAGS HEADING ABOVE THE COLOURS IT HEADS, AND CHANGE TAGS IS A PRESS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASKED FOR
 * ---------------------------------------------------------------------------------------
 *
 * A person reading an agent's profile sees the tags section in this order: the heading, then the
 * colours the person gave the agent, then the press that opens the editor. The heading heads the
 * colours, so it stands above them rather than under them, where it read as the heading of the
 * press and of what follows.
 *
 * The press that opens the editor is drawn like the page's other presses: it carries the class the
 * page's presses carry, so its border, its hover and its pressed state come from the same rule.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · an agent with one assigned tag draws that tag as a colour;
 *   · the heading stands before the colour in the page's order;
 *   · the change press carries the page press class, px-btn;
 *   · the editor's Create and Cancel presses carry the same class, so every press in the section
 *     looks like the page's other presses.
 *
 * The heading's words and the press's words are read from their word keys with t(), so a changed
 * word does not turn this test red.
 */

import { afterAll, beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, waitForThePage, type LiveApp } from './helpers.ts'

let app: LiveApp
let agentId = ''
const tagName = 'Made-up tag'
const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }

beforeAll(async () => {
  app = await liveApp({ name: 'agent-tags-order', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
  const made = await fetch(`${app.api}/api/records`, { method: 'POST', headers, body: JSON.stringify({ kind: 'agent', title: 'Made-up agent page', data: { handle: 'made-up-tag-order-agent', runtime: 'claude-code', state: 'active', role: 'worker' } }) })
  expect(made.status, await made.clone().text()).toBe(201)
  const participants = await fetch(`${app.api}/api/participants`, { headers })
  const listed = await participants.json() as { agents: { id: string; handle: string }[] }
  agentId = listed.agents.find((one) => one.handle === 'made-up-tag-order-agent')!.id
  const saved = await fetch(`${app.api}/api/agent-tags`, { method: 'PUT', headers, body: JSON.stringify({ tags: [{ name: tagName, colour: '#7860a8', agents: [agentId] }] }) })
  expect(saved.status, await saved.clone().text()).toBe(200)
}, 240_000)
afterAll(async () => { await app?.stop() }, 60_000)

it('draws the heading above the agent’s colours, and the change press with the page press class', async () => {
  await app.page.goto(`${app.site}/?lang=en#/who/agent/${agentId}`)
  await waitForThePage(app.page, 60_000)
  await app.page.locator('[data-personal-agent-tag]', { hasText: tagName }).first().waitFor({ timeout: 60_000 })
  await app.page.getByRole('button', { name: t('agentTags.change') }).waitFor({ timeout: 60_000 })

  const drawn = await app.page.evaluate((words) => {
    const section = [...document.querySelectorAll('section')].find((one) => one.getAttribute('aria-label') === words.heading) ?? null
    if (section === null) return null
    const heading = [...section.querySelectorAll('strong')].find((one) => one.textContent === words.heading) ?? null
    const marks = [...section.querySelectorAll('[data-personal-agent-tag]')]
    const press = [...section.querySelectorAll('button')].find((one) => (one.textContent ?? '').trim() === words.change) ?? null
    return {
      marks: marks.length,
      headingBeforeMarks: heading !== null && marks.length > 0 && marks.every((mark) => (heading.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0),
      pressClass: press === null ? null : press.className,
    }
  }, { heading: t('agentTags.heading'), change: t('agentTags.change') })

  expect(drawn, 'the profile page draws the agent tags section').not.toBeNull()
  expect.soft(drawn!.marks, 'one assigned tag is drawn as a colour').toBeGreaterThan(0)
  expect.soft(drawn!.headingBeforeMarks, 'the heading stands above the colours it heads').toBe(true)
  expect.soft(drawn!.pressClass?.split(/\s+/), 'the change press carries the page press class').toContain('px-btn')

  await app.page.getByRole('button', { name: t('agentTags.change') }).click()
  await app.page.getByLabel(t('agentTags.name')).waitFor({ timeout: 60_000 })
  const editor = await app.page.evaluate((words) => {
    const section = [...document.querySelectorAll('section')].find((one) => one.getAttribute('aria-label') === words.heading) ?? null
    if (section === null) return null
    const named = (name: string) => [...section.querySelectorAll('button')].find((one) => (one.textContent ?? '').trim() === name) ?? null
    return {
      createClass: named(words.create)?.className ?? null,
      cancelClass: named(words.cancel)?.className ?? null,
    }
  }, { heading: t('agentTags.heading'), create: t('agentTags.create'), cancel: t('g6b.profile.cancel') })

  expect(editor, 'opening change tags draws the editor').not.toBeNull()
  expect.soft(editor!.createClass?.split(/\s+/), 'the create press carries the page press class').toContain('px-btn')
  expect.soft(editor!.cancelClass?.split(/\s+/), 'the cancel press carries the page press class').toContain('px-btn')
}, 180_000)
