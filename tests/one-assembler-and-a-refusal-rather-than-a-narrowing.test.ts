// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE ASSEMBLER, TWENTY-THREE DISTINCT PARTS, AND A REFUSAL WHERE THERE USED TO BE A NARROWING.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE DEFECTS THIS FILE HOLDS SHUT, ALL MEASURED ON 27 AUGUST 2026
 * ---------------------------------------------------------------------------------------
 *
 * 1. ASKING FOR A PART PANELX DOES NOT HAVE WAS ANSWERED 200.
 *    `GET /api/bundles/preview?preset=continue&slots=plan,schedule,waiting` returned the default
 *    reading with nothing in the reply saying the request had been narrowed. A caller that asked
 *    for the Plan was told yes and handed something else, which CLAUDE.md forbids by name.
 *
 * 2. A LIST OF PARTS WAS IGNORED ON FIVE OF THE SIX PRESETS AND ECHOED BACK ANYWAY.
 *    `?preset=continue&slots=objective` produced 10,968 bytes and `?preset=custom&slots=objective`
 *    produced 4,357, and both replies claimed `slots: ["objective"]`.
 *
 * 3. SIX DECLARED PARTS PRINTED FOUR SECTIONS, because two pairs were the same branch of the
 *    renderer. Asking for what was tried printed what was open.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT MAKES EACH TEST A TEST
 * ---------------------------------------------------------------------------------------
 *
 * Each block below states the mutation that turns it red, so a later reader can check the
 * assertion is load-bearing rather than incidental. The first test of the file is the CONTROL: an
 * ordinary request that must succeed, because a suite where every assertion is a refusal passes
 * just as well when nothing runs at all.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { nowStamp } from '@shared/time.ts'
import type { FastifyInstance } from 'fastify'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { BUNDLE_PRESETS, SCOPE_NAMES, SCOPES, sharesOf, type ScopeName } from '../src/shared/bundles.ts'
import { createI18n } from '../src/shared/i18n.ts'

/**
 * EACH CASE GETS ITS OWN PROJECT, so the copy a case asks for holds only the records that case filed.
 * The presets below read the whole project, and a project per case is what keeps one case's records
 * out of another's answer.
 */
let WORKSPACE = 'default'
const AS_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
function person(): Record<string, string> {
  return { ...AS_PERSON, 'x-mole-office-workspace': WORKSPACE }
}

let t: TestDb
const en = createI18n('en')
let app: FastifyInstance
let caseNumber = 0

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

beforeEach(async () => {
  caseNumber += 1
  WORKSPACE = `assembler-case-${String(caseNumber)}`
  const made = await app.inject({
    method: 'POST',
    url: '/api/workspaces',
    payload: { id: WORKSPACE, title: `Assembler case ${String(caseNumber)}` },
  })
  expect(made.statusCode, made.body).toBe(201)
})

interface Part {
  name: string
  label: string
  reader: string | null
  answered: boolean
  why?: string
  says: string
  carried: number
  considered: number
  bytes: number
}
interface Preview {
  text: string
  parts: Part[]
  carried: { recordId: string }[]
  bytes: number
  fits: boolean
}

async function post(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'POST', url, payload: payload as object, headers: person() })
  return { status: res.statusCode, body: res.json() }
}
async function get(url: string): Promise<{ status: number; body: any }> {
  const res = await app.inject({ method: 'GET', url, headers: person() })
  return { status: res.statusCode, body: res.statusCode < 500 ? res.json() : null }
}
async function preview(query: string): Promise<Preview> {
  const res = await get(`/api/bundles/preview?${query}`)
  expect(res.status, JSON.stringify(res.body)).toBe(200)
  return res.body as Preview
}
async function file(kind: string, title: string, data: unknown): Promise<string> {
  const made = await post('/api/records', { kind, title, data })
  expect(made.status, `${kind} "${title}": ${JSON.stringify(made.body)}`).toBe(201)
  return made.body.record.id as string
}
async function link(fromId: string, toId: string, type: string): Promise<void> {
  expect((await post('/api/links', { fromId, toId, type })).status).toBe(201)
}

