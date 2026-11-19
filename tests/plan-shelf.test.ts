// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHELF AND THE PLAN PAGE, IN A REAL BROWSER.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THESE FOUR THINGS NEED A BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Each one is a fact about what happens after a press, and none of them can be seen by rendering a
 * component to a string:
 *
 *   1. WHERE THE NAMING BOX APPEARS. The owner's report was "pressing Write a new plan makes the
 *      creation UI appear in the top-right, disconnected from the action I just took". That is a
 *      measurement — the distance in pixels between the press and the box it reveals — so it is
 *      measured here, at 1440, rather than argued about.
 *   2. THAT MARKING A PLAN AS READ KEEPS WHAT YOU HAVE TYPED. The press used to re-fetch the page,
 *      which took the document off the screen and the writing state with it. Nothing failed and
 *      nothing warned; the characters were simply gone. This test types, presses, and then asks the
 *      very same textarea element whether it is still in the document.
 *   3. THAT A PLAN CAN BE ENDED FROM THE PRODUCT. The shelf offered "Show closed plans" for a state
 *      no press in the browser could reach.
 *   4. THAT DELETING SAYS WHAT SURVIVES, AND THAT IT SURVIVES. The sentence on screen and the record
 *      in the database are two different claims, and this checks both.
 *
 * ---------------------------------------------------------------------------------------
 * HOW IT RUNS
 * ---------------------------------------------------------------------------------------
 *
 * Its own API server, its own Vite, its own SQLite file in a temporary directory, all on ports the
 * operating system handed out. Nothing here touches the running development servers or the live
 * database. `liveApp` in tests/helpers.ts starts all three and `stop()` takes them down; it is the
 * one place any of that is written, and its header says how a server is stopped even when this
 * file's `afterAll` never runs.
 */

import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import { englishWords } from '../src/shared/words/joined.ts'

// ------------------------------------------------------------------- the servers and the page

let app: LiveApp
let apiPort: number
let webPort: number
let page: Page

/** Who the test claims to be. The same headers the browser app sends on every request. */
const AS_HUMAN = {
  'content-type': 'application/json',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
  'x-mole-office-workspace': 'default',
}

/**
 * An agent, for the one thing only an agent can do here.
 *
 * "What was written since you read this" deliberately leaves out what YOU wrote — `writtenSinceRead`
 * filters on `line.updatedBy !== reader` — so a test that writes as the same person it then reads as
 * gets an empty band and no way to press "Mark as read".
 */
const AS_AGENT = { ...AS_HUMAN, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'orbit' }

