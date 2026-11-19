// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE MESSAGE A SWEEP SENDS A RECEIVER OF LETTERS FOR RETIRED AGENTS IS DRAWN IN THE PAGE'S LANGUAGE.
 *
 * Problem wN3CEhHxRKO3. A sweep routes an agent's old letters for retired agents to the first starter who can be
 * reached, and tells that starter in ONE message: how many letters, for whom, and where to read them. The server
 * stores the English and the facts beside it. The Messages page names the message by its few words, and the
 * message's own page says the whole of it, both in the page's language. A letter it tells about says on its own page
 * that the receiver was told in one message, not given the letter.
 *
 * The world is built in this process, because a starter that can be reached needs a live process of its own: three
 * letters from an agent to two agents that are retired after the letters are written, started by one worker that can
 * be reached. The sweep is pressed here. Then a browser opens the same database file through a stack of its own.
 *
 * The message's own page is headed by its few words, not by the sender's name; its time does not break on a narrow page;
 * and it names the fold the Messages page keeps its filters in (row 57 of report rFBoQG6mAEI0, wave 13n round 44).
 *
 * When TEST_SHOTS names a folder, the Messages page and the message's own page are photographed at 1440, 990, 660 and
 * 390 in light and dark, in English and in Chinese.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { MESSAGE_SEGMENT } from '../src/shared/addresses.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { testShots } from './where-shots-go.ts'

const WORKSPACE = 'default'
const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': WORKSPACE,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({ ...AS_THE_PERSON, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id })

let t: TestDb
let server: FastifyInstance
let app: LiveApp
const started: ChildProcess[] = []
const shots = testShots('a-sweeps-one-message-to-a-receiver')

let summaryId = ''
let letterId = ''
let sweepLineId = ''

function idOf(handle: string): string {
  const row = t.client.sqlite.prepare('SELECT id FROM agents WHERE handle = ?').get(handle) as { id: string } | undefined
  expect(row, `no agent bears the handle ${handle}`).toBeDefined()
  return row!.id
}

function anAgent(handle: string, startedBy: string | null): void {
  t.api.createRecord({ workspaceId: WORKSPACE, kind: 'agent', title: handle, data: { handle, state: 'active', runtime: 'claude-code' }, actor: t.api.HUMAN })
  t.client.sqlite.prepare("UPDATE agents SET role = 'worker' WHERE id = ?").run(idOf(handle))
  // THE OWNER BESIDE THE STARTER. Since the owner package the sweep follows the recorded owner, and the office records an
  // agent's starter as its owner, so this test writes both, as a real office holds them.
  if (startedBy !== null) t.client.sqlite.prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ?, owner_kind = 'agent', owner_id = ? WHERE id = ?").run(idOf(startedBy), idOf(startedBy), idOf(handle))
}

/** A running session record serving the agent, and a live process of this test's own registered against it. */
async function makeReachable(handle: string): Promise<void> {
  const session = t.api.createRecord({
    workspaceId: WORKSPACE,
    kind: 'session',
    title: `a run of ${handle}`,
    data: { state: 'running', runtime: 'claude-code', servingAgent: idOf(handle) },
    actor: t.api.HUMAN,
  }).id
  const child = spawn('sleep', ['600'], { detached: true, stdio: 'ignore' })
  child.unref()
  started.push(child)
  expect(child.pid, 'the child did not start, so nothing below is measuring anything').toBeDefined()
  const { registerResource } = await import('../src/server/lib/resources.ts')
  registerResource({ workspaceId: WORKSPACE, sessionRecordId: session, type: 'process', key: String(child.pid), actor: t.api.HUMAN })
}

async function send(to: string, body: string): Promise<string> {
  const reply = await server.inject({ method: 'POST', url: '/api/records', headers: asAgent('x-sender'), payload: { kind: 'message', title: body, data: { to: [{ kind: 'agent', id: to }], body } } })
  const said = reply.json() as { record?: { id: string } }
  expect(said.record?.id, reply.body.slice(0, 400)).toBeTruthy()
  return said.record!.id
}

beforeAll(async () => {
  t = await freshDb()
  server = (await apiApp()).app
  await server.ready()
  anAgent('x-sender', null)
  anAgent('w-starter', null)
  anAgent('quill', 'w-starter')
  anAgent('zhixu', 'w-starter')
  await makeReachable('quill')
  await makeReachable('zhixu')
  letterId = await send(idOf('quill'), 'The table is ready for you.')
  await send(idOf('quill'), 'One more row came in.')
  await send(idOf('zhixu'), 'The draft is in your folder.')
  for (const handle of ['quill', 'zhixu']) {
    t.client.sqlite.prepare("UPDATE agents SET retired = 1, retired_because = 'its work here is done' WHERE id = ?").run(idOf(handle))
  }
  await makeReachable('w-starter')
  const swept = await server.inject({ method: 'POST', url: '/api/dead-letters/sweep', headers: AS_THE_PERSON })
  expect(swept.statusCode, swept.body).toBe(200)
  const summaries = (swept.json() as { summaries: { messageId: string; letters: number }[] }).summaries
  expect(summaries.map((one) => one.letters)).toEqual([3])
  summaryId = summaries[0]!.messageId
  sweepLineId = (swept.json() as { lineId: string }).lineId
  await server.close()
  app = await liveApp({ name: 'a-sweeps-one-message', viewport: { width: 1440, height: 1000 }, workspace: WORKSPACE, database: t.file })
  await app.page.addInitScript(({ person }) => {
    const query = new URLSearchParams(location.search)
    localStorage.setItem('mole-office.preset.theme', query.get('look') ?? 'light')
    localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: person }))
  }, { person: THE_PERSON })
}, 300_000)