// ============================================================================== the control

describe('the control: an ordinary request is answered', () => {
  it('assembles the parts a preset names, and says which reader answered each', async () => {
    await file('problem', 'The far edge of the tray is not segmented', { symptom: 'It drops it.', state: 'open' })
    const reply = await preview('preset=recover_project')
    expect(reply.parts.map((p) => p.name)).toEqual([...BUNDLE_PRESETS.recover_project.slots])
    // EVERY PART SAYS WHAT ANSWERED IT, or says nothing could. There is no third state.
    for (const part of reply.parts) {
      if (part.answered) expect(part.reader, part.name).not.toBeNull()
      else expect(part.why, part.name).toBeDefined()
    }
  })
})

// ============================================================== a refusal, not a silent narrowing

describe('asking for something Mole Office cannot give is refused', () => {
  /** Mutation: filter unknown names out of the array in `whyTheseSlotsCannotBeUsed`. */
  it('refuses a part it has no name for, and names both the part and the ones it has', async () => {
    const res = await get('/api/bundles/preview?preset=custom&slots=plan,waiting,nonsense')
    expect(res.status).toBe(400)
    const said = String(res.body.error ?? res.body.message)
    expect(said, 'the refusal must name what was not understood').toContain('"waiting"')
    expect(said).toContain('"nonsense"')
    // AND THE ONES IT DOES HAVE, because a refusal that does not say what to send instead is a
    // dead end. The caller asked for the Plan and the Plan exists.
    expect(said).toContain('plan')
    expect(said).toContain('schedule')
    expect(said).toContain('waitingOnYou')
  })

  /**
   * Mutation: put `.min(1)` back on `slots` in `askQuery`, `src/server/api/bundle.ts`.
   *
   * NAMING NO PART IS A THING A CALLER CAN DO, and the answer has to say what is wrong with the
   * request rather than what is wrong with the query string. With `.min(1)` the door answered a zod
   * complaint about a string being too short, which does not tell anybody the copy would be empty.
   */
  it('refuses an empty list of parts with the reason, not with the shape of the query string', async () => {
    const res = await get('/api/bundles/preview?preset=custom&slots=')
    expect(res.status).toBe(400)
    const said = String(res.body.error ?? res.body.message)
    expect(said, 'the refusal must say the copy would have nothing in it').toContain(en.t('g7a.bundles.choosePart', { preset: BUNDLE_PRESETS.custom.word }))
    expect(said, 'a complaint about the query string is not an answer').not.toContain('too small')
    // AND IT DOES NOT DUMP THE PART NAMES. This is the one refusal a person reaches by pressing a
    // button, and the page they are on already names every part in plain words.
    expect(said, 'machine part names must not be listed on a screen a person reads').not.toContain('openLoops')
  })

  /** Mutation: return `null` from `whyTheseSlotsCannotBeUsed` when the preset is not `custom`. */
  it('refuses a list of parts sent beside a preset that is its own list', async () => {
    const res = await get('/api/bundles/preview?preset=continue&slots=objective')
    expect(res.status).toBe(400)
    const said = String(res.body.error ?? res.body.message)
    expect(said).toContain('Choose what goes in')
  })

  /**
   * THE SAME LIST MUST NOT PRODUCE TWO ANSWERS. This is the measured defect in its own words: one
   * `slots=objective` produced 10,968 bytes and the other 4,357, and both claimed the same list.
   *
   * Mutation: make `specFromQuery` drop the refusal and keep the old filter.
   */
  it('never answers one list of parts two ways', async () => {
    await file('problem', 'Something is open', { symptom: 'x', state: 'open' })
    const asCustom = await preview('preset=custom&slots=objective')
    const asContinue = await get('/api/bundles/preview?preset=continue&slots=objective')
    expect(asContinue.status, 'the second door must not answer where the first refuses').toBe(400)
    expect(asCustom.parts.map((p) => p.name)).toEqual(['objective'])
  })

  /** Mutation: fall back to `continue` for an unknown stored preset, as `specOf` used to. */
  it('refuses a stored bundle whose preset Mole Office has never heard of, rather than making a different one', async () => {
    const bundle = await file('context_bundle', 'A bundle stored with a preset from the future', {
      scope: 'project',
      preset: 'continue',
    })
    // Written past the create door on purpose: the point is a row that is already in the database.
    t.client.sqlite
      .prepare("UPDATE records SET data = json_set(data, '$.preset', 'from_the_future') WHERE id = ?")
      .run(bundle)
    const res = await post('/api/bundles/export', { bundleId: bundle })
    expect(res.status).toBe(422)
    expect(String(res.body.error ?? res.body.message)).toContain('from_the_future')
    // AND THE LIST STILL DRAWS THE ROW, saying what it could not read. A row that vanished would
    // tell the person a bundle they filed is gone.
    const listed = await get('/api/bundles')
    expect(listed.status).toBe(200)
    const row = listed.body.bundles.find((one: { id: string }) => one.id === bundle)
    expect(row.spec).toBeNull()
    expect(String(row.unreadable)).toContain('from_the_future')
  })
})

