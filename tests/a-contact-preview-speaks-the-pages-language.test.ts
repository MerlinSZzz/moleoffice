// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONTACT LIST'S PREVIEW SPEAKS THE PAGE'S LANGUAGE (round 42 of wave 13n, problem muiPzUf5KFbJ).
 *
 * The opened conversation words a line Mole Office wrote in the page's language (`theWordsOfAnOfficeLine` in
 * src/shared/dead-letter-lines.ts). The row in the contact list drew the same message's body as stored, so on a Chinese
 * page the row said English and the conversation it opened said Chinese. Round 41 fixed the between-agents list only.
 *
 * WHAT THIS FILE PROVES, in a real browser: the office's restart line, stored in English as the office stores it, is
 * the last line of the person's conversation with an agent. On an English page and on a Chinese page, the contact row's
 * preview is the words the opened conversation draws for that line. On the Chinese page those words are not the stored
 * English body, which is what shows the line was worded at all.
 * MUTATION: the row draws `line.last.body` again in src/web/components/ContactChooser.tsx. The Chinese case goes red.
 *
 * The line is written straight into the test office's own database, as tests/a-contacts-row-says-the-state-of-the-
 * conversation.test.ts does, because no door lets a test make the office restart a run. Everybody here is made up.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { nanoid } from 'nanoid'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { theRestartLine } from '../src/shared/office-lines.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, theOfficesOwnIdIn, waitForThePage, type LiveApp } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { openTheChat } from './open-the-chat.ts'

let app: LiveApp
const AGENT_NAME = 'Test Plover'
const AGENT_HANDLE = 'preview-plover'
/** The restart line as the office stores it: in English. */
const STORED = theRestartLine(sayInEnglish).line

const AS_THE_OWNER: Record<string, string> = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The office's restart line, as the last line of the person's conversation with this agent. */
function writeTheRestartLine(agentId: string): void {
  const db = new Database(join(app.dir, 'panelx.db'))
  try {
    const at = new Date().toISOString().replace('T', ' ').slice(0, 19)
    const id = nanoid(12)
    db.prepare(
      'INSERT INTO records (id, workspace_id, owner_id, created_at, updated_at, kind, title, data, origin) ' +
        `VALUES (?, 'message-centre', '${THE_TEST_OFFICES_OWNER.id}', ?, ?, 'message', ?, ?, 'authored')`,
    ).run(
      id,
      at,
      at,
      STORED.slice(0, 40),
      JSON.stringify({
        body: STORED,
        sentBy: { kind: 'agent', id: theOfficesOwnIdIn(db) },
        writtenIn: { project: 'default' },
        to: [
          { kind: 'person', id: THE_PERSON },
          { kind: 'agent', id: agentId },
        ],
      }),
    )
    for (const [kind, recipient] of [
      ['person', THE_PERSON],
      ['agent', agentId],
    ] as const) {
      db.prepare(
        'INSERT INTO message_delivery (id, message_id, recipient_kind, recipient_id, mark, at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(nanoid(12), id, kind, recipient, 'queued', at)
    }
  } finally {
    db.close()
  }
}

/** The contact row's preview, and the words the opened conversation draws for its last line, on a page in this language. */
async function thePreviewAndTheOpenedLine(lang: 'en' | 'zh'): Promise<{ preview: string; opened: string }> {
  await app.page.goto(`${app.site}/?lang=${lang}#/`)
  await app.page.reload()
  await waitForThePage(app.page, 30_000)
  await openTheChat(app.page)
  await app.page.waitForSelector('.px-chat', { timeout: 20_000 })
  if ((await app.page.$('.px-chat-back')) !== null) await app.page.click('.px-chat-back')
  const row = app.page.locator(`.px-chat-contact:has(.px-chat-name:text-is("${AGENT_NAME}"))`).first()
  await row.waitFor({ timeout: 20_000 })
  const preview = (await row.locator('.px-chat-last').innerText()).trim()
  await row.click()
  await app.page.waitForSelector('.px-chat-system .px-chat-system-block', { timeout: 20_000 })
  const lines = await app.page.locator('.px-chat-system .px-chat-system-block').allInnerTexts()
  return { preview, opened: (lines[lines.length - 1] ?? '').trim() }
}

beforeAll(async () => {
  app = await liveApp({ name: 'contact-preview-language', viewport: { width: 1440, height: 1000 } })
  const filed = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: AS_THE_OWNER,
    body: JSON.stringify({ kind: 'agent', title: AGENT_NAME, data: { handle: AGENT_HANDLE, runtime: 'claude-code', state: 'active' } }),
  })
  expect(filed.status, await filed.clone().text()).toBe(201)
  const listed = (await (await fetch(`${app.api}/api/participants`, { headers: AS_THE_OWNER })).json()) as {
    agents?: { id: string; handle: string }[]
  }
  const agent = listed.agents?.find((one) => one.handle === AGENT_HANDLE)
  expect(agent, `${AGENT_HANDLE} is not in the registry`).toBeDefined()
  writeTheRestartLine(agent!.id)
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe("the contact list's preview speaks the page's language", () => {
  it('draws, on an English page, the words the opened conversation draws', async () => {
    const seen = await thePreviewAndTheOpenedLine('en')
    expect(seen.opened, 'the opened conversation draws the office line').not.toBe('')
    expect(seen.preview).toBe(seen.opened)
  }, 120_000)

  it('draws, on a Chinese page, the words the opened conversation draws, and not the stored English', async () => {
    const seen = await thePreviewAndTheOpenedLine('zh')
    expect(seen.opened, 'the opened conversation words the office line in Chinese').not.toBe(STORED)
    expect(seen.preview).toBe(seen.opened)
  }, 120_000)
})
