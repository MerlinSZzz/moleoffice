// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RIGHT-CLICK PANEL NAMES A CONTACT, AND THE MESSAGE GOES THE WAY A CHAT MESSAGE GOES.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES
 * ---------------------------------------------------------------------------------------
 *
 * Criterion W4 is from a message. Before there was a role and a registry, the panel could only
 * be asked to find a SESSION. The right-click panel is contact based now, like the chat. One small panel — the dialog
 * with the thing right-clicked already named as what the message is about, the chat's own contact chooser (people and
 * registered agents, never a session), and three presses: send, save without sending, organise. Shape B put Start
 * review where save without sending was, and Organise is behind More.
 *
 * THIS IS THE END-TO-END VERSION, in a real browser against a real server on this machine's own
 * ports and its own database: right-click a record, choose a contact, press Send — and then ASK THE
 * SERVER what it stored. The message is a message record, addressed to the contact, carrying the
 * thing that was right-clicked as what it is about. Deliveries are written for the recipient the
 * same way the chat's own send writes them, and the agent's inbox holds the message.
 *
 * START REVIEW FILES IT UNSENT: the record is written with the about and no delivery row for
 * anybody, and the record's review starts with it inside. The mutation that turns this red is dropping the `about` from the panel's send call;
 * the control run is green before it, and the restore is byte-identical (sha256 in the report).
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commandThatStopsWithItsOwner, apiServerArguments, anApiServerOfItsOwn, waitForItsOwnVite, waitForThePage } from './helpers.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const TOOLSHOT = resolve(root, 'tools')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const WORKSPACE = 'default'
const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}
const AGENT_ACTOR = (handle: string) => ({
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  'x-mole-office-workspace': WORKSPACE,
})

// ============================================================================ the servers

function portIsFree(port: number): Promise<boolean> {
  return new Promise((r) => {
    const probe = createServer()
    probe.on('error', () => r(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => r(true)))
  })
}

interface Service {
  label: string
  child: ChildProcess
  log: string[]
}
const started: Service[] = []