// ============================================================ every part is a different part

describe('the six parts that used to be two pairs of aliases are six different parts', () => {
  /**
   * Mutation: put `whatWasTried` back on the same branch as `openLoops` in `READERS`.
   *
   * THE FIXTURE IS THE POINT. One problem is open with two recorded attempts and one is open with
   * none, so "what is open" and "what was tried" have to disagree about the second one.
   */
  it('tells what is open from what has already been tried', async () => {
    await file('problem', 'The gripper drops the tray on the third cycle', {
      symptom: 'It drops it.',
      state: 'open',
      attempts: [
        {
          id: 'a-more-force',
          tried: 'Raised the grip force to 40 newtons.',
          result: 'It crushed the lip of the tray.',
          failed_because: 'The lip is 0.4 mm and it folds above 35 newtons.',
          do_not_repeat: 'grip force above 35 newtons',
        },
      ],
    })
    await file('problem', 'Nobody has tried anything on this one', { symptom: 'y', state: 'open' })
    const both = await preview('preset=custom&slots=openLoops,whatWasTried')
    const open = both.parts.find((p) => p.name === 'openLoops')
    const tried = both.parts.find((p) => p.name === 'whatWasTried')
    expect(open?.carried).toBe(2)
    expect(tried?.carried, 'only one of the two problems has an attempt on it').toBe(1)
    expect(both.text).toContain('do not repeat: grip force above 35 newtons')
    expect(both.text).toContain(SCOPES.openLoops.heading)
    expect(both.text).toContain(SCOPES.whatWasTried.heading)
  })

  /** Mutation: put `howItStands` back on the same branch as `importantContext`. */
  it('tells where the work stopped from what is linked to the subject', async () => {
    const module = await file('module', 'Wrist camera intake', { context: 'Where frames enter.' })
    const near = await file('note', 'A note beside it', {})
    await link(near, module, 'about')
    await file('stopping_point', 'Stopped halfway through the calibration', {
      doing: 'Calibrating the wrist camera',
      failed: 'The checkerboard would not resolve at 2 metres',
      remains: 'The last four poses',
    })
    const reply = await preview(`scope=${module}&preset=custom&slots=howItStands,importantContext`)
    const stood = reply.parts.find((p) => p.name === 'howItStands')
    const around = reply.parts.find((p) => p.name === 'importantContext')
    expect(stood?.carried).toBe(1)
    expect(around?.carried).toBe(1)
    expect(reply.text).toContain('what failed: The checkerboard would not resolve at 2 metres')
    expect(reply.text).toContain('A note beside it')
  })

  /**
   * Mutation: delete an entry from `READERS` in continuation.ts — which does not compile, which is
   * the point — or add a name to `SCOPES` and not to `READERS`.
   *
   * THIS IS THE SWEEP, and it is what makes the two blocks above more than two examples: every
   * declared part is asked for, and every one either names a reader or says nothing can answer it.
   */
  it('answers every declared part, each naming its reader or saying nothing can answer it', async () => {
    await file('problem', 'Something is open', { symptom: 'x', state: 'open' })
    const reply = await preview(`preset=custom&slots=${SCOPE_NAMES.join(',')}`)
    expect(reply.parts.map((p) => p.name).sort()).toEqual([...SCOPE_NAMES].sort())
    for (const part of reply.parts) {
      expect(part.label, part.name).toBe(SCOPES[part.name as ScopeName].label)
      expect(reply.text, `${part.name} has no heading in the text`).toContain(SCOPES[part.name as ScopeName].heading)
      expect(part.says.length, `${part.name} says nothing about what it carried`).toBeGreaterThan(20)
      if (part.answered && part.name === 'schedule') {
        expect(part.reader, part.name).toBe('the planned hours for today, this week and this month')
      } else if (part.answered) {
        expect(part.reader, part.name).toMatch(/\(src\/server\/lib\/.+\.ts\)$/)
      }
      else expect(['nothing-computes-it', 'about-one-record', 'no-agent-named']).toContain(part.why)
    }
  })
})

