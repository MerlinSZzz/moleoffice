// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE TERMINAL PAGES IN A REAL BROWSER: TERMINAL MANAGEMENT AND AN AGENT'S TERMINALS. Wave 13u, round 2.
 *
 * Terminal management (src/web/pages/TerminalsPage.tsx, #/terminals) and the Terminals panel on an
 * agent's profile page (src/web/components/AgentTerminals.tsx) are opened on a scratch office beside a
 * real terminal holder. What a person sees is checked:
 *
 *   1. Terminal management lists each terminal with its command line, its state, its folder and who
 *      opened it: two shells the person opened through the door (one ended with exit code 3) and one an
 *      agent opened and works in.
 *   2. The words filter narrows the list to one row and says how many it hides; Show all brings the rest
 *      back; the state filter set to Ended leaves only the ended one.
 *   3. Pressing a row opens the terminal below the list with its screen, and Put away hides it.
 *   4. With the holder meant to run and not running, the page says so, with the office's sentence and
 *      the holder's own last line, and draws no rows.
 *   5. An agent's profile page shows its own terminal once, though it opened it too, with its project by name
 *      ("Default"), and pressing it opens the view; an agent with no terminal gets both absence sentences, and
 *      its "Open in a terminal" press, with its recorded start folder gone, is refused in the page's language (wave
 *      13u round 3, the coordinator's review of round 2 point 5). Until wave 13s round 205 this agent had no start
 *      folder at all; since then the office makes one for such an agent and opens it there, so the refusal shown is
 *      the one for a recorded folder that is gone.
 *   6. At 390 wide neither page scrolls sideways.
 *   7. Every scene is measured at 1440 and 390 in the light look, in English, and photographed into the folder
 *      TERMINAL_PAGES_SHOTS names, when it names one (wave 13n round F: the other widths, the dark look and the
 *      Chinese sweep are gone; the behaviour cases still visit the Chinese page).
 *   8. The start press starts a holder where none ran, and the page then says it runs; an office whose holder is
 *      turned off starts none (round 3).
 *   9. An agent opened from its profile page comes back with its resume command after the holder is stopped and
 *      another started, and the office's message tells the person so (round 3).
 *  10. The person reads the last line they typed on the page and keeps it as a note of theirs, in a terminal whose
 *      keeping is off (round 3; round 4 keeps that press only for such a terminal).
 *  11. With keeping on, the terminal view says so and names the note with how many lines it kept and left out; the
 *      switch turns keeping off and round 3's press comes back; the person's note shows each kept line, the count of lines
 *      left out and why, and deletes one line by its press (round 4, the coordinator's decision YLv8grhgilBV).
 *  12. In Normal mode the keeping block is the switch and the note's link, and nothing else; the switch turns keeping
 *      off as in case 11. Developer mode adds the note's counts, round 11.
 *      Photographed in English only, by the decision ENGLISH FIRST.
 *      MUTATION: KeepingWhatIType.tsx draws the whole block in Normal mode too: red.
 *  13. A kept line that looks like a key is kept, and the terminal view says so in one sentence that blocks nothing, in
 *      Normal mode as in Developer mode; a terminal whose lines are ordinary shows no such sentence (case 12). Round 3's
 *      press offers such a line with the same warning and keeps it, round 12, by two of the owner's decisions and
 *      answer LBC7EuG5aIqI. Photographed in English only.
 *      MUTATION: KeepingWhatIType.tsx never draws the sentence: red.
 *
 * WHERE THE HOLDER IS. As in tests/the-terminal-view-draws-and-types.test.ts: the holder is started in a
 * place of this file's own (tests/terminal-holder-stand.ts), and liveApp's server is given the same
 * XDG_CONFIG_HOME and HOME, and a UTF-8 LANG, while it starts.
 *
 * A HOLDER THAT DOES NOT RUN (case 4). liveApp's environment always says MOLE_OFFICE_TERMINAL_HOLDER=off
 * (tests/helpers.ts devStackEnvironment writes it after the process's own variables), and with off the
 * office answers "off", not "not running". So a second server is started with startAServer and
 * MOLE_OFFICE_TERMINAL_HOLDER=on on a place with no holder, and a browser context of its own sends the
 * built page's API requests to that server (Playwright's route.continue with that server's address).
 * Every answer the page draws there is that real server's answer. The second server is told that its dev
 * server's page is the built page liveApp serves (MOLE_OFFICE_WEB_PORT and MOLE_OFFICE_WEB), because the
 * requests it gets carry that page's Origin, and a server takes only its own office's pages.
 *
 * STAND-INS FOR THIS MACHINE'S PROGRAMS (wave 13u, round 3). Terminal management now carries the install press and
 * start at login. Both servers here get a folder first on PATH with a stand-in for each agent tool that prints a version,
 * and a stand-in systemctl and loginctl that answer "off" and change nothing (tests/harness-stand-ins.ts), and
 * MOLE_OFFICE_HARNESS_REGISTRY points at a stand-in registry. So no real agent tool, systemd or package registry is
 * asked.
 *
 * THE CHINESE PAGE is asked for with ?lang=zh in the address (src/web/lib/language.ts), for that page
 * view only. The theme is the browser's colour scheme (page.emulateMedia). The sideways sweep is English and light only.
 *
 * MUTATION (after a control run; the commit message that added this file has the three runs): in
 * TerminalsPage the rows are drawn from `all` instead of `shown`, so the filters narrow nothing: case 2
 * goes red. Wave 13u round 3 (its commit has the runs): the project drawn by its key, the open press's refusal
 * drawn in the server's English, and theAgentsTerminals listing a terminal twice each turn case 5 red. Wave 13s round
 * 205 (its commit has the runs): the refusal for a recorded start folder that is gone, given the no-folder code, turns
 * case 5 red. A reopening after the holder restarts that is given no resume command turns case 9 red.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BrowserContext, Page } from 'playwright'
import { t } from '../src/shared/i18n.ts'
import type { TerminalReading } from '../src/shared/terminals.ts'
import { liveApp, theResizeIsDrawn, waitForThePage, type LiveApp } from './helpers.ts'
import { aStandInRegistry, writeTheStandIns, type StandInRegistry } from './harness-stand-ins.ts'
import {
  AS_THE_PERSON,
  aPlace,
  ask,
  groups,
  holder,
  startAHolder,
  startAServer,
  stopEverything,
  stopTheGroup,
  theStreamsScreen,
  until,
  type HeldTerminal,
  type Place,
  type ScratchServer,
} from './terminal-holder-stand.ts'

/** A folder to photograph the pages into, outside the checkout, only when one is named. */
const SHOTS = process.env['TERMINAL_PAGES_SHOTS']
if (SHOTS !== undefined && SHOTS !== '') mkdirSync(SHOTS, { recursive: true })
const SHOOT = SHOTS !== undefined && SHOTS !== ''

const COMMAND_LINE = '/bin/bash --noprofile --norc'
const LAST_WORD = '2026-10-04 05:00:00 the terminal holder could not start: a reason only this test writes'

let app: LiveApp | null = null
let place: Place
let holderPid: number
let standIns: string
let registry: StandInRegistry | undefined
let downPlace: Place
let down: ScratchServer | null = null
let downContext: BrowserContext | null = null
let downPage: Page | null = null
/** The three terminals' folders, each with a word no other folder has. */
let north: string
let south: string
let agentYard: string
let northTerminal: HeldTerminal
let southTerminal: HeldTerminal
let agentTerminal: HeldTerminal
/** The registered agent that works in a terminal, and one that has none. */
let worker: { id: string; name: string }
let idle: { id: string; name: string }

/** Start liveApp with the place's XDG_CONFIG_HOME, HOME and a UTF-8 LANG, and put the variables back after. */
async function liveAppBesideTheHolder(): Promise<LiveApp> {
  const names = ['XDG_CONFIG_HOME', 'HOME', 'LANG', 'PATH', 'MOLE_OFFICE_HARNESS_REGISTRY'] as const
  const was = Object.fromEntries(names.map((name) => [name, process.env[name]]))
  Object.assign(process.env, theStandInsEnvironment(), { XDG_CONFIG_HOME: place.config, HOME: place.home, LANG: 'C.UTF-8' })
  try {
    return await liveApp({ name: 'terminal-pages', viewport: { width: 1440, height: 900 }, database: place.database })
  } finally {
    for (const name of names) {
      if (was[name] === undefined) delete process.env[name]
      else process.env[name] = was[name]
    }
  }
}

/** The PATH and registry that send both servers to the stand-ins. */
function theStandInsEnvironment(): { PATH: string; MOLE_OFFICE_HARNESS_REGISTRY: string } {
  return { PATH: `${standIns}:${process.env['PATH'] ?? '/usr/bin:/bin'}`, MOLE_OFFICE_HARNESS_REGISTRY: registry?.at ?? '' }
}

/** Open a shell through the door, as the person, in `folder`; keeping what the person types is on unless `keeping` is false. */
async function openThroughTheDoor(api: string, folder: string, keeping?: boolean): Promise<HeldTerminal> {
  const opened = await ask(api, '/api/terminals', {
    method: 'POST',
    headers: AS_THE_PERSON,
    body: { folder, command: '/bin/bash', args: ['--noprofile', '--norc'], ...(keeping === undefined ? {} : { keeping }) },
  })
  expect(opened.status, JSON.stringify(opened.body)).toBe(201)
  const terminal = opened.body['terminal'] as HeldTerminal
  groups.add(terminal.pid)
  return terminal
}

/** Type into a terminal through the door, as the person. */
async function typeThroughTheDoor(api: string, id: string, data: string): Promise<void> {
  const typed = await ask(api, `/api/terminals/${id}/input`, { method: 'POST', body: { data } })
  expect(typed.status, JSON.stringify(typed.body)).toBe(200)
}

/** Register an agent as the person, and answer its registry id and name. */
async function registerAnAgent(api: string, handle: string, name: string, runtime?: string): Promise<{ id: string; name: string }> {
  const started = await ask(api, '/api/agents/started', { method: 'POST', headers: AS_THE_PERSON, body: { handle, name, ...(runtime === undefined ? {} : { runtime }) } })
  expect(started.status, JSON.stringify(started.body)).toBe(201)
  const agent = started.body['agent'] as { id: string } | undefined
  expect(typeof agent?.id, JSON.stringify(started.body)).toBe('string')
  return { id: String(agent?.id), name }
}

function theApp(): LiveApp {
  if (app === null) throw new Error('No app.')
  return app
}

/** Go to a page of the scratch office in one language and mode (Developer mode unless asked), and wait until it is drawn. */
async function visit(page: Page, site: string, hash: string, lang: 'en' | 'zh' = 'en', mode: 'inspect' | 'normal' = 'inspect'): Promise<void> {
  await page.goto('about:blank')
  const search = lang === 'en' ? `?mode=${mode}` : `?mode=${mode}&lang=zh`
  await page.goto(`${site}/${search}#${hash}`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** A row of Terminal management, found by its folder. */
function theRow(page: Page, folder: string) {
  return page.locator('.tm-row').filter({ hasText: folder })
}

/**
 * MEASURE A SCENE at 1440 and 390 in the light look, in English: it never scrolls sideways, and it is photographed when
 * TERMINAL_PAGES_SHOTS names a folder. The other widths, the dark look and the Chinese page were swept until wave 13n
 * round F; they are dropped here, and the behaviour cases still visit the Chinese page.
 */
async function sweep(on: Page, scene: string, lang: 'en' | 'zh'): Promise<void> {
  if (lang !== 'en') return
  await on.emulateMedia({ colorScheme: 'light' })
  for (const width of [1440, 390]) {
    await on.setViewportSize({ width, height: 900 })
    await theResizeIsDrawn(on)
    expect(await sideways(on), `${scene} ${String(width)} light ${lang}`).toBeLessThanOrEqual(1)
    // A WHOLE-PAGE PICTURE OF A SCROLLED WINDOW draws the fixed bars where the window stood, so it is taken from the top.
    if (SHOOT) await on.evaluate(() => window.scrollTo(0, 0))
    if (SHOOT) await on.screenshot({ path: join(SHOTS as string, `${scene}-${String(width)}-light-${lang}.png`), fullPage: true })
  }
  await on.setViewportSize({ width: 1440, height: 900 })
}

/** The office's messages saying which agents came back after the holder restarted, read from the scratch database. */
function theMessagesAboutAgentsInTerminals(): { id: string }[] {
  const db = new Database(place.database, { readonly: true, fileMustExist: true })
  try {
    return db.prepare("SELECT id FROM records WHERE kind = 'message' AND deleted_at IS NULL AND json_extract(data, '$.extra.agentsInTerminals') IS NOT NULL").all() as { id: string }[]
  } finally {
    db.close()
  }
}

/** How far the page scrolls sideways. */
function sideways(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

/** The text of the open view's xterm rows. */
async function theViewsRows(page: Page): Promise<string> {
  return page.locator('.tm-view .xterm-rows').innerText().catch(() => '')
}

beforeAll(async () => {
  place = aPlace('tp')
  north = join(place.dir, 'north-yard')
  south = join(place.dir, 'south-yard')
  agentYard = join(place.dir, 'agent-yard')
  for (const folder of [north, south, agentYard]) mkdirSync(folder)
  standIns = join(place.dir, 'stand-ins')
  mkdirSync(standIns)
  writeTheStandIns(standIns, { programs: ['claude', 'codex', 'opencode', 'kimi', 'dsh'], shells: false })
  writeTheStandIns(standIns, { programs: [], shells: false, systemd: true })
  // THE CLAUDE AN AGENT IS OPENED WITH (case 9): it answers --version as the install panel asks, and otherwise prints
  // what it was given and waits, as an agent at work does. No real agent program is started.
  writeFileSync(
    join(standIns, 'claude'),
    `#!${process.execPath}\nconst args = process.argv.slice(2)\nif (args.includes('--version')) { console.log('2.1.200 (Claude Code)'); process.exit(0) }\n` +
      `process.stdout.write('Stand-in for claude, given: ' + args.join(' ') + '\\r\\n')\nsetInterval(() => undefined, 1 << 30)\n`,
    { mode: 0o755 },
  )
  registry = await aStandInRegistry()
  holderPid = (await startAHolder(place)).pid
  app = await liveAppBesideTheHolder()

  northTerminal = await openThroughTheDoor(app.api, north)
  await typeThroughTheDoor(app.api, northTerminal.id, "printf '中文终端：你好，世界\\nEnglish line\\n'; echo \"printed-$((6*7))\"\r")
  southTerminal = await openThroughTheDoor(app.api, south)
  await typeThroughTheDoor(app.api, southTerminal.id, 'exit 3\r')

  worker = await registerAnAgent(app.api, 'tp-worker', 'Terminal worker')
  idle = await registerAnAgent(app.api, 'tp-idle', 'Idle helper', 'claude-code')
  // THE DOOR CANNOT SET AN AGENT YET (that is wave 13u's round 3), so the agent's terminal is opened
  // straight through the holder's socket, naming the agent as the one who opened it and the one in it.
  const opened = await holder(place, {
    op: 'open',
    who: { kind: 'agent', id: worker.id },
    agent: { kind: 'agent', id: worker.id },
    project: 'default',
    command: '/bin/bash',
    args: ['--noprofile', '--norc'],
    folder: agentYard,
    env: { PATH: process.env['PATH'] ?? '/usr/bin:/bin', HOME: place.home, TERM: 'xterm-256color', HISTFILE: '/dev/null', LANG: 'C.UTF-8' },
    cols: 80,
    rows: 24,
    keeping: false,
  })
  agentTerminal = opened['terminal'] as HeldTerminal
  groups.add(agentTerminal.pid)
  await typeThroughTheDoor(app.api, agentTerminal.id, 'echo "agent-$((6*7))"\r')

  // The ended shell reads as ended before any page is opened.
  const listed = await until(
    () => ask(theApp().api, '/api/terminals'),
    (read) => ((read.body['terminals'] ?? []) as HeldTerminal[]).some((one) => one.id === southTerminal.id && one.state === 'ended'),
  )
  const ended = ((listed.body['terminals'] ?? []) as HeldTerminal[]).find((one) => one.id === southTerminal.id)
  expect(ended?.exit?.code, JSON.stringify(listed.body)).toBe(3)

  // THE OFFICE WHOSE HOLDER IS MEANT TO RUN AND DOES NOT: a log line first, then a server with it on.
  downPlace = aPlace('td')
  mkdirSync(dirname(downPlace.log), { recursive: true, mode: 0o700 })
  writeFileSync(downPlace.log, `2026-10-04 04:59:59 an earlier line\n${LAST_WORD}\n`)
  // ITS DEV SERVER'S PAGE IS THE ONE THE BROWSER OPENS: the built page liveApp serves. That page's origin is the Origin
  // of every request routed here, and a server takes an Origin only from a page of its own office.
  down = await startAServer(downPlace, undefined, {
    MOLE_OFFICE_TERMINAL_HOLDER: 'on',
    MOLE_OFFICE_WEB_PORT: String(app.webPort),
    MOLE_OFFICE_WEB: app.site,
    ...theStandInsEnvironment(),
  })
  downContext = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  const theDownApi = new URL(down.api)
  const thePagesApiPort = String(app.apiPort)
  await downContext.route(
    (url) => url.hostname === '127.0.0.1' && url.port === thePagesApiPort,
    (route) => {
      const to = new URL(route.request().url())
      to.port = theDownApi.port
      return route.continue({ url: to.toString() })
    },
  )
  downPage = await downContext.newPage()
}, 300_000)

afterAll(async () => {
  try {
    await downContext?.close()
    await app?.stop()
  } finally {
    // The holder, the second server and every terminal, each by its process group.
    await stopEverything()
    await registry?.close()
  }
}, 120_000)

describe('the terminal pages', () => {
  it('1. Terminal management lists each terminal with its command, state, folder and who opened it', async () => {
    const { page, site } = theApp()
    await visit(page, site, '/terminals')
    await page.locator('.tm-row').nth(2).waitFor({ state: 'visible' })
    expect(await page.locator('.tm-row').count()).toBe(3)
    // THE HOLDER IS SAID IN PLAIN WORDS; its process number is behind the developers' fold (the coordinator's review, point 7).
    expect(await page.locator('.tm-holder-running .tm-holder-line').innerText()).toBe(t('terminals.holder.running'))
    expect(await page.locator('.tm-holder-running .tm-holder-line').innerText()).not.toContain(String(holderPid))
    await page.locator('.tm-holder-running .tm-dev > summary').click()
    expect(await page.locator('.tm-holder-running .tm-dev').innerText()).toContain(String(holderPid))

    // EACH ROW HAS A PLAIN TITLE, whose terminal it is (point 3), and its project by name (point 4).
    const projectName = ((await ask(theApp().api, '/api/workspaces')).body['workspaces'] as { id: string; title: string }[]).find((one) => one.id === 'default')?.title ?? ''
    expect(projectName).not.toBe('')
    const northRow = await theRow(page, north).innerText()
    expect(northRow).toContain(t('terminals.title.yours'))
    expect(northRow).toContain(COMMAND_LINE)
    expect(northRow).toContain(projectName)
    expect(northRow).toContain(t('terminals.state.running'))
    expect(northRow).toContain(t('terminals.who.you'))
    expect(northRow).toContain(t('terminals.agent.none'))

    const southRow = await theRow(page, south).innerText()
    expect(southRow).toContain(COMMAND_LINE)
    // AN EXIT CODE IS SAID AS A PERSON WOULD (point 7).
    expect(southRow).toContain(t('terminals.state.failed'))
    expect(southRow).toContain(t('terminals.who.you'))

    // The agent's name is read from the participants list after the row is drawn.
    const agentRow = await until(() => theRow(page, agentYard).innerText(), (text) => text.includes(worker.name))
    expect(agentRow).toContain(t('terminals.title.agents', { name: worker.name }))
    expect(agentRow).toContain(t('terminals.state.running'))
    expect(agentRow).toContain(worker.name)
    expect(agentRow).not.toContain(t('terminals.who.you'))
    expect(agentRow).not.toContain(t('terminals.agent.none'))
  }, 120_000)

  it('2. the words filter narrows to one row, Show all brings the rest back, and Ended leaves the ended one', async () => {
    const { page, site } = theApp()
    await visit(page, site, '/terminals')
    await page.locator('.tm-row').nth(2).waitFor({ state: 'visible' })
    await page.getByText(t('terminals.filters'), { exact: true }).click()
    await page.getByLabel(t('terminals.filter.words')).fill('north-yard')
    await page.getByText(t('terminals.hiding', { n: 2 })).waitFor({ state: 'visible' })
    expect(await page.locator('.tm-row').count()).toBe(1)
    expect(await theRow(page, north).count()).toBe(1)

    await page.getByRole('button', { name: t('terminals.clear') }).click()
    await page.locator('.tm-row').nth(2).waitFor({ state: 'visible' })
    expect(await page.locator('.tm-row').count()).toBe(3)
    expect(await page.locator('.tm-hiding').count()).toBe(0)

    await page.getByLabel(t('terminals.filter.state')).selectOption('ended')
    await page.getByText(t('terminals.hiding', { n: 2 })).waitFor({ state: 'visible' })
    expect(await page.locator('.tm-row').count()).toBe(1)
    expect(await theRow(page, south).count()).toBe(1)
  }, 120_000)

  it('3. pressing a row opens the terminal below the list with its screen, and Put away hides it', async () => {
    const { page, site } = theApp()
    await visit(page, site, '/terminals')
    await theRow(page, north).locator('.tm-row-press').click()
    await page.locator('.tm-view .xterm-rows').waitFor({ state: 'visible' })
    const rows = await until(() => theViewsRows(page), (text) => text.includes('printed-42'))
    expect(rows).toContain('printed-42')
    expect(rows).toContain('中文终端：你好，世界')
    expect(await page.locator('.tm-view-folder').innerText()).toContain(north)
    expect(await theRow(page, north).locator('.tm-row-press').getAttribute('aria-expanded')).toBe('true')
    await page.getByRole('button', { name: t('terminals.view.putAway') }).click()
    await page.locator('.tm-view').waitFor({ state: 'detached' })
    expect(await page.locator('.tm-row').count()).toBe(3)
  }, 120_000)

  it("4. with the holder meant to run and not running, the page says so with the holder's last line, and draws no rows", async () => {
    if (downPage === null || app === null) throw new Error('No page for the office without a holder.')
    await visit(downPage, app.site, '/terminals')
    await downPage.locator('.tm-holder-down').waitFor({ state: 'visible' })
    expect(await downPage.locator('.tm-holder-headline').innerText()).toBe(t('terminals.holder.notRunning'))
    // THE PRESS THAT STARTS IT (the coordinator's review, point 1); the holder's last line is behind the developers' fold.
    expect(await downPage.getByRole('button', { name: t('terminals.holder.start') }).count()).toBe(1)
    expect(await downPage.locator('.tm-holder-down .tm-holder-why').isVisible()).toBe(false)
    await downPage.locator('.tm-holder-down .tm-dev > summary').click()
    const why = await downPage.locator('.tm-holder-why').innerText()
    expect(why).toContain(t('terminals.holder.lastWord'))
    expect(why).toContain(LAST_WORD)
    expect(await downPage.locator('.tm-row').count()).toBe(0)
    expect(await downPage.getByText(t('terminals.noneOpen')).count()).toBe(0)
  }, 120_000)

  it("5. an agent's profile page shows its own terminal once, with its project's name, opens it, says when it has none, and refuses an open whose start folder is gone in its language", async () => {
    const { page, site, api } = theApp()
    await visit(page, site, `/who/agent/${worker.id}`)
    const panel = page.locator('.tm-prof-rows')
    await panel.first().waitFor({ state: 'visible' })
    expect(await page.getByText(t('terminals.profile.own'), { exact: true }).count()).toBe(1)
    expect(await page.getByText(t('terminals.profile.summoned'), { exact: true }).count()).toBe(1)
    // ONE TERMINAL, LISTED ONCE: it opened it and works in it, so it is its own and not among those it opened.
    expect(await panel.count()).toBe(1)
    expect(await panel.nth(0).locator('.tm-prof-press').count()).toBe(1)
    expect(await page.getByText(t('terminals.profile.noSummoned')).count()).toBe(1)
    expect(await panel.nth(0).innerText()).toContain(COMMAND_LINE)
    expect(await panel.nth(0).innerText()).toContain(t('terminals.state.running'))
    // ITS PROJECT BY NAME, as the sidebar shows it, and not by its key.
    expect(await panel.nth(0).locator('.tm-prof-project').innerText()).toBe('Default')
    expect(await page.getByText(t('terminals.profile.notListed')).count()).toBe(0)
    await panel.nth(0).locator('.tm-prof-press').click()
    await page.locator('.tm-view .xterm-rows').waitFor({ state: 'visible' })
    const rows = await until(() => theViewsRows(page), (text) => text.includes('agent-42'))
    expect(rows).toContain('agent-42')
    expect(await page.locator('.tm-view-folder').innerText()).toContain(agentYard)

    await visit(page, site, `/who/agent/${idle.id}`)
    await page.getByText(t('terminals.profile.notListed')).waitFor({ state: 'visible' })
    await page.getByText(t('terminals.profile.noSummoned')).waitFor({ state: 'visible' })
    expect(await page.locator('.tm-prof-press').count()).toBe(0)
    expect(await page.getByRole('link', { name: t('terminals.profile.allTerminals') }).count()).toBe(1)
    // OPEN IN A TERMINAL, for an agent whose recorded start folder is gone: refused, in the page's own words, and
    // nothing opens.
    const gone = join(place.dir, 'idle-yard')
    mkdirSync(gone)
    const set = await ask(api, '/api/participants/agent/tp-idle/start-folder', { method: 'POST', body: { startFolder: gone, because: 'Test: its folder is removed before the press' } })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    rmSync(gone, { recursive: true })
    await page.getByRole('button', { name: t('terminals.agent.openPress') }).click()
    const refused = page.locator('.tm-prof-line[role="alert"]')
    await refused.waitFor({ state: 'visible' })
    expect(await refused.innerText()).toBe(`${t('terminals.agent.openRefused')} ${t('server.terminalAgentStartFolderGone')}`)
    expect(await page.locator('.tm-prof-press').count()).toBe(0)
  }, 120_000)

  it('7. every scene at the widest and the narrowest width, in the light theme, scrolls no page sideways in English, still runs in Chinese, and is photographed when asked', async () => {
    const { page, site } = theApp()
    if (downPage === null) throw new Error('No page for the office without a holder.')
    const thePageWithNoHolder = downPage
    if (down === null) throw new Error('No office without a holder.')
    const stillAgent = await registerAnAgent(down.api, 'still-agent', 'Still agent')

    /** Measure, and photograph when asked, one scene at 1440 and 390 in the light look; the Chinese page still runs. */
    for (const lang of ['en', 'zh'] as const) {
      await page.setViewportSize({ width: 1440, height: 900 })
      await visit(page, site, '/terminals', lang)
      expect(await page.evaluate(() => document.documentElement.lang)).toBe(lang)
      await page.locator('.tm-row').nth(2).waitFor({ state: 'visible' })
      await until(() => theRow(page, agentYard).innerText(), (text) => text.includes(worker.name))
      await sweep(page, 'management', lang)

      await page.locator('.tm-narrow-open').click()
      await page.locator('.tm-filters input').first().fill('north-yard')
      await page.locator('.tm-hiding').waitFor({ state: 'visible' })
      expect(await page.locator('.tm-row').count()).toBe(1)
      await sweep(page, 'management-searched', lang)

      await page.locator('.tm-clear').click()
      await page.locator('.tm-narrow-open').click()
      await theRow(page, north).locator('.tm-row-press').click()
      await page.locator('.tm-view .xterm-rows').waitFor({ state: 'visible' })
      expect(await until(() => theViewsRows(page), (text) => text.includes('中文终端：你好，世界'))).toContain('中文终端：你好，世界')
      await sweep(page, 'terminal-chinese', lang)

      await visit(page, site, `/who/agent/${worker.id}`, lang)
      await page.locator('.tm-prof-press').first().waitFor({ state: 'visible' })
      await sweep(page, 'agent-profile', lang)

      await thePageWithNoHolder.setViewportSize({ width: 1440, height: 900 })
      await visit(thePageWithNoHolder, theApp().site, '/terminals', lang)
      await thePageWithNoHolder.locator('.tm-holder-down').waitFor({ state: 'visible' })
      await sweep(thePageWithNoHolder, 'holder-not-running', lang)

      // AND AN AGENT'S PROFILE WITH THE HOLDER STOPPED (the coordinator's review of round 2, point 2): both pages say so.
      await visit(thePageWithNoHolder, theApp().site, `/who/agent/${stillAgent.id}`, lang)
      await thePageWithNoHolder.locator('.tm-holder-down').waitFor({ state: 'visible' })
      await sweep(thePageWithNoHolder, 'agent-profile-holder-stopped', lang)
    }
  }, 600_000)

  it("8. the start press starts the holder where none ran, and the page then says it runs", async () => {
    const page = downPage
    if (page === null || app === null || down === null) throw new Error('No page for the office without a holder.')
    await visit(page, app.site, '/terminals')
    try {
      await page.getByRole('button', { name: t('terminals.holder.start') }).click()
      await page.locator('.tm-holder-running').waitFor({ state: 'visible', timeout: 30_000 })
    } finally {
      // THE HOLDER IT STARTED is this test's to stop, by its process group, which is its pid, whether or not the page said so.
      const holder = (await ask(down.api, '/api/terminals')).body['holder'] as { state: string; pid?: number }
      if (typeof holder.pid === 'number') groups.add(holder.pid)
    }
    expect(((await ask(down.api, '/api/terminals')).body['holder'] as { state: string }).state).toBe('running')
    // AN OFFICE WHOSE HOLDER IS TURNED OFF starts none by the press either, as mole-office start starts none.
    const off = await ask(app.api, '/api/terminals/holder/start', { method: 'POST', body: {} })
    expect(off.status, JSON.stringify(off.body)).toBe(409)
    expect(off.body['code']).toBe('terminalHolderTurnedOff')
  }, 120_000)

  it('9. an agent opened from its profile comes back after the holder restarts, and the person is told', async () => {
    const { page, site, api } = theApp()
    const yard = join(place.dir, 'claude-yard')
    mkdirSync(yard)
    const helper = await registerAnAgent(api, 'tp-claude', 'Claude helper', 'claude-code')
    const set = await ask(api, '/api/participants/agent/tp-claude/start-folder', { method: 'POST', body: { startFolder: yard, because: 'Test: its terminal opens here' } })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
    /** The running terminal the helper works in, its process group recorded. */
    const itsTerminal = async (): Promise<TerminalReading | undefined> => {
      const all = ((await ask(api, '/api/terminals')).body['terminals'] ?? []) as TerminalReading[]
      for (const one of all) groups.add(one.pid)
      return all.find((one) => one.agent?.id === helper.id && one.state === 'running')
    }

    await visit(page, site, `/who/agent/${helper.id}`)
    await page.getByRole('button', { name: t('terminals.agent.openPress') }).click()
    const first = await until(itsTerminal, (one) => one !== undefined, 20_000)
    expect(basename(first?.command ?? '')).toBe('claude')
    expect(first?.folder).toBe(yard)

    // THE HOLDER IS STOPPED BY ITS GROUP AND ANOTHER STARTED: every terminal ends, and the agent is opened again.
    await stopTheGroup(holderPid)
    holderPid = (await startAHolder(place)).pid
    // THE REOPENED TERMINAL CARRIES ITS RESUME COMMAND among its arguments, and not first: every claude-code launch puts
    // the switches that turn the harness's own subagents off before its own arguments (src/server/lib/terminal-agents.ts).
    const again = await until(itsTerminal, (one) => one !== undefined && one.args.includes('--resume'), 30_000)
    expect(again?.folder).toBe(yard)
    expect(again?.args, 'the agent was opened again without its resume command').toContain('--resume')
    // THE MESSAGE TO THE PERSON is written in the message centre, so it is read from the scratch database, read-only.
    const told = await until(
      async () => theMessagesAboutAgentsInTerminals(),
      (found) => found.length > 0,
      20_000,
    )
    expect(told).toHaveLength(1)

    for (const lang of ['en', 'zh'] as const) {
      await visit(page, site, `/who/agent/${helper.id}`, lang)
      await page.locator('.tm-prof-press').first().waitFor({ state: 'visible' })
      await sweep(page, 'agent-reopened-profile', lang)
      await visit(page, site, '/terminals', lang)
      await theRow(page, yard).waitFor({ state: 'visible' })
      expect(await theRow(page, yard).innerText()).toContain(helper.name)
      await sweep(page, 'agent-reopened-management', lang)
      await visit(page, site, `/r/${told[0]!.id}`, lang)
      await page.locator('[data-text-field="data.saidInFull"]').first().waitFor({ state: 'attached' })
      expect(await page.locator('[data-text-field="data.saidInFull"]').first().textContent()).toContain('Opened again: tp-claude')
      // THE FULL TEXT IS BEHIND ITS FOLD on a message's page; it is opened, so the picture shows what the person reads.
      await page.locator('details:has([data-text-field="data.saidInFull"]) > summary').first().click()
      await page.locator('[data-text-field="data.saidInFull"]').first().waitFor({ state: 'visible' })
      await sweep(page, 'agent-reopened-message', lang)
    }
  }, 300_000)

  it('10. the person keeps the last line they typed as their own words, after reading it on the page', async () => {
    const { page, site, api } = theApp()
    const kiln = join(place.dir, 'kiln-yard')
    mkdirSync(kiln)
    const shell = await openThroughTheDoor(api, kiln, false)
    await typeThroughTheDoor(api, shell.id, 'echo the kiln fires on friday\r')
    await until(() => theStreamsScreen(api, shell.id), (lines) => lines.join('\n').includes('the kiln fires on friday\n'), 10_000)

    for (const lang of ['en', 'zh'] as const) {
      await visit(page, site, '/terminals', lang)
      await theRow(page, kiln).locator('.tm-row-press').click()
      await page.locator('.tm-view .xterm-rows').waitFor({ state: 'visible' })
      // THE PRESSES BY THEIR PLACE, as the Chinese page names them in Chinese.
      await page.locator('.tm-view .tm-keep > .px-btn').click()
      await page.locator('.tm-keep-offer').waitFor({ state: 'visible' })
      expect(await page.locator('.tm-keep-line').innerText()).toBe('echo the kiln fires on friday')
      await sweep(page, 'keep-offered', lang)
      await page.locator('.tm-keep-presses .px-btn[data-variant="primary"]').click()
      await page.locator('.tm-keep-says').waitFor({ state: 'visible' })
      await sweep(page, 'keep-kept', lang)
    }
    const notes = ((await ask(api, '/api/records?kind=note&shape=full')).body['records'] ?? []) as { id: string; data: Record<string, unknown> }[]
    const kept = notes.filter((one) => one.data['body'] === 'echo the kiln fires on friday')
    expect(kept.length).toBeGreaterThan(0)
    for (const lang of ['en', 'zh'] as const) {
      await visit(page, site, `/r/${kept[0]!.id}`, lang)
      await page.getByText('echo the kiln fires on friday').first().waitFor({ state: 'visible' })
      await sweep(page, 'keep-the-note', lang)
    }
  }, 300_000)

  it('11. what the person types is kept with no press, the switch turns it off, and the note shows the kept lines and what was left out', async () => {
    // Since round 12 a line that looks like a key is kept, by the owner's decision. The
    // password here is made up.
    const { page, site, api } = theApp()
    const clay = join(place.dir, 'clay-shed')
    mkdirSync(clay)
    const shell = await openThroughTheDoor(api, clay)
    for (const line of ['echo glaze the blue bowls', 'export DB_PASSWORD=hunter2', 'echo fire them on monday']) {
      await typeThroughTheDoor(api, shell.id, `${line}\r`)
      const shown = line.startsWith('export') ? null : line.slice('echo '.length)
      if (shown !== null) await until(() => theStreamsScreen(api, shell.id), (lines) => lines.join('\n').includes(`${shown}\n`), 10_000)
    }
    // A LINE THE SCREEN DID NOT SHOW is still left out: a password at a prompt that does not echo.
    await typeThroughTheDoor(api, shell.id, "read -s -p 'pw: ' x; echo; echo read-done\r")
    await until(() => theStreamsScreen(api, shell.id), (lines) => lines.join('\n').includes('pw: '), 10_000)
    await typeThroughTheDoor(api, shell.id, 'plain-words-for-a-password\r')
    await until(() => theStreamsScreen(api, shell.id), (lines) => lines.join('\n').includes('read-done\n'), 10_000)
    const keeping = async (): Promise<Record<string, unknown>> => (await ask(api, `/api/terminals/${shell.id}/keeping`)).body
    const read = await until(keeping, (one) => {
      const note = one['note'] as { lines: number; leftOut: { notShown: number } } | null
      return note !== null && note.lines === 4 && note.leftOut.notShown === 1
    }, 10_000)
    expect(read['note'], JSON.stringify(read)).toMatchObject({ lines: 4, keyLike: 1, leftOut: { notShown: 1, edited: 0, tooLong: 0, before: 0 } })
    const noteId = (read['note'] as { id: string }).id

    for (const lang of ['en', 'zh'] as const) {
      const on = await ask(api, `/api/terminals/${shell.id}/keeping`, { method: 'PUT', headers: AS_THE_PERSON, body: { on: true } })
      expect(on.status, JSON.stringify(on.body)).toBe(200)
      await visit(page, site, '/terminals', lang)
      await theRow(page, clay).locator('.tm-row-press').click()
      await page.locator('.tm-view .xterm-rows').waitFor({ state: 'visible' })
      await page.locator('.tm-keeping-switch[data-keeping="on"]').waitFor({ state: 'visible' })
      expect(await page.locator('.tm-keeping-switch input').isChecked()).toBe(true)
      expect(await page.locator('.tm-view .tm-keep').count()).toBe(0)
      // THE NOTE IS NAMED WITH ITS COUNTS: four kept, one left out, the one not shown; and the key-like line is said.
      const says = await page.locator('.tm-keeping').innerText()
      expect(says).toContain(lang === 'en' ? 'Lines kept: 4. Lines left out: 1.' : '已保存 4 行。未保存 1 行。')
      expect(says).toContain(lang === 'en' ? 'Not shown on the screen: 1.' : '屏幕没有显示：1。')
      expect(await page.locator('.tm-keeping-key').innerText()).toBe(lang === 'en' ? '1 kept line looks like a key. It is kept as usual.' : '有 1 行已保存的内容看起来像密钥，照常保存。')
      expect(says).not.toContain('plain-words-for-a-password')
      await sweep(page, 'keeping-on', lang)
      await page.locator('.tm-keeping-switch input').click()
      await page.locator('.tm-keeping-switch[data-keeping="off"]').waitFor({ state: 'visible' })
      expect(await page.locator('.tm-keeping-switch input').isChecked()).toBe(false)
      await page.locator('.tm-view .tm-keep > .px-btn').waitFor({ state: 'visible' })
      expect((await keeping())['on']).toBe(false)
      await sweep(page, 'keeping-off', lang)
    }

    for (const lang of ['en', 'zh'] as const) {
      await visit(page, site, `/r/${noteId}`, lang)
      await page.locator('.kl-line').first().waitFor({ state: 'visible' })
      expect(await page.locator('.kl-text').allInnerTexts()).toEqual([
        'echo glaze the blue bowls',
        'export DB_PASSWORD=hunter2',
        'echo fire them on monday',
        "read -s -p 'pw: ' x; echo; echo read-done",
      ])
      const theNote = await page.locator('.kl').innerText()
      expect(theNote).toContain(lang === 'en' ? 'Lines kept: 4. Lines left out: 1.' : '已保存 4 行。未保存 1 行。')
      expect(theNote).not.toContain('plain-words-for-a-password')
      await sweep(page, 'keeping-the-note', lang)
    }
    // ONE LINE DELETED BY ITS PRESS, which the note's editing address carries as every write press: the note keeps the other.
    await visit(page, site, `/r/${noteId}/edit`, 'en')
    await page.locator('.kl-line').first().locator('.px-btn').click()
    expect(await until(() => page.locator('.kl-line').count(), (count) => count === 3, 10_000)).toBe(3)
    const after = await ask(api, `/api/records/${noteId}`)
    // THE NOTE'S BODY loses the line; its history keeps the edit, as for every note the person edits.
    expect((after.body['record'] as { data: Record<string, unknown> }).data['body']).toBe("export DB_PASSWORD=hunter2\necho fire them on monday\nread -s -p 'pw: ' x; echo; echo read-done")
  }, 300_000)

  it("12. in Normal mode the keeping block is the switch and the note's link; Developer mode adds the note's counts", async () => {
    const { page, site, api } = theApp()
    const kiln = join(place.dir, 'kiln-room')
    mkdirSync(kiln)
    const shell = await openThroughTheDoor(api, kiln)
    await typeThroughTheDoor(api, shell.id, 'echo stack the kiln\r')
    const keeping = async (): Promise<Record<string, unknown>> => (await ask(api, `/api/terminals/${shell.id}/keeping`)).body
    await until(keeping, (one) => (one['note'] as { lines: number } | null)?.lines === 1, 10_000)
    const theBlock = async (): Promise<string> => (await page.locator('.tm-view .tm-keeping').innerText()).replace(/\s+/g, ' ').trim()

    await visit(page, site, '/terminals', 'en', 'normal')
    await theRow(page, kiln).locator('.tm-row-press').click()
    await page.locator('.tm-keeping-switch[data-keeping="on"]').waitFor({ state: 'visible' })
    expect(await theBlock()).toBe('Keep what I type here Open the note')
    // AN ORDINARY LINE BRINGS NO WARNING (case 13 is the other side).
    expect(await page.locator('.tm-keeping-key').count()).toBe(0)
    await sweep(page, 'keeping-normal-on', 'en')
    await page.locator('.tm-keeping-switch input').click()
    await page.locator('.tm-keeping-switch[data-keeping="off"]').waitFor({ state: 'visible' })
    expect(await page.locator('.tm-keeping-switch input').isChecked()).toBe(false)
    expect((await keeping())['on']).toBe(false)
    await page.locator('.tm-view .tm-keep > .px-btn').waitFor({ state: 'visible' })
    expect(await page.locator('.tm-view .tm-keeping-open').innerText()).toBe('Open the note')
    await sweep(page, 'keeping-normal-off', 'en')

    const on = await ask(api, `/api/terminals/${shell.id}/keeping`, { method: 'PUT', headers: AS_THE_PERSON, body: { on: true } })
    expect(on.status, JSON.stringify(on.body)).toBe(200)
    await visit(page, site, '/terminals', 'en', 'inspect')
    await theRow(page, kiln).locator('.tm-row-press').click()
    await page.locator('.tm-keeping-switch[data-keeping="on"]').waitFor({ state: 'visible' })
    const whole = await theBlock()
    expect(whole).toContain('Lines kept: 1. Lines left out: 0.')
  }, 300_000)
  it('13. a kept line that looks like a key is said in one sentence that blocks nothing, and round 3\'s press offers and keeps one', async () => {
    const { page, site, api } = theApp()
    const shed = join(place.dir, 'potting-shed')
    mkdirSync(shed)
    const shell = await openThroughTheDoor(api, shed)
    // MADE-UP TOKEN, typed as a user who chooses to give an agent a key would.
    await typeThroughTheDoor(api, shell.id, 'echo token=Zx81Ka92Lm03Pq74Rs65Tu56\r')
    await until(() => theStreamsScreen(api, shell.id), (lines) => lines.join('\n').includes('token=Zx81Ka92Lm03Pq74Rs65Tu56\n'), 10_000)
    const keeping = async (): Promise<Record<string, unknown>> => (await ask(api, `/api/terminals/${shell.id}/keeping`)).body
    await until(keeping, (one) => (one['note'] as { lines: number } | null)?.lines === 1, 10_000)

    await visit(page, site, '/terminals', 'en', 'normal')
    await theRow(page, shed).locator('.tm-row-press').click()
    await page.locator('.tm-keeping-key').waitFor({ state: 'visible' })
    expect(await page.locator('.tm-keeping-key').innerText()).toBe('1 kept line looks like a key. It is kept as usual.')
    // IT BLOCKS NOTHING: the switch still answers, and the next line is kept after it.
    expect(await page.locator('.tm-keeping-switch input').isDisabled()).toBe(false)
    await typeThroughTheDoor(api, shell.id, 'echo water the seedlings\r')
    await until(keeping, (one) => (one['note'] as { lines: number } | null)?.lines === 2, 10_000)
    await sweep(page, 'keeping-key-warning', 'en')

    // ROUND 3'S PRESS, with keeping off: the key-like line is offered with the same warning, and kept.
    await page.locator('.tm-keeping-switch input').click()
    await page.locator('.tm-keeping-switch[data-keeping="off"]').waitFor({ state: 'visible' })
    await typeThroughTheDoor(api, shell.id, 'echo token=Zx81Ka92Lm03Pq74Rs65Tu56\r')
    // FOUR TIMES ON THE SCREEN: each typing shows the command and then its output.
    await until(() => theStreamsScreen(api, shell.id), (lines) => lines.join('\n').split('token=Zx81Ka92Lm03Pq74Rs65Tu56\n').length > 4, 10_000)
    // THE HOLDER ASKS THE SCREEN a moment after Enter; until then the line is not offered, so the press waits for it.
    await until(() => ask(api, `/api/terminals/${shell.id}/last-line`), (read) => read.body['looksLikeAKey'] === true, 10_000)
    await page.locator('.tm-view .tm-keep > .px-btn').click()
    await page.locator('.tm-keep-key').waitFor({ state: 'visible' })
    expect(await page.locator('.tm-keep-key').innerText()).toBe('This line looks like a key. You can still keep it.')
    await sweep(page, 'keep-offered-key', 'en')
    const before = ((await ask(api, '/api/records?kind=note&shape=full')).body['records'] ?? []) as unknown[]
    await page.locator('.tm-keep-presses .px-btn[data-variant="primary"]').click()
    await page.locator('.tm-keep-says').waitFor({ state: 'visible' })
    const after = ((await ask(api, '/api/records?kind=note&shape=full')).body['records'] ?? []) as unknown[]
    expect(after.length).toBe(before.length + 1)
  }, 300_000)
})