function start(label: string, command: string, args: string[], env: NodeJS.ProcessEnv): Service {
  const child = spawn(command, args, { cwd: root, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  const service: Service = { label, child, log: [] }
  const keep = (chunk: unknown) => {
    for (const line of String(chunk).split('\n')) if (line.trim() !== '') service.log.push(line)
    if (service.log.length > 100) service.log.splice(0, service.log.length - 100)
  }
  child.stdout?.on('data', keep)
  child.stderr?.on('data', keep)
  child.on('error', (err) => service.log.push(`could not start ${command}: ${err.message}`))
  started.push(service)
  return service
}

async function stopGroup(service: Service): Promise<void> {
  const { child } = service
  if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return
    throw err
  }
  const exited = await Promise.race([once(child, 'exit').then(() => true), sleep(5_000).then(() => false)])
  if (exited) return
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch {
    // Already gone between the two signals, which is the outcome that was wanted.
  }
  await Promise.race([once(child, 'exit'), sleep(5_000)])
}

/** What GET /api/messages/:id carries, in the parts this file asks about. */
interface MessageDetailReading {
  to: { kind: string; id: string }[]
  target: Record<string, unknown>
  deliveries?: { to: { kind: string; id: string }; mark: string }[]
}

interface DetailMessage {
  message: MessageDetailReading
}

/** The rows a detail read carries, whichever of the two doors answered it. */
function messageDeliveriesOf(detail: DetailMessage): { to: { kind: string; id: string }; mark: string }[] {
  return detail.message.deliveries ?? []
}

/** Every message in the pool, with what this file reads. */
async function everyMessage(): Promise<PoolEntryLike[]> {
  const reading = (await read('/api/messages?full=1')) as { messages: PoolEntryLike[] }
  return reading.messages
}

/** The fields of a pool row this file reads. */
interface PoolEntryLike {
  id: string
  body: string
  to?: { kind: string; id: string }[]
  notSentYet?: boolean
}

// ============================================================================ the harness

let dir: string
let apiPort: number
let webPort: number
let browser: Browser
let page: Page
let recordId: string
let agentHandle: string
/** The trawler's registry id. The office gives it an id of its own, which is not its handle. */
let agentId: string

async function api(path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST', headers = HUMAN): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method,
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${method} ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

async function read(path: string, headers = HUMAN): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, { headers })
  if (!res.ok) throw new Error(`GET ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

const REPORT_PROSE = 'The fan controller stalls the pump when the tray is out, and nobody has measured why.'

beforeAll(async () => {
  // OUTSIDE THE CHECKOUT: an office will not open a database inside a git worktree (problem nd7jOk5LCU4s).
  dir = mkdtempSync(join(tmpdir(), 'panel-contact.'))
  // Taken only from itself, and started again on other ports when its port was taken.
  // `anApiServerOfItsOwn` in tests/helpers.ts says why.
  const stack = await anApiServerOfItsOwn('the API server of tests/the-panel-names-a-contact-and-it-goes.test.ts', dir, (env) =>
    start('the API server', join(root, 'node_modules', '.bin', 'tsx'), apiServerArguments(), env),
  )
  apiPort = stack.apiPort
  webPort = stack.webPort
  const { env } = stack
  const watched = commandThatStopsWithItsOwner(join(root, 'node_modules', '.bin', 'vite'), ['--strictPort', '--host', '127.0.0.1'])
  const web = start('Vite', watched.command, watched.args, env)
  await waitForItsOwnVite(web, webPort, apiPort)

  // A registered agent, which is what a contact row offers: people and registered agents.
  const trawler = await api('/api/records', {
    kind: 'agent',
    title: 'Trawler',
    data: { handle: 'trawling', runtime: 'claude-code', state: 'active' },
  })
  agentHandle = 'trawling'
  void trawler
  const roster = (await read('/api/participants')) as { agents: { id: string; handle: string }[] }
  const registered = roster.agents.find((one) => one.handle === agentHandle)
  if (registered === undefined) throw new Error(`the registry holds no agent with the handle ${agentHandle}`)
  agentId = registered.id

  // A report, whose title is the thing that gets right-clicked.
  const report = await api('/api/records', {
    kind: 'report',
    title: 'What the pump did on Friday',
    summary: 'The pump stalls with the tray out.',
    data: { date: '2026-09-16', blocks: [{ id: 'b-prose', type: 'text', text: REPORT_PROSE }] },
  })
  recordId = ((report as { record: { id: string } }).record).id

  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
}, 240_000)

afterAll(async () => {
  await browser?.close()
  for (const service of started) await stopGroup(service)
  // The servers are stopped, so the folder goes now. After the port checks, a failed check would leave it behind.
  if (dir !== undefined) {
    rmSync(dir, { recursive: true, force: true })
  }
  for (const port of [apiPort, webPort]) {
    if (port !== undefined) {
      expect(await portIsFree(port), `port ${port} is still held after the test`).toBe(true)
    }
  }
}, 60_000)

async function open(where: string): Promise<void> {
  await page.goto(`http://127.0.0.1:${webPort}/#${where}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await sleep(400)
}

// ============================================================================ the doing

async function rightClickInside(selector: string): Promise<void> {
  await page.evaluate((which) => {
    const el = document.querySelector(which)
    if (el === null) throw new Error(`${which} is not on the page`)
    const at = el.getBoundingClientRect()
    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: Math.round(at.left + 20),
        clientY: Math.round(at.top + 8),
      }),
    )
  }, selector)
  await sleep(300)
}

/** Open the panel on the record, write words into the dialog, and name the contacts open. */
async function openThePanel(words: string): Promise<void> {
  await open(`/r/${recordId}`)
  await page.waitForSelector('article.rp h1', { timeout: 20_000 })
  await page.locator('article.rp h1').click({ button: 'right' })
  await page.waitForSelector('.px-talk', { timeout: 15_000 })
  await page.locator('.px-talk textarea').first().fill(words)
}