// ================================================== the three a bundle may not carry

describe('the Plan, the Schedule and the Waiting-on-you queue reach the text', () => {
  /** Mutation: drop `plan`, `schedule` or `waitingOnYou` from `READERS` and from `SCOPES`. */
  it('carries a plan line, an hour on the schedule and a fork, in the text a person copies', async () => {
    const plan = await post('/api/plans', { title: 'What August is for' })
    expect(plan.status, JSON.stringify(plan.body)).toBe(201)
    const planId = plan.body.plan.id as string
    const wrote = await app.inject({
      method: 'PUT',
      url: `/api/plans/${planId}/body`,
      payload: { body: 'Re-run the segmentation on the near tray' },
      headers: person(),
    })
    expect(wrote.statusCode, wrote.body).toBeLessThan(300)

    const task = await file('task', 'Re-run the segmentation on the near tray', { state: 'doing' })
    const hours = await post('/api/planning/allocations', {
      horizon: 'day',
      // The local day, not the UTC one. Mole Office days are local wall clock with one reader and one
      // writer, both in src/shared/time.ts, and `toISOString()` is neither. With a UTC date this
      // line filed the hours against yesterday whenever the two dates differ, so the assertion
      // below found no hours and the file was red for one hour every night.
      period: nowStamp().slice(0, 10),
      recordId: task,
      plannedHours: 3,
    })
    expect(hours.status, JSON.stringify(hours.body)).toBeLessThan(300)

    await file('proposal', 'Should the tray be re-textured or replaced?', {
      question: 'Should the tray be re-textured or replaced?',
      options: ['Re-texture the pads.', 'Replace the tray.'],
      recommendation: 'Re-texture the pads.',
      evidence: ['The pads were measured at 0.3 mm on 26 August 2026.'],
    })

    const reply = await preview('preset=owner_governance')
    expect(reply.text).toContain('Re-run the segmentation on the near tray')
    expect(reply.text).toContain('3 hour(s) planned')
    expect(reply.text).toContain('Should the tray be re-textured or replaced?')
    expect(reply.text).toContain('one answer: Replace the tray.')
    const { COPY_SAYS } = await import('../src/server/lib/continuation.ts')
    expect(reply.text).toContain(COPY_SAYS.recommended('Re-texture the pads.'))
    expect(reply.text).toContain('already observed: The pads were measured at 0.3 mm on 26 August 2026.')
    expect(reply.text).toContain('it is holding nothing up')
  })

  /**
   * Mutation: leave `evidence`, `resultWillBeUsedTo` or the duplicate sentence out of the fork
   * entry in `READERS.waitingOnYou`.
   *
   * A FORK THAT LEFT THE QUEUE IS SAID SO WHERE IT IS SAID AT ALL. The owner's §13 asks for the duplicate
   * and supersession state on the queue index, and that fact is `readForks().leftTheQueue`.
   */
  it('says when a fork has been superseded, on the fork itself', async () => {
    const older = await file('proposal', 'The first way of asking it', {
      question: 'Which way round?',
      options: ['a', 'b'],
    })
    const newer = await file('proposal', 'The way it is asked now', { question: 'Which way round?', options: ['a', 'b'] })
    await link(newer, older, 'supersedes')
    const reply = await preview('preset=owner_governance')
    // The superseded one is off the queue, and the queue is not silent about where it went.
    expect(reply.text).toContain('The way it is asked now')
    const said = reply.parts.find((p) => p.name === 'waitingOnYou')?.says ?? ''
    expect(said).toContain('1 thing only a person can do')
  })
})

