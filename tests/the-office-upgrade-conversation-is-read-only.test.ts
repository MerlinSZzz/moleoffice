// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Made-up upgrade events in a throwaway office. No upgrade or cloud suite runs here.
 * The original event API supplies the actual chat contact and system lines.
 * Control: both cases pass. Mutate the office-only branch to false: case one
 * sees ordinary write controls. Mutate it to accept every contact: case two loses
 * the ordinary agent composer. Exact source restore makes both cases green.
 * Removing the office-scoped wrap rule makes the actual 390-pixel layout case red.
 */
import { afterAll, beforeAll, expect, it } from 'vitest'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { liveApp, theOfficesOwnIdIn, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { WHOLE_SUITE_RECEIPT_EXAMPLE } from '../src/shared/whole-suite-receipt.ts'
import { MOLE_OFFICE_NAME } from '../src/shared/participants.ts'
import { localStamp } from '../src/shared/time.ts'
import { THE_BUILT_PAGE_FOLDER, theServingInstall } from '../src/config/settings.mjs'
import { writeTheBuildStamp } from '../src/config/build-stamp.mjs'

let office: LiveApp
let agentId = ''
const notice = 'Made-up upgrade: search now finds the labelled example conversations.'
const person = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
async function ask(method: string, path: string, body?: unknown, headers: Record<string, string> = person) {
  const reply = await fetch(office.api + path, { method, headers, signal: AbortSignal.timeout(10_000), ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  const text = await reply.text()
  expect(reply.status, text).toBeLessThan(300)
  return JSON.parse(text)
}
beforeAll(async () => {
  writeTheBuildStamp(THE_BUILT_PAGE_FOLDER, theServingInstall())
  office = await liveApp({ name: 'upgrade-system-chat', viewport: { width: 1440, height: 1000 } })
  const made = await ask('POST', '/api/agents/started', { handle: 'made-up-upgrade-secretary', name: 'Made-up upgrade secretary', role: 'secretary' })
  const author: Record<string, string> = { ...person, 'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': made.agent.id, 'x-mole-office-key': made.whatToGiveIt.key }
  const run = await ask('POST', '/api/records', { kind: 'session', title: 'Made-up notice controller',
    data: { state: 'running', servingAgent: made.agent.id } }, author)
  author['x-mole-office-session'] = run.record.id
  const approved = await ask('POST', '/api/records', { kind: 'note', title: 'Made-up checked upgrade notice', data: { body: notice } }, author)
  const runtime = await ask('GET', '/api/runtime')
  const target = 'b'.repeat(40)
  const evidence = await ask('POST', '/api/records', { kind: 'whole_suite_receipt', title: 'Made-up receipt for chat layout; no cloud run',
    data: { ...WHOLE_SUITE_RECEIPT_EXAMPLE, commit: target } }, author)
  const original = (r: { record: { id: string }; version: string }) => ({ id: r.record.id, seq: 1, contentHash: r.version })
  const before = await ask('POST', '/api/office/upgrades/notice', {
    stage: 'before', sendId: 'made-up-chat-before', announcement: {
      candidateTag: 'stable-' + localStamp(new Date()).slice(0, 10) + '-made-up-chat',
      baselineTag: 'made-up-baseline', fromCommit: runtime.repository.head.full, toCommit: target,
      tree: WHOLE_SUITE_RECEIPT_EXAMPLE.tree, notice, evidence: original(evidence), noticeApproval: original(approved),
    },
  }, author)
  await ask('POST', '/api/office/upgrades/notice', {
    stage: 'after', sendId: 'made-up-chat-after', before: before.original,
    outcome: { state: 'failed-restored', reason: 'Upgrade failed and the baseline was restored.' },
  }, author)
  const regular = await ask('POST', '/api/agents/started', { handle: 'made-up-chat-writer', name: 'Made-up ordinary writer', role: 'worker' })
  agentId = regular.agent.id
  await office.page.goto(office.site + '/#/chat')
  await waitForThePage(office.page)
}, 120_000)
afterAll(async () => { await office?.stop() })

/** The office's own contact. Its id is read from this office's database, because a fresh office draws it new each time. */
function theOfficesContact() {
  const db = new Database(join(office.dir, 'panelx.db'), { readonly: true, fileMustExist: true })
  try {
    return office.page.locator('[data-contact="agent:' + theOfficesOwnIdIn(db) + '"]')
  } finally {
    db.close()
  }
}

it('opens the real office contact onto both notices without agent write or lifecycle controls', async () => {
  const contact = theOfficesContact()
  await contact.waitFor({ state: 'visible' })
  await contact.click()
  await expect.poll(async () => office.page.locator('.px-chat-office-notices').count(), { timeout: 5000 }).toBe(1)
  await office.page.waitForFunction((text) => document.querySelectorAll('.px-chat-system-block').length >= 2 &&
    [...document.querySelectorAll('.px-chat-system-block')].filter(el => el.textContent?.includes(text)).length >= 2, notice)
  expect(await office.page.locator('.px-chat-name').filter({ hasText: MOLE_OFFICE_NAME }).count()).toBeGreaterThan(0)
  for (const selector of ['.px-chat-write', '.px-chat-cannot-reach', '.px-chat-state-edit', '.px-chat-them-state', '.px-chat-unsent-bar']) {
    expect(await office.page.locator(selector).count(), selector).toBe(0)
  }
  const shots = process.env['UPGRADE_CHAT_PICTURES']
  if (shots) {
    mkdirSync(shots, { recursive: true })
    for (const theme of ['light', 'dark']) {
      for (const width of [1440, 990, 660, 390]) {
        await office.page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
        await office.page.evaluate((chosen) => localStorage.setItem('mole-office.preset.theme', chosen), theme)
        await office.page.goto(office.site + '/?lang=en#/chat')
        await office.page.reload()
        await waitForThePage(office.page)
        const officeContact = theOfficesContact()
        if (!await officeContact.isVisible()) await office.page.locator('.px-chat-back:visible').first().click()
        await officeContact.click()
        await office.page.locator('.px-chat-office-notices').waitFor({ state: 'visible', timeout: 5000 })
        await office.page.waitForFunction((text) => [...document.querySelectorAll('.px-chat-system-block')]
          .filter(el => el.textContent?.includes(text)).length >= 2, notice)
        expect(await office.page.locator('html').getAttribute('data-theme')).toBe(theme)
        await office.page.screenshot({ path: `${shots}/upgrade-conversation-${width}-${theme}-en.png` })
      }
    }
    await office.page.setViewportSize({ width: 1440, height: 1000 })
  }
}, 120_000)

it('keeps the composer for an ordinary agent contact', async () => {
  const contact = office.page.locator('[data-contact="agent:' + agentId + '"]')
  await contact.waitFor({ state: 'visible' })
  await contact.click()
  await expect.poll(async () => office.page.locator('.px-chat-write').count(), { timeout: 5000 }).toBe(1)
  expect(await office.page.locator('.px-chat-office-notices').count()).toBe(0)
  expect(await office.page.locator('.px-chat-write').count()).toBe(1)
})

it('wraps both office upgrade notice bodies completely at 390 pixels', async () => {
  await theOfficesContact().click()
  await expect.poll(async () => office.page.locator('[data-office-notices="yes"]').count(), { timeout: 5000 }).toBe(1)
  await office.page.setViewportSize({ width: 390, height: 844 })
  const blocks = office.page.locator('[data-office-notices="yes"] .px-chat-system-block')
  await expect.poll(async () => blocks.count(), { timeout: 5000 }).toBe(2)
  const measured = await blocks.evaluateAll((elements) => elements.map((element) => ({
    whiteSpace: getComputedStyle(element).whiteSpace,
    overflow: element.scrollWidth - element.clientWidth,
    text: element.textContent,
  })))
  expect(measured).toHaveLength(2)
  for (const block of measured) {
    expect(block.whiteSpace).toBe('normal')
    expect(block.overflow).toBeLessThanOrEqual(1)
    expect(block.text).toContain(notice)
  }
})
