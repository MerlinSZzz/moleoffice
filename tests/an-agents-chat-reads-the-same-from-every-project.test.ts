// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S CHAT SHOWS THE SAME FROM EVERY PROJECT IT IS OPENED IN (wave 13y round 111, item 44, as the owner widened it).
 *
 * On 30 October 2026 the owner opened a secretary's chat from a project the secretary is not registered in and saw a grey
 * dot and "Unavailable", where its own project showed a green dot and "Answering". Its duty line there said that nobody
 * had recorded its duties in this project, and another department's agent showed other duties too. The chat is the
 * message centre's own and belongs to no project, so what it shows of an agent is the same from every project.
 *
 * WHAT IS MEASURED: two agents' chats, each opened from both projects, at 1440, 990, 660 and 390 in both themes. One is a
 * secretary held by a live session, as the live office's secretary is. The other is a supervisor the secretary's duties name, with its own
 * conversation in its own project. In the conversation's heading: the dot's colour, the presence word, the duty line, the
 * personal line and the "Working on" line. At 1440, where the contact list is beside the conversation, the contact row's
 * dot and duty line too. Each reads the same from the second project as from the first. No presence word says
 * "Unavailable", and no duty line says that nobody has recorded the duties.
 *
 * THE "CANNOT REACH" BOX TOO (wave 13y round 112, item 46). The message worker watches one project and, since round 112,
 * takes a message written in another project to an agent whose conversation it picks up. So the box reads the same from
 * every project as well, and neither agent draws it: the keeper is held, and the supervisor's conversation is picked up.
 * Until round 112 the box was written down and not compared, because the worker took only its own project's messages.
 *
 * MADE-UP RECORDS: `seedStatusOffice` and `seedASecondProject` of tests/status-office.ts, and one message from the person
 * to each agent, so each has a conversation and a contact row. This test's own process is renamed "claude" for the file,
 * because the keeper's terminal names it (see `seedASecondProject`).
 *
 * THE PICTURES ARE TAKEN BEFORE ANY ASSERTION, so a run on main gives the pictures from before the change. With
 * W13Y_CHAT_EVERY_PROJECT set to a folder, each heading is photographed under the made-up label, and what was read is
 * written beside it.
 *
 * RED ON MAIN: from the second project, both agents' dots are grey with "Unavailable", the duty lines are missing or say
 * nobody recorded them, and the "Working on" line says "Unavailable". Red before round 112: from the second project the
 * supervisor's chat draws "Cannot reach".
 */
import { cpSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterAll, beforeAll, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { apiApp, freshDb, liveApp, waitForThePage, type LiveApp, type TestDb } from './helpers.ts'
import { SECOND_PROJECT, seedASecondProject, seedStatusOffice, STATUS_FIXTURE as F, STATUS_PERSON } from './status-office.ts'
import { putTheMadeUpLabelIn } from './the-made-up-label-above-the-page.ts'
import { participantKey } from '../src/shared/messages.ts'
import { OPEN_AT } from '../src/web/lib/open-chat.ts'

const output = process.env.W13Y_CHAT_EVERY_PROJECT
const ORIGINAL_TITLE = process.title
const PROJECTS = ['default', SECOND_PROJECT.id] as const
const LABEL = 'Made-up data — an invented office with two projects, not real office data'

let app: LiveApp
let t: TestDb
let ids: { keeper: string; supervisor: string }
let terminal = ''

beforeAll(async () => {
  t = await freshDb()
  const api = (await apiApp()).app
  await api.ready()
  await seedStatusOffice(t, api, 8)
  process.title = 'claude'
  const second = await seedASecondProject(t, api)
  ids = { keeper: F.all, supervisor: second.supervisor }
  terminal = second.terminal
  for (const id of Object.values(ids)) {
    const reply = await api.inject({ method: 'POST', url: '/api/records', headers: STATUS_PERSON, payload: { kind: 'message', title: 'A made-up conversation', data: { body: 'The invented ledger is ready to read.', to: [{ kind: 'agent', id }] } } })
    expect(reply.statusCode, reply.body).toBe(201)
  }
  t.client.sqlite.prepare("UPDATE records SET data=json_set(data,'$.writtenFrom.machine','invented-workbench') WHERE kind='message'").run()
  await api.close()
  // Direct invented rows need their baseline ledger before the ordinary startup guard will serve them.
  const { migrateRevisions } = await import('../src/server/db/revision-backfill.ts')
  migrateRevisions(t.client.sqlite)
  app = await liveApp({ name: 'chat-from-every-project', viewport: { width: 1440, height: 1000 }, database: t.file })
}, 240_000)

afterAll(async () => {
  process.title = ORIGINAL_TITLE
  if (output && app) cpSync(app.dir, join(output, 'browser-runtime'), { recursive: true })
  await app?.stop()
  if (output && t) cpSync(dirname(t.file), join(output, 'browser-database'), { recursive: true })
  t?.close()
}, 60_000)

/**
 * What each agent's chat shows, opened from one project. The chat is loaded once from the project, and each agent's
 * conversation is opened in it in turn, as a person opens one after another. Before this was changed, each agent's chat
 * was loaded in a browser of its own; every reading was taken both ways, and the two were the same in each.
 */
async function whatTheChatsShow(project: string, width: number, theme: 'light' | 'dark') {
  const context = await app.browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, colorScheme: theme })
  await context.addInitScript(([look, here]) => {
    localStorage.setItem('mole-office.preset.theme', look)
    localStorage.setItem('mole-office.language', 'en')
    localStorage.setItem('mole-office.workspace', here)
  }, [theme, project] as const)
  const page = await context.newPage()
  try {
    await page.goto(`${app.site}/#/chat`)
    await waitForThePage(page)
    const keeper = await whatOneChatShows(page, 'keeper', project, width, theme)
    const supervisor = await whatOneChatShows(page, 'supervisor', project, width, theme)
    return { keeper, supervisor }
  } finally {
    await context.close()
  }
}

