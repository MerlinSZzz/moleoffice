// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON CAN GET THEIR REVIEW READ FROM INSIDE PANELX.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------------
 *
 * On 19 August 2026 both halves of having a review read were built on the server and neither had a
 * way in. `grep -rn organise src/web` returned nothing at all: no screen asked
 * GET /api/reviews/:id/organise for the question, and no screen sent an answer to
 * POST /api/reviews/:id/organise. So a person could finish collecting a review and then had
 * nowhere to go — and the pane that draws what Mole Office made of a comment drew it for readings
 * nothing anybody could press had ever put there.
 *
 * **This was the sixth time in the campaign that something built and working had no path to it.**
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IS HELD HERE
 * ---------------------------------------------------------------------------------------------
 *
 *   THE WIRING EXISTS AT ALL, read off the files. A panel asks the server on an effect, so a static
 *   render draws its loading state and would pass with the request deleted.
 *   tests/server-wiring.test.ts reads files off disk for the same reason.
 *
 *   THE THREE STATES OF ASKING, as a function over a conversation: nobody has asked, somebody asked
 *   and nothing has answered, an answer is here. The middle one is an ordinary and possibly endless
 *   state — the run waits for a worker that may not be running — and it says so in words.
 *
 *   WHAT COMES BACK IS TURNED INTO A VALUE AND CHECKED NOWHERE HERE. The server holds the one check
 *   of what a reading is; a second one in the browser would be the same rule written twice.
 *
 *   A SHORT FORM NOBODY WROTE IS ABSENT AND SAYS SO. Four answers, because three of them are
 *   different kinds of nothing, and none of them is the opening of the record cut to length.
 *
 *   AND THE WHOLE LOOP IN CHROMIUM: collect, finish, ask for the question, hand back a reading, and
 *   read it beside the words. Against a Mole Office of this test's own; nothing touches ./data/panelx.db.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { thePersonsKeyHeader, type LiveApp, liveApp, waitForThePage } from './helpers.ts'
import type { ContextReading, ThreadDetail } from '../src/server/lib/agents.ts'
import type { FoundMember, ReviewDetail, ReviewMember, ReviewState, ReviewView } from '../src/server/lib/reviews.ts'
import type { ShortFormForRow } from '../src/server/lib/zoom.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import type { Target } from '../src/shared/targets.ts'

type Bar = typeof import('../src/web/components/agent/ReviewBar.tsx')
type Api = typeof import('../src/web/api.ts')

let bar: Bar
let api: Api

beforeAll(async () => {
  // Both modules read storage the first time they are imported, so the smallest stand-in goes in
  // before either of them. Nothing here is under test; the same stand-in is in three other files.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  bar = await import('../src/web/components/agent/ReviewBar.tsx')
  api = await import('../src/web/api.ts')
})

// ============================================================ 1. the wiring exists

describe('a screen asks for a reading, and a screen sends one back', () => {
  const browserFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return browserFiles(path)
      return entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) ? [path] : []
    })

  it('has a call for the question and a call for the answer', () => {
    expect('askToOrganise' in api.api, 'no screen can ask what an interpreter should be told').toBe(true)
    expect('keepOrganised' in api.api, 'no screen can send back a reading').toBe(true)
  })

  it('has at least one screen that presses each of them', () => {
    const screens = browserFiles('src/web').filter((path) => !path.endsWith(join('src/web', 'api.ts')))
    const asking = screens.filter((path) => readFileSync(path, 'utf8').includes('api.askToOrganise('))
    const keeping = screens.filter((path) => readFileSync(path, 'utf8').includes('api.keepOrganised('))
    expect(asking, 'nothing in the browser asks for the question, so a person cannot start').not.toHaveLength(0)
    expect(keeping, 'nothing in the browser sends an answer, so nothing can ever be kept').not.toHaveLength(0)
  })

})

// ============================================================ 2. the three states of asking

const message = (role: 'human' | 'agent', body: string) =>
  ({ id: `m-${role}`, role, body }) as unknown as ThreadDetail['messages'][number]

