// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S ACCEPTANCE CASE FOR AN UNSENT INSTRUCTION, PERFORMED IN A REAL BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * THE CASE, IN THE OWNER'S ORDER
 * ---------------------------------------------------------------------------------------
 *
 *   1. Select text in a report.
 *   2. Open the composer.
 *   3. Type: "Investigate this number. If it is wrong, create a Problem and fix it."
 *   4. Do NOT send it.
 *   5. Select only the words "create a Problem" inside your own draft.
 *   6. Invoke the context interaction on that selected phrase.
 *   7. Say: "Do not create it automatically. Investigate first and only propose a Problem if
 *      confirmed."
 *   8. Mole Office must understand this second act is about the pending instruction, NOT another comment
 *      on the report.
 *   9. The original report anchor must remain attached.
 *  10. No agent run may start before final dispatch.
 *  11. The changed interpretation must be visible.
 *  12. The recipient must not silently change.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS MEASURED HERE AND NOT ONLY IN tests/an-unsent-instruction.test.ts
 * ---------------------------------------------------------------------------------------
 *
 * Five phases in a row this campaign were built with green tests and a clean typecheck, and in
 * every one a first-time reader could not reach the thing that had been built. The tests never
 * caught it. So the functions are proved without a browser next door, and everything a PERSON has
 * to be able to do is proved here: right-clicking a phrase inside the composer's own box has to
 * open a panel rather than a second composer, and the composer behind it has to still be holding
 * the report.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE FAILURES THIS FILE IS AIMED AT
 * ---------------------------------------------------------------------------------------
 *
 * 1. The second act silently becoming another comment on the report. Everything would work; the
 *    agent would be told something about the wrong thing.
 * 2. The composer being replaced by a second composer, which drops the report anchor and the
 *    recipient without saying a word. That is the Russian doll the owner named by hand.
 * 3. Something reaching the server before the instruction is finally sent. `GET /api/agent/runs` is
 *    asked at every step for that reason.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { chromium, errors, type Browser, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commandThatStopsWithItsOwner, apiServerArguments, anApiServerOfItsOwn, waitForItsOwnVite, openRecordPagesAt, waitForThePage } from './helpers.ts'
import { theTimeLeftIn, type TheTimeLeft } from './how-long-a-test-may-take.ts'
import { shortenToWords } from '../src/shared/shortening.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'

const root = fileURLToPath(new URL('..', import.meta.url))
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const WORKSPACE = 'default'
const HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': WORKSPACE,
}

// ============================================================================ the servers
//
// Copied from tests/seven-surfaces.test.ts, which is the file that established this harness. The
// process rules are CLAUDE.md's: start as a process group, kill the group, and prove the port is
// free before the file is allowed to pass.

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.on('error', () => resolve(false))
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)))
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

// ============================================================================ the fixture

let dir: string
let apiPort: number
let webPort: number
let browser: Browser
let page: Page
let reportId: string

const REPORT_PROSE =
  'The gripper let go of the part on 37% of runs above fifteen newtons, and nobody has measured why.'

/** The instruction's words, exactly. */
const INSTRUCTION = 'Investigate this number. If it is wrong, create a Problem and fix it.'
const PHRASE = 'create a Problem'
const INSTEAD = 'Do not create it automatically. Investigate first and only propose a Problem if confirmed.'

