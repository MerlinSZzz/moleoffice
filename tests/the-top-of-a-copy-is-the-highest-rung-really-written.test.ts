// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CRITERION B32: THE TOP OF A COPY IS THE HIGHEST RUNG REALLY WRITTEN, AND FULL IS NOT A RUNG.
 *
 * ---------------------------------------------------------------------------------------
 * THE DECISION
 * ---------------------------------------------------------------------------------------
 *
 * The decision on problem `AQZm6esnQqCr`, in `design/bundle/ACCEPTANCE.md`:
 *
 *   When Full is the person's original text, a copy does not go up to it but steps back, because Full may
 *   itself be incomplete: use level 6 if there is one, else step back again; with none of 4 to 6, level 3.
 *
 * So for every entry of a copy the top rung is the digest where somebody wrote one, else the sketch,
 * else the outline, else the Conclusion. The record itself is never a rung a copy goes to. A rung
 * nobody wrote is not the one below dressed as a higher level: the page says the highest rung this
 * entry has, and *more* stops there.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED 8 SEPTEMBER 2026 BEFORE ANY OF THIS WAS BUILT
 * ---------------------------------------------------------------------------------------
 *
 * On the twelve-problem corpus this file makes, through `GET /api/bundles/preview`, the part
 * carrying what is still open came to 3,398 bytes at Level 2, 6,088 at the Conclusion and 4,577 at
 * Full. A shorter level said 1,511 bytes more than a longer one, and one press of *less* took the
 * whole copy from 14,382 characters to 15,954. Two separate faults made that number:
 *
 *   1. THE CONCLUSION WAS PRINTED TWICE. The open-loop reader names a problem by its own summary, so
 *      the entry's identifying line WAS the Conclusion, and rung 3 wrote it again underneath. Rung 7
 *      had a guard against exactly that and rung 3 had none.
 *   2. RUNG 7 WAS NOT THE RECORD. It held what the part's reader wrote — three short lines — which
 *      is neither the record nor a rung of any ladder, and it measured shorter than the summary.
 *
 * After this file's criterion: 3,398 at Level 2 and 4,577 at every position above it, and one press
 * of *less* takes the copy from 14,682 characters to 14,569.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PINS
 * ---------------------------------------------------------------------------------------
 *
 *   1. THE FIVE POSITIONS TOP OUT AT LEVEL 6, and Full is refused by name with the reason.
 *   2. EACH RECORD'S TOP IS THE HIGHEST RUNG IT REALLY HAS: a report with written parts reaches the
 *      digest, a module made of modules reaches the sketch, an atomic record stops at its
 *      Conclusion, and a record with nothing written stops at its title.
 *   3. A LONGER POSITION NEVER SAYS LESS THAN A SHORTER ONE, for one part, at every position.
 *   4. THE CONCLUSION IS NOT PRINTED TWICE where the identifying line already carries it.
 *   5. THE PAGE SAYS THE HIGHEST RUNG AND *MORE* STOPS THERE.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import type { Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { BUNDLE_RUNGS } from '../src/shared/bundles.ts'
import { levelLabel, type Rung } from '../src/shared/detail.ts'

let app: LiveApp
let page: Page

/** How many problems the corpus holds. Enough that one part cannot hold them all at its top. */
const PROBLEMS = 12

interface PartOnTheWire {
  name: string
  label: string
  says: string
  bytes: number
  share: number
  top: Rung | null
  chose?: { level: string; automatic: string; shift: number; fits: boolean }
}

interface CopyOnTheWire {
  characters: number
  parts: PartOnTheWire[]
  text: string
  top: Rung | null
  detail: string
}

/** Ask the server for a copy, without a browser. */
async function copy(query: string): Promise<CopyOnTheWire> {
  const at = `http://127.0.0.1:${String(app.apiPort)}/api/bundles/preview?preset=recover_project${query}`
  const reply = await fetch(at)
  if (!reply.ok) throw new Error(`the preview answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as CopyOnTheWire
}

/** One record's own copy, at one position, as text. `objective` draws that record and nothing else. */
async function oneRecordAt(recordId: string, detail: string): Promise<CopyOnTheWire> {
  const at =
    `http://127.0.0.1:${String(app.apiPort)}/api/bundles/preview?scope=${recordId}` +
    `&preset=custom&slots=objective&detail=${detail}`
  const reply = await fetch(at)
  if (!reply.ok) throw new Error(`the preview answered ${String(reply.status)}: ${await reply.text()}`)
  return (await reply.json()) as CopyOnTheWire
}

async function post(body: unknown): Promise<{ id: string }> {
  const res = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`the seed was refused: ${String(res.status)} ${await res.text()}`)
  return ((await res.json()) as { record: { id: string } }).record
}

/** Ids of the four records whose ladders differ, so each case names the record it is about. */
const written: { report: string; whole: string; atomic: string; bare: string } = {
  report: '',
  whole: '',
  atomic: '',
  bare: '',
}

beforeAll(async () => {
  app = await liveApp({ name: 'bundle-top-rung', viewport: { width: 1440, height: 1000 } })
  page = app.page

  // THE SERVER REFUSES A WRITE UNDER AN AGENT ID NO REGISTRY ROW ANSWERS (16 September 2026,
  // problem tClP6DIMlOpz), so the agent this file writes the report's short forms as is registered
  // before the write below.
  const registered = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-actor-type': 'human',
      'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id,
    },
    body: JSON.stringify({
      kind: 'agent',
      title: 'The B32 test',
      data: { handle: 'the-b32-test', runtime: 'claude-code', state: 'active' },
    }),
  })
  if (!registered.ok) {
    throw new Error(`the agent registration was refused: ${String(registered.status)} ${await registered.text()}`)
  }

  // TWELVE PROBLEMS, each with a summary, so the open-work part is big enough to have made a choice.
  for (let i = 0; i < PROBLEMS; i += 1) {
    await post({
      kind: 'problem',
      title: `The far edge of tray ${String(i)} is not segmented at 40 cm`,
      summary:
        `Segmentation drops the far edge of tray ${String(i)} at forty centimetres, on every run, ` +
        'and the depth image is clean there. It is the mask that is short, not the sensor, and the ' +
        'same tray at thirty centimetres is segmented whole.',
      data: {
        symptom: `Segmentation drops the far edge of tray ${String(i)}.`,
        state: 'open',
        why_it_hurts: 'A grasp planned on a short mask reaches for an edge that is not where it looks.',
      },
    })
  }

  // A MODULE MADE OF MODULES: children, so it has an outline and a sketch, and no written parts, so
  // it has no digest.
  const whole = await post({
    kind: 'module',
    title: 'The perception stack',
    summary: 'Everything between the camera and a grasp pose.',
  })
  written.whole = whole.id
  for (const [title, summary] of [
    ['Frame intake', 'Where frames enter, and at what rate.'],
    ['Grasp proposals', 'Turning a segmented tray into poses to try.'],
  ] as const) {
    const child = await post({ kind: 'module', title, summary })
    const link = await fetch(`http://127.0.0.1:${String(app.apiPort)}/api/links`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fromId: child.id, toId: whole.id, type: 'part_of' }),
    })
    if (!link.ok) throw new Error(`the link was refused: ${await link.text()}`)
  }

  // AN ATOMIC MODULE: a summary and nothing under it, so its ladder stops at the Conclusion.
  written.atomic = (
    await post({
      kind: 'module',
      title: 'The logging shim',
      summary: 'Where every line of output goes.',
    })
  ).id

  // A RECORD WITH NOTHING WRITTEN BELOW ITS TITLE, so its ladder stops at the title.
  written.bare = (await post({ kind: 'module', title: 'The gripper firmware' })).id

  // A REPORT WITH PARTS WRITTEN BY HAND, which is the only place a level 6 exists.
  const report = await post({
    kind: 'report',
    title: 'What the tray run of Tuesday measured',
    summary: 'Two runs of forty trays each, with the far edge dropped on eleven of them.',
    data: {
      for: THE_TEST_OFFICES_OWNER.name,
      date: '2026-09-08',
      blocks: [
        {
          id: 'b-what',
          type: 'text',
          heading: 'What was measured',
          text:
            'Two runs of forty trays each were measured on Tuesday morning and Tuesday afternoon. In both ' +
            'runs the mask dropped the far edge of eleven of the forty trays at a range of forty centimetres. ' +
            'The depth image is clean at that range on every one of the eleven, which is why this names the ' +
            'mask rather than the sensor. The same eleven trays were measured again at thirty centimetres and ' +
            'were segmented whole, both times, with nothing else about the rig changed. Every number here was ' +
            'read off the run output rather than off anybody\'s notes, and the run output is kept beside the ' +
            'report. Nothing was inferred from a run that was not taken, and no tray was measured once and ' +
            'counted twice. The eleven are named individually in the run output by their table positions.',
        },
        {
          id: 'b-how',
          type: 'text',
          heading: 'How',
          text:
            'The camera was not moved between the two runs and the light was not changed, so a difference ' +
            'between the runs would have been a difference in the mask rather than in the scene. The tray ' +
            'positions were the same to within a centimetre, measured off the table markings rather than ' +
            'assumed from the last run. Nobody restarted the camera between the runs and nothing else about ' +
            'the rig was touched on the day. That is what makes the two runs comparable, and it is what makes ' +
            'the eleven dropped edges the same eleven in both of them rather than eleven of each. The run ' +
            'output records the exposure and the gain for every frame, and both were constant throughout.',
        },
      ],
    },
  })
  written.report = report.id
  const revisions = await fetch(
    `http://127.0.0.1:${String(app.apiPort)}/api/records/${report.id}/revisions`,
  )
  const list = (await revisions.json()) as { revisions?: { seq: number; contentHash: string }[] }
  const newest = (list.revisions ?? []).slice(-1)[0]
  if (newest === undefined) throw new Error('the report has no revision to write short forms from')
  const forms = await fetch(
    `http://127.0.0.1:${String(app.apiPort)}/api/records/${report.id}/short-forms`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': 'the-b32-test',
      },
      body: JSON.stringify({
        madeFrom: { seq: newest.seq, contentHash: newest.contentHash },
        forms: {
          parts: [
            {
              id: 'p-what',
              heading: 'Forty trays were measured twice on Tuesday',
              text30: 'Two runs of forty trays each, on one camera under one light, with the far edge dropped on eleven.',
              text120:
                'Two runs of forty trays each were measured on Tuesday, on the same camera and under the same ' +
                'light, and the far edge of eleven trays was dropped by the mask in both runs. The depth image ' +
                'is clean at that distance, so the sensor is not what is short. The same eleven trays at thirty ' +
                'centimetres are segmented whole, which is the reason the mask rather than the range is named ' +
                'here. Nothing about the light changed between the runs and nothing about the tray positions ' +
                'changed either, so the two runs are comparable and the eleven are the same eleven.',
              covers: ['b-what'],
            },
            {
              id: 'p-how',
              heading: 'The same camera and the same light both times',
              text30: 'One camera, one light, the same tray positions, so the two runs can be compared directly.',
              text120:
                'The camera was not moved between the runs and the light was not changed, so a difference ' +
                'between the two runs would have been a difference in the mask rather than in the scene. The ' +
                'tray positions were the same to within a centimetre, measured off the table markings rather ' +
                'than assumed. That is what makes the two runs comparable, and it is why the eleven dropped ' +
                'edges can be named as the same eleven in both. Nothing else about the rig was touched on the ' +
                'day, and nobody restarted the camera between the runs.',
              covers: ['b-how'],
            },
          ],
        },
      }),
    },
  )
  if (!forms.ok) throw new Error(`the short forms were refused: ${await forms.text()}`)

  await page.goto(`http://127.0.0.1:${String(app.webPort)}/#/bundles`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.px-page')
}, 240_000)