// ============================================================================ semantic zoom

describe('a part that does not fit its share says what it left out and how much', () => {
  /**
   * Mutation: in `fitOnePart`, drop the members that do not fit without adding the sentence, or
   * split the sentence so the cut is reported apart from what was carried.
   *
   * IT USED TO ASSERT THE DROPPED IDS WERE IN THAT SENTENCE, and that was the defect problem
   * `F2NxzxAnRkb2` names: a copy under budget was up to 49.7% record ids with nothing beside them.
   * The sentence still carries both facts — what was carried and how many were left out — and what
   * was left out is NAMED now, with its title and kind, where there is room. At the 900 bytes this
   * case asks for there is no room even for the names, so the sentence says that instead, which is
   * the honest answer and is asserted below. The other branch, where the names do fit, is in
   * tests/a-copy-under-budget-is-not-a-list-of-ids.test.ts, which has a corpus big enough to show
   * both.
   */
  it('says what it carried and what it dropped in one sentence, and names no id alone', async () => {
    const ids: string[] = []
    for (let i = 0; i < 12; i += 1) {
      ids.push(
        await file('proposal', `A fork with a title long enough to cost real bytes, number ${String(i)}`, {
          question: `Question ${String(i)}, written at the length the real corpus writes them at, so the cut happens.`,
          options: ['The first defensible answer, at length.', 'The second defensible answer, at length.'],
        }),
      )
    }
    const reply = await preview('preset=custom&slots=waitingOnYou&budgetBytes=900')
    const part = reply.parts.find((p) => p.name === 'waitingOnYou')
    expect(part?.carried, 'the budget must actually bite, or this test asserts nothing').toBeLessThan(12)
    expect(part?.considered).toBe(12)
    // ONE SENTENCE, BOTH FACTS. Never a bare count, and never the count without an account of what
    // it stands for.
    expect(part?.says).toContain('This text carries')
    expect(part?.says).toContain('leaves out')
    expect(reply.text).toContain(part?.says ?? '\0')

    // AND IT NAMES THE ONES IT DROPPED, which is what criterion B13 asked for and what this case
    // used to assert the absence of.
    //
    // IT ASSERTED `no room even for their names` UNTIL 7 SEPTEMBER 2026, AND THAT WAS A DEFECT
    // PINNED AS A FEATURE. A part filled its share with entries and then handed the naming step
    // whatever was left, which is by construction less than one entry's cost — so the branch that
    // names a dropped record could never run, and every part over its size printed that sentence.
    // Problem `tOODHtWe78qg`. A third of the share is reserved for the names now, and only when
    // something is actually dropped, so the sentence a reader gets is the names.
    expect(part?.says).toContain('are named below')
    expect(reply.text).toContain('What was left out, by name:')

    // NO ID STANDS ALONE ANYWHERE IN THE TEXT. The forks this copy DID carry name their ids, and
    // every one of those is on a line that also carries the fork's own words.
    for (const id of ids) {
      const line = String(reply.text).split('\n').find((one) => one.includes(id))
      if (line === undefined) continue
      expect(line.replaceAll(id, '').trim().length, `${id} is printed with nothing beside it`).toBeGreaterThan(10)
    }
  })

  /** Mutation: let a part spend another part's unspent share. */
  it('gives each part the share its preset declares, and lends none of it', async () => {
    const spec = { scope: { kind: 'project' as const }, preset: 'owner_governance' as const, budgetBytes: 96 * 1024 }
    const shares = sharesOf(spec)
    expect([...shares.keys()]).toEqual([...BUNDLE_PRESETS.owner_governance.slots])
    // Twelve eighteenths of the whole, from the declared weights, and nothing from what was found.
    expect(shares.get('waitingOnYou')).toBe(Math.floor((96 * 1024 * 12) / 18))
    expect(shares.get('schedule')).toBe(Math.floor((96 * 1024 * 1) / 18))
    const total = [...shares.values()].reduce((sum, one) => sum + one, 0)
    expect(total, 'the shares may come to less than the whole and must never come to more').toBeLessThanOrEqual(96 * 1024)
  })
})

