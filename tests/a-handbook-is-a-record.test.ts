// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A HANDBOOK IS A RECORD, SENT TO WHOEVER STARTS ITS FLOW OR TAKES ITS CARD.
 *
 * The kind `handbook` (src/shared/handbooks.ts, src/server/lib/handbooks.ts) holds guidance for whoever starts a flow
 * or takes a role card: whom it is for, where it stands, its text in one or more languages, the places it hangs on,
 * and why each change to its text was made. Who wrote each version, and when, is the revision ledger's.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE MEASURES, THROUGH THE REAL DOORS, in a test office. Every record and text here is made up.
 * ---------------------------------------------------------------------------------------
 *
 *   a. A handbook is filed and its text is changed. Both versions are kept in the ledger, each with who wrote it, when,
 *      and the change record's why. A text change that adds no entry, or names other languages, or removes an earlier
 *      entry, is refused and writes nothing, and so is a place that is not there.
 *   b. A run that names a flow, and an agent that enters a flow by its door, get the in-use handbooks on the flow and on
 *      its steps in one message from the office, in the agent's language, with the reason, once for that start. A
 *      later change of the run sends nothing, and a new start sends them again.
 *   c. An agent that takes a role card, on registration or by a later grant, gets the in-use handbooks on that card in
 *      the card message, after the card's own handbook, in its language, with the reason.
 *   d. A flow or a card with no handbook in use behaves as before: the run's answer, the enter door's answer and the
 *      card message are what they were, and no message is added. A draft or a retired handbook is not sent.
 *   e. An agent's handbook on a role card, with no warrant, is refused with the card rule's own words and writes
 *      nothing: on filing, on a change of an in-use one's text, on putting one in use, and on bringing a deleted one
 *      back. The same handbook on a flow is filed. The person needs no warrant, and an agent with a warrant that a
 *      decision of the owner's rests on is let through.
 *   f. A flow's read, which its page draws, lists every live handbook on the flow or on its steps, in any state, with its
 *      languages and where on the flow it hangs. A deleted one is not listed, and a flow with none lists none.
 *   g. An in-use handbook with no text is sent saying it holds none, with no writer, reason or language for a text it
 *      does not have. One whose "for" is left out, or is blank, is sent as nobody having recorded whom it is for. The
 *      door refuses a blank "for", so the blank one is written straight into this test's own database.
 *   h. A handbook goes by the one language rule to a reader of English, which is its own language; to a reader whose
 *      language nobody gave, in every language it is written in; and to a reader of a language it is not written in,
 *      in English, or in every language when it is not written in English either. Each part says which and why. A
 *      card's own handbook found in neither language stops the card message, naming the card and what was found.
 *
 * Every sentence the office says is read from where the code builds it, HANDBOOK_SAYS in src/server/lib/handbooks.ts,
 * so a change of the words does not turn this red, and a sentence built from the wrong facts does.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, WITH A CONTROL RUN FIRST
 * ---------------------------------------------------------------------------------------
 *
 *   1. records.ts, `createRecordWithReport`: do not ask `checkAHandbookWrite` → a's place case and e's filing case red.
 *   2. records.ts, `patchRecord`: do not ask `checkAHandbookWrite` → a's refusal case red, and e's second case, whose
 *      changes meet the card rule through the same check.
 *   3. handbooks.ts, `checkTheCardRule`: return at once → e's filing case and e's second case red.
 *   4. records.ts, `restoreRecord`: do not ask `checkAHandbookBroughtBack` → e's second case red, at bringing it back.
 *   5. flow-runs.ts, `fileTheFlowRunOf`: never send the handbooks → b's run case red.
 *   6. entered-flows.ts, `enterAFlow`: never send the handbooks → b's enter case red.
 *   7. handbooks.ts, `sendTheHandbooksOfAFlowStart`: read no language for the agent → both of b's cases red (each
 *      reader gets every language).
 *   8. cardmessage.ts, `writeTheCardMessageToOne`: leave out the handbooks on the card → both of c's cases red.
 *   9. handbooks.ts, `theHandbooksInUse`: keep a handbook in any state → b's run case and both of d's cases red (a
 *      draft and a retired one are sent).
 *  10. flows.ts, `readOneFlow`: answer no handbooks → f red.
 *  11. handbooks.ts, `theHandbooksOnAFlow`: keep a place on any flow → f red (the other flows' handbooks are listed).
 *  12. handbooks.ts, `theHandbookPart`: send a handbook with no text as one with text → g red.
 *  13. src/shared/handbooks.ts, `theForOf`: keep a blank "for" → g red.
 *  14. handbooks.ts, `theHandbookPart`: leave out the "for" line when nobody recorded it → g red.
 *  15. src/shared/handbooks.ts, `theLanguagesToSend`: read a reader whose language nobody gave as a reader of English →
 *      h's case of that reader red, and its card case, whose card then stops for a reader with no language too.
 *  16. src/shared/handbooks.ts, `theLanguagesToSend`: never take English as the reader's own → h's English case red.
 *  17. src/shared/handbooks.ts, `theLanguagesToSend`: say a text in neither language went in every language because
 *      nobody gave one → h's English case, its case of neither, and its card case red.
 *  18. cardmessage.ts, `theHandbookPartFor`: do not stop on "neither" → h's card case red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance, InjectOptions } from 'fastify'

import { apiApp, freshDb, theAnswerToAWriteInATestOffice, type TestDb, governsTheWholeProject } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { SYSTEM_LINES } from '../src/shared/groups.ts'
import { createI18n } from '../src/shared/i18n.ts'
import type { RoleCard } from '../src/shared/roles.ts'

let t: TestDb
let app: FastifyInstance

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

const asAgent = (handle: string, run?: string): Record<string, string> => ({
  ...AS_THE_PERSON,
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': handle,
  ...(run === undefined ? {} : { 'x-mole-office-session': run }),
})

/** The agent that writes handbooks here, registered by the person with the worker card. */
const THE_WRITER = 'hb-writer'

/** The builders of the office's words about a handbook, as src/server/lib/handbooks.ts exports them in HANDBOOK_SAYS. */
interface TheHandbookWords {
  anEarlierEntryChanged(held: number): string
  anEntryWithNoTextChange(): string
  notExactlyOneEntry(changed: readonly string[], gained: number): string
  otherLanguagesNamed(at: number, named: readonly string[], changed: readonly string[]): string
  noRoleCard(card: string): string
  noLiveFlow(flow: string): string
  noStep(flow: string, step: number): string
  theActOnACard(act: 'create' | 'change' | 'restore', subject: string, cards: readonly string[]): string
  heading(title: string, id: string, version: number | null): string
  forWhom(who: string | null): string
  youHaveIt(because: string): string
  onTheCard(card: string): string
  onTheFlowStarted(onTheFlow: boolean, steps: readonly number[]): string
  noText(): string
  theLanguages(sent: { languages: string[]; why: 'theirs' | 'english' | 'unknown' | 'neither' }, reads: string | null): string
}
const THE_WORDS_READ = [
  'anEarlierEntryChanged',
  'anEntryWithNoTextChange',
  'notExactlyOneEntry',
  'otherLanguagesNamed',
  'noRoleCard',
  'noLiveFlow',
  'noStep',
  'theActOnACard',
  'heading',
  'forWhom',
  'youHaveIt',
  'onTheCard',
  'onTheFlowStarted',
  'noText',
  'theLanguages',
] as const satisfies readonly (keyof TheHandbookWords)[]
let SAYS: TheHandbookWords

/**
 * READ HANDBOOK_SAYS AFTER THE SERVER IS UP, because `freshDb` resets the modules and the server's own copy is the one
 * imported after it. It is read by name, so this file says which builder is missing rather than failing to load.
 */
async function theHandbookWords(): Promise<TheHandbookWords> {
  const lib: object = await import('../src/server/lib/handbooks.ts')
  const says: unknown = Reflect.get(lib, 'HANDBOOK_SAYS')
  if (typeof says !== 'object' || says === null) throw new Error('src/server/lib/handbooks.ts exports no HANDBOOK_SAYS, so the words this file checks cannot be read.')
  const missing = THE_WORDS_READ.filter((key) => typeof Reflect.get(says, key) !== 'function')
  if (missing.length > 0) throw new Error(`src/server/lib/handbooks.ts exports no HANDBOOK_SAYS.${missing.join(', HANDBOOK_SAYS.')}.`)
  return says as TheHandbookWords
}

/** A request through the server, with its status, its parsed body, the body as sent, and a refusal's own words. */
async function inject(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  payload?: InjectOptions['payload'],
  headers: Record<string, string> = AS_THE_PERSON,
): Promise<{ status: number; json: Record<string, unknown>; text: string; error: string }> {
  // A REQUEST WITH NO BODY SAYS NO CONTENT TYPE, because a JSON content type with an empty body is refused.
  const { 'content-type': contentType, ...withoutABody } = headers
  const options: InjectOptions = { method, url, headers: payload === undefined ? withoutABody : { ...withoutABody, 'content-type': contentType ?? 'application/json' } }
  if (payload !== undefined) options.payload = payload
  const reply = await app.inject(options)
  let json: Record<string, unknown> = {}
  try {
    json = reply.json() as Record<string, unknown>
  } catch {
    json = {}
  }
  return { status: reply.statusCode, json, text: reply.body, error: String(json['error'] ?? '') }
}

/** File a record and answer its id. */
async function file(kind: string, title: string, data: Record<string, unknown>, headers: Record<string, string> = AS_THE_PERSON): Promise<string> {
  const made = await inject('POST', '/api/records', { kind, title, data }, headers)
  expect(made.status, made.text).toBe(theAnswerToAWriteInATestOffice(headers, { kind, data }))
  return String((made.json['record'] as { id: string }).id)
}

/** Register an agent through the starter door, as the person. */
async function register(handle: string, role: string, language?: 'en' | 'zh' | 'el'): Promise<void> {
  const done = await inject('POST', '/api/agents/started', { handle, name: handle, role, ...(language === undefined ? {} : { language }) })
  expect(done.status, done.text).toBe(201)
}

/** A made-up flow of two steps, each with its reason and source. */
async function aFlow(title: string): Promise<string> {
  const source = await file('report', `MADE-UP source for ${title}`, { blocks: [] })
  const step = (n: number) => ({ n, does: `MADE-UP step ${n}.`, evidence: 'a made-up commit', why: 'Without it the made-up work is not done.', sources: [source] })
  return file('flow', title, {
    declared_in: 'a made-up flow of this test',
    runs: 'a made-up worker',
    trigger: 'A made-up piece of work is asked for.',
    stages: [step(1), step(2)],
    leaves_behind: 'a made-up commit',
    governed_by: 'this test file',
    reviewed_at: '2026-11-07',
  })
}

type Place = { flow: string; step?: number } | { card: string } | { project: string }

/** A handbook's data, with one entry in its change record naming every language it is written in. */
function aHandbook(state: string, text: Record<string, string>, hangsOn: Place[]): Record<string, unknown> {
  return {
    for: 'The made-up agent of this test.',
    state,
    text: Object.fromEntries(Object.entries(text).map(([language, opening]) => [language, { opening }])),
    hangs_on: hangsOn,
    text_changes: [{ languages: Object.keys(text).sort(), why: 'MADE-UP: the first text.' }],
  }
}

interface AMessage {
  id: string
  body: string
  saidInFull: string
  extra: Record<string, unknown>
}

/** Every message waiting for the agent, through the waiter's own door, oldest first. */
async function messagesFor(handle: string): Promise<AMessage[]> {
  const waiting = await inject('GET', `/api/handles/${handle}/waiting`)
  expect(waiting.status, waiting.text).toBe(200)
  const out: AMessage[] = []
  for (const one of (waiting.json as { waiting: { messageId: string }[] }).waiting) {
    const reply = await inject('GET', `/api/records/${one.messageId}`)
    expect(reply.status, reply.text).toBe(200)
    const data = (reply.json['record'] as { data: Record<string, unknown> }).data
    out.push({ id: one.messageId, body: String(data['body']), saidInFull: String(data['saidInFull'] ?? ''), extra: (data['extra'] ?? {}) as Record<string, unknown> })
  }
  return out
}

/** The messages that carried handbook records, by the mark each one holds. */
const withHandbooks = (messages: readonly AMessage[]): AMessage[] => messages.filter((one) => one.extra['handbooksSent'] !== undefined)

/** The card message an agent holds: the one the card line opens. */
function theCardMessage(messages: readonly AMessage[], card: string): AMessage {
  const found = messages.filter((one) => one.body === SYSTEM_LINES.youHoldACard(card, '').line)
  expect(found, `the agent holds ${String(found.length)} card messages for the ${card} card`).toHaveLength(1)
  return found[0]!
}

/** File a run serving one agent, as that agent, and answer its id and the answer's flowRun. */
async function aRun(handle: string, flow: string): Promise<{ id: string; flowRun: Record<string, unknown> }> {
  const made = await inject('POST', '/api/records', { kind: 'session', title: 'MADE-UP run', data: { state: 'running', servingAgent: handle, flow } }, asAgent(handle))
  expect(made.status, made.text).toBe(201)
  return { id: String((made.json['record'] as { id: string }).id), flowRun: made.json['flowRun'] as Record<string, unknown> }
}

/** Every row the office holds, and how many change and revision rows, so "writes nothing" is measured. */
function everythingHeld(): unknown {
  const sqlite = t.client.sqlite
  return {
    records: sqlite.prepare('SELECT id, kind, data, updated_at, deleted_at FROM records ORDER BY id').all(),
    changes: sqlite.prepare('SELECT count(*) AS n FROM changes').get(),
    revisions: sqlite.prepare('SELECT count(*) AS n FROM revisions').get(),
  }
}

/** The card message an agent registered before any handbook was filed got, kept for case d. */
let theWorkersCardMessageBefore: AMessage

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()
  SAYS = await theHandbookWords()
  await register(THE_WRITER, 'worker', 'en')
  // BEFORE ANY HANDBOOK IS FILED: the card message as it was.
  await register('hb-plain-a', 'worker', 'en')
  theWorkersCardMessageBefore = theCardMessage(await messagesFor('hb-plain-a'), 'worker')
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

describe('a. a handbook is filed and its text changed, and both versions are kept with their change record', () => {
  it('keeps each version in the ledger with who wrote it, when, and the newest entry’s why', async () => {
    const flow = await aFlow('MADE-UP flow of case a')
    const id = await file('handbook', 'MADE-UP handbook of case a', aHandbook('draft', { en: 'MADE-UP opening, first version.' }, [{ flow }]), asAgent(THE_WRITER))
    const first = (await inject('GET', `/api/records/${id}`)).json['record'] as { data: Record<string, unknown> }
    const changed = await inject(
      'PATCH',
      `/api/records/${id}`,
      {
        dataPatch: {
          text: { en: { opening: 'MADE-UP opening, second version.' } },
          text_changes: [...(first.data['text_changes'] as unknown[]), { languages: ['en'], why: 'MADE-UP: the second text.' }],
        },
      },
      asAgent(THE_WRITER),
    )
    expect(changed.status, changed.text).toBe(200)

    const listing = await inject('GET', `/api/records/${id}/revisions`)
    expect(listing.status, listing.text).toBe(200)
    expect(listing.json['count']).toBe(2)
    const versions = []
    for (const seq of [1, 2]) {
      const one = await inject('GET', `/api/records/${id}/revisions/${seq}`)
      expect(one.status, one.text).toBe(200)
      const revision = one.json as { at: string; who: { actorType: string; actorId: string }; content: { data: Record<string, unknown> } }
      const changes = revision.content.data['text_changes'] as { why: string }[]
      versions.push({
        opening: (revision.content.data['text'] as { en: { opening: string } }).en.opening,
        why: changes.at(-1)?.why,
        entries: changes.length,
        who: revision.who.actorType,
        at: typeof revision.at,
      })
    }
    expect(versions).toEqual([
      { opening: 'MADE-UP opening, first version.', why: 'MADE-UP: the first text.', entries: 1, who: 'agent', at: 'string' },
      { opening: 'MADE-UP opening, second version.', why: 'MADE-UP: the second text.', entries: 2, who: 'agent', at: 'string' },
    ])
  })

  it('refuses a text change with no entry, with an entry naming other languages, or with an earlier entry gone, and writes nothing', async () => {
    const flow = await aFlow('MADE-UP flow of the refusals')
    const id = await file('handbook', 'MADE-UP handbook of the refusals', aHandbook('draft', { en: 'MADE-UP opening.', zh: '虚构的开头。' }, [{ flow }]), asAgent(THE_WRITER))
    const [entry] = ((await inject('GET', `/api/records/${id}`)).json['record'] as { data: { text_changes: unknown[] } }).data.text_changes
    const before = everythingHeld()
    for (const [what, dataPatch, words] of [
      ['no entry', { text: { en: { opening: 'MADE-UP opening, changed.' } } }, SAYS.notExactlyOneEntry(['en'], 0)],
      ['other languages', { text: { en: { opening: 'MADE-UP opening, changed.' } }, text_changes: [entry, { languages: ['zh'], why: 'MADE-UP.' }] }, SAYS.otherLanguagesNamed(1, ['zh'], ['en'])],
      ['an earlier entry gone', { text: { en: { opening: 'MADE-UP opening, changed.' } }, text_changes: [{ languages: ['en'], why: 'MADE-UP.' }] }, SAYS.anEarlierEntryChanged(1)],
      ['an entry with no text change', { text_changes: [entry, { languages: ['en'], why: 'MADE-UP.' }] }, SAYS.anEntryWithNoTextChange()],
    ] as const) {
      const refused = await inject('PATCH', `/api/records/${id}`, { dataPatch }, asAgent(THE_WRITER))
      expect(refused.status, `${what}: ${refused.text}`).toBe(400)
      expect(refused.error, what).toContain(words)
    }
    expect(everythingHeld(), 'a refused change wrote something').toEqual(before)
  })

  it('refuses a place that is not there: a flow no record is, a step the flow lacks, and a card the office does not hold', async () => {
    const flow = await aFlow('MADE-UP flow of the places')
    const before = everythingHeld()
    for (const [place, words] of [
      [{ flow: 'no-such-flow' }, SAYS.noLiveFlow('no-such-flow')],
      [{ flow, step: 9 }, SAYS.noStep(flow, 9)],
      [{ card: 'no-such-card' }, SAYS.noRoleCard('no-such-card')],
    ] as const) {
      const refused = await inject('POST', '/api/records', { kind: 'handbook', title: 'MADE-UP handbook of a missing place', data: aHandbook('draft', { en: 'MADE-UP.' }, [place]) })
      expect(refused.status, refused.text).toBe(400)
      expect(refused.error).toContain(words)
    }
    expect(everythingHeld(), 'a refused handbook wrote something').toEqual(before)
  })
})

describe('b. a handbook on a flow reaches the agent that starts the flow, in its language, once, with the reason', () => {
  let flow: string
  let onTheFlow: string
  let onAStep: string

  beforeAll(async () => {
    flow = await aFlow('MADE-UP flow of case b')
    const other = await aFlow('MADE-UP other flow of case b')
    onTheFlow = await file('handbook', 'MADE-UP handbook on the flow', aHandbook('in use', { en: 'MADE-UP flow opening, English.', zh: '虚构的流程开头，中文。' }, [{ flow }]))
    onAStep = await file('handbook', 'MADE-UP handbook on step 2', aHandbook('in use', { en: 'MADE-UP step opening, English.' }, [{ flow, step: 2 }]))
    await file('handbook', 'MADE-UP draft on the flow', aHandbook('draft', { en: 'MADE-UP draft opening.' }, [{ flow }]))
    await file('handbook', 'MADE-UP handbook on another flow', aHandbook('in use', { en: 'MADE-UP other flow opening.' }, [{ flow: other }]))
    await register('hb-zh', 'worker', 'zh')
  }, 60_000)

  it('sends one message when a run names the flow, and a change of the run sends nothing more', async () => {
    const run = await aRun('hb-zh', flow)
    expect(run.flowRun['written']).toBe(true)
    const handbooks = run.flowRun['handbooks'] as { sent: boolean; message: string; handbooks: { id: string; languages: string[] }[] }
    expect(handbooks.sent, JSON.stringify(handbooks)).toBe(true)
    expect(handbooks.handbooks.map(({ id, languages }) => ({ id, languages }))).toEqual([
      { id: onTheFlow, languages: ['zh'] },
      { id: onAStep, languages: ['en'] },
    ])

    const sent = withHandbooks(await messagesFor('hb-zh'))
    expect(sent, 'the start wrote other than one handbooks message').toHaveLength(1)
    const message = sent[0]!
    expect(message.id).toBe(handbooks.message)
    expect(message.body).toBe(SYSTEM_LINES.handbooksForAFlowStart('').line)
    expect(message.extra['handbooksSent']).toEqual({ flowRun: run.flowRun['id'], handbooks: handbooks.handbooks })
    expect(message.saidInFull).toContain('虚构的流程开头，中文。')
    expect(message.saidInFull, 'the Chinese reader was sent the English text it has in Chinese').not.toContain('MADE-UP flow opening, English.')
    expect(message.saidInFull).toContain(SAYS.youHaveIt(SAYS.onTheFlowStarted(true, [])))
    expect(message.saidInFull).toContain(SAYS.youHaveIt(SAYS.onTheFlowStarted(false, [2])))
    expect(message.saidInFull).toContain(SAYS.theLanguages({ languages: ['en'], why: 'english' }, 'zh'))
    expect(message.saidInFull).toContain('MADE-UP step opening, English.')
    expect(message.saidInFull).toContain('MADE-UP: the first text.')
    expect(message.saidInFull, 'a draft was sent').not.toContain('MADE-UP draft opening.')
    expect(message.saidInFull, 'another flow’s handbook was sent').not.toContain('MADE-UP other flow opening.')

    const later = await inject('PATCH', `/api/records/${run.id}`, { dataPatch: { doing: 'MADE-UP: later in the run' } }, asAgent('hb-zh'))
    expect(later.status, later.text).toBe(200)
    expect(withHandbooks(await messagesFor('hb-zh')), 'a change of the run sent the handbooks again').toHaveLength(1)

    const again = await aRun('hb-zh', flow)
    const both = withHandbooks(await messagesFor('hb-zh'))
    expect(both, 'a new start did not send the handbooks again').toHaveLength(2)
    expect(both[1]!.extra['handbooksSent']).toMatchObject({ flowRun: again.flowRun['id'] })
  })

  it('sends one message when an agent enters the flow by its door', async () => {
    await register('hb-enter', 'worker', 'en')
    const run = await file('session', 'MADE-UP run that enters', { state: 'running', servingAgent: 'hb-enter' }, asAgent('hb-enter'))
    const about = await file('note', 'MADE-UP note the flow is about', { body: 'MADE-UP.' })
    const entered = await inject('POST', `/api/flows/${flow}/enter`, { about }, asAgent('hb-enter', run))
    expect(entered.status, entered.text).toBe(201)
    expect(entered.json['handbooks']).toMatchObject({ sent: true })
    const sent = withHandbooks(await messagesFor('hb-enter'))
    expect(sent, 'entering wrote other than one handbooks message').toHaveLength(1)
    expect(sent[0]!.extra['handbooksSent']).toMatchObject({ flowRun: entered.json['flowRun'] })
    expect(sent[0]!.saidInFull).toContain('MADE-UP flow opening, English.')
    expect(sent[0]!.saidInFull).not.toContain('虚构的流程开头，中文。')
  })
})

describe('c. a handbook on a role card reaches the agent that takes the card', () => {
  let onTheCard: string

  beforeAll(async () => {
    onTheCard = await file('handbook', 'MADE-UP handbook on the supervisor card', aHandbook('in use', { en: 'MADE-UP card opening, English.', zh: '虚构的角色卡开头，中文。' }, [{ card: 'supervisor' }]))
  })

  it('is in the card message of a registration, after the card’s own handbook, in the agent’s language', async () => {
    await register('hb-sup', 'supervisor', 'zh')
    const message = theCardMessage(await messagesFor('hb-sup'), 'supervisor')
    expect(message.saidInFull).toContain('虚构的角色卡开头，中文。')
    expect(message.saidInFull).not.toContain('MADE-UP card opening, English.')
    expect(message.saidInFull).toContain(SAYS.youHaveIt(SAYS.onTheCard('supervisor')))
    const ownHeading = message.saidInFull.indexOf(createI18n('zh').t('cardHandbook.heading', { card: 'supervisor' }))
    expect(ownHeading, 'the card’s own handbook is not in the card message').toBeGreaterThan(-1)
    expect(message.saidInFull.indexOf('虚构的角色卡开头，中文。')).toBeGreaterThan(ownHeading)
    expect(message.extra['handbooksSent']).toEqual({ card: 'supervisor', handbooks: [{ id: onTheCard, version: 1, languages: ['zh'] }] })
  })

  it('is in the card message of a later grant of the card', async () => {
    await register('hb-grant', 'worker', 'en')
    const given = await inject('POST', '/api/roles/card/hb-grant', { role: 'supervisor' })
    expect(given.status, given.text).toBe(201)
    const message = theCardMessage(await messagesFor('hb-grant'), 'supervisor')
    expect(message.saidInFull).toContain('MADE-UP card opening, English.')
    expect(message.extra['handbooksSent']).toEqual({ card: 'supervisor', handbooks: [{ id: onTheCard, version: 1, languages: ['en'] }] })
  })
})

describe('d. a flow or a card with no handbook in use behaves as before', () => {
  it('a run naming such a flow, and an agent entering it, answer as before and get no message', async () => {
    const flow = await aFlow('MADE-UP flow of case d')
    await file('handbook', 'MADE-UP draft of case d', aHandbook('draft', { en: 'MADE-UP draft of case d.' }, [{ flow }]))
    await file('handbook', 'MADE-UP retired one of case d', aHandbook('retired', { en: 'MADE-UP retired of case d.' }, [{ flow, step: 1 }]))
    await register('hb-none', 'worker', 'en')
    const run = await aRun('hb-none', flow)
    expect(run.flowRun).toEqual({ written: true, id: expect.any(String) })
    const about = await file('note', 'MADE-UP note of case d', { body: 'MADE-UP.' })
    const entered = await inject('POST', `/api/flows/${flow}/enter`, { about }, asAgent('hb-none', run.id))
    expect(entered.status, entered.text).toBe(201)
    expect(Object.keys(entered.json)).not.toContain('handbooks')
    expect(withHandbooks(await messagesFor('hb-none'))).toEqual([])
  })

  it('a card with no handbook in use gets the card message it got before any handbook was filed', async () => {
    await file('handbook', 'MADE-UP draft on the worker card', aHandbook('draft', { en: 'MADE-UP worker draft.' }, [{ card: 'worker' }]))
    await register('hb-plain-b', 'worker', 'en')
    const now = theCardMessage(await messagesFor('hb-plain-b'), 'worker')
    const before = theWorkersCardMessageBefore
    expect({ saidInFull: now.saidInFull.replaceAll('hb-plain-b', 'hb-plain-a'), extra: Object.keys(now.extra) }).toEqual({
      saidInFull: before.saidInFull,
      extra: Object.keys(before.extra),
    })
  })
})

describe('e. a handbook on a role card meets the card rule, and the same handbook on a flow does not', () => {
  const TITLE = 'MADE-UP handbook an agent puts on a card'

  it('refuses an agent’s handbook on a card with no warrant, in the card rule’s words, and files the same on a flow', async () => {
    const before = everythingHeld()
    const refused = await inject('POST', '/api/records', { kind: 'handbook', title: TITLE, data: aHandbook('draft', { en: 'MADE-UP.' }, [{ card: 'worker' }]) }, asAgent(THE_WRITER))
    expect(refused.status, refused.text).toBe(403)
    // THE CARD RULE'S OWN SENTENCE IS src/server/lib/card-words.ts's. What this file holds it to is that the refusal
    // names the act as a handbook's, and that nothing is written.
    expect(refused.error).toContain(SAYS.theActOnACard('create', TITLE, ['worker']))
    expect(everythingHeld(), 'the refused handbook wrote something').toEqual(before)

    const flow = await aFlow('MADE-UP flow of case e')
    await file('handbook', TITLE, aHandbook('in use', { en: 'MADE-UP.' }, [{ flow }]), asAgent(THE_WRITER))
  })

  it('refuses an agent’s change of an in-use one’s text, putting one in use, and bringing one back, and lets the person do each', async () => {
    const inUse = await file('handbook', 'MADE-UP in-use handbook on the worker card', aHandbook('in use', { en: 'MADE-UP.' }, [{ card: 'worker' }]))
    const draft = await file('handbook', 'MADE-UP draft handbook on the worker card', aHandbook('draft', { en: 'MADE-UP.' }, [{ card: 'worker' }]))
    const entries = [{ languages: ['en'], why: 'MADE-UP: the first text.' }, { languages: ['en'], why: 'MADE-UP: changed.' }]
    const acts: [what: string, method: 'PATCH' | 'POST', url: string, payload: Record<string, unknown> | undefined, words: string][] = [
      ['a change of its text', 'PATCH', `/api/records/${inUse}`, { dataPatch: { text: { en: { opening: 'MADE-UP, changed.' } }, text_changes: entries } }, SAYS.theActOnACard('change', inUse, ['worker'])],
      ['putting it in use', 'PATCH', `/api/records/${draft}`, { dataPatch: { state: 'in use' } }, SAYS.theActOnACard('change', draft, ['worker'])],
      ['bringing it back', 'POST', `/api/records/${inUse}/restore`, undefined, SAYS.theActOnACard('restore', inUse, ['worker'])],
    ]
    for (const [what, method, url, payload, words] of acts) {
      // THE PERSON DELETES IT FIRST, so there is something to bring back.
      if (what === 'bringing it back') expect((await inject('DELETE', `/api/records/${inUse}`)).status).toBe(200)
      const before = everythingHeld()
      const refused = await inject(method, url, payload, asAgent(THE_WRITER))
      expect(refused.status, `${what}: ${refused.text}`).toBe(403)
      expect(refused.error, what).toContain(words)
      expect(everythingHeld(), `the refused ${what} wrote something`).toEqual(before)
      const done = await inject(method, url, payload)
      expect(done.status, `the person's ${what}: ${done.text}`).toBe(200)
    }
  })

  it('lets an agent file one on a card on a warrant a decision of the owner’s rests on', async () => {
    const words = 'MADE-UP: put a handbook on the worker card.'
    const message = await file('message', 'MADE-UP about a card handbook', { body: `MADE-UP first line.\n\n${words}`, to: [{ kind: 'agent', id: THE_WRITER }] })
    await file('decision', 'MADE-UP: the worker card gets a handbook', {
      ...governsTheWholeProject(), replaces: [],
      decided_by: 'the owner',
      authority: 'the owner said so',
      authority_reference: message,
      option_taken: 'MADE-UP.',
      because: 'MADE-UP.',
    })
    const title = 'MADE-UP handbook on a warrant'
    const done = await inject(
      'POST',
      '/api/records',
      {
        kind: 'handbook',
        title,
        data: aHandbook('in use', { en: 'MADE-UP.' }, [{ card: 'worker' }]),
        warrant: { saidBy: THE_PERSON, words, where: `message:${message}`, when: '2026-11-07 10:00', for: [title] },
      },
      asAgent(THE_WRITER),
    )
    expect(done.status, done.text).toBe(201)
  })
})

describe('f. a flow’s read lists every handbook on the flow, in any state, for its page', () => {
  it('names each one’s state, its languages and where on the flow it hangs, and a flow with none lists none', async () => {
    const flow = await aFlow('MADE-UP flow of case f')
    const other = await aFlow('MADE-UP other flow of case f')
    const both = await file('handbook', 'MADE-UP draft of case f', aHandbook('draft', { en: 'MADE-UP f one.', zh: 'MADE-UP f one, zh.' }, [{ flow, step: 2 }, { flow }]))
    const steps = await file('handbook', 'MADE-UP retired one of case f', aHandbook('retired', { en: 'MADE-UP f two.' }, [{ flow, step: 2 }, { flow: other }, { flow, step: 1 }]))
    const gone = await file('handbook', 'MADE-UP deleted one of case f', aHandbook('in use', { en: 'MADE-UP f three.' }, [{ flow }]))
    expect((await inject('DELETE', `/api/records/${gone}`)).status).toBe(200)
    const read = await inject('GET', `/api/flows/${flow}`)
    expect(read.status, read.text).toBe(200)
    expect(read.json['handbooks']).toEqual([
      { id: both, title: 'MADE-UP draft of case f', state: 'draft', languages: ['en', 'zh'], onTheFlow: true, steps: [2] },
      { id: steps, title: 'MADE-UP retired one of case f', state: 'retired', languages: ['en'], onTheFlow: false, steps: [1, 2] },
    ])
    const none = await aFlow('MADE-UP flow of case f with none')
    const empty = await inject('GET', `/api/flows/${none}`)
    expect(empty.status, empty.text).toBe(200)
    expect(empty.json['handbooks']).toEqual([])
  })
})

describe('g. an in-use handbook with no text, or with no "for", is sent saying so', () => {
  it('sends one with no text as holding none, with nothing about a text it lacks, and a "for" left out or blank as not recorded', async () => {
    const flow = await aFlow('MADE-UP flow of case g')
    const FOR = 'The made-up agent of this test.'
    // NO TEXT, AND NO "FOR": each field is left out, which the shape takes as an incomplete record.
    const empty = await file('handbook', 'MADE-UP handbook of case g with no text', { for: FOR, state: 'in use', hangs_on: [{ flow }] })
    const { for: _for, ...withNoFor } = aHandbook('in use', { en: 'MADE-UP opening of case g, with no for.' }, [{ flow, step: 1 }])
    const noFor = await file('handbook', 'MADE-UP handbook of case g with no for', withNoFor)
    // A BLANK "FOR" IS REFUSED AT THE DOOR, as every blank string is, so the blank one is written straight into this
    // test's own database, and its reading is measured too.
    const blankData = { ...aHandbook('in use', { en: 'MADE-UP opening of case g, with a blank for.' }, [{ flow, step: 2 }]), for: '   ' }
    const refused = await inject('POST', '/api/records', { kind: 'handbook', title: 'MADE-UP handbook of case g refused', data: blankData })
    expect(refused.status, refused.text).toBe(400)
    expect(refused.error).toContain('data.for')
    const blank = await file('handbook', 'MADE-UP handbook of case g with a blank for', { ...blankData, for: FOR })
    t.client.sqlite.prepare("UPDATE records SET data = json_set(data, '$.for', '   ') WHERE id = ?").run(blank)

    await register('hb-g', 'worker', 'en')
    const run = await aRun('hb-g', flow)
    const handbooks = run.flowRun['handbooks'] as { sent: boolean; handbooks: { id: string; languages: string[] }[] }
    expect(handbooks.sent, JSON.stringify(handbooks)).toBe(true)
    expect(handbooks.handbooks.map(({ id, languages }) => ({ id, languages }))).toEqual([
      { id: empty, languages: [] },
      { id: noFor, languages: ['en'] },
      { id: blank, languages: ['en'] },
    ])
    // THE CARD MESSAGE CARRIES HANDBOOKS TOO, since case e put some in use on the worker card, so this start's is read.
    const sent = withHandbooks(await messagesFor('hb-g')).filter((one) => (one.extra['handbooksSent'] as { flowRun?: unknown }).flowRun === run.flowRun['id'])
    expect(sent, 'the start wrote other than one handbooks message').toHaveLength(1)
    const parts = sent[0]!.saidInFull.split('\n\n')
    expect(parts, 'the handbook with no text is not sent as holding none, and as nothing else').toContain(
      [SAYS.heading('MADE-UP handbook of case g with no text', empty, 1), SAYS.forWhom(FOR), SAYS.youHaveIt(SAYS.onTheFlowStarted(true, [])), SAYS.noText()].join('\n'),
    )
    for (const [what, id, title] of [
      ['left out', noFor, 'MADE-UP handbook of case g with no for'],
      ['blank', blank, 'MADE-UP handbook of case g with a blank for'],
    ] as const) {
      const part = parts.find((one) => one.startsWith(SAYS.heading(title, id, 1)))
      expect(part, `the handbook with a "for" ${what} is not sent`).toBeDefined()
      expect(part!.split('\n')[1], `a "for" ${what} is not sent as not recorded`).toBe(SAYS.forWhom(null))
    }
    expect(sent[0]!.saidInFull).toContain('MADE-UP opening of case g, with no for.')
    expect(sent[0]!.saidInFull).toContain('MADE-UP opening of case g, with a blank for.')
  })
})

describe('h. a handbook goes to a reader of English, of no known language, and of neither, by the one language rule', () => {
  const BOTH = 'MADE-UP handbook of case h in two languages'
  const CHINESE_ONLY = 'MADE-UP handbook of case h in Chinese only'
  let flow: string
  let both: string
  let chineseOnly: string

  beforeAll(async () => {
    flow = await aFlow('MADE-UP flow of case h')
    both = await file('handbook', BOTH, aHandbook('in use', { en: 'MADE-UP opening of case h, English.', zh: '虚构的 h 开头，中文。' }, [{ flow }]))
    chineseOnly = await file('handbook', CHINESE_ONLY, aHandbook('in use', { zh: '虚构的 h 开头，只有中文。' }, [{ flow, step: 1 }]))
  }, 60_000)

  /**
   * WHAT A RUN NAMING THE FLOW SENT A NEW AGENT: the languages the run's answer says went with each handbook, the
   * languages line of each handbook's part, and the message in full.
   */
  async function theStartOf(handle: string, language?: 'en' | 'el'): Promise<{ handbooks: { id: string; languages: string[] }[]; lines: (string | undefined)[]; saidInFull: string }> {
    await register(handle, 'worker', language)
    const run = await aRun(handle, flow)
    const handbooks = run.flowRun['handbooks'] as { sent: boolean; handbooks: { id: string; languages: string[] }[] }
    expect(handbooks.sent, JSON.stringify(handbooks)).toBe(true)
    // THE CARD MESSAGE CARRIES HANDBOOKS TOO, since case e put some in use on the worker card, so this start's is read.
    const sent = withHandbooks(await messagesFor(handle)).filter((one) => (one.extra['handbooksSent'] as { flowRun?: unknown }).flowRun === run.flowRun['id'])
    expect(sent, 'the start wrote other than one handbooks message').toHaveLength(1)
    const parts = sent[0]!.saidInFull.split('\n\n')
    // A PART'S FIRST BLOCK ENDS WITH ITS LANGUAGES LINE, and its texts follow in blocks of their own.
    const lines = [
      [BOTH, both],
      [CHINESE_ONLY, chineseOnly],
    ].map(([title, id]) => parts.find((one) => one.startsWith(SAYS.heading(title!, id!, 1)))?.split('\n').at(-1))
    return { handbooks: handbooks.handbooks.map(({ id, languages }) => ({ id, languages })), lines, saidInFull: sent[0]!.saidInFull }
  }

  it('sends a reader of English the English text as its own language, and a text written only in Chinese as neither', async () => {
    const start = await theStartOf('hb-h-en', 'en')
    expect(start.handbooks).toEqual([
      { id: both, languages: ['en'] },
      { id: chineseOnly, languages: ['zh'] },
    ])
    expect(start.lines).toEqual([SAYS.theLanguages({ languages: ['en'], why: 'theirs' }, 'en'), SAYS.theLanguages({ languages: ['zh'], why: 'neither' }, 'en')])
    expect(start.saidInFull).toContain('MADE-UP opening of case h, English.')
    expect(start.saidInFull, 'the reader of English was sent the Chinese text it has in English').not.toContain('虚构的 h 开头，中文。')
    expect(start.saidInFull).toContain('虚构的 h 开头，只有中文。')
  })

  it('sends a reader whose language nobody gave every language each handbook is written in, saying nobody gave one', async () => {
    const start = await theStartOf('hb-h-unknown')
    expect(start.handbooks).toEqual([
      { id: both, languages: ['en', 'zh'] },
      { id: chineseOnly, languages: ['zh'] },
    ])
    expect(start.lines).toEqual([SAYS.theLanguages({ languages: ['en', 'zh'], why: 'unknown' }, null), SAYS.theLanguages({ languages: ['zh'], why: 'unknown' }, null)])
    for (const text of ['MADE-UP opening of case h, English.', '虚构的 h 开头，中文。', '虚构的 h 开头，只有中文。']) expect(start.saidInFull).toContain(text)
  })

  it('sends a reader of a language no handbook is written in the English text, and a text with no English in every language', async () => {
    const start = await theStartOf('hb-h-el', 'el')
    expect(start.handbooks).toEqual([
      { id: both, languages: ['en'] },
      { id: chineseOnly, languages: ['zh'] },
    ])
    expect(start.lines).toEqual([SAYS.theLanguages({ languages: ['en'], why: 'english' }, 'el'), SAYS.theLanguages({ languages: ['zh'], why: 'neither' }, 'el')])
    expect(start.saidInFull).toContain('MADE-UP opening of case h, English.')
    expect(start.saidInFull, 'the reader of Greek was sent the Chinese text of a handbook written in English').not.toContain('虚构的 h 开头，中文。')
    expect(start.saidInFull).toContain('虚构的 h 开头，只有中文。')
  })

  it('stops the card message when a card’s own handbook is found neither in the reader’s language nor in English', async () => {
    // A CARD'S OWN HANDBOOK IS WRITTEN IN EVERY HANDBOOK LANGUAGE, so no card the office reads gives "neither". A copy of
    // the worker card holding a made-up Chinese text only is built here and handed to the builder of the card's part.
    const { theHandbookPartFor } = await import('../src/server/lib/cardmessage.ts')
    const { theRoleCards } = await import('../src/server/lib/roles.ts')
    const worker = theRoleCards().cards.find((one) => one.name === 'worker')
    expect(worker, 'the office reads no worker card').toBeDefined()
    const card = { ...worker!, howItWorks: { zh: '虚构的角色卡说明，只有中文。' }, inPractice: undefined } as unknown as RoleCard
    for (const language of ['en', 'el'] as const) {
      let thrown: unknown = null
      try {
        theHandbookPartFor({ card, sentIn: null, language })
      } catch (error) {
        thrown = error
      }
      expect(thrown, `a card handbook found in Chinese only was sent to a reader of ${language}`).toBeInstanceOf(Error)
      expect((thrown as Error).message).toContain('worker')
      expect((thrown as Error).message).toContain('zh')
    }
    // THE SAME CARD GOES TO A READER OF CHINESE, and to one whose language nobody gave, so it is "neither" that stops it.
    for (const language of ['zh', null] as const) expect(theHandbookPartFor({ card, sentIn: null, language }).said).toContain('虚构的角色卡说明，只有中文。')
  })
})