async function api(path: string, body: unknown, method: 'POST' | 'PATCH' = 'POST'): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, { method, headers: HUMAN, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`${method} ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

async function read(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, { headers: HUMAN })
  if (!res.ok) throw new Error(`GET ${path} answered ${String(res.status)}: ${await res.text()}`)
  return (await res.json()) as Record<string, unknown>
}

/** Every run this machine holds, across every project. Nought is the answer until dispatch. */
async function runsStarted(): Promise<number> {
  const held = (await read('/api/agent/runs')) as { runs?: unknown[] }
  return held.runs?.length ?? 0
}

/** Every note anybody has written down. */
async function notesWritten(): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const held = (await read('/api/messages/comments')) as {
    comments: { id: string; data: Record<string, unknown> }[]
  }
  return held.comments
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'mole-office-instruction-'))
  // Taken only from itself, and started again on other ports when its port was taken.
  // `anApiServerOfItsOwn` in tests/helpers.ts says why.
  const stack = await anApiServerOfItsOwn('the API server of tests/changing-an-instruction-before-it-goes.test.ts', dir, (env) =>
    start('the API server', join(root, 'node_modules', '.bin', 'tsx'), apiServerArguments(), env),
  )
  apiPort = stack.apiPort
  webPort = stack.webPort
  const { env } = stack
  const watched = commandThatStopsWithItsOwner(join(root, 'node_modules', '.bin', 'vite'), ['--strictPort', '--host', '127.0.0.1'])
  const web = start('Vite', watched.command, watched.args, env)
  await waitForItsOwnVite(web, webPort, apiPort)

  const report = await api('/api/records', {
    kind: 'report',
    title: 'What the gripper did on Tuesday',
    summary: 'One run in three dropped the part.',
    data: { date: '2026-08-18', blocks: [{ id: 'b-prose', type: 'text', text: REPORT_PROSE }] },
  })
  reportId = (report['record'] as { id: string }).id

  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await openRecordPagesAt(page, 'full')
}, 240_000)

afterAll(async () => {
  await browser?.close()
  for (const service of started) await stopGroup(service)
  // The servers are stopped, so the folder goes now. After the port checks, a failed check would leave it behind.
  if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  for (const port of [apiPort, webPort]) {
    if (port !== undefined) {
      expect(await portIsFree(port), `port ${port} is still held after the test`).toBe(true)
    }
  }
}, 60_000)

// ============================================================================ doing what a person does

const COMPOSER = '.px-talk[aria-label="Talk about this"]'
const PANEL = '.px-talk[aria-label="Change this instruction"]'

/**
 * THE ELEMENT EVERY GESTURE IN THIS FILE LANDS ON, and the thing to wait for before touching it.
 *
 * WHY IT IS A CONSTANT AND WAITED FOR — PROBLEM `KmCyBzW88_qB`. Two `page.evaluate` calls query
 * this selector and throw "the report paragraph is not on the page" when it answers nothing. The
 * only wait before them was for `[data-target^="reportBlock/"]`, which is the block, plus a fixed
 * 400 ms sleep. The block is drawn before the text field inside it, so under load the sleep ran out
 * first and the evaluate threw. It went red about one run in three in the suites of 5 and 6
 * September 2026 and passed eight times out of eight when the file was run alone on an idle
 * machine, which is what a wait masked by a sleep looks like.
 */
const THE_PARAGRAPH = '[data-target^="reportBlock/"] [data-text-field]'

/**
 * THE CASE'S OWN BUDGET, and the one number every wait inside it takes what is left of.
 *
 * Problem `RzOvH_2PKnih`. This case went red in full suite runs on a loaded machine and passed alone,
 * with two errors: a thirty-second timeout reading the recipient control, and "the composer has no box
 * to type in". Both were read straight after waiting for the composer's frame, and neither said
 * whether the composer was still on the page. Every wait now takes the rest of this budget through
 * `theTimeLeftIn` (tests/how-long-a-test-may-take.ts), and `inTheComposer` below says which control
 * it waited for and whether the composer was there at all.
 */
const THE_CASES_BUDGET = 300_000

/**
 * WAIT FOR ONE CONTROL OF THE OPEN COMPOSER, AND SAY WHICH WAIT RAN OUT.
 *
 * The composer draws its frame, its box and its recipient control in one render, so a frame with no
 * box means the composer went away after it opened, or never opened. The error says which of the
 * two the page showed when the wait ran out, instead of leaving it to be guessed.
 */
async function inTheComposer(time: TheTimeLeft, what: string, selector: string): Promise<Locator> {
  const control = page.locator(`${COMPOSER} ${selector}`).first()
  const ms = time.forAWait(`${what} in the composer`)
  try {
    await control.waitFor({ state: 'visible', timeout: ms })
  } catch (err) {
    if (!(err instanceof errors.TimeoutError)) throw err
    const frames = await page.locator(COMPOSER).count()
    throw new Error(
      `Waited ${String(ms)} ms for ${what} in the composer, and it never came. ` +
        (frames === 0
          ? 'The composer was not on the page when the wait ran out.'
          : 'The composer was on the page, without it.'),
      { cause: err },
    )
  }
  return control
}

async function openTheReport(time: TheTimeLeft): Promise<void> {
  await page.goto(`http://127.0.0.1:${webPort}/#/r/${reportId}`, { timeout: time.forAWait('the report page to load') })
  await waitForThePage(page, time.forAWait('the ready mark on the report page'))
  await page.waitForSelector(THE_PARAGRAPH, { timeout: time.forAWait("the report's paragraph") })
  await sleep(400)
}

