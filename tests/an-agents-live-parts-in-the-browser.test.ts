// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT'S LIVE TERMINAL, ITS LIVE STEPS AND THE WAY BACK, DRAWN IN THE BROWSER. Wave 13u, round 10,
 * on a decision and two others. AgentLiveTerminal,
 * AgentLiveSteps and AgentWayBack are drawn on their own test
 * page (the component sheet's page with `?agent-live=<agent>`, src/web/components/TheLivePartsSheet.tsx).
 *
 * The page is a real dev stack whose API requests go to a scratch server with a real holder, on a database in the
 * test's own folder (tests/terminal-holder-stand.ts). No real agent program and no real tmux run: a stand-in claude and
 * a stand-in tmux are first on the scratch server's PATH, as in tests/an-agents-tmux-pane-is-watched-without-
 * moving-the-persons.test.ts. The runs are session records the test files; the sandboxed run's conversation is a file the test writes.
 *
 * THIS FILE NOW CHECKS THREE THINGS:
 *   1. live-steps: its steps, a step written later, a message sent, and the way back with no press. A step holding a
 *      key is drawn with a marker where the key was, and no key is drawn (round 10b).
 *   2. live-flags in Developer mode: the technical rows the person's mode leaves out, and a left-out flag drawn by
 *      its name only, so a flag holding a key is not drawn with it (round 10b).
 *   3. an office-held live screen on the actual profile: the show press reuses its stream without a pane POST,
 *      at 1440, 990, 660 and 390, in light and dark, in English, with optional pictures of every combination.
 *
 * The earlier general sweeps were taken out in wave 13n round F. The held-screen case checks its own eight views.
 *
 * MUTATIONS (each after a control run; the commit message has the runs):
 *   - AgentLiveSteps asks again with no `after`: case 3 red (19 rows, not 5).
 *   - AgentWayBack offers the press for a sandboxed run: case 3 red.
 *   - theStepsOfALine does not screen a step's text (round 10b): case 3 red.
 *   - theStartFlagsOf names a left-out flag with its value, unscreened (round 10b): case 5 red.
 */

import { randomUUID } from 'node:crypto'
import { appendFileSync, chmodSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import Database from 'better-sqlite3'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { BrowserContext, Locator, Page } from 'playwright'
import { createI18n } from '../src/shared/i18n.ts'
import { liveApp, thePersonsKeyHeader, waitForThePage, type LiveApp } from './helpers.ts'
import { AS_THE_PERSON, aPlace, ask, groups, startAHolder, startAServer, stopEverything, until, type Place, type ScratchServer } from './terminal-holder-stand.ts'
import type { TerminalReading } from '../src/shared/terminals.ts'

const WORDS = { en: createI18n('en').t, zh: createI18n('zh').t }

let app: LiveApp | null = null
let place: Place
let server: ScratchServer
let context: BrowserContext | null = null
let page: Page | null = null
let personsKey: Record<string, string> = {}
let liveFile = ''
let work = ''
const stopped = randomUUID()
const sandboxed = randomUUID()

/**
 * The sandboxed run's working directory, and the folder Claude Code flattens it to (src/config/claude-code-served.mjs).
 * A REAL FOLDER (round 11): the office closes a running row whose working directory is not on the disk and which
 * recorded no process (src/config/own-rows.mjs), about a minute in, and case 2 then found the run finished.
 */
let WORKING_DIRECTORY = ''
let FLATTENED = ''
/** What the stand-in tmux says the pane shows. */
const PANE_SCREEN = 'TEST PANE SCREEN, example content'
/** A made-up key in the shape of an API key, for this test only. It opens no account. */
const TEST_KEY = 'sk-test0000000000000000000000000000'

const CLAUDE_STAND_IN = `#!${process.execPath}
process.stdout.write('STAND-IN claude ARGS ' + JSON.stringify(process.argv.slice(2)) + '\\r\\n')
setInterval(() => undefined, 1 << 30)
`

/** The stand-in tmux: the pane on the terminal the state file names, its screen, and a control mode that sends nothing. */
function aTmuxStandIn(state: string): string {
  return `#!${process.execPath}
const fs = require('node:fs')
const args = process.argv.slice(2)
const state = () => JSON.parse(fs.readFileSync(${JSON.stringify(state)}, 'utf8'))
const flag = (name) => (args.indexOf(name) === -1 ? null : args[args.indexOf(name) + 1])
const pane = (id) => state().panes.find((one) => one.id === id)
const fail = (line) => { process.stderr.write(line + '\\n'); process.exit(1) }
if (args[0] === 'list-panes') {
  for (const one of state().panes) process.stdout.write([one.id, one.target, one.tty, one.cols, one.rows].join(' ') + '\\n')
} else if (args[0] === 'display-message') {
  const one = pane(flag('-t'))
  if (one === undefined) fail("can't find pane: " + flag('-t'))
  process.stdout.write(args[args.length - 1].includes('cursor') ? one.id + ' 0 1\\n' : one.id + '\\n')
} else if (args[0] === 'capture-pane') {
  process.stdout.write(${JSON.stringify(PANE_SCREEN)} + '\\n')
} else if (args[0] === 'new-session' || args[0] === 'kill-session') {
} else if (args[0] === '-C') {
  process.stdout.write('%begin 1 1 0\\n%end 1 1 0\\n')
  process.stdin.resume()
  process.stdin.on('end', () => process.exit(0))
} else {
  fail('the stand-in tmux does not know ' + args.join(' '))
}
`
}

/** A local stamp `seconds` from now, in the form the office's records hold. */
function aLocalStamp(seconds: number): string {
  const d = new Date(Date.now() + seconds * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** One assistant line, in the shape Claude Code writes it. */
function anAssistantLine(seconds: number, content: unknown[]): string {
  return JSON.stringify({ type: 'assistant', isSidechain: false, timestamp: new Date(Date.now() + seconds * 1000).toISOString(), message: { role: 'assistant', content } }) + '\n'
}

async function register(handle: string, startFolder: string | null = null): Promise<void> {
  const registered = await ask(server.api, '/api/agents/started', { method: 'POST', body: { handle, name: handle, role: 'worker', runtime: 'claude-code' } })
  expect(registered.status, JSON.stringify(registered.body)).toBe(201)
  if (startFolder !== null) {
    const set = await ask(server.api, `/api/participants/agent/${handle}/start-folder`, { method: 'POST', body: { startFolder, because: 'the test opens it in a terminal' } })
    expect(set.status, JSON.stringify(set.body)).toBe(200)
  }
}

async function aRun(handle: string, data: Record<string, unknown>): Promise<string> {
  const filed = await ask(server.api, '/api/records', {
    method: 'POST',
    headers: { ...AS_THE_PERSON, ...personsKey },
    body: { kind: 'session', title: `Test run of ${handle}`, data: { state: 'running', servingAgent: handle, runtime: 'claude-code', ...data } },
  })
  expect(filed.status, JSON.stringify(filed.body)).toBe(201)
  return String((filed.body['record'] as { id?: string } | undefined)?.id ?? filed.body['id'])
}

beforeAll(async () => {
  place = aPlace('live-parts')
  const bin = join(place.dir, 'b')
  mkdirSync(bin)
  work = join(place.dir, 'w')
  mkdirSync(work)
  const stateFile = join(place.dir, 'tmux-state.json')
  writeFileSync(stateFile, JSON.stringify({ panes: [] }))
  writeFileSync(join(bin, 'claude'), CLAUDE_STAND_IN)
  writeFileSync(join(bin, 'tmux'), aTmuxStandIn(stateFile))
  chmodSync(join(bin, 'claude'), 0o755)
  chmodSync(join(bin, 'tmux'), 0o755)

  WORKING_DIRECTORY = join(place.dir, 'sw')
  mkdirSync(WORKING_DIRECTORY)
  FLATTENED = WORKING_DIRECTORY.replace(/[^a-zA-Z0-9]/g, '-')

  // THE SANDBOXED RUN'S CONVERSATION, as Claude Code writes it in the sandbox's home.
  const sandbox = join(place.home, '.cache', 'mole-office', 'sandboxes', 'sb')
  const conversations = join(sandbox, 'home', '.claude', 'projects', FLATTENED)
  mkdirSync(conversations, { recursive: true })
  liveFile = join(conversations, `${sandboxed}.jsonl`)
  writeFileSync(
    liveFile,
    anAssistantLine(-30, [{ type: 'thinking', thinking: 'TEST-THINKING-NEVER-SHOWN' }, { type: 'text', text: 'Reading the brief.' }]) +
      anAssistantLine(-29, [{ type: 'tool_use', name: 'Read', input: { file_path: '/test/brief.md' } }]) +
      anAssistantLine(-27, [{ type: 'tool_use', name: 'Bash', input: { command: `npm test --api-key ${TEST_KEY}` } }]) +
      anAssistantLine(-26, [{ type: 'tool_use', name: 'Edit', input: { file_path: '/test/a.ts', old_string: 'x', new_string: 'y' } }]),
  )

  await startAHolder(place)
  server = await startAServer(place, undefined, { PATH: `${bin}:${process.env['PATH'] ?? '/usr/bin:/bin'}` })
  personsKey = thePersonsKeyHeader(join(dirname(place.database), 'keys.json'))
  for (const handle of ['live-stopped', 'live-steps', 'live-flags']) await register(handle)
  await register('live-held', work)
  await aRun('live-stopped', {
    providerSession: stopped,
    workingDirectory: work,
    extra: { discovered: { tool: 'claude-code', externalId: stopped, pidCommand: 'claude --model test-model' } },
  })
  // A RUN WHOSE START HAD A KEY IN A FLAG IT LEAVES OUT, as a record written before round 10b holds it.
  await aRun('live-flags', {
    providerSession: randomUUID(),
    workingDirectory: work,
    extra: { discovered: { tool: 'claude-code', pidCommand: `claude --model test-model --settings ${TEST_KEY} --token=${TEST_KEY}` } },
  })
  await aRun('live-steps', {
    providerSession: sandboxed,
    workingDirectory: WORKING_DIRECTORY,
    startedAt: aLocalStamp(-60),
    sandbox: { template: 'test-template', container: 'test-row', folder: sandbox },
  })

  app = await liveApp({ name: 'live-parts', viewport: { width: 1440, height: 900 }, database: join(place.dir, 'page.db') })
  context = await app.browser.newContext({ viewport: { width: 1440, height: 900 } })
  const thePagesApiPort = String(app.apiPort)
  const theScratchPort = String(server.port)
  await context.route(
    (url) => url.hostname === '127.0.0.1' && url.port === thePagesApiPort,
    (route) => {
      const to = new URL(route.request().url())
      to.port = theScratchPort
      return route.continue({ url: to.toString() })
    },
  )
  page = await context.newPage()
}, 300_000)

afterAll(async () => {
  try {
    await context?.close()
    await app?.stop()
  } finally {
    await stopEverything()
  }
}, 120_000)

function thePage(): Page {
  if (page === null) throw new Error('No page.')
  return page
}

async function visit(agent: string, lang: 'en' | 'zh', mode: 'normal' | 'inspect' = 'normal'): Promise<void> {
  const on = thePage()
  await on.goto('about:blank')
  await on.goto(`${app?.site ?? ''}/?mode=${mode}&agent-live=${agent}${lang === 'zh' ? '&lang=zh' : ''}#/ui`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await waitForThePage(on, 60_000)
  await on.locator('.al-sheet').waitFor({ state: 'visible' })
}

/** The panel titled so, which must be there. */
function thePanel(title: string): Locator {
  return thePage().locator('section.px-panel').filter({ has: thePage().locator('.px-panel-head', { hasText: title }) })
}

/** Every line drawn in a panel's body, as the person reads it. */
async function theLines(panel: Locator): Promise<string[]> {
  return (await panel.locator('.px-panel-body').innerText()).split('\n').map((line) => line.trim()).filter((line) => line !== '')
}

describe("an agent's live parts, in the browser", () => {
  it('shows an office-held screen from the profile press without opening a tmux view', async () => {
    const opened = await ask(server.api, '/api/terminals/agents', { method: 'POST', headers: { ...AS_THE_PERSON, ...personsKey }, body: { agent: 'live-held' } })
    expect(opened.status, JSON.stringify(opened.body)).toBe(201)
    const held = opened.body['terminal'] as TerminalReading
    groups.add(held.pid)
    let panePresses = 0
    const on = thePage()
    const countPress = (request: import('playwright').Request): void => {
      if (request.method() === 'POST' && /\/terminals\/agents\/[^/]+\/pane$/.test(request.url())) panePresses++
    }
    await on.addInitScript(() => {
      if (location.protocol === 'http:') localStorage.setItem('mole-office.preset.theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    })
    on.on('request', countPress)
    try {
      for (const theme of ['light', 'dark'] as const) for (const width of [1440, 990, 660, 390]) {
        await on.setViewportSize({ width, height: 1000 })
        await on.emulateMedia({ colorScheme: theme })
        await on.goto('about:blank')
        await on.goto(`${app?.site ?? ''}/#/who/agent/live-held`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
        await waitForThePage(on, 60_000)
        const panel = thePanel(WORDS.en('agentLive.terminal.title'))
        await panel.getByRole('button', { name: WORDS.en('agentLive.terminal.show') }).click()
        await panel.locator('.xterm').waitFor({ state: 'visible' })
        await expect.poll(() => panel.locator('.xterm-screen').innerText()).toContain('STAND-IN claude ARGS')
        expect(await on.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        const shots = process.env.W13K_AGENT_PARTS_SHOTS
        if (shots !== undefined) {
          mkdirSync(shots, { recursive: true })
          await on.screenshot({ path: join(shots, `held-agent-${width}-${theme}-en.png`), fullPage: true })
        }
      }
      expect(panePresses).toBe(0)
      const listed = await ask(server.api, '/api/terminals')
      expect((listed.body['terminals'] as TerminalReading[]).filter(one => one.agent?.id === held.agent?.id).map(one => one.id)).toEqual([held.id])
    } finally { on.off('request', countPress) }
  }, 300_000)

  it('3. a run in a sandbox: its steps, a step written later, a message sent, and the way back with no press', async () => {
    for (const lang of ['en', 'zh'] as const) {
      const t = WORDS[lang]
      await visit('live-steps', lang)
      const on = thePage()
      const steps = thePanel(t('agentLive.steps.title'))
      await steps.locator('.al-steps li').first().waitFor({ state: 'visible' })
      expect(await thePanel(t('agentLive.terminal.title')).count()).toBe(0)
      const rows = await steps.locator('.al-steps li').evaluateAll((items) => items.map((item) => [...item.children].map((one) => (one as HTMLElement).innerText.trim()).slice(1)))
      expect(rows).toEqual([
        [t('agentLive.steps.said'), 'Reading the brief.'],
        [t('agentLive.steps.read'), '/test/brief.md'],
        [t('agentLive.steps.ran'), 'npm test --api-key <an API key, not shown>'],
        [t('agentLive.steps.wrote'), '/test/a.ts'],
      ])
      expect(await steps.innerText()).not.toContain('TEST-THINKING-NEVER-SHOWN')
      expect(await steps.innerText()).not.toContain('sk-test')
      // THE COMMAND IS THE SERVER'S (src/config/the-way-back.mjs), drawn whole.
      const command = String(((await ask(server.api, '/api/terminals/agents/live-steps/way-back')).body['way'] as { command: string }).command)
      expect(command).toContain(sandboxed)
      expect(await theLines(thePanel(t('agentLive.back.title')))).toEqual([t('agentLive.back.sandbox'), command, t('agentLive.back.copy')])
      expect(await on.getByRole('button', { name: t('agentLive.back.press') }).count()).toBe(0)
      expect(await on.locator('.al-dev').count()).toBe(0)
      }
    // A STEP WRITTEN LATER is added below the others, once.
    await visit('live-steps', 'en')
    const on = thePage()
    const steps = thePanel(WORDS.en('agentLive.steps.title'))
    await steps.locator('.al-steps li').first().waitFor({ state: 'visible' })
    appendFileSync(liveFile, anAssistantLine(0, [{ type: 'text', text: 'Written while the page watched.' }]))
    await until(() => steps.locator('.al-steps li').count(), (n) => n >= 5, 15_000)
    await on.waitForTimeout(5_000)
    expect(await steps.locator('.al-steps li').count()).toBe(5)
    expect(await steps.locator('.al-steps li').last().innerText()).toContain('Written while the page watched.')
    // A MESSAGE FROM THE BOX is a message to the agent.
    const body = `A test message, ${randomUUID()}`
    await steps.locator('textarea').fill(body)
    await steps.getByRole('button', { name: WORDS.en('agentLive.message.send') }).click()
    await steps.getByText(WORDS.en('agentLive.message.sent')).waitFor({ state: 'visible' })
    const db = new Database(place.database, { readonly: true, fileMustExist: true })
    try {
      const rows = db.prepare("SELECT data FROM records WHERE kind = 'message'").all() as { data: string }[]
      const sent = rows.map((row) => JSON.parse(row.data) as { body?: string; to?: { kind: string; id: string }[] }).filter((data) => data.body === body)
      expect(sent).toHaveLength(1)
      expect(sent[0]?.to?.[0]?.kind).toBe('agent')
    } finally {
      db.close()
    }
  }, 300_000)

  it('5. Developer mode draws how each part was found, which the person reads nowhere else', async () => {
    const t = WORDS.en
    await visit('live-stopped', 'en', 'inspect')
    await thePanel(t('agentLive.back.title')).locator('.al-dev').waitFor({ state: 'visible' })
    const terminal = await thePanel(t('agentLive.terminal.title')).locator('.al-dev').innerText()
    expect(terminal).toContain(t('agentLive.dev.how'))
    const back = await thePanel(t('agentLive.back.title')).locator('.al-dev').innerText()
    // ITS NEWEST RUN NAMES THE SAME CONVERSATION and keeps no flags.
    for (const word of [t('agentLive.dev.how'), t('agentLive.dev.folder'), t('agentLive.dev.conversation')]) expect(back).toContain(word)
    expect(back).toContain(stopped)
    await visit('live-steps', 'en', 'inspect')
    const steps = thePanel(t('agentLive.steps.title'))
    await steps.locator('.al-dev').waitFor({ state: 'visible' })
    const read = await steps.locator('.al-dev').innerText()
    expect(read).toContain(t('agentLive.dev.every'))
    expect(read).toContain(sandboxed)
    // A LEFT-OUT FLAG IS DRAWN BY ITS NAME, and a key in its value is not drawn.
    await visit('live-flags', 'en', 'inspect')
    const flags = thePanel(t('agentLive.back.title'))
    await flags.locator('.al-dev').waitFor({ state: 'visible' })
    const drawn = await flags.innerText()
    expect(drawn).toContain('--settings, --token')
    expect(drawn).toContain('--model test-model')
    expect(drawn).not.toContain('sk-test')
  }, 300_000)

})
