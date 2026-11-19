// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FORK IS SETTLED IN TWO PRESSES: CHOOSE, THEN CONFIRM. CRITERION P89.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS ASKED, AND WHAT CHANGED IN THIS FILE
 * ---------------------------------------------------------------------------------------
 *
 * Problem `fV-w1Boj9kjM`:
 *
 * A press on an option made the decision at once, again, where there have to be two steps.
 *
 * Two steps: press Decide it, then confirm. This was asked twice, the second time after settling
 * `_zwf321rD3Dx` with a press that was not meant to be final. Criterion P89, in
 * design/permissions/ACCEPTANCE.md.
 *
 * THIS FILE WAS `an-option-is-pressed-and-that-is-the-decision.test.ts` AND IT PROVED THE OLD RULE.
 * That rule was M57: the options A to D of a decision are to be pressed directly, and the pressed one
 * changes colour. Half of it still stands: the options are buttons and the pressed one changes
 * colour. What P89 took away is what the press WRITES. So one assertion was
 * turned around — the press on B used to be asserted to file a decision, and is now asserted to file
 * none — and three were added, for the confirm press, the words on it, and the way back from a
 * choice. Every other assertion here is the one it always was: the decision names the option and
 * carries the reason, the taken card keeps its colour through a reload, a press on a settled fork is
 * refused in the server's own words, the box for a reason sits above the options at 390 and beside
 * them at 1440, and an agent's actor is refused.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A BROWSER TEST
 * ---------------------------------------------------------------------------------------
 *
 * Every claim in P89 is about what a press does, and most of them are about what a press does to the
 * server. A rendered-markup test can see that a card is a `<button>`; it cannot see that the first
 * press wrote NOTHING, that the second wrote a decision naming the option pressed, that the colour
 * survives a reload, or that a press on a settled fork comes back refused. So this drives a real
 * browser against a real server and then asks the server what it holds.
 *
 * ---------------------------------------------------------------------------------------
 * IT SETTLES A PROPOSAL OF ITS OWN, IN A DATABASE OF ITS OWN
 * ---------------------------------------------------------------------------------------
 *
 * Settling is the one act Mole Office reserves to a person, and an agent driving a browser is still an
 * agent. `liveApp` gives this file an empty Mole Office in a temporary directory; the two proposals it
 * settles are two it filed itself, seconds earlier. Nothing here can reach anybody's real queue.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT EACH TEST WOULD CATCH
 * ---------------------------------------------------------------------------------------
 *
 *   1. Settle on the press of a card, the way it worked until 9 September 2026, and the first test
 *      fails: a decision exists before anybody confirmed.
 *   2. Say nothing on the confirm press about which option it will write, and the second fails.
 *   3. Take away the way back and the third fails: a choice cannot be changed before it is written.
 *   4. Drop the confirm press, or make the card a `<div>` again, and the fourth fails: nothing
 *      writes the decision.
 *   5. Send the wrong option — or send none — and the fifth fails: the decision the server holds
 *      does not name B.
 *   6. Draw the option a decision took in a neutral, as the stylesheet did until 6 September 2026,
 *      and the sixth fails: the card carries no colour of its own after a reload.
 *   7. Draw the settled cards as dead text, or let a second press through, and the seventh fails:
 *      pressing C either says nothing or files a second decision.
 *   8. Let the browser decide who may settle a proposal, rather than asking the server, and the last
 *      fails: an agent's press is not refused, or the refusal is not drawn.
 */
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
// THE PRODUCT'S OWN WORDS FOR ITS OWN PRESSES. Typing them out here would be a second copy that
// could disagree with the screen while everything passed. Criterion P89.
import { CHANGE_THE_CHOICE, confirmPressWords } from '../src/web/components/Governance.tsx'
import { optionCards } from '../src/shared/proposal.ts'
import { type LiveApp, liveApp, waitForThePage } from './helpers.ts'

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** The reason a person types into the box before pressing. Distinctive, so it can be found again. */
const BECAUSE = 'Pressed on the proposal page, in a browser, against an empty test database.'