const thread = (messages: ThreadDetail['messages']): ThreadDetail =>
  ({ thread: { id: 't1' }, messages, runs: [], says: 'One run, queued.' }) as unknown as ThreadDetail

describe('where having the comments read has got to', () => {
  it('says not asked yet when there is no conversation for it', () => {
    const said = bar.whereTheReadingHasGot(null)
    expect(said.asked).toBe(false)
    // A WORD AND NOT A SENTENCE. This is an absence, the pane draws it through `Absence`, and
    // tests/absence-weight.test.ts is what caught the paragraph that used to be here.
    if (said.asked) return
    expect(said.word).toBe('not asked yet')
  })

  /**
   * THE STATE THAT MATTERS. A run waits for a worker, the worker may be on another machine or not
   * running at all, and a surface drawing this as a spinner promises an answer nobody has.
   */
  it('says nothing has answered yet while the question is only asked', () => {
    const said = bar.whereTheReadingHasGot(thread([message('human', 'the whole question')]))
    expect(said.asked).toBe(true)
    if (!said.asked) return
    expect(said.waiting).toBe(true)
    expect(said.answer).toBe(null)
    expect(said.says).toContain('No answer yet')
  })

  it('hands back what the agent said once one has answered', () => {
    const said = bar.whereTheReadingHasGot(
      thread([message('human', 'the whole question'), message('agent', '{"comments":[]}')]),
    )
    expect(said.asked).toBe(true)
    if (!said.asked) return
    expect(said.waiting).toBe(false)
    expect(said.answer).toBe('{"comments":[]}')
  })
})

// ============================================================ 3. what came back, read but not judged

describe('turning what came back into something to send', () => {
  it('refuses an empty box without pretending anything happened', () => {
    const read = bar.readWhatCameBack('   ')
    expect('problem' in read).toBe(true)
    if ('problem' in read) expect(read.problem).toContain('nothing to keep')
  })

  it('says plainly when the text is not an answer at all', () => {
    const read = bar.readWhatCameBack('I read them and they seem fine to me')
    expect('problem' in read).toBe(true)
    if ('problem' in read) expect(read.problem).toContain('could not read that')
  })

  it('refuses a list, because an answer is one thing with comments in it', () => {
    expect('problem' in bar.readWhatCameBack('[1, 2, 3]')).toBe(true)
  })

  /**
   * IT CHECKS NOTHING ABOUT THE READING ITSELF, AND THAT IS THE POINT. `checkOrganised` on the
   * server is the one statement of what a reading is, and it is the only check that can compare an
   * answer against the comments that were handed over. A shape check here would be that rule
   * written twice, free to refuse something the server accepts.
   */
  it('hands an object straight on without judging it', () => {
    const read = bar.readWhatCameBack('{"comments":[{"commentId":"n1"}],"nonsense":true}')
    expect('reading' in read, 'the browser refused an answer only the server can judge').toBe(true)
  })
})

// ============================================================ 4. a gist nobody wrote is absent

const record = (id: string): Target => ({ kind: 'record', recordId: id, workspaceId: 'panelx' })
const aPlan = (): Target => ({ kind: 'plan', planId: 'BcO6p5CRMhk3' })

const row = (over: Partial<ShortFormForRow> = {}): ShortFormForRow => ({
  recordId: 'r1',
  level: 'gist',
  text: 'The printed wrist mount cracks at about fifteen newtons, under the twenty the trials need.',
  title: null,
  state: 'current',
  override: false,
  by: 'claude-code/short-form-writer',
  at: '2026-09-02 10:14:03',
  says: 'Written against the newest revision.',
  ...over,
})