afterAll(async () => {
  for (const child of started) {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL')
    } catch {
      // Already gone, which is not a failure of anything this file is testing.
    }
  }
  await app?.stop()
  t?.close()
}, 120_000)

async function openTheMessages(lang: 'en' | 'zh' = 'en', width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}#/messages`)
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.px-ms-one', { timeout: 30_000 })
}

async function openAMessage(id: string, lang: 'en' | 'zh' = 'en', width = 1440, look = 'light'): Promise<void> {
  await app.page.setViewportSize({ width, height: 1000 })
  await app.page.goto('about:blank')
  await app.page.goto(`${app.site}/?lang=${lang}&look=${look}#/${MESSAGE_SEGMENT}/${encodeURIComponent(id)}`)
  await waitForThePage(app.page, 60_000)
  await app.page.waitForSelector('.mp-body', { timeout: 30_000 })
}

it('restarts with the retained sweep notice still addressed to nobody', async () => {
  const reply = await fetch(`${app.api}/api/messages/${sweepLineId}`, { headers: AS_THE_PERSON })
  expect(reply.status, await reply.clone().text()).toBe(200)
  const { message } = await reply.json() as { message: { notice: string; toGroup: string | null; to: unknown[]; deliveries: unknown[] } }
  expect(message.notice).toBe('deadLetterSweep')
  expect(message.toGroup).toBeNull()
  expect(message.to).toEqual([])
  expect(message.deliveries).toEqual([])
}, 120_000)

it('the Messages page names the one message by its few words, in English and in Chinese', async () => {
  await openTheMessages()
  expect(await app.page.locator('.px-ms-one .px-ms-words', { hasText: /^Letters for retired agents$/ }).count()).toBe(1)
  await openTheMessages('zh')
  expect(await app.page.locator('.px-ms-one .px-ms-words', { hasText: /^给已停用智能体的信$/ }).count()).toBe(1)
}, 120_000)

it('the message\'s own page says how many, for whom, and where to read them, with no API words', async () => {
  await openAMessage(summaryId)
  const body = (await app.page.locator('.mp-body').first().innerText()).trim()
  expect(body).toMatch(/^Letters for retired agents\s+When Mole Office looked again at .+, it routed 3 letters for retired agents to you: quill \(2\), zhixu \(1\)\./)
  expect(body).toContain('This one message tells you about all of them.')
  expect(body).toContain('open the Messages page, open "Choose what to show", and choose the addressee under "reached".')
  expect(body).not.toContain('GET /api/')
  // HEADED BY ITS FEW WORDS, NOT BY THE SENDER, and its time is one piece a narrow page cannot break (row 57 of report
  // rFBoQG6mAEI0): non-breaking hyphens in the date and a non-breaking space before the clock.
  expect((await app.page.locator('h1.mp-title').innerText()).trim()).toBe('Letters for retired agents')
  expect(await app.page.locator('.mp-body').first().textContent()).toMatch(/at \d{4}\u2011\d{2}\u2011\d{2}\u00a0\d{2}:\d{2}:\d{2},/u)
  await openAMessage(summaryId, 'zh')
  const chinese = (await app.page.locator('main').innerText()).trim()
  expect((await app.page.locator('.mp-body').first().innerText()).trim()).toMatch(/^给已停用智能体的信\s+Mole Office 在 .+ 再次查看时，把 3 封写给已停用智能体的信转给了你：quill \(2\), zhixu \(1\)。/)
  expect(chinese).toContain('展开“选择要显示的内容”，在“送达给谁”里选择收信人')
  expect((await app.page.locator('h1.mp-title').innerText()).trim()).toBe('给已停用智能体的信')
  expect(chinese).not.toContain('Letters for retired agents')
  expect(chinese).not.toContain('routed')
}, 120_000)

it('a letter it tells about says on its own page that the receiver was told in one message', async () => {
  await openAMessage(letterId)
  expect(await app.page.locator('main').innerText()).toContain('It told w-starter about it in one message that lists every letter it routed to w-starter at that time.')
  await openAMessage(letterId, 'zh')
  expect(await app.page.locator('main').innerText()).toContain('Mole Office 只用一条消息告诉了 w-starter')
}, 120_000)

it.skipIf(!process.env['TEST_SHOTS'])('photographs the message\'s own page and the Messages page', async () => {
  for (const lang of ['en', 'zh'] as const) {
    for (const width of [1440, 990, 660, 390]) {
      for (const look of ['light', 'dark']) {
        await openAMessage(summaryId, lang, width, look)
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${lang} ${String(width)} ${look}`).toBe(true)
        await app.page.screenshot({ path: `${shots}/summary-page-${lang}-${String(width)}-${look}.png`, fullPage: true })
        await openTheMessages(lang, width, look)
        expect(await app.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${lang} ${String(width)} ${look}`).toBe(true)
        await app.page.screenshot({ path: `${shots}/summary-messages-${lang}-${String(width)}-${look}.png`, fullPage: false })
      }
    }
  }
}, 900_000)