async function callApi<T>(
  path: string,
  init: { method?: string; body?: unknown; as?: Record<string, string> } = {},
): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, {
    method: init.method ?? 'GET',
    headers: init.as ?? AS_HUMAN,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} answered ${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

/** The status a bare request gets, so a test can check that a plan is really gone. */
async function statusOf(path: string): Promise<number> {
  const res = await fetch(`http://127.0.0.1:${apiPort}${path}`, { headers: AS_HUMAN })
  return res.status
}

interface NewPlanReply {
  plan: { id: string; title: string; state: string }
  lines: { id: string; text: string }[]
}

function newPlan(title: string, body?: string): Promise<NewPlanReply> {
  return callApi<NewPlanReply>('/api/plans', {
    method: 'POST',
    body: body === undefined ? { title } : { title, body },
  })
}

/** The plan as the server holds it right now, joined back into one document. */
async function storedBody(id: string): Promise<string> {
  const reply = await callApi<{ lines: { line: { text: string } }[] }>(`/api/plans/${id}/blocks`)
  return reply.lines.map((entry) => entry.line.text).join('\n')
}

beforeAll(async () => {
  app = await liveApp({ name: 'shelf', viewport: { width: 1440, height: 1000 } })
  apiPort = app.apiPort
  webPort = app.webPort
  page = app.page
  // THE SERVER REFUSES A WRITE UNDER AN AGENT ID NO REGISTRY ROW ANSWERS (16 September 2026,
  // problem tClP6DIMlOpz), so the agent this file writes as is registered before it writes. It holds
  // the supervisor card, because writing a plan is `plan.write` and the worker card does not hold it.
  const orbit = await fetch(`http://127.0.0.1:${String(apiPort)}/api/records`, {
    method: 'POST',
    headers: AS_HUMAN,
    body: JSON.stringify({
      kind: 'agent',
      title: 'Orbit',
      data: { handle: 'orbit', role: 'supervisor', runtime: 'claude-code', state: 'active' },
    }),
  })
  if (!orbit.ok) throw new Error(`the agent registration was refused: ${String(orbit.status)} ${await orbit.text()}`)
}, 240_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

/**
 * Open an address in the app, on a fresh document, and wait for the network to go quiet.
 *
 * THE BLANK PAGE FIRST IS NOT DECORATION. Two visits to the same address differ only in the hash, so
 * the browser makes it a same-document navigation and the app carries on with the state the previous
 * test left it in — a naming box still open, a confirmation still asked. Measured here: the second
 * test found two buttons where the page has one.
 */
async function open(hash: string): Promise<void> {
  await page.goto('about:blank')
  await page.goto(`http://127.0.0.1:${webPort}/#${hash}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
}

/** Where something is on the screen, in page pixels. */
async function boxOf(selector: string): Promise<{ x: number; y: number; width: number }> {
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) throw new Error(`${selector} is not on the screen, so it has no position`)
  return { x: box.x, y: box.y, width: box.width }
}

// ============================================================================ the empty shelf

/**
 * THIS RUNS FIRST BECAUSE THE DATABASE IS EMPTY FIRST, and the empty shelf is the screen a stranger
 * meets. The live corpus holds no plans either — they were deleted — so this
 * is not a hypothetical state.
 */
describe('a shelf with nothing on it', () => {
  it('shows three things and no fourth', async () => {
    await open('/plans')
    await page.waitForSelector('.pl-start button', { timeout: 30_000 })
    const lines = (await page.locator('#main').innerText())
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
    // The dash's sentence is read out and not drawn: it is a clipped `.px-sr` span, and innerText
    // still gives it a line of its own. Each such line is taken out once, so what is left is what
    // the page draws.
    const readOutOnly = (await page.locator('#main .px-sr').allInnerTexts()).map((line) => line.trim())
    expect(readOutOnly).toEqual([englishWords()['g8.shelf.noOpenPlan' as never]])
    const said = [...lines]
    for (const line of readOutOnly) {
      expect(said).toContain(line)
      said.splice(said.indexOf(line), 1)
    }
    expect(said.map(line => line.toLowerCase())).toEqual(['plans', 'write a new plan', '—'])
    // Nothing on this page can be typed into until something is pressed, and nothing on it asks
    // for hours — the absence is what tells this page apart from the schedule.
    for (const control of ['input', 'select', 'textarea']) {
      expect(await page.locator(`#main ${control}`).count(), control).toBe(0)
    }
  }, 120_000)
})

// ============================================================================ the naming box

describe('the press that starts a plan, and the box it reveals', () => {
  /**
   * THE OWNER'S COMPLAINT, WRITTEN AS A MEASUREMENT.
   *
   * Before this, the button and the naming box were both the second child of a header set to
   * `justify-content: space-between`, so at 1440 both landed against the right edge — about 1150px
   * from the "Plans" heading and above the whole grid they were about to add to. Two numbers say
   * that is fixed: the press starts where the page's own content starts, and the box appears where
   * the press was.
   */
  it('puts the press at the left edge of the page, and the box in the press’s own place', async () => {
    await newPlan('Something already on the shelf')
    await open('/plans')
    await page.waitForSelector('.pl-start button', { timeout: 30_000 })

    const heading = await boxOf('.pl-title')
    const press = await boxOf('.pl-start button')
    expect(
      Math.abs(press.x - heading.x),
      `the press is ${Math.round(press.x - heading.x)}px from the page heading's left edge`,
    ).toBeLessThanOrEqual(4)

    await page.locator('.pl-start button').click()
    await page.waitForSelector('.pl-new', { timeout: 10_000 })
    const box = await boxOf('.pl-new')

    expect(
      Math.abs(box.x - press.x),
      `the naming box is ${Math.round(box.x - press.x)}px sideways from the press that revealed it`,
    ).toBeLessThanOrEqual(4)
    expect(
      Math.abs(box.y - press.y),
      `the naming box is ${Math.round(box.y - press.y)}px below the press that revealed it`,
    ).toBeLessThanOrEqual(8)
  }, 120_000)

  it('starts the plan on Enter and lands on the new plan’s own page', async () => {
    await open('/plans')
    await page.locator('.pl-start button').click()
    await page.locator('.pl-new input').fill('Typed in the box under the press')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => window.location.hash.startsWith('#/plans/'), undefined, { timeout: 20_000 })
    await page.waitForSelector('.op-title', { timeout: 20_000 })
    expect(await page.locator('.op-title').inputValue()).toBe('Typed in the box under the press')
  }, 120_000)
})