describe('the gist of the thing a comment is about', () => {
  it('asks nothing about a thing that is not a record, because there is nothing to ask', () => {
    expect(bar.gistBeside([], aPlan()).kind).toBe('nothing-to-ask')
  })

  it('tells "nobody has looked" apart from "nobody wrote one"', () => {
    // The fifth engineering rule, on this surface. A pane that has not asked is not a pane that
    // asked and was told there is none.
    expect(bar.gistBeside(null, record('r1')).kind).toBe('nobody-looked')
    expect(bar.gistBeside([row({ text: null, state: 'none' })], record('r1')).kind).toBe('none')
  })

  it('says which of them in the server’s own sentence', () => {
    const none = bar.gistBeside([row({ text: null, state: 'none', says: 'Nobody has written a gist.' })], record('r1'))
    expect(none.kind === 'none' ? none.says : '').toBe('Nobody has written a gist.')
  })

  it('hands back the words somebody wrote, and says when the record has moved past them', () => {
    const now = bar.gistBeside([row()], record('r1'))
    expect(now.kind).toBe('gist')
    if (now.kind !== 'gist') return
    expect(now.text).toContain('fifteen newtons')
    expect(now.current).toBe(true)
    const old = bar.gistBeside([row({ state: 'out_of_date' })], record('r1'))
    expect(old.kind === 'gist' ? old.current : true).toBe(false)
  })

  /**
   * NOTHING HERE CAN FALL BACK TO CUTTING THE RECORD. A gist is twenty to thirty words somebody
   * wrote on purpose, and the first thirty words of a report are not the useful conclusion. This is
   * the check that the function never invents one: it is given a row with no words and a record
   * whose body it could have reached for, and it answers with an absence.
   */
  it('never makes one up when nobody wrote one', () => {
    const said = bar.gistBeside([row({ text: null, state: 'none' })], record('r1'))
    expect(said.kind).toBe('none')
    expect(JSON.stringify(said)).not.toContain('…')
  })
})

describe('which records one request has to ask about', () => {
  it('asks once per record, however many comments point at it', () => {
    const members = [found({ id: 'n1' }), found({ id: 'n2' }), found({ id: 'n3', target: record('r2') })]
    expect(bar.recordsBehind(members).sort()).toEqual(['r1', 'r2'])
  })

  it('leaves out what names no record, and asks nothing at all when none does', () => {
    expect(bar.recordsBehind([found({ id: 'n1', target: aPlan() })])).toEqual([])
  })
})

// ============================================================ 5. the pane offers it in the right states

const READING: ContextReading = {
  state: 'there',
  about: 'the report "Round seven"',
  says: 'Still there, in the same place.',
}

function found(over: { id?: string; target?: Target; interpretation?: string | null } = {}): FoundMember {
  return {
    found: true,
    source: 'annotation',
    id: over.id ?? 'n1',
    body: 'These two numbers disagree, and I do not know which one was measured.',
    context: { target: over.target ?? record('r1') },
    reading: READING,
    created: '2026-08-19 09:00:00',
    createdBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
    key: 'record/r1/panelx',
    interpretation: over.interpretation ?? null,
  } as unknown as FoundMember
}

function detail(state: ReviewState, members: ReviewMember[] = [found()]): ReviewDetail {
  return {
    review: {
      id: 'kScwD9LbAb5f',
      workspaceId: 'panelx',
      entry: { target: record('r1') },
      state,
      started: '2026-08-19 09:40:00',
      startedBy: `human:${THE_TEST_OFFICES_OWNER.id}`,
      collectedAt: state === 'collecting' ? null : '2026-08-19 09:55:00',
      membershipFrozen: state !== 'collecting',
      fromThreadId: null,
    } as unknown as ReviewView,
    rule: { kind: 'record', id: 'r1', says: 'Everything about that report.', gaps: [] },
    members,
    // NO COMMENT SAVED WITHOUT SENDING is listed beside these, which is the case this file draws.
    saved: [],
    count: members.length,
    gaps: [],
    organised: null,
    // WHO IT GOES TO, which every review read carries since wave 13r round 15. Nobody is recorded as writing r1.
    goesTo: { ground: 'nobody-recorded', recipient: null, name: null, elsewhere: [] },
    says: 'Collecting finished. 1 comment. Nothing has been sent.',
  } as unknown as ReviewDetail
}

const pane = (state: ReviewState): string =>
  renderToStaticMarkup(
    h(bar.PaneBody, { detail: detail(state), notes: null, showing: { state: 'none' } as never }),
  )