/** Select every word of the report's paragraph, exactly as a person dragging across it would. */
async function selectTheProse(time: TheTimeLeft): Promise<void> {
  await page.waitForSelector(THE_PARAGRAPH, { timeout: time.forAWait("the report's paragraph, to select it") })
  await page.evaluate(() => {
    const el = document.querySelector('[data-target^="reportBlock/"] [data-text-field]')
    if (el === null) throw new Error('the report paragraph is not on the page')
    const range = document.createRange()
    range.selectNodeContents(el)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
  await sleep(250)
}

/**
 * Open the composer on those words, the way the owner does: select them and right-click them.
 *
 * IT IS THE EVENT A RIGHT-CLICK FIRES, dispatched on the element a right-click would land on, for
 * the same reason `contextInteractionOnTheInstruction` below does it that way: the point of the
 * gesture is the phrase that is selected, and a real press can collapse a selection first.
 *
 * Selecting the words does not draw anything and is not supposed to. Selection is passive until
 * somebody invokes; this is the invoking.
 */
async function openTheComposerOnTheProse(time: TheTimeLeft): Promise<void> {
  await selectTheProse(time)
  // WAITED FOR AGAIN, and not because `selectTheProse` might not have waited. The page redraws
  // between the two, so the element this evaluate queries is a different node from the one that
  // was there a moment ago, and it has to be there NOW.
  await page.waitForSelector(THE_PARAGRAPH, { timeout: time.forAWait("the report's paragraph, to right-click it") })
  await page.evaluate(() => {
    const el = document.querySelector('[data-target^="reportBlock/"] [data-text-field]')
    if (el === null) throw new Error('the report paragraph is not on the page')
    const at = el.getBoundingClientRect()
    el.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: Math.round(at.left + 20),
        clientY: Math.round(at.top + 8),
      }),
    )
  })
  await page.waitForSelector(COMPOSER, { timeout: time.forAWait('the composer to open on the selected words') })
}

/**
 * Select a phrase inside the composer's own instruction, as a drag across it would.
 *
 * THE BOX IS WAITED FOR FIRST, in this composer and no other `.px-talk`. This used to read
 * `.px-talk textarea` at once, straight after the frame appeared, and threw "the composer has no box
 * to type in" without saying whether the composer was still open.
 */
async function selectInsideTheInstruction(time: TheTimeLeft, phrase: string): Promise<void> {
  const box = await inTheComposer(time, 'the box to type in', 'textarea')
  await box.evaluate((el, want) => {
    if (!(el instanceof HTMLTextAreaElement)) throw new Error('the box in the composer is not a text box')
    const at = el.value.indexOf(want)
    if (at === -1) throw new Error(`the instruction does not hold "${want}"`)
    el.focus()
    el.setSelectionRange(at, at + want.length)
  }, phrase)
  await sleep(250)
}

/**
 * The context interaction, on whatever is selected in the composer's box.
 *
 * IT IS THE EVENT A RIGHT-CLICK FIRES, dispatched on the element a right-click would land on. It is
 * done this way rather than with a real right-click because Chromium collapses a text selection
 * when a press lands outside it, and the point of this gesture is the phrase that is selected.
 */
async function contextInteractionOnTheInstruction(time: TheTimeLeft): Promise<void> {
  const inTheBox = await inTheComposer(time, 'the box to right-click', 'textarea')
  await inTheBox.evaluate((box) => {
    const at = box.getBoundingClientRect()
    box.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: Math.round(at.left + 40),
        clientY: Math.round(at.top + 12),
      }),
    )
  })
  await sleep(300)
}

// ============================================================================ the case