describe('the right-click panel is contact based, like the chat', () => {
  it("right-click a record, choose a contact, send: the message carries the contact and the about, and the contact's inbox has the message", async () => {
    await openThePanel('The pump stalls when the tray is out — is that still unmeasured?')

    // THE PRESSES, AND NOTHING MORE. Criterion W4: send, save without sending, organise. Criterion
    // change, 27 September 2026: a decision put Organise behind one More press. Shape B
    // replaced save without sending with Start review.
    // THE PRESSES ARE DRAWN ONCE THE BOX HAS READ WHICH REVIEWS COLLECT HERE. Until then their region is empty and
    // marked busy, because that answer decides the second press (src/web/components/agent/TalkBox.tsx).
    await page.locator('.px-talk-do:not([aria-busy])').waitFor({ timeout: 15_000 })
    const presses = await page.locator('.px-talk-do').getByRole('button').allTextContents()
    const named = presses.map((one) => one.replace(/\s+/g, ' ').trim())
    expect(named, 'the panel draws Send, Start review and More').toEqual([
      'Send',
      'Start review',
      'More ▾',
    ])
    // THE EARLIER PANEL'S SECOND PANEL IS NOT HERE: no chooser of where a review starts, no five
    // chips, no ranking. Start review starts this page's review and asks nothing.
    expect(await page.getByText('Start a review from here').count()).toBe(0)
    expect(await page.getByText('Review the whole project').count()).toBe(0)
    expect(await page.getByText('More ways to review').count()).toBe(0)
    expect(await page.getByText('Add to review').count()).toBe(0)

    await page.locator('.px-talk-to-btn').click()
    await page.waitForSelector('.px-talk-chooser', { timeout: 10_000 })
    // THE CHAT'S CONTACTS: the same rows the chat's contacts tab offers, with the agent among them.
    const row = page.locator('.px-talk-chooser [data-contact]').first()
    await row.waitFor({ timeout: 10_000 })
    const trawlerRow = page.locator('.px-talk-chooser li', { hasText: 'Trawler' })
    await trawlerRow.first().waitFor({ timeout: 10_000 })
    await trawlerRow.first().click()

    // THE CHOICE IS ON THE CONTROL, AND THE SEND GOES.
    await page.locator('.px-talk-to-btn').getByText('Trawler').waitFor({ timeout: 10_000 })
    // A PERSON'S SEND TO AN AGENT NOTHING HOLDS ANSWERS 409, with the letter stored and routed, so the box heads its note
    // with the routed line, which the 409 carries as its `error`, and the letter is in the pool all the same.
    const answered = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/records' && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    const reply = await answered
    expect(reply.status()).toBe(409)
    const said = (await reply.json()) as { error: string; record?: { id?: string } }
    expect(said.record?.id, 'the 409 still carries the stored letter').toBeTruthy()
    const heading = page.locator('.px-talk .px-error-mark strong')
    await heading.waitFor({ timeout: 15_000 })
    expect(await heading.textContent()).toBe(said.error)

    // WHAT THE SERVER STORED. A message record with the thing right-clicked as what it is about.
    const sentWord = 'The pump stalls when the tray is out — is that still unmeasured?'
    const found = (await everyMessage()).find((one) => one.body === sentWord)
    expect(found, 'the message the panel wrote is not in the pool').toBeDefined()
    const detail = (await read(`/api/messages/${found!.id}`)) as {
      message: MessageDetailReading
    }
    // WHO IT WENT TO: the contact the panel named.
    expect(detail.message.to).toEqual([{ kind: 'agent', id: agentId }])
    // THE ABOUT IS ONE LEVEL DOWN: a message's `target` is the context — where it was read, what
    // the pointer landed in — and `target.target` is the thing itself. Recording the record here is
    // criterion W4's own test: drop the `about` from the send and this line goes red.
    expect(detail.message.target).toEqual(
      expect.objectContaining({
        target: { kind: 'record', recordId, workspaceId: WORKSPACE },
      }),
    )
    // AND THE DELIVERY ROWS, WRITTEN THE WAY THE CHAT'S OWN SEND WRITES THEM.
    expect(
      messageDeliveriesOf(detail).find(
        (one) => one.to.kind === 'agent' && one.to.id === agentId,
      ),
      'the contact has no delivery row for the message',
    ).toBeDefined()

    // AND THE WAY IT REACHED THE CONTACT IS THE WAY THE CHAT'S OWN SEND REACHES ONE. The chat
    // writes a message record with `to` and the door writes the delivery rows (writeDeliveries is
    // the one function). So this sends a control message through the chat's own call and asks the
    // server for both: the two must be indistinguishable in who got them and in how far each got.
    // The chat's send answers the same 409 as the panel's, with the letter stored.
    const control = await fetch(`http://127.0.0.1:${apiPort}/api/records`, {
      method: 'POST',
      headers: HUMAN,
      body: JSON.stringify({ kind: 'message', title: sentWord, data: { body: sentWord, to: [{ kind: 'agent', id: agentId }] } }),
    })
    expect(control.status, await control.clone().text()).toBe(409)
    for (const one of await everyMessage()) {
      const detail = (await read(`/api/messages/${one.id}`)) as unknown as DetailMessage
      if (one.body !== sentWord) continue
      const rows = messageDeliveriesOf(detail)
      expect(rows.length).toBe(1)
      expect(rows[0]!.to).toEqual({ kind: 'agent', id: agentId })
      expect(rows[0]!.mark).toBe('queued')
    }

    // Close the panel as a person would before opening a fresh one in the next case.
    await page.locator('.px-talk .px-talk-close').click()
    await page.locator('.px-talk').waitFor({ state: 'detached' })
  })

  it('starts a review, and the message files unsent with the about on it, in that review', async () => {
    await openThePanel('The controller overruns while the tray is out.')
    // NO CONTACT NAMED — Start review asks nothing of anybody.
    await page.getByRole('button', { name: 'Start review', exact: true }).click()
    // NO REVIEW WAS COLLECTING ON THIS RECORD, so the press starts one, and the frame says the
    // comment is in it. The case above sent its message and started nothing.
    const said = page.locator('.px-talk-said [data-part="in-the-review"]')
    await said.waitFor({ timeout: 15_000 })
    expect(await said.textContent()).toBe('Your review of this page has started, with this comment in it. Nothing has been sent.')

    const held = (await everyMessage()).find(
      (one) => one.body === 'The controller overruns while the tray is out.',
    )
    expect(held, 'the unsaved message is not in the pool').toBeDefined()
    expect(held!.to, 'an unsent message names no reader at all').toEqual([])
    expect(held!.notSentYet, 'an unsent message is said to be waiting').toBe(true)
    // AND THE ABOUT, on the record that was filed.
    const record = (await read(`/api/records/${held!.id}`)) as {
      record: { data: { target?: Record<string, unknown> } }
    }
    expect(record.record.data.target).toEqual(
      expect.objectContaining({
        target: { kind: 'record', recordId, workspaceId: WORKSPACE },
      }),
    )
    // AND THE AGENT'S INBOX DOES NOT HOLD IT, because it was never sent.
    const inbox = (await read('/api/agent/inbox', AGENT_ACTOR(agentHandle))) as {
      entries?: { body?: string }[]
      waiting?: { body?: string }[]
    }
    const lines = (inbox.entries ?? inbox.waiting ?? []) as { body?: string }[]
    expect(lines.find((one) => one.body === 'The controller overruns while the tray is out.')).toBeUndefined()
  })
})