describe('where the pane offers to have the comments read', () => {
  /**
   * THE ACT SITS BETWEEN THE TWO BOUNDARIES. A reading of a set that can still change is a reading
   * of something else, and the server refuses one on a collecting review by name — so offering it
   * there would be a press that can only fail, which docs/UX-CONTRACT.md forbids.
   */
  // ASKED FOR THE ACT, NOT FOR THE STYLE. These four checks used to look for `px-org`, which is a
  // block style and not a claim about anything: when Send was built it reused the same style, so the
  // `sent` case started finding `px-org` in the SEND block and failed — while the offer it is
  // actually about was correctly hidden. The product was right and the test was looking at the wrong
  // thing.
  //
  // The heading cannot be used either, because the section draws a loading state first and a static
  // render never reaches the words. So the section now says WHICH ACT IT IS, in the markup, and this
  // asks for that. It is the same idea as the rest of this campaign: a thing worth pointing at says
  // what it is, rather than being recognised by how it looks.
  const OFFER = 'data-part="have-them-read"'

  it('is not offered while the review is still collecting', () => {
    expect(pane('collecting'), 'a reading was offered of a set that can still change').not.toContain(OFFER)
  })

  it('is offered once collecting has finished', () => {
    expect(pane('collected'), 'a finished review has nowhere to go').toContain(OFFER)
  })

  it('is still offered on a review something has already read, because a reading can be wrong', () => {
    expect(pane('organised')).toContain(OFFER)
  })

  it('is not offered on a review that has gone to somebody', () => {
    // AND THE SEND BLOCK IS STILL THERE, which is what tells this apart from the section simply
    // having vanished. A review that has gone still says so; what it no longer does is offer to have
    // its comments read.
    expect(pane('sent')).not.toContain(OFFER)
    expect(pane('sent'), 'a sent review draws nothing at all, so this proves nothing').toContain(
      'data-part="send-the-review"',
    )
  })
})

// ============================================================ 6. the whole loop, in Chromium