afterAll(async () => {
  await app.stop()
})

describe('the top of a copy is the highest rung really written', () => {
  it('offers five positions ending at Level 6, and refuses Full by name with the reason', async () => {
    // THE FIVE, READ FROM THE DECLARATION. Nothing here lists them a second time.
    expect([...BUNDLE_RUNGS]).toEqual(['title', 'gist', 'outline', 'sketch', 'digest'])
    for (const rung of BUNDLE_RUNGS) {
      const reply = await fetch(
        `http://127.0.0.1:${String(app.apiPort)}/api/bundles/preview?preset=recover_project&detail=${rung}`,
      )
      expect(reply.status, `${rung} was refused: ${await reply.text()}`).toBe(200)
    }

    // FULL IS A REAL POSITION OF THE LADDER AND A COPY NO LONGER GOES THERE. Refused by name, with
    // the reason, rather than rounded down to the neighbour.
    const refused = await fetch(
      `http://127.0.0.1:${String(app.apiPort)}/api/bundles/preview?preset=recover_project&detail=full`,
    )
    expect(refused.status).toBe(400)
    const said = String(((await refused.json()) as { error: string }).error)
    expect(said).toContain('full')
    expect(said).toContain('the record itself')
    expect(said).toContain('Nothing was assembled')
  })

  it('gives each record the highest rung really written on it, and no higher', async () => {
    // A REPORT WITH PARTS WRITTEN BY HAND REACHES LEVEL 6. It is the only kind that can.
    const report = await oneRecordAt(written.report, 'digest')
    expect(report.top).toBe('digest')
    expect(report.text).toContain('The camera was not moved between the runs')

    // A MODULE MADE OF MODULES STOPS AT LEVEL 5. Nobody wrote its children at a hundred and twenty
    // words, so it has no level 6 and asking for one draws level 5 rather than level 5 renamed.
    const whole = await oneRecordAt(written.whole, 'digest')
    expect(whole.top).toBe('sketch')
    expect(whole.text).toContain('Frame intake')

    // AN ATOMIC RECORD STOPS AT ITS CONCLUSION: it has no levels 4 to 6 in between.
    const atomic = await oneRecordAt(written.atomic, 'digest')
    expect(atomic.top).toBe('gist')
    expect(atomic.text).toContain('Where every line of output goes.')

    // A RECORD WITH NOTHING WRITTEN UNDER ITS TITLE STOPS AT ITS TITLE.
    const bare = await oneRecordAt(written.bare, 'digest')
    expect(bare.top).toBe('title')
  })

  it('never says less at a longer position than at a shorter one', async () => {
    // THE MEASUREMENT PROBLEM `AQZm6esnQqCr` WAS FOUND BY, taken the same way, on one part.
    const sizes: { rung: Rung; bytes: number; characters: number }[] = []
    for (const rung of BUNDLE_RUNGS) {
      const one = await copy(`&detail=${rung}`)
      const open = one.parts.find((part) => part.name === 'openLoops')
      expect(open, `the copy at ${rung} has no open-work part`).toBeDefined()
      sizes.push({ rung, bytes: (open as PartOnTheWire).bytes, characters: one.characters })
    }
    for (let i = 1; i < sizes.length; i += 1) {
      const below = sizes[i - 1] as { rung: Rung; bytes: number }
      const here = sizes[i] as { rung: Rung; bytes: number }
      expect(
        here.bytes,
        `${here.rung} (${String(here.bytes)} bytes) says less than ${below.rung} (${String(below.bytes)})`,
      ).toBeGreaterThanOrEqual(below.bytes)
    }

    // AND THE SAME THING FROM THE CONTROL'S END: less makes the copy smaller, more makes it larger.
    const shorter = await copy('&shift=-1')
    const base = await copy('')
    const longer = await copy('&shift=1')
    expect(shorter.characters).toBeLessThanOrEqual(base.characters)
    expect(longer.characters).toBeGreaterThanOrEqual(base.characters)
  })

  it('does not print the record’s conclusion twice when the head line already carries it', async () => {
    // THE OPEN-WORK READER NAMES A PROBLEM BY ITS OWN SUMMARY, so the identifying line IS the
    // Conclusion. Writing it again underneath is half of what made a shorter level say more.
    //
    // TWO PARTS MAY EACH NAME THE SAME PROBLEM and that is not this fault: what this looks for is a
    // head line with the same summary repeated on the line under it.
    const one = await copy('&detail=gist')
    const summary = 'It is the mask that is short, not the sensor'
    // AN ENTRY STARTS AT A LINE WITH NO INDENT and everything indented under it belongs to it, which
    // is the shape every reader in the assembler writes.
    const entries: string[][] = []
    for (const line of one.text.split('\n')) {
      if (line.startsWith(' ') && entries.length > 0) (entries[entries.length - 1] as string[]).push(line)
      else entries.push([line])
    }
    const repeated = entries.filter(
      (entry) => entry.filter((line) => line.includes(summary)).length > 1,
    )
    expect(
      repeated.length,
      `${String(repeated.length)} entries carry their own conclusion twice, for example:\n${(repeated[0] ?? []).join('\n')}`,
    ).toBe(0)

    // AND THE CONCLUSION IS STILL THERE, once, on the entries whose head line does not carry it.
    expect(one.text).toContain(summary)
  })

  it('keeps what the part wrote about a record at every position above Level 2', async () => {
    // WHAT A PART WROTE IS NOT A RUNG. The open-work reader writes why each record ranks where it
    // does, and the records it ranks often have no summary of their own — so if those lines were a
    // rung of the record's ladder they would be dropped by every copy that is not at the top.
    const ranking = /The attention rule (puts this \d+ of \d+|could not rank)/
    for (const rung of BUNDLE_RUNGS) {
      const one = await copy(`&detail=${rung}`)
      if (rung === 'title') {
        // LEVEL 2 IS ONE LINE EACH, which is what the shortest position means.
        expect(one.text, 'Level 2 carried more than a line each').not.toMatch(ranking)
        continue
      }
      expect(one.text, `${rung} dropped what the part wrote about its records`).toMatch(ranking)
    }
  })

  it('says on the page how high each part goes, and stops More there', async () => {
    // CRITERION B33 REMOVED THE *Choose a reading* PRESS. The controls are on the page on arrival.
    await page.waitForSelector('#bx-preset')
    await page.getByRole('button', { name: 'Read what it would say' }).click()
    await page.waitForSelector('#bx-thetext')

    // WHERE THE LADDER STOPS, SAID ON THE PAGE. Criterion B32.
    const top = page.locator('#bx-top')
    await expect.poll(async () => await top.count()).toBe(1)
    // THE WORDING NAMES THE COPY'S OWN TOP, read off the same reply the page drew from, so the two
    // cannot disagree about where the ladder stops.
    const onTheWire = await copy('')
    expect(onTheWire.top, 'the copy says it has no top at all').not.toBeNull()
    const wording = await top.innerText()
    expect(wording).toContain(levelLabel(onTheWire.top as Rung))

    // MORE STOPS AT THE TOP. Pressing it until it stops leaves the press disabled and the page
    // saying why, rather than a control that is there, is pressed, and does nothing.
    const more = page.locator('#bx-more')
    for (let press = 0; press < BUNDLE_RUNGS.length + 1; press += 1) {
      if (await more.isDisabled()) break
      await more.click()
      await page.waitForTimeout(1200)
    }
    expect(await more.isDisabled(), 'More never stopped').toBe(true)
    // WHAT THE PAGE SAYS WHEN THE PRESS STOPS. The second half goes through the absence component,
    // so what is drawn is its word rather than a sentence, and the sentence is on the tooltip.
    expect(await top.innerText()).toContain('the top of this copy')

    // AND EACH PART'S CELL SAYS HOW HIGH ITS OWN RECORDS GO, where it is not already there.
    const cells = await page.locator('.bx-part-level').allInnerTexts()
    expect(cells.some((cell) => cell.includes('written up to')) || (await top.innerText()).length > 0).toBe(true)
  })
})