describe("the owner's acceptance case for an instruction nobody has sent", () => {
  it('is performed end to end, and nothing reaches an agent on the way', async ({ task }) => {
    const time = theTimeLeftIn(task)
    // ---------------------------------------------------------------- 1, 2. the report, the composer
    await openTheReport(time)
    await openTheComposerOnTheProse(time)

    // The composer is about the paragraph that was selected. This is the anchor condition 9 is
    // about, read before anything else happens so the comparison at the end means something.
    const anchorAtTheStart = await (await inTheComposer(time, 'the words it is about', '.px-talk-chip-what')).innerText()
    expect(anchorAtTheStart, 'the composer did not open on the words that were selected').toContain(
      'The gripper let go of the part',
    )

    // Who it is for, before the second act. Condition 12 is that this does not change by itself.
    const recipientAtTheStart = await (await inTheComposer(time, 'the recipient control', '.px-talk-to-btn')).innerText()

    // ---------------------------------------------------------------- 3, 4. type it, do not send it
    await page.locator(`${COMPOSER} textarea`).fill(INSTRUCTION)
    await sleep(200)

    // THE INSTRUCTION SAYS WHAT IT IS. This is the whole of the target model's claim: an unsent
    // instruction is addressable because the box it is in carries the same attribute a paragraph of
    // a report carries, and not because anything knows it is a composer.
    const declared = await page.locator(`${COMPOSER} [data-target^="draft/"]`).count()
    expect(declared, 'the composer does not say that the instruction in it is a thing you can point at').toBe(1)

    expect(await runsStarted(), 'an agent run started from typing an instruction').toBe(0)

    // ---------------------------------------------------------------- 5. select a phrase inside it
    await selectInsideTheInstruction(time, PHRASE)

    // ---------------------------------------------------------------- 6. the context interaction
    await contextInteractionOnTheInstruction(time)

    // 8. IT IS ABOUT THE PENDING INSTRUCTION. A panel for changing it, not a second comment box.
    await page.waitForSelector(PANEL, { timeout: time.forAWait('the panel that changes the instruction') })
    expect(await page.locator(PANEL).innerText()).toContain(PHRASE)

    // 9, AND THE RUSSIAN DOLL THE OWNER NAMED BY HAND. The composer is still there, still open, and
    // still about the paragraph of the report. Nothing was replaced.
    expect(await page.locator(COMPOSER).count(), 'the composer was replaced by a second one').toBe(1)
    expect(await page.locator(`${COMPOSER} .px-talk-chip-what`).first().innerText()).toBe(anchorAtTheStart)

    // IT IS LIGHTER THAN A COMPOSER, and that is measured rather than asserted in prose. No
    // recipient control, no send, and nothing inside it that can itself be pointed at — which is
    // why there is no third level to open.
    expect(await page.locator(`${PANEL} .px-talk-to`).count(), 'the panel asks who the message is for').toBe(0)
    expect(await page.locator(`${PANEL} button`, { hasText: 'Send' }).count()).toBe(0)
    expect(await page.locator(`${PANEL} [data-target]`).count(), 'the panel can itself be pointed at').toBe(0)

    // It says what it is not changing, which is the risk this panel carries.
    const panelWords = await page.locator(PANEL).innerText()
    expect(panelWords).toContain('Still about')
    expect(panelWords).toContain('Still for')

    expect(await runsStarted(), 'an agent run started from pointing at an unsent instruction').toBe(0)

    // ---------------------------------------------------------------- 7. say what it should mean
    await page.locator(`${PANEL} textarea`).fill(INSTEAD)
    await page.getByRole('button', { name: 'Change it', exact: true }).click()
    // WAITED FOR, NOT SLEPT FOR. This was a fixed 400 ms and then a count of the panel, which a slow
    // machine could lose. The panel closes and the change is drawn in one render.
    await page
      .locator(PANEL)
      .waitFor({ state: 'detached', timeout: time.forAWait('the panel to close after the change was made') })

    // 11. THE CHANGED INTERPRETATION IS VISIBLE, in the composer, beside the instruction it changes,
    // quoting the phrase it is about.
    expect(await page.locator(PANEL).count(), 'the panel stayed open after the change was made').toBe(0)
    const composerWords = await page.locator(COMPOSER).innerText()
    expect(composerWords).toContain('Changes to this instruction')
    expect(composerWords).toContain(PHRASE)
    expect(composerWords).toContain(INSTEAD)

    // The instruction itself is untouched. Mole Office does not fold a change into somebody's sentence.
    expect(await page.locator(`${COMPOSER} textarea`).inputValue()).toBe(INSTRUCTION)

    // 9 again, and 12: the anchor and the recipient are what they were before any of this.
    expect(await page.locator(`${COMPOSER} .px-talk-chip-what`).first().innerText()).toBe(anchorAtTheStart)
    expect(
      await page.locator(`${COMPOSER} .px-talk-to-btn`).innerText(),
      'the recipient changed while the instruction was being revised',
    ).toBe(recipientAtTheStart)

    // 10. NOTHING HAS REACHED THE SERVER AT ALL.
    expect(await runsStarted(), 'an agent run started before the instruction was ever sent').toBe(0)
    expect((await notesWritten()).length, 'something was written down before anybody pressed a press').toBe(0)

    // ---------------------------------------------------------------- it survives a reload
    //
    // docs/UX-CONTRACT.md: loose input that exists in memory but does not survive a reload is a
    // feature that is not done. A half-written comment used to survive navigating away and not a
    // reload, and nothing said which. It is stored now, which is the same piece of work as being
    // able to point at it.
    await page.reload({ timeout: time.forAWait('the report page to load again') })
    await waitForThePage(page, time.forAWait('the ready mark after the reload'))
    await page.waitForSelector('[data-target^="reportBlock/"]', { timeout: time.forAWait("the report's block after the reload") })
    await sleep(400)
    await openTheComposerOnTheProse(time)
    expect(await page.locator(`${COMPOSER} textarea`).inputValue(), 'the instruction did not survive a reload').toBe(
      INSTRUCTION,
    )
    const afterReload = await page.locator(COMPOSER).innerText()
    expect(afterReload, 'the change did not survive a reload').toContain(INSTEAD)
    expect(afterReload, 'the box did not say that the words had come back').toContain('is back')

    // ---------------------------------------------------------------- what is finally written down
    //
    // NOTHING IS SENT HERE EITHER, and that is on purpose: writing the note down is the act that
    // needs nobody's name, so it is the one that can be performed in a fixture with no agents in
    // it. What it proves is what condition 9 is really about — the words go to the server carrying
    // the report anchor, with the change beside them.
    // "Write it down and keep it" became "Save without sending": the old caption did not say
    // where it is kept or whether anybody would see it. Nit 37 of the language audit, 19 Aug 2026.
    // Shape B replaced that press with Start review, which writes the same note and then starts the
    // report's review. Nothing is sent either way, and the review is not what this file is about.
    await page.getByRole('button', { name: 'Start review', exact: true }).click()
    await page.waitForSelector('.px-talk-said', { timeout: time.forAWait('the line saying the note was saved') })

    const notes = await notesWritten()
    expect(notes.length, 'the note was not written down').toBe(1)
    const note = notes[0]!
    const body = String(note.data['body'])
    // A COMMENT IS A MESSAGE WITH A TARGET NOW (criterion M1), so the place it points at is under
    // `target`; a comment written before that keeps it under `context`.
    const context = (note.data['target'] ?? note.data['context']) as {
      target: Record<string, string>
      span?: { quote: string }
      place?: { at: string; span?: { quote: string }; cut?: true }
    }

    // 9. THE ORIGINAL REPORT ANCHOR IS ATTACHED TO WHAT WAS STORED.
    //
    // WHERE THE WORDS ARE WRITTEN DOWN CHANGED, AND WHAT IS DEMANDED HERE DID NOT. A context now
    // carries a `place` and the span is worked out from it; a context written before that carries a
    // bare `span`. Both are read, so this test is not pinned to the era the row was written in. The
    // assertion is the same one it always was: the note kept the exact prose it was written about.
    // WHAT THIS ASSERTED UNTIL WAVE 5 STEP 7, AND WHY IT CHANGED. It read `{kind: 'reportBlock',
    // recordId, blockId: 'b-prose'}`: a press anywhere in a report's prose was filed against the
    // whole block. That is the owner's own complaint — a comment about one paragraph filed against
    // more than the paragraph — and step 7 (`c41ea05`) is what fixes it. A paragraph of a report
    // carries a region target of its own now, the upward walk from the press reaches it first, and
    // the comment is about the paragraph. `c41ea05` moved this same assertion in
    // tests/seven-surfaces.test.ts and did not move it here, so this file was red from that commit
    // until the assertion caught up. Nothing about the behaviour changed to make it green.
    //
    // The block's `reportBlock` target is still on the block element, which is why the helpers
    // above still find the paragraph through `[data-target^="reportBlock/"] [data-text-field]`.
    expect(context.target['kind']).toBe('region')
    expect(context.target['recordId']).toBe(reportId)
    expect(String(context.target['regionId'] ?? '')).toMatch(/^data\.blocks\[#b-prose\]\.text@\d+$/)
    expect((context.place?.span ?? context.span)?.quote).toBe(shortenToWords(REPORT_PROSE).words)
    expect(context.place?.cut).toBe(true)

    // The instruction is first and exactly as typed, and the change is under it, quoting its phrase.
    expect(body.startsWith(INSTRUCTION), `the instruction was rewritten: ${body}`).toBe(true)
    expect(body).toContain(`"${PHRASE}"`)
    expect(body).toContain(INSTEAD)

    // 10, last. Writing a note down starts nothing.
    expect(await runsStarted(), 'an agent run started from writing a note down').toBe(0)
  }, THE_CASES_BUDGET)
})