// ============================================================== the limit goes beside the right record

describe('a limit is printed beside the record it reaches, from the reader that answers that', () => {
  /**
   * Mutation: put the old rule back — attach the limit to the anchor when the restriction record is
   * not itself carried.
   *
   * THE FIXTURE IS BUILT SO THE OLD RULE WOULD BE WRONG. The anchor is a module, the placeholder is
   * about a PROBLEM linked to it, and the problem is not the first record in the carried list. The
   * old code attached it to the anchor, so the module's own entry claimed a limit that reaches the
   * problem.
   */
  it('puts it under the problem it is about and not under the module that is the subject', async () => {
    const module = await file('module', 'Wrist camera intake', { context: 'Where frames enter.' })
    const problem = await file('problem', 'The far edge of the tray is not segmented', { symptom: 'It drops it.', state: 'open' })
    await link(problem, module, 'about')
    const placeholder = await file('placeholder', 'The tray depth is a guess', {
      what: 'Nobody has measured the tray.',
      slot: 'stand_in',
      substitute: '40 mm, guessed',
      resolved_when: 'Somebody measures it.',
      allowed_uses: ['plumbing'],
      disallowed_claims: ['any claim about reach'],
      severity: 'stops_final',
    })
    await link(placeholder, problem, 'about')

    const reply = await preview(`scope=${module}&preset=custom&slots=objective,openLoops,validityLimits`)
    const lines = reply.text.split('\n')
    const limitAt = lines.findIndex((one) => one.includes('LIMIT — The tray depth is a guess'))
    expect(limitAt, 'the limit must be printed inline somewhere').toBeGreaterThan(-1)
    // AN ENTRY STARTS AT THE LEFT MARGIN AND ITS OWN LINES ARE INDENTED, so the entry a line rides
    // inside is the nearest unindented line above it.
    const owner =
      lines
        .slice(0, limitAt)
        .reverse()
        .find((one) => one.trim() !== '' && !one.startsWith(' ')) ?? ''
    expect(owner, 'the limit rides inside the entry of the record it reaches').toContain(
      'The far edge of the tray is not segmented',
    )
    expect(owner).not.toContain('Wrist camera intake')
  })
})

// ================================================== a question that stopped being the owner's to answer

/**
 * WHETHER SOMETHING HAS REPLACED A FORK OR ASKED IT TWICE, WHICH THE OWNER'S §13 LIST ASKS FOR.
 *
 * THE FIRST BUILD PUT IT ON THE WRONG OBJECT AND THE BRANCH COULD NEVER RUN. It looked each open
 * fork up in `readForks().leftTheQueue`, but `readForks` takes a superseded or duplicate fork OUT
 * of `open` and puts it in that list — `src/server/lib/forks.ts:609-626` — so the lookup missed
 * every time. The pack claimed a fact the owner's brief asked for and printed it never.
 *
 * Both tests below carry the mutation that turns them red.
 */