/** The three options every proposal below records, so the letters A, B and C are the fork's own. */
const OPTIONS = [
  'a — Close on contact. It is simple and it crushes anything soft.',
  'b — Close on force. It needs the load cell calibrated first.',
  'c — Leave it as it is until the cell arrives.',
]

let app: LiveApp
let page: Page

/** File one proposal as an agent — which is who files them — and answer with its id. */
async function fileAProposal(which: string): Promise<string> {
  const res = await fetch(`${app.api}/api/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': 'claude-code',
    },
    body: JSON.stringify({
      kind: 'proposal',
      title: `Should the gripper close on contact or on force? (${which})`,
      data: {
        question: 'Should the gripper close on contact, or on measured force?',
        options: OPTIONS,
        recommendation: 'Take (b). The load cell is already on the bench.',
        because: 'Two demonstrations have crushed a cup each.',
        who_settles_it: 'the owner',
      },
    }),
  })
  if (!res.ok) throw new Error(`filing a proposal answered ${String(res.status)}: ${await res.text()}`)
  const filed = (await res.json()) as { record: { id: string } }
  return filed.record.id
}

/**
 * Open a proposal's own page, from nothing.
 *
 * IT LOADS THE ADDRESS AND THEN RELOADS IT. Going to an address that differs from the current one
 * only after the `#` is a move within the same document, so the browser does not draw the page
 * again and whatever the last test left open is still open. The reload is what makes each test
 * below start from a page nobody has touched.
 */
async function openProposal(id: string): Promise<void> {
  await page.goto(`${app.site}/#/r/${id}`, { timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.reload({ timeout: 60_000 })
  await waitForThePage(page, 60_000)
  await page.waitForSelector('.px-gov-opt', { timeout: 30_000 })
}

/** Every decision the server holds, newest first is not promised — this reads them all. */
async function decisionsHeld(): Promise<{ id: string; title: string; data: Record<string, unknown> }[]> {
  const res = await fetch(`${app.api}/api/records?kind=decision&shape=full`)
  if (!res.ok) throw new Error(`GET /api/records?kind=decision answered ${String(res.status)}`)
  const listed = (await res.json()) as { records: { id: string; title: string; data: Record<string, unknown> }[] }
  return listed.records
}

/**
 * WHICH CARDS ARE PRESSABLE, AND WHAT COLOUR EACH ONE IS DRAWN IN.
 *
 * The colour is read off the element the browser really drew, not off the stylesheet, because
 * "changes colour" is a claim about what a person sees. The comparison is between the cards on one
 * screen: the one that was taken must not be drawn the same as the ones that were not.
 */
async function cardsOnScreen(): Promise<
  { letter: string; pressable: boolean; taken: boolean; border: string; background: string }[]
> {
  return page.evaluate(() =>
    [...document.querySelectorAll('li.px-gov-opt')].map((card) => {
      const inner = card.querySelector('.px-gov-opt-inner')
      const style = window.getComputedStyle(card)
      return {
        letter: (card.querySelector('.px-gov-letter')?.textContent ?? '').trim(),
        pressable: inner instanceof HTMLButtonElement && !inner.disabled,
        taken: card.getAttribute('data-taken') === '1',
        border: style.borderTopColor,
        background: inner === null ? '' : window.getComputedStyle(inner).backgroundColor,
      }
    }),
  )
}

/** The card whose letter this is. Throws rather than answering about the wrong card. */
function theCard<T extends { letter: string }>(cards: readonly T[], letter: string): T {
  const found = cards.find((card) => card.letter === letter)
  if (found === undefined) throw new Error(`no option card is lettered ${letter}: ${JSON.stringify(cards)}`)
  return found
}

/** Press the option with this letter, on the page as it stands. */
async function pressOption(letter: string): Promise<void> {
  await page
    .locator('li.px-gov-opt', { has: page.locator('.px-gov-letter', { hasText: letter }) })
    .locator('button.px-gov-opt-inner')
    .first()
    .click()
}

/**
 * THE CONFIRM PRESS, FOUND BY THE WORDS IT SAYS RATHER THAN BY A CLASS. Criterion P89.
 *
 * The criterion is that the press NAMES the option it will write, so a test that found it by a class
 * name would pass on a button reading "Confirm" — which is the thing P89 refuses. The words come
 * from `confirmPressWords` in src/web/components/Governance.tsx and it is imported here rather than
 * typed out, so the product and the test cannot come to disagree about them.
 */
function confirmPress() {
  return page.locator('.px-gov-acts button.px-btn', { hasText: 'Decide ' })
}

/** The press that puts the choice back. Its words are the product's own, for the same reason. */
function changeThePress() {
  return page.locator('.px-gov-acts button.px-btn', { hasText: CHANGE_THE_CHOICE })
}

/** Which cards are marked as the reader's choice right now, by letter. */
async function markedChoice(): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('li.px-gov-opt[data-chosen="1"]')].map((card) =>
      (card.querySelector('.px-gov-letter')?.textContent ?? '').trim(),
    ),
  )
}

beforeAll(async () => {
  app = await liveApp({ name: 'option-press', viewport: { width: 1440, height: 1000 } })
  page = app.page
}, 300_000)

afterAll(async () => {
  await app?.stop()
}, 60_000)

// ============================================================ the press, and what the server holds

describe('a person presses option B, and the fork is not settled until they confirm', () => {
  let proposalId = ''

  it('writes nothing on the press of a card, and marks the card as the choice', async () => {
    proposalId = await fileAProposal('the press')
    await openProposal(proposalId)

    // THE CONTROL: nothing has been decided yet, and the server holds no decision at all.
    expect(await decisionsHeld(), 'the database was not empty before the press').toEqual([])

    // The options open behind "Decide it" on a record page, exactly as they always have.
    await page.locator('button', { hasText: 'Decide it' }).first().click()
    await page.waitForSelector('button.px-gov-opt-inner', { timeout: 15_000 })

    const before = await cardsOnScreen()
    expect(before.map((card) => card.letter), 'the fork’s own letters are not on the cards').toEqual([
      'A',
      'B',
      'C',
      '—',
    ])
    expect(theCard(before, 'B').pressable, 'option B is not a button a person can press').toBe(true)
    expect(await markedChoice(), 'a card was marked as the choice before anybody pressed one').toEqual([])

    await page.locator('textarea').first().fill(BECAUSE)
    await pressOption('B')

    // THE CARD IS MARKED AND NOTHING IS WRITTEN. Criterion P89. This
    // is the assertion this file used to make the other way round, and it is the whole change.
    await confirmPress().waitFor({ state: 'visible', timeout: 15_000 })
    expect(await markedChoice(), 'the press did not mark B as the reader’s choice').toEqual(['B'])

    // WAITED OUT RATHER THAN ASKED ONCE. A write that had been sent would land within a second or
    // two, so a single read straight after the press would pass on a build that still settles on the
    // card. Ten reads over five seconds is the same wait the confirm press below is given.
    for (let tries = 0; tries < 10; tries += 1) {
      await sleep(500)
      expect(await decisionsHeld(), 'the press on a card settled the fork with no confirm press').toEqual([])
    }
  }, 180_000)

  it('says on the confirm press which option it will write', async () => {
    // THE PRESS NAMES THE OPTION. A button reading "Confirm" is what P89 refuses: not seeing which
    // option was about to be written is how the owner settled a fork they had not meant to.
    const cards = optionCards(OPTIONS)
    const b = cards[1]
    if (b === undefined) throw new Error('the fork under test records no option B')
    const said = (await confirmPress().first().innerText()).trim()
    expect(said, 'the confirm press does not name the option it will write').toBe(confirmPressWords(b))
    expect(said, 'the confirm press does not name the option’s letter').toContain('B')
    expect(said.toLowerCase(), 'the confirm press does not carry the option’s own words').toContain('close on force')
  }, 60_000)

  it('puts the choice back when the reader presses to change it, and still writes nothing', async () => {
    await changeThePress().first().click()
    await confirmPress().first().waitFor({ state: 'detached', timeout: 15_000 })
    expect(await markedChoice(), 'the choice was not put back').toEqual([])
    expect(await decisionsHeld(), 'changing the choice wrote a decision').toEqual([])

    // AND ANOTHER CARD CAN BE MARKED, which is the point of the way back. B again, because the rest
    // of this file reads the decision B makes.
    await pressOption('B')
    await confirmPress().waitFor({ state: 'visible', timeout: 15_000 })
    expect(await markedChoice()).toEqual(['B'])
  }, 120_000)

  it('files the decision on the confirm press', async () => {
    await confirmPress().first().click()

    // WHAT THE SERVER HOLDS, ASKED OF THE SERVER. A press that looks like it worked and wrote
    // nothing is the failure this product exists to prevent.
    let filed: { id: string; title: string; data: Record<string, unknown> }[] = []
    for (let tries = 0; tries < 40; tries += 1) {
      await sleep(500)
      filed = await decisionsHeld()
      if (filed.length > 0) break
    }
    expect(filed.length, 'the confirm press wrote no decision the server can see').toBe(1)
  }, 180_000)

  it('says in the decision which option was pressed, in the field the kind has for it', async () => {
    // THE FIELDS ARE THE KIND'S OWN. `option_taken` holds the words of what was taken and
    // `option_index` its position, both declared in src/shared/kinds.ts and served by
    // GET /api/kinds/decision. The promote route carries them in `data` like any other field of a
    // decision, so nothing had to be added to it for M57.
    const filed = await decisionsHeld()
    expect(filed.length).toBe(1)
    const decision = filed[0] as { id: string; title: string; data: Record<string, unknown> }
    expect(decision.data['option_index'], 'the decision does not say which option was pressed').toBe(1)
    expect(decision.data['option_taken'], 'the decision does not carry the words of the option taken').toBe(
      'Close on force. It needs the load cell calibrated first.',
    )
    expect(decision.data['alternatives_rejected'], 'the options nobody took are not recorded').toEqual(['A', 'C'])
    expect(decision.data['because'], 'the reason the person typed is not in the decision').toBe(BECAUSE)

    // AND THE DECISION SETTLES THIS PROPOSAL, rather than sitting beside it.
    const res = await fetch(`${app.api}/api/records/${proposalId}`)
    const held = (await res.json()) as { resolution?: { resolved: boolean; by: { id: string }[] } }
    expect(held.resolution?.resolved, 'the proposal is not settled by the decision the press filed').toBe(true)
    expect(held.resolution?.by.map((one) => one.id)).toContain(decision.id)
  }, 60_000)

  it('draws the option that was taken in a colour of its own, and keeps it after a reload', async () => {
    // A RELOAD, so this is the colour the page draws from what the server stored and not a colour
    // left over in the browser's memory from the press.
    await openProposal(proposalId)
    const cards = await cardsOnScreen()

    const b = theCard(cards, 'B')
    expect(b.taken, 'the option that was taken is not marked on the page').toBe(true)
    // THE WORD IS THERE TOO, so the mark is not held by colour alone.
    expect(await page.locator('.px-gov-taken').innerText()).toContain('taken')

    // AND IT IS A DIFFERENT COLOUR FROM THE CARDS NOBODY TOOK. Read off what the browser drew.
    const a = theCard(cards, 'A')
    const c = theCard(cards, 'C')
    expect(a.border, 'the control: the two untaken cards are drawn alike').toBe(c.border)
    expect(b.border, 'the option that was taken is drawn in the same edge as the ones nobody took').not.toBe(a.border)
    expect(
      b.background,
      'the option that was taken has the same ground as the ones nobody took, so nothing changed colour',
    ).not.toBe(a.background)
  }, 120_000)

  it('refuses a press on another option, because this proposal is already settled', async () => {
    // The cards are still buttons, which is why a person gets an answer at all. See the header of
    // `SettledPanel` in src/web/components/Governance.tsx.
    const cards = await cardsOnScreen()
    expect(theCard(cards, 'C').pressable, 'a settled proposal drew its options as dead text').toBe(true)

    await pressOption('C')
    await page.waitForSelector('.px-error', { timeout: 30_000 })

    // HEADED "Error", WITH ONE SHORT REASON UNDER IT. Criterion M43.
    expect((await page.locator('.px-error strong').first().innerText()).trim()).toBe('Error')
    const shown = (await page.locator('.px-error .px-error-msg').first().innerText()).trim()
    const firstLine = shown.split('\n')[0] ?? ''
    expect(firstLine, 'the refusal does not say the proposal is already settled').toContain('already settled')
    expect(firstLine.length, 'the short reason is not short').toBeLessThan(90)

    // AND NOTHING WAS WRITTEN. One decision, still, and it is still the one that took B.
    const filed = await decisionsHeld()
    expect(filed.length, 'the second press filed a second decision').toBe(1)
    expect((filed[0] as { data: Record<string, unknown> }).data['option_index']).toBe(1)
  }, 120_000)
})

// ================================================ where the box for a reason sits, at each width

/**
 * ON A PHONE THE CONFIRM PRESS IS UNDER THE OPTIONS, AND AT A DESK THE BOX IS BESIDE THEM.
 *
 * ---------------------------------------------------------------------------------------
 * THIS BLOCK ASSERTED THE OPPOSITE AT 390 UNTIL 9 SEPTEMBER 2026, AND HERE IS WHY IT TURNED
 * ---------------------------------------------------------------------------------------
 *
 * While a press on an option WAS the decision, the box asking why had to be above the cards on a
 * phone: somebody who scrolled to the cards and pressed one had decided without ever seeing it.
 * That was task mG6MpUiqOTE1, and the answer was order rather than a sentence, because
 * UX-CONTRACT 8.10 forbids answering an interface question with a sentence.
 *
 * P89 took the premise away: a press on a card writes nothing, and the decision is written by a
 * confirm press that lives in the same form as the box. With the form above the cards at 390, that
 * confirm press — the one naming what is about to be written — was off the top of the screen at the
 * moment the reader pressed a card. Measured in the handback pictures for ui-fix-1. So the stack
 * goes back to the markup's order, and what is asserted at 390 is what now matters: the confirm
 * press is BELOW the options, where a reader who has just pressed one is looking.
 *
 * The desk arrangement is untouched and is asserted here unchanged. Both widths are measured from
 * the boxes the browser really laid out, because "under the options" and "beside the options" are
 * claims about position.
 */
describe('the confirm press is under the options on a phone, and the box is beside them at a desk', () => {
  /** Where the reason box, the options and the confirm press were laid out, in page coordinates. */
  async function whereTheyAre(): Promise<{
    box: { x: number; y: number; bottom: number }
    options: { x: number; y: number; right: number; bottom: number }
    confirm: { x: number; y: number; bottom: number } | null
  }> {
    return page.evaluate(() => {
      const box = (el: Element) => {
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }
      }
      const at = (selector: string) => {
        const el = document.querySelector(selector)
        if (el === null) throw new Error(`nothing on the page matches ${selector}`)
        return box(el)
      }
      const press = [...document.querySelectorAll('.px-gov-acts button.px-btn')].find((one) =>
        (one.textContent ?? '').startsWith('Decide '),
      )
      return {
        box: at('.px-gov-act textarea'),
        options: at('.px-gov-choices .px-gov-opts'),
        confirm: press === undefined ? null : box(press),
      }
    })
  }

  /** Open a fork's own page at this width, with the options showing. */
  async function decideAt(id: string, width: number): Promise<void> {
    await page.setViewportSize({ width, height: 900 })
    await openProposal(id)
    await page.locator('button', { hasText: 'Decide it' }).first().click()
    await page.waitForSelector('button.px-gov-opt-inner', { timeout: 15_000 })
    await page.waitForSelector('.px-gov-act textarea', { timeout: 15_000 })
  }

  let proposalId = ''

  afterAll(async () => {
    // EVERY OTHER FILE IN THIS RUN GETS THE WIDTH IT STARTED WITH. This one is the only test that
    // moves the window, and a width left behind is a failure in a file that never touched it.
    await page.setViewportSize({ width: 1440, height: 1000 })
  })

  it('draws the confirm press under the options on a phone, at 390', async () => {
    proposalId = await fileAProposal('the order on a phone')
    await decideAt(proposalId, 390)
    // THE CHOICE IS MADE FIRST, because the confirm press does not exist until one is. That is the
    // moment the arrangement has to be right for: the reader has just pressed a card.
    await pressOption('B')
    await confirmPress().waitFor({ state: 'visible', timeout: 15_000 })
    const { box, options, confirm } = await whereTheyAre()
    expect(confirm, 'the confirm press is not on the page at 390').not.toBeNull()
    const press = confirm as { x: number; y: number; bottom: number }
    expect(
      press.y,
      `the confirm press starts at ${String(Math.round(press.y))} and the options end at ${String(Math.round(options.bottom))}`,
    ).toBeGreaterThanOrEqual(options.bottom - 1)
    // AND THEY ARE STACKED, which is what makes "under" the right word for it. Two columns with the
    // press in the right one would satisfy the line above and be a different arrangement.
    expect(Math.abs(box.x - options.x), 'the two are in different columns at 390').toBeLessThan(40)
  }, 180_000)

  it('keeps the desk arrangement at 1440: the box beside the options, not above them', async () => {
    await decideAt(proposalId, 1440)
    const { box, options } = await whereTheyAre()
    expect(box.x, 'the box for a reason is no longer to the right of the options').toBeGreaterThan(options.right)
    // BESIDE MEANS THE TOPS ARE LEVEL, give or take the form's own heading. The point of the
    // arrangement is that a reader sees both without scrolling, which a box starting below the
    // last card would not give them.
    expect(
      box.y,
      `the box starts at ${String(Math.round(box.y))} and the options at ${String(Math.round(options.y))}`,
    ).toBeLessThan(options.y + 200)
  }, 180_000)
})

