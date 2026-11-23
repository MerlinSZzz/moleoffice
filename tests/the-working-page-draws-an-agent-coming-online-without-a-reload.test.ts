// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WORKING PAGE DRAWS AN AGENT COMING ONLINE WITHOUT A RELOAD.
 *
 * WHAT WENT WRONG. An agent is online on the Working roster when it has an open attachment. Opening one changes that
 * row, but the page read its roster only once, when it opened. It listened for no event, so the row stayed offline
 * until the reader loaded the page again. The server's presence event did not help either: it is sent only when the
 * chat dot changes, and opening an attachment can leave the dot as it was.
 *
 * WHAT THIS FILE HOLDS. A made-up agent is started and has no attachment, so its row on the open Working page is
 * offline. The agent then opens an attachment. Within eight seconds the same page, not loaded again, draws the row
 * online.
 *
 * It fails on main's code, where the row stays offline, because the page never reads its roster again.
 *
 * MADE UP. The office, the agent and its attachment are made up for this test, in a test office of its own. No live
 * office is read. No picture is taken.
 */
import { join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { liveApp, thePersonsKeyHeader, type LiveApp } from './helpers.ts'
import { notReloaded, open, type HeardOffice } from './a-page-that-hears-changes.ts'

let app: LiveApp

const NAME = 'Made-up kiln watcher'
const HANDLE = 'made-up-kiln-watcher'
/** How long a change may take to be drawn. The page waits at most five seconds between two reads of its roster. */
const DRAWN_WITHIN_MS = 8_000

function asThePerson(): Record<string, string> {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'human',
    'x-mole-office-actor-id': THE_PERSON,
    ...thePersonsKeyHeader(join(app.dir, 'keys.json')),
  }
}

async function send(method: string, url: string, body: object, headers: Record<string, string>): Promise<Record<string, any>> {
  const reply = await fetch(app.api + url, { method, headers, body: JSON.stringify(body) })
  const text = await reply.text()
  expect(reply.status, `${method} ${url}: ${text}`).toBeLessThan(300)
  return JSON.parse(text) as Record<string, any>
}

/** This file's test office, as the page is opened in it. */
function heard(): HeardOffice {
  return { api: app.api, site: app.site, headers: asThePerson() }
}

beforeAll(async () => {
  app = await liveApp({ name: 'the-working-page-draws-an-agent-coming-online', viewport: { width: 1440, height: 1000 }, workspace: 'default' })
}, 300_000)

afterAll(async () => {
  await app?.stop()
})

it('draws the row of an agent that opens an attachment as online, without a reload', async () => {
  const page = app.page
  const started = await send('POST', '/api/agents/started', { handle: HANDLE, name: NAME, role: 'worker', runtime: 'claude-code' }, asThePerson())
  const theRow = page.locator('li.wrk-row', { hasText: NAME })

  await open(heard(), page, '/working', `li.wrk-row[data-presence="offline"]:has-text("${NAME}")`)
  expect(await theRow.getAttribute('data-presence')).toBe('offline')

  const asTheAgent = {
    'content-type': 'application/json',
    'x-mole-office-workspace': 'default',
    'x-mole-office-actor-type': 'agent',
    'x-mole-office-actor-id': HANDLE,
    'x-mole-office-key': String(started['whatToGiveIt']?.key),
  }
  await send('POST', '/api/attachments', { title: `A made-up run of ${NAME}`, agentId: String(started['record']) }, asTheAgent)

  await page.waitForSelector(`li.wrk-row[data-presence="online"]:has-text("${NAME}")`, { timeout: DRAWN_WITHIN_MS }).catch(() => undefined)
  expect(await theRow.getAttribute('data-presence'), 'the row of the agent that opened an attachment is drawn online').toBe('online')
  expect(await notReloaded(page), 'the page was not loaded again').toBe(true)
}, 120_000)