describe('the copy says which questions left the queue without being answered', () => {
  /** Mutation: delete the `leftOut` block from the `waitingOnYou` reader in `continuation.ts`. */
  it('names the superseded fork and what replaced it, in the copy itself', async () => {
    const old = await file('proposal', 'Is a module card a boundary', {
      question: 'Is a module card a boundary?',
      options: ['a — yes', 'b — no'],
    })
    const fresh = await file('proposal', 'The module-label question, untangled', {
      question: 'What does a module label mean on its own?',
      options: ['a — one thing', 'b — the other'],
    })
    await link(fresh, old, 'supersedes')

    const reply = await preview('preset=owner_governance')
    const part = reply.parts.find((p) => p.name === 'waitingOnYou')
    // THE CONTROL FOR THIS ROW: the fork that replaced it is still waiting and is carried whole.
    expect(part?.carried, 'only the live question is waiting on anybody').toBe(1)
    expect(reply.text).toContain(fresh)

    // AND THE ONE THAT LEFT IS NAMED, WITH THE READER'S OWN SENTENCE, rather than vanishing.
    expect(reply.text, 'a fork that left the queue must not vanish from the copy').toContain(old)
    expect(reply.text).toContain('left this queue without being answered')
    expect(reply.text, "the reader's own account of why it left").toContain('replaced it')
    // IT IS NOT COUNTED AMONG WHAT IS WAITING. Nobody has to answer it.
    expect(part?.says).toContain('1 thing only a person can do')
  })

  /**
   * Mutation: drop `.filter((one) => one.workspaceId === ask.workspaceId)` from `left` in the
   * `waitingOnYou` reader. `readForks` reads by kind ACROSS PROJECTS and says so in its own
   * comment, so an unnarrowed list puts another project's question into this project's copy.
   */
  it('names only the ones that left THIS project, because the reader reads every project', async () => {
    const mine = await file('proposal', 'A question of mine', { question: 'Mine?', options: ['a — yes', 'b — no'] })
    const replacing = await file('proposal', 'The question of mine, asked better', {
      question: 'Mine, asked better?',
      options: ['a — yes', 'b — no'],
    })
    await link(replacing, mine, 'supersedes')

    // THE SAME SHAPE IN ANOTHER PROJECT, written straight through the records api so this project's
    // door is not involved at all.
    const workspaces = await import('../src/server/lib/workspaces.ts')
    const elsewhere = `${WORKSPACE}-elsewhere`
    workspaces.createWorkspace({ id: elsewhere, title: 'Elsewhere', note: 'another project' })
    const AGENT = { type: 'agent' as const, id: 'claude-code', stated: true }
    const theirs = t.api.createRecord({
      workspaceId: elsewhere,
      kind: 'proposal',
      title: 'A question of theirs',
      data: { question: 'Theirs?', options: ['a — yes', 'b — no'] },
      actor: AGENT,
    }).id
    const theirReplacement = t.api.createRecord({
      workspaceId: elsewhere,
      kind: 'proposal',
      title: 'The question of theirs, asked better',
      data: { question: 'Theirs, asked better?', options: ['a — yes', 'b — no'] },
      actor: AGENT,
    }).id
    // THE PERSON MAKES THE LINK. From 27 August 2026 a `supersedes` onto a fork nobody has
    // classified is refused to an agent — an unclassified fork is the person's, and taking one off
    // the queue is the person's act. This test is about which PROJECT a superseded fork is reported in, so
    // who made the link is incidental to it; what matters is that the link exists.
    const PERSON = { type: 'human' as const, id: THE_TEST_OFFICES_OWNER.id, stated: true }
    t.api.createLink({ fromId: theirReplacement, toId: theirs, type: 'supersedes', actor: PERSON })

    const reply = await preview('preset=owner_governance')
    expect(reply.text, "this project's own superseded question is named").toContain(mine)
    expect(reply.text, "another project's question must not reach this copy").not.toContain(theirs)
    expect(reply.text).not.toContain('A question of theirs')
    expect(reply.text).toContain('1: question(s) left this queue')
  })
})