// ============================================================================ marking it as read

describe('marking a plan as read', () => {
  /**
   * THE PRESS USED TO THROW THE WRITING AWAY, and this is the test that would have caught it.
   *
   * It asks the very same textarea element, taken before the press, whether it is still in the
   * document afterwards. A re-fetch takes the plan off the screen and React removes that element,
   * so the question has one answer under the old behaviour and the opposite under the new one, with
   * no dependence on how fast anything was.
   */
  it('keeps the page, the box and every character typed into it', async () => {
    const written = await newPlan('A plan an agent wrote in', '# Ports\n\n- check the Velodyne')
    const id = written.plan.id
    await callApi(`/api/plans/${id}/read`, { method: 'POST' })
    // An agent writes one more line AFTER the read, which is what the band above the document is
    // about. The lines that were already there keep their rows and their moments.
    await callApi(`/api/plans/${id}/body`, {
      method: 'PUT',
      body: { body: '# Ports\n\n- check the Velodyne\n- and the IMU' },
      as: AS_AGENT,
    })

    await open(`/plans/${id}`)
    await page.waitForSelector('.pw-box', { timeout: 30_000 })
    await page.waitForSelector('.op-since', { timeout: 30_000 })

    const boxBefore = await page.waitForSelector('.pw-box')
    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('\n- and the mount bracket')

    // COUNT WHAT THE PRESS ASKS FOR. Reading the plan again is the whole defect, so it is counted
    // rather than argued about: the fixed page asks for nothing, the broken one asks for the
    // document and gets an answer that may predate the save already on its way.
    let refetched = 0
    const watch = (req: { url(): string }) => {
      if (req.url().includes(`/api/plans/${id}/blocks`)) refetched += 1
    }
    page.on('request', watch)

    const marked = page.waitForResponse(
      (res) => res.url().includes(`/api/plans/${id}/read`) && res.request().method() === 'POST',
      { timeout: 20_000 },
    )
    await page.locator('button', { hasText: 'Mark as read' }).click()
    await marked
    // Leaving the box saves at once, so the page's own word is the event to wait on. It comes after
    // anything the press set off, which is what makes the three checks below stable.
    await page.waitForFunction(
      () => document.querySelector('.pw-say')?.textContent?.trim() === 'Stored.',
      undefined,
      { timeout: 20_000 },
    )
    page.off('request', watch)

    expect(refetched, 'the press read the plan again, which takes the document off the screen').toBe(0)
    expect(
      await boxBefore.evaluate((el) => el.isConnected),
      'the plan was taken off the screen, which is what loses the writing',
    ).toBe(true)
    expect(await page.locator('.pw-box').inputValue()).toContain('- and the mount bracket')
    expect(await page.locator('.op-since').count(), 'the band did not clear').toBe(0)

    // And what was typed reaches the database, rather than being overwritten by the older text a
    // re-fetch would have brought back.
    expect(await storedBody(id)).toContain('- and the mount bracket')
  }, 120_000)
})

// ============================================================================ the two views