/** What one agent's chat shows, opened on a page that has the chat loaded. A part that is not drawn is null. */
async function whatOneChatShows(page: Page, who: keyof typeof ids, project: string, width: number, theme: 'light' | 'dark') {
  // The keeper's hold lapses after 90 seconds without a beat, and this file reads for longer.
  const beat = await fetch(`${app.api}/api/handles/${F.all}/beat`, { method: 'POST', headers: { ...STATUS_PERSON, 'content-type': 'application/json' }, body: JSON.stringify({ session: terminal }) })
  expect(beat.status, await beat.clone().text()).toBe(200)
  const id = ids[who]
  await Promise.all([
    // THE HEADING'S STATUS COMES WITH THE CONVERSATION'S ANSWER (wave 13y round 115), so that is the read waited for.
    page.waitForResponse(response => new URL(response.url()).pathname === '/api/messages/conversation' && new URL(response.url()).searchParams.get('id') === id),
    page.evaluate(([event, key]) => window.dispatchEvent(new CustomEvent(event, { detail: key })), [OPEN_AT, participantKey({ kind: 'agent', id })] as const),
  ])
  await waitForThePage(page)
  const head = page.locator('.px-chat-them').last()
  const textOf = async (at: string) => (await head.locator(at).count()) === 0 ? null : (await head.locator(at).first().innerText()).trim()
  const row = page.locator(`.px-chat-contact[data-contact="${participantKey({ kind: 'agent', id })}"]`)
  const seen = {
    project: await page.evaluate(() => localStorage.getItem('mole-office.workspace')),
    dot: await head.locator('.px-chat-dot').first().getAttribute('data-colour'),
    word: await textOf('.px-chat-presence-word'),
    duty: await textOf('.duty-line'),
    personal: await textOf('.px-chat-them-state'),
    flow: await textOf('.px-chat-flow'),
    row: width !== 1440 ? null : (await row.count()) === 0 ? 'no row' : {
      dot: await row.locator('.px-chat-dot').first().getAttribute('data-colour'),
      duty: (await row.locator('.duty-line').count()) === 0 ? null : (await row.locator('.duty-line').first().innerText()).trim(),
    },
    // The Cannot reach box is drawn under the heading, beside it and not inside it.
    cannotReach: (await page.locator('.px-chat-cannot-reach').count()) > 0,
  }
  if (output) {
    const dir = join(output, 'pictures')
    mkdirSync(dir, { recursive: true })
    await putTheMadeUpLabelIn(page, LABEL, head.locator('.px-chat-them-top'), `${who} from ${project}, ${width}, ${theme}`)
    const name = `${who}-from-${project}-${width}-${theme}`
    await page.screenshot({ path: join(dir, `${name}.png`) })
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(seen, null, 2))
  }
  return seen
}

for (const width of [1440, 990, 660, 390]) for (const theme of ['light', 'dark'] as const) it(`shows each agent the same from both projects at ${width} in ${theme}`, async () => {
  const seen: Record<string, Record<string, Awaited<ReturnType<typeof whatOneChatShows>>>> = { keeper: {}, supervisor: {} }
  for (const project of PROJECTS) {
    const both = await whatTheChatsShow(project, width, theme)
    for (const who of ['keeper', 'supervisor'] as const) seen[who]![project] = both[who]
  }
  for (const who of ['keeper', 'supervisor'] as const) {
    const [first, second] = PROJECTS.map(project => seen[who]![project]!)
    expect([first!.project, second!.project], 'each chat was opened from the project it names').toEqual([...PROJECTS])
    const { project: _first, ...here } = first!
    const { project: _second, ...there } = second!
    expect.soft(there, `${who}, from ${SECOND_PROJECT.id} as from default`).toEqual(here)
    for (const one of [first!, second!]) {
      expect.soft(one.dot, `${who} from ${one.project}: the dot`).toBe('green')
      expect.soft(one.cannotReach, `${who} from ${one.project}: the "Cannot reach" box`).toBe(false)
      expect.soft(one.word, `${who} from ${one.project}: the presence word`).not.toBe('Unavailable')
      expect.soft(one.flow ?? '', `${who} from ${one.project}: the "Working on" line`).not.toContain('Unavailable')
      expect.soft(one.duty, `${who} from ${one.project}: the duty line`).toBe(who === 'keeper' ? F.duty : SECOND_PROJECT.supervisorArea)
      if (width === 1440) expect.soft(one.row, `${who} from ${one.project}: the contact row`).toEqual({ dot: 'green', duty: who === 'keeper' ? F.duty : SECOND_PROJECT.supervisorArea })
    }
  }
}, 300_000)