// ============================================================ and an agent's actor is still refused

describe('an agent pressing an option is refused, and the page draws the refusal', () => {
  it('gets the 403 the promote route has always given, and writes nothing', async () => {
    const proposalId = await fileAProposal('the refusal')

    // WHO THIS BROWSER WRITES AS, set the way the actor picker in the sidebar sets it. Nothing here
    // fakes a reply: the press goes to the same route and the server answers it.
    await page.goto(`${app.site}/#/`, { timeout: 60_000 })
    await page.evaluate(() => {
      window.localStorage.setItem('mole-office.actor', JSON.stringify({ type: 'agent', id: 'claude-code' }))
    })
    try {
      await openProposal(proposalId)
      await page.locator('button', { hasText: 'Decide it' }).first().click()
      await page.waitForSelector('button.px-gov-opt-inner', { timeout: 15_000 })
      // BOTH PRESSES, because both presses are what settling a fork is now. Criterion P89.
      await pressOption('B')
      await confirmPress().waitFor({ state: 'visible', timeout: 15_000 })
      await confirmPress().first().click()
      await page.waitForSelector('.px-error', { timeout: 30_000 })

      expect((await page.locator('.px-error strong').first().innerText()).trim()).toBe('Error')

      // AND THE PROPOSAL IS UNTOUCHED. The refusal is the guard working, not a message about it.
      const res = await fetch(`${app.api}/api/records/${proposalId}`)
      const held = (await res.json()) as { resolution?: { resolved: boolean } }
      expect(held.resolution?.resolved, 'an agent’s press settled a proposal').toBe(false)
    } finally {
      // Put the browser back to the person, so a later file in this run is not left writing as an
      // agent through a shared profile.
      await page.evaluate(() => {
        window.localStorage.removeItem('mole-office.actor')
      })
    }
  }, 180_000)
})