describe('the two views of one plan', () => {
  /**
   * PRESS A SETTING OF THE VIEW CONTROL BY ITS WHOLE NAME.
   *
   * THIS USED TO BE A SUBSTRING MATCH AND IT WENT RED. `hasText` is a case-insensitive substring, so
   * "Table" matched both `Writing and table` and `Table`, and Playwright refused to guess which.
   *
   * THE TEST WAS WRONG AND THE LABELS ARE RIGHT, which is the opposite of what the failure suggests.
   * The middle setting puts the other two on screen together, and the only honest way to say that is
   * with both words in it. A unique-substring name would have to be "Both" or "Split" — one says
   * nothing about what, the other names the layout rather than what the reader gets. The test below
   * carries that claim: all four names differ as WHOLE names, which is what a person reads and what
   * a screen reader announces.
   */
  const view = (name: string) => page.getByRole('button', { name, exact: true })

  /**
   * SWITCHING VIEWS IS NOT LEAVING THE PAGE, and the characters in the box prove it.
   *
   * The writing lives above both views, so the Table is a different arrangement of the same store
   * rather than another page. If it ever moves inside one of them, a person who pressed Table to
   * check something loses whatever they had not saved, and nothing would say so.
   */
  it('keeps what is typed when you look at the table and come back', async () => {
    const written = await newPlan('Two ways of looking at it', '# Tray clamp\n\n- replace it')
    await open(`/plans/${written.plan.id}`)
    await page.waitForSelector('.pw-box', { timeout: 30_000 })

    await page.locator('.pw-box').click()
    await page.keyboard.press('Control+End')
    await page.keyboard.type('\n- and measure the force')

    await view('Table').click()
    await page.waitForSelector('.pw-box', { state: 'detached', timeout: 20_000 })
    await view('Writing').click()
    await page.waitForSelector('.pw-box', { timeout: 20_000 })

    expect(await page.locator('.pw-box').inputValue()).toContain('- and measure the force')
  }, 120_000)

  /**
   * EVERY SETTING OF THE VIEW CONTROL HAS ITS OWN WHOLE NAME, and there are exactly four of them.
   *
   * Two settings sharing a whole name would be a control a person could not tell apart, and it is
   * the reason the test above went red. This is the claim itself rather than a consequence of it, so
   * a fifth setting called "Table" fails here and names the problem.
   */
  it('gives each setting of the view control its own name', async () => {
    const written = await newPlan('One name each', '# Tray clamp\n\n- replace it')
    await open(`/plans/${written.plan.id}`)
    await page.waitForSelector('.op-views', { timeout: 30_000 })

    const names = await page.locator('.op-views .op-view').allTextContents()
    const whole = names.map((one) => one.replace(/\s+/g, ' ').trim())
    expect(whole).toEqual(['Writing', 'Writing and table', 'Table', 'Review'])
    expect(new Set(whole).size, 'two settings of one control answer to the same name').toBe(whole.length)
    /**
     * COUNTED INSIDE THE CONTROL, AND IT USED TO BE COUNTED OVER THE WHOLE PAGE.
     *
     * THE CLAIM IS UNCHANGED: no two settings of this control answer to the same name. What changed
     * is what the count reads. A page-wide count of presses named `Review` stopped being a
     * statement about this control on 20 August 2026, when the review strip landed and put a press
     * named `Review` at the top of every page in the application.
     *
     * THAT IS A REAL COLLISION AND IT IS NOT FIXED HERE. The interaction contract's §8.5 says
     * `Review` names one thing on screen — the collection — in the strip, the review pane's header,
     * the sidebar destination and the Settings panel, and nowhere else. This plan view is the
     * nowhere else: it means "ask an agent to look at this plan", which is what
     * `SURFACE_LABELS['plans.review']` already calls it. Renaming it is a change to the plan page,
     * which the step that landed the strip does not own, so it is written down here and reported
     * rather than resolved quietly.
     */
    for (const name of whole) {
      const exactly = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
      expect(
        await page.locator('.op-views .op-view').filter({ hasText: exactly }).count(),
        `"${name}" names one setting of the view control`,
      ).toBe(1)
    }
    // AND THE CONTROL IS STILL REACHED BY NAME, which is what `view` is for everywhere else here.
    expect(await view('Writing').count(), 'the view control is not reachable by name').toBe(1)
  }, 120_000)
})