describe('a person gets their review read, in Chromium', () => {
  let app: LiveApp
  let reportId: string
  let reviewId: string

  /** The agent asked to read the comments: a contact of the chat, made up for this test. */
  const READER = 'Review reading agent'

  /** The report's own summary, which IS reading length 3 since 3 September 2026 (criterion A14b). */
  const SUMMARY = 'What landed and what did not.'

  const post = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
    const res = await fetch(`${app.api}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw new Error(`POST ${path} answered ${String(res.status)}: ${await res.text()}`)
    return (await res.json()) as Record<string, unknown>
  }

  /** What the review column says, whitespace collapsed, the way a person reads it. */
  const column = async (): Promise<string> => {
    const said = await app.page.getByRole('complementary', { name: 'Your reviews' }).innerText()
    return said.replace(/\s+/g, ' ')
  }

  beforeAll(async () => {
    app = await liveApp({ name: 'organise', viewport: { width: 1440, height: 1000 } })
    await app.page.route(`${app.api}/api/agent/threads/*/dispatch`, (route) => route.continue({
      headers: { ...route.request().headers(), ...thePersonsKeyHeader(app.dir + '/keys.json') },
    }))

    const made = (await post('/api/records', {
      kind: 'report',
      title: 'Round seven: the human surface finished',
      summary: SUMMARY,
      data: {
        date: '2026-08-18',
        blocks: [{ id: 'b-prose', type: 'text', text: 'The plan table and the Schedule now count the same way.' }],
      },
    })) as { record: { id: string } }
    reportId = made.record.id

    const started = (await post('/api/reviews', {
      entry: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } },
    })) as { review: { id: string } }
    reviewId = started.review.id

    for (const body of [
      'These two numbers disagree with the run log. Which of the two was measured?',
      'Same disagreement here, and we should automate this check next round.',
    ]) {
      await post('/api/records', {
        kind: 'annotation',
        title: body.slice(0, 40),
        data: {
          body,
          context: { target: { kind: 'record', recordId: reportId, workspaceId: 'default' } },
        },
      })
    }
    await post(`/api/reviews/${reviewId}/finish-collecting`, {})

    // A CONTACT TO ASK. Who reads the comments is chosen from the chat's contacts for problem sLyxTMlvze6A,
    // and an agent that has written to the person is one of them.
    await post('/api/records', { kind: 'agent', title: READER, data: { handle: 'review-reader', runtime: 'claude-code', state: 'active' } })
    const res = await fetch(`${app.api}/api/records`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'review-reader' },
      body: JSON.stringify({ kind: 'message', title: 'A note', data: { body: 'I can read comments.', to: [{ kind: 'person', id: THE_PERSON }] } }),
    })
    if (!res.ok) throw new Error(`the reader's note answered ${String(res.status)}: ${await res.text()}`)

    await openTheOrganiser()
  }, 240_000)

  /**
   * OPEN THE REPORT, THEN THE REVIEW PANE, THEN THE REVIEW THIS FILE IS ABOUT.
   *
   * It goes through the page rather than through a stored setting, because what the pane offers is
   * what a person reaches by pressing. It is called once, from `beforeAll`: the cases below walk on
   * through the steps from wherever the one above them left off, and calling it again in the middle
   * would put a case back at the first step and measure a different view.
   */
  async function openTheOrganiser(): Promise<void> {
    await app.page.goto(`${app.site}/#/r/${reportId}`, { timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.locator('.px-review-switch').waitFor({ timeout: 30_000 })
    await app.page.evaluate(() => {
      window.localStorage.removeItem('mole-office.review')
    })
    await app.page.reload({ timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.locator('.px-review-switch').click()
    await app.page.locator('.px-pane-list .px-rev-go').first().waitFor({ timeout: 30_000 })
    await app.page.locator('.px-pane-list .px-rev-go').first().click()
    await app.page.waitForSelector('.px-org', { timeout: 30_000 })
    await app.page.getByText('Have these comments read').first().waitFor({ timeout: 30_000 })
  }

  afterAll(async () => {
    await app?.stop()
  }, 60_000)

  /**
   * THE ONE THIS FILE IS FOR. Before this, a finished review's pane offered nothing at all that
   * would have a comment read, and the routes that do it were named by no file in src/web.
   */
  it('offers to have the comments read, and says no reader has been asked yet', async () => {
    const said = await column()
    expect(said).toContain('Have these comments read')
    expect(said.toLowerCase(), 'a person is not told that no reader has been asked').toContain(
      'not asked yet',
    )
  }, 60_000)

  it('shows the question Mole Office would ask, with every comment in it', async () => {
    await app.page.locator('.px-org-self > summary').click()
    await app.page.locator('.px-org-text').first().waitFor({ state: 'visible', timeout: 30_000 })
    const question = await app.page.locator('.px-org-text').first().innerText()
    expect(question, 'the question does not carry the words somebody wrote').toContain('Which of the two was measured?')
    expect(question).toContain('automate this check next round')
  }, 60_000)

  /** A refusal stores nothing and says so, in the server's own sentence. */
  it('refuses a reading that leaves a comment out, and keeps nobody’s words touched', async () => {
    const asked = (await (await fetch(`${app.api}/api/reviews/${reviewId}/organise`)).json()) as {
      comments: { id: string }[]
    }
    const half = JSON.stringify({
      comments: [{ commentId: asked.comments[0]?.id ?? '', reading: 'Only this one.', intents: ['ask'], artefacts: [] }],
      groups: [],
    })
    await app.page.locator('.px-org textarea').fill(half)
    await app.page.getByRole('button', { name: 'Keep this reading' }).click()
    await expect.poll(column, { timeout: 15_000 }).toContain("no words have been changed")
    const said = await column()
    expect(said, 'a refused reading did not say no words were changed').toContain(
      "no words have been changed",
    )
  }, 60_000)

  it('keeps a whole reading, and draws it beside the words a person wrote', async () => {
    const asked = (await (await fetch(`${app.api}/api/reviews/${reviewId}/organise`)).json()) as {
      comments: { id: string }[]
    }
    const whole = JSON.stringify({
      comments: asked.comments.map((one, at) => ({
        commentId: one.id,
        reading: at === 0 ? 'Asks which of two numbers was measured.' : 'Asks for the check to be automated.',
        intents: at === 0 ? ['ask'] : ['change'],
        artefacts: at === 0 ? ['problem'] : ['task'],
      })),
      groups: [{ says: 'Both are about the same two numbers disagreeing.', commentIds: asked.comments.map((o) => o.id) }],
    })
    await app.page.locator('.px-org textarea').fill(whole)
    await app.page.getByRole('button', { name: 'Keep this reading' }).click()
    await expect.poll(column, { timeout: 30_000 }).toContain('now stored beside the words')

    // AND THE READING IS ON THE SCREEN, BESIDE THE WORDS, WHICH IS THE WHOLE POINT.
    await app.page.getByRole('button', { name: 'More', exact: true }).first().click()
    await expect.poll(column, { timeout: 15_000 }).toContain('Asks which of two numbers was measured.')
    const opened = await column()
    // The two headings are chrome and are set in capitals by the stylesheet, so what a browser
    // reads back is upper case. The comparison is on the words, not on how they are drawn.
    expect(opened.toLowerCase()).toContain('what the comment says')
    expect(opened.toLowerCase()).toContain('what mole office made of it')
    expect(opened, 'the reading that was just kept is on no screen').toContain(
      'Asks which of two numbers was measured.',
    )
    expect(opened, 'the words somebody wrote were replaced by the reading').toContain(
      'Which of the two was measured?',
    )
  }, 60_000)

  /**
   * THE PANE DOES NOT HIDE ITS OWN CONTENTS, AND THIS ASKS IT AS GEOMETRY.
   *
   * WHAT WENT WRONG, MEASURED. On 19 August 2026 the pane put a scrolling box — the list of
   * comments — inside itself, and gave that box whatever height was left after the rest of the pane
   * had taken what it wanted. The send block arrived that morning and took 307px of a 22rem column
   * that is at most one screen tall. At 1440x1000, in the state the test above leaves behind, the
   * comment list was measured at 0px tall with 271px of comments inside it, and on other runs at
   * 15px tall with 652px inside it. The comments were still in the layout, so the More press beside
   * each of them still had a place on the screen, and the pane was painted over that place: the
   * press was there to look at and dead to a click. Playwright called it "aside class=px-pane
   * intercepts pointer events".
   *
   * WHY IT IS ASKED THIS WAY. Three ways of asking were tried and two of them were quiet.
   * Clicking the press, which is what the test above does, found it on two runs in three: Playwright
   * retries a blocked click for thirty seconds and the pane finishes loading while it retries.
   * Asking whether anything is painted over each press found it only when the list was exactly 0px,
   * because a press centred in a 15px window is still hit by a click at its middle — and a 15px
   * window over 652px of comments is the same defect, just less of it. What is left is the cause
   * itself, and it does not move between runs: a box inside the pane that is shorter than what is
   * in it. The pane may scroll. Nothing inside the pane may.
   *
   * WHY IT IS HERE AND NOT AT THE END OF THE FILE. It has to run while the pane is in the state
   * that broke — the reading kept and the send block drawn, which is the tallest the pane ever is.
   * At the end of the file the fold holding the question is shut and the pane fits.
   */
  it('hides none of its own contents inside a squeezed box, at 1440 and 390', async () => {
    for (const width of [1440, 390]) {
      await app.page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 })
      // THE PANE FETCHES AFTER IT FIRST DRAWS, so its height moves for a second or two. This waits
      // for two readings of the same height rather than for a fixed number of milliseconds.
      let last = -1
      await expect
        .poll(
          async () => {
            const now = await app.page.evaluate(() => document.querySelector('aside.px-pane')?.scrollHeight ?? -1)
            const settled = now === last
            last = now
            return settled
          },
          { timeout: 30_000, interval: 500 },
        )
        .toBe(true)
      const measured = await app.page.evaluate(() => {
        const pane = document.querySelector('aside.px-pane')
        if (pane === null) return { rows: 0, squeezed: [] as { box: string; shows: number; holds: number }[] }
        const squeezed: { box: string; shows: number; holds: number }[] = []
        for (const inside of pane.querySelectorAll('*')) {
          // A box holding ONE LONG TEXT scrolls that text on purpose, and both of the pane's are
          // written as one: the question Mole Office would ask is a `pre`, and the answer a person
          // pastes back is a `textarea`. Neither is a piece of the pane's layout, and neither can
          // swallow a section of the pane the way the list did. Everything else that scrolls inside
          // the pane is the defect this test is about.
          if (inside.tagName === 'TEXTAREA' || inside.tagName === 'PRE') continue
          const how = getComputedStyle(inside).overflowY
          if (how !== 'auto' && how !== 'scroll' && how !== 'hidden') continue
          if (inside.scrollHeight <= inside.clientHeight) continue
          squeezed.push({
            box: inside.tagName.toLowerCase() + '.' + String(inside.className),
            shows: inside.clientHeight,
            holds: inside.scrollHeight,
          })
        }
        return { rows: pane.querySelectorAll('.px-rev-item').length, squeezed }
      })
      expect(measured.rows, `the pane drew no comments at ${String(width)}, so this measured nothing`).toBeGreaterThan(
        0,
      )
      expect(
        measured.squeezed,
        `at ${String(width)} the pane hides part of itself in a box too short for it: ${JSON.stringify(measured.squeezed)}`,
      ).toEqual([])
    }
    // BACK TO THE SIZE THE REST OF THIS FILE IS WRITTEN FOR.
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
  }, 180_000)

  /**
   * CHANGED 3 SEPTEMBER 2026, criterion A14b, AND THE POINT IT GUARDS DID NOT MOVE.
   *
   * It asserted the pane said *no gist of that record*, because nobody had written a short form of
   * this report at that length and the record's own summary was not one. The summary IS reading
   * length 3 now — a summary is 20 to 60 words — so this record has one and the pane draws it.
   * What is being guarded either way is that the pane never cuts the report to length, and that is
   * what the second half of this case says.
   */
  it('draws the record’s own summary beside the comment, and never a cut of the report', async () => {
    const opened = await column()
    expect(opened, 'the pane does not draw the record’s own summary').toContain(SUMMARY)
    expect(opened, 'the report body was cut and drawn as a gist').not.toContain(
      'The plan table and the Schedule now count the same way',
    )
  }, 60_000)

  /**
   * AND THE OTHER HALF, THROUGH THE ROUTE THE PANE READS RATHER THAN THROUGH THE PANE.
   *
   * `gistBeside` in src/web/components/agent/ReviewBar.tsx draws *no gist of that record* when the
   * row it was handed has `text: null`, and draws the words when it has some. So what decides the
   * mark is this route's answer, and this asserts both answers on two records that differ in one
   * thing: whether somebody wrote a summary.
   *
   * IT IS NOT PRESSED IN THE BROWSER, AND THAT IS SAID RATHER THAN LEFT OUT. The mark is drawn in a
   * step of the pane that the cases above this one walked to by pressing, and it is not where a
   * reload comes back to — measured on 3 September 2026: after a reload the column holds 1,572
   * characters and the word *gist* is in none of them. Taking the summary away and reloading would
   * therefore have measured which step the pane opens at, not what the mark says.
   */
  it('hands the pane no words for a record whose summary nobody wrote', async () => {
    const bare = (await post('/api/records', {
      kind: 'report',
      title: 'A report filed in a hurry with nothing under its name',
      data: { date: '2026-08-18', blocks: [{ id: 'b-1', type: 'text', text: 'One paragraph and no summary.' }] },
    })) as { record: { id: string } }
    const rows = (await post('/api/short-forms/rows', {
      recordIds: [reportId, bare.record.id],
      level: 'gist',
    })) as { rows: { recordId: string; text: string | null; says: string }[] }
    const withOne = rows.rows.find((one) => one.recordId === reportId)
    const without = rows.rows.find((one) => one.recordId === bare.record.id)
    expect(withOne?.text, 'the record with a summary was handed nothing').toBe(SUMMARY)
    expect(without?.text, 'the record with no summary was handed some words').toBeNull()
    expect(without?.says, 'the route says nothing about why there are no words').toContain('has been written for this record')
    expect(without?.says, 'the report was cut to fill the gap').not.toContain('One paragraph and no summary')
  }, 60_000)

  /**
   * THE OTHER WAY TO GET AN ANSWER, AND THE STATE IT LEAVES BEHIND.
   *
   * A run waits for a worker. None is running here, and none may be running on the owner's machine
   * either, so this state has to be drawn honestly rather than as a spinner. It also proves the
   * conversation can be found again: the pane holds no id, and it reads the answer out of the
   * conversation Mole Office named after this review.
   */
  it('asks an agent, makes a run, and says nothing has answered yet', async () => {
    await app.page.setViewportSize({ width: 1440, height: 1000 })
    await app.page.getByRole('button', { name: 'Choose a reader' }).click()
    const reader = app.page.locator('.px-review-contacts .px-talk-contact', { hasText: READER })
    await reader.waitFor({ timeout: 30_000 })
    await reader.click()
    const ask = app.page.getByRole('button', { name: 'Ask them to read these' })
    await ask.waitFor({ timeout: 30_000 })
    await ask.click()

    // A RUN EXISTS. This is the same machinery an ordinary comment to an agent uses.
    await expect
      .poll(
        async () => {
          const runs = (await (await fetch(`${app.api}/api/agent/runs?state=queued`)).json()) as {
            runs: { threadTitle: string }[]
          }
          return runs.runs.filter((one) => one.threadTitle.includes(reviewId)).length
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0)

    // AND THE PANE SAYS SO, AFTER A RELOAD, WITHOUT HOLDING AN ID OF ITS OWN.
    await app.page.reload({ timeout: 60_000 })
    await waitForThePage(app.page, 60_000)
    await app.page.locator('.px-pane-list .px-rev-go').first().waitFor({ timeout: 30_000 })
    await app.page.locator('.px-pane-list .px-rev-go').first().click()
    await app.page.waitForSelector('.px-org', { timeout: 30_000 })
    await expect.poll(column, { timeout: 15_000 }).toContain('No answer yet')
    const said = await column()
    expect(said, 'the pane forgot that anybody had been asked').toContain('No answer yet')
  }, 120_000)

  it('does not scroll the pane sideways at 1440 or 390', async () => {
    // Imported here and not at the top, because the module reads storage, for the reason the first beforeAll gives.
    const { CIRCLES_ATTRIBUTE } = await import('../src/web/components/agent/CommentCircle.tsx')
    for (const width of [1440, 390]) {
      await app.page.setViewportSize({ width, height: 1000 })
      await app.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
      // MEASURED ONCE THE PAGE SAYS ITS COMMENT CIRCLES STAND WHERE THEY GO. Straight after the resize to 390 the
      // window has its width, but the circle still stands where it stood at 1440, its right edge at 1076, so the page
      // is 1076 wide until the circle moves. Alone it moves within the two frames above; at a 1-minute load of 33 to
      // 39 on 20 CPUs it had not. The two frames come first so the page has seen the resize; the circles' own mark is
      // read rather than a longer wait, so a circle placed past the column at 390 is still red below.
      await app.page.waitForFunction((name) => document.documentElement.getAttribute(name) === 'placed', CIRCLES_ATTRIBUTE, { timeout: 30_000 })
      const measured = await app.page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
        blocks: document.querySelectorAll('.px-org').length,
      }))
      expect(measured.blocks, 'the block is not on the page, so this measured nothing').toBeGreaterThan(0)
      expect(measured.scroll, `the page scrolls sideways at ${String(width)}`).toBeLessThanOrEqual(measured.client)
    }
  }, 120_000)
})