// ============================================================================ ending a plan

describe('a plan that has ended', () => {
  it('can be marked finished, and the shelf then offers it under the closed plans', async () => {
    const written = await newPlan('Finished with this one', '# done\n\n- nothing left')
    const id = written.plan.id

    await open(`/plans/${id}`)
    await page.waitForSelector('.op-end', { timeout: 30_000 })
    // THE THREE WAYS A PLAN ENDS ARE BEHIND ONE PRESS. They used to stand at the foot of every
    // plan under the writing, all the time, one of them being a delete that cannot be undone.
    await page.locator('.op-end-open').click()
    await page.locator('button', { hasText: 'Mark it finished' }).click()
    await page.waitForSelector('.op-end button:text("Put it back in the list")', { timeout: 20_000 })

    const read = await callApi<{ plan: { state: string } }>(`/api/plans/${id}/blocks`)
    expect(read.plan.state).toBe('done')

    await open('/plans')
    await page.waitForSelector('.pl-closed', { timeout: 30_000 })
    // It has left the list of plans being written.
    expect(await page.locator('.pl-grid').first().innerText()).not.toContain('Finished with this one')
    await page.locator('button', { hasText: 'Show closed plans' }).click()
    await page.waitForSelector('.pl-closed .pl-grid', { timeout: 20_000 })
    expect(await page.locator('.pl-closed .pl-grid').innerText()).toContain('Finished with this one')
  }, 120_000)
})

// ============================================================================ deleting a plan

describe('deleting a plan', () => {
  /**
   * THE RECORDS SURVIVE, AND THE SCREEN SAYS SO BEFORE THE PRESS RATHER THAN AFTER IT.
   *
   * That is the thing a person is afraid of when they read the word delete on a plan whose lines
   * have become real work, so it is the first sentence in the question, and this test reads it off
   * the screen and then checks the database agrees.
   */
  it('says the work survives, asks first, and the work does survive', async () => {
    const written = await newPlan('Getting the arm to hand something over', '# Robotics\n\n- replace the gripper\n- calibrate it')
    const id = written.plan.id
    const lineId = written.lines.find((line) => line.text === '- replace the gripper')!.id
    const filed = await callApi<{ recordId: string }>(`/api/plans/${id}/lines/${lineId}/file-as-work`, {
      method: 'POST',
      body: { kind: 'task', workspaceId: 'default' },
    })

    await open(`/plans/${id}`)
    await page.waitForSelector('.op-end', { timeout: 30_000 })
    // The three ways a plan ends are behind one press. See the test above.
    await page.locator('.op-end-open').click()
    await page.locator('button', { hasText: 'Delete this plan' }).click()
    await page.waitForSelector('.tiered-question[open]', { timeout: 20_000 })

    const asked = await page.locator('.tiered-question[open]').textContent()
    expect(asked).toContain('Every record filed from a line in this plan stays exactly as it is')
    expect(asked).toContain('4 lines')
    expect(asked).toContain('There is no undo.')

    // AND IT FITS ON A PHONE. Every button in this app refuses to wrap its words, so a plan's name
    // inside the press is how this screen would come to scroll sideways at 390 — which nothing in
    // the product does. The name is in the sentence instead, and this is what says so.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.waitForSelector('.tiered-question[open]', { timeout: 10_000 })
    const wide = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      window: window.innerWidth,
    }))
    expect(wide.scroll, 'the delete question makes the page scroll sideways at 390').toBeLessThanOrEqual(
      wide.window,
    )
    await page.setViewportSize({ width: 1440, height: 1000 })

    await page.locator('.tiered-question[open] button', { hasText: 'Yes, delete' }).click()
    await page.waitForFunction(() => window.location.hash === '#/plans', undefined, { timeout: 20_000 })

    expect(await statusOf(`/api/plans/${id}/blocks`)).toBe(404)
    expect(await statusOf(`/api/records/${filed.recordId}`)).toBe(200)
  }, 120_000)
})
