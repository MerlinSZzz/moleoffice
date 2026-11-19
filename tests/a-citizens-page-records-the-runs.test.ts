// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CITIZEN'S PAGE RECORDS THE MODEL, THE EFFORT, THE TOKENS AND THE COMPACTIONS — CRITERION P91.
 *
 * The profile recorded neither an agent's model, effort and total token use, nor the times and number of its compactions.
 * The criterion was amended on 12 September 2026: the page shows, per run and summed for the agent,
 * the model and the effort as the run declared them, the tokens from the usage receipts, and each
 * compaction with its time where the runtime reports one, else "not reported by this runtime". The
 * step timeline is OUT of the criterion: the page says it is not built and names 11 September 2026,
 * the day the step log was withdrawn.
 *
 * WAVE 13K ROUND 52 (line round 52, item 1). Since round 46 the session hook records each compaction
 * Claude Code reports, so "not reported by this runtime" stopped being true of a Claude Code run, and
 * the sum on the agent was the tokens alone. The brief's rule: a count read from a source that sees
 * only some compactions must say which runs it can see. The secretary's answer 8d3uCCxwD_1j: the sum also
 * says each model and effort the runs declared, with how many runs declared it, and how many declared
 * none.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS MEASURED
 * ---------------------------------------------------------------------------------------
 *
 *   · the runs are found through `ranAs`, the run's own statement of which durable agent it worked
 *     as, so a run bound to another agent is not on this page — the inspector's check is counted on
 *     the inspector and never on the run it checked;
 *   · each run's model and effort are what the run declared, and absent is "the run did not say";
 *   · the tokens are the runtime's receipts, per run and summed on the agent, drawn by the one
 *     summation `ReceiptTotals` already draws on the Usage page;
 *   · a run with no receipt says so and is not counted as zero tokens in the sum;
 *   · a run's compaction sentence follows its runtime, and is never a zero: a Claude Code run with
 *     none says none is recorded and why that may not be all of them, a run on another runtime says
 *     "not reported by this runtime", and a run that did not say its runtime says that is not known;
 *   · the sum on the agent counts the compactions on its Claude Code runs only, and says how many runs
 *     that covers and how many it cannot see (another runtime, or no runtime said). With no Claude
 *     Code run it gives no number at all, never a zero;
 *   · the sum on the agent lists each model and effort its runs declared, most runs first, and counts
 *     the runs that declared neither;
 *   · on a Chinese page each of those sentences is drawn in Chinese;
 *   · the timeline's place says the timeline is not built and names 11 September 2026.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THAT TURN THIS RED, EACH AFTER A CONTROL RUN, EACH RESTORED BYTE-IDENTICAL
 * ---------------------------------------------------------------------------------------
 *
 * Control: the four cases below green on the unmutated tree.
 *
 *   1. SUM THE TOKENS WRONGLY (src/server/lib/usage-receipts.ts, `receiptsFromRuns`): change
 *      `group.values[key] = (group.values[key] ?? 0) + value` to add `0`. The case for the sum on
 *      the agent goes red — the by-agent row is 0, not 300.
 *   2. DRAW A ZERO FOR A COMPACTION (src/web/components/TheAgentsRuns.tsx): draw `0` where
 *      `run.compactions.length === 0` instead of the sentence. The compaction case goes red.
 *   3. DRAW A TIMELINE (src/web/components/TheAgentsRuns.tsx): replace the timeline sentence with a
 *      short list of steps. The timeline case goes red, because the sentence naming the withdrawal
 *      is gone.
 *   4. COUNT A MISSING RECEIPT AS A SUPPLIED ZERO (src/server/lib/usage-receipts.ts): drop the
 *      `if (!receipt) missingReceipts += 1` line. The missing-receipt case goes red, because the
 *      page no longer says one run had no receipt.
 *
 * Round 52 adds five, each after its own control run and each ended by a restore run:
 *
 *   5. SEE EVERY RUN (src/server/lib/agent-runs.ts, the compaction count): count every run as a
 *      Claude Code run. The summed case goes red: the count covers 4 runs, and the sentences naming
 *      the runs it cannot see are gone.
 *   6. THE OLD SENTENCE (src/server/lib/agent-runs.ts): give a Claude Code run with none recorded
 *      "not reported by this runtime" again. The per-run cases go red.
 *   7. A ZERO WHERE NOTHING IS SEEN (src/server/lib/agent-runs.ts): with no Claude Code run, say no
 *      compaction is recorded on 0 runs instead of saying none can be counted. The only-codex case
 *      goes red.
 *   8. THE PAIR BY MODEL ALONE (src/server/lib/agent-runs.ts, the declared sum): count a pair by its
 *      model only. The declared cases go red on the agent whose runs declared one model at two efforts.
 *   9. DRAW THE SERVER'S ENGLISH (src/web/components/TheAgentsRuns.tsx): draw a run's compaction
 *      sentence as it came, not through sentenceOnThePage. The Chinese case goes red.
 *
 * The file was restored byte-identical after each mutation (sha256 before and after).
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { apiApp, freshDb, liveApp, waitForThePage, type TestDb } from './helpers.ts'
import { historicalSession } from './synthetic-submission-fixtures.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { AGENT_RUNS_WORDS, type TheAgentsRuns } from '../src/shared/profile.ts'
import { allInEnglish, inEnglish } from '../src/shared/dev-sayings.ts'
import { A_COMPACTION_REPORTED_BY_CLAUDE_CODE } from '../src/config/a-reported-compaction.mjs'

type ProfileModule = typeof import('../src/web/pages/ProfilePage.tsx')

/**
 * THE PAGE'S OWN WORD READER, and the two readers that draw a server sentence. `freshDb` resets the module
 * registry, so the page imported after it reads another copy of src/shared/i18n.ts than one imported at the top
 * of this file. The Chinese case sets the language on the page's copy, imported beside the page.
 */
interface ThePagesWords {
  words: typeof import('../src/shared/i18n.ts')
  sentences: typeof import('../src/web/lib/server-sentences.ts')
  sayings: typeof import('../src/shared/dev-sayings.ts')
}
let pages: ThePagesWords

let t: TestDb
let app: FastifyInstance
let pp: ProfileModule
let mode: typeof import('../src/web/lib/mode.ts')

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}

/** The two runs of the agent that changed model, so a reader can see the change. */
let runOnOne = ''
let runOnTwo = ''
/** One run of the agent whose runs carry no receipt at all, and one that does carry one. */
let runWithoutReceipt = ''
/** A run bound to the inspector, which must never land on the page of the agent it checked. */
let inspectorRun = ''
/** The runs of the agent the compaction count can and cannot see, newest first. */
let compactedRuns: string[] = []
/** The one run of the agent with no Claude Code run, so its count has nothing to count. */
let onlyCodexRun = ''

/**
 * Register an agent through the door every agent comes through. P88 refuses a registration with no
 * runtime, so the literal is always sent; this helper is where that rule is obeyed once.
 */
async function register(body: Record<string, unknown>): Promise<string> {
  const reply = await app.inject({
    method: 'POST',
    url: '/api/agents/started',
    headers: AS_THE_PERSON,
    payload: { runtime: 'claude-code', ...body },
  })
  expect(reply.statusCode, reply.body).toBe(201)
  return String((reply.json() as { record: string }).record)
}

/** One session record, bound to the agent's own record in this project through `ranAs`. */
function aRun(title: string, agentRecordId: string, data: Record<string, unknown>): string {
  // A FINISHED RUN IS FILED HISTORICALLY, so the finish writer does not try to seal a Git tip for a
  // test fixture. The same helper `tests/a-run-carries-its-usage-receipt.test.ts` uses.
  return historicalSession(t, {
    workspaceId: 'default',
    // FILED BY THE PERSON, from inside the office: a session for an agent is filed only by that agent, those above it,
    // the person proved, or the office. It was an unregistered name, which may no longer file for an agent.
    actor: { type: 'human', id: THE_PERSON },
    kind: 'session',
    title,
    data: { state: 'finished', ranAs: [{ workspaceId: 'default', agentId: agentRecordId }], ...data },
  }).id
}

async function profileOf(handle: string): Promise<Record<string, unknown>> {
  const reply = await app.inject({
    method: 'GET',
    url: `/api/participants/agent/${handle}/profile`,
    headers: AS_THE_PERSON,
  })
  expect(reply.statusCode, reply.body).toBe(200)
  return reply.json() as Record<string, unknown>
}

/** The reading the reply carries, or a failure naming what came back instead. */
function runsIn(said: Record<string, unknown>): TheAgentsRuns {
  const reading = said['agentRuns'] as TheAgentsRuns | null
  expect(reading, 'an agent page carries its runs').not.toBeNull()
  return reading as TheAgentsRuns
}

/** The profile page's own half, drawn with what the server actually said. */
function drawnProfile(said: Record<string, unknown>): string {
  mode.setMode('inspect')
  return renderToStaticMarkup(
    h(pp.TheProfile, { said, onChanged: () => {} } as unknown as Parameters<ProfileModule['TheProfile']>[0]),
  )
}

beforeAll(async () => {
  t = await freshDb()
  app = (await apiApp()).app
  await app.ready()

  // THE AGENT THAT CHANGED MODEL BETWEEN RUNS. Two runs, two models, two efforts.
  const changed = await register({ handle: 'two-models', name: 'Two models', role: 'worker' })
  runOnOne = aRun('Its first run', changed, {
    servingAgent: 'two-models',
    deliveringMessage: 'message-one',
    model: 'model-one',
    effort: 'high',
    runtime: 'claude-code',
    usageReceipt: { runtime: 'claude-code', model: 'model-one', inputTokens: 100, cachedInputTokens: 10, outputTokens: 5, inputIncludesCached: true },
  })
  runOnTwo = aRun('Its second run', changed, {
    servingAgent: 'two-models',
    deliveringMessage: 'message-two',
    model: 'model-two',
    effort: 'low',
    runtime: 'claude-code',
    usageReceipt: { runtime: 'claude-code', model: 'model-two', inputTokens: 200, cachedInputTokens: 20, outputTokens: 7, inputIncludesCached: true },
  })

  // THE AGENT WITH A RUN THAT HAS NO RECEIPT AT ALL. The missing count must not become a zero.
  const noReceipt = await register({ handle: 'no-receipt', name: 'No receipt', role: 'worker' })
  aRun('A run with a receipt', noReceipt, {
    servingAgent: 'no-receipt',
    model: 'model-one',
    usageReceipt: { runtime: 'claude-code', model: 'model-one', inputTokens: 50, inputIncludesCached: true },
  })
  runWithoutReceipt = aRun('A run nobody measured', noReceipt, { servingAgent: 'no-receipt', model: 'model-one' })

  // THE INSPECTOR'S OWN RUN, bound to the inspector and to no other agent. Criterion P91: the
  // inspector's usage is counted on the inspector, not on the run it checked.
  const inspector = await register({ handle: 'the-inspector', name: 'The inspector', role: 'worker' })
  inspectorRun = aRun('A check of somebody else', inspector, {
    servingAgent: 'the-inspector',
    runtime: 'claude-code',
    extra: { purpose: 'inspection', inspectionRun: runOnOne },
    usageReceipt: { runtime: 'claude-code', model: 'inspector-model', inputTokens: 999, inputIncludesCached: true },
  })

  // THE AGENT WHOSE RUNS THE COMPACTION COUNT CAN AND CANNOT SEE. Two Claude Code runs, one with two
  // compactions the session hook recorded and one with none; a run on another runtime; and a run that said
  // no runtime, no model and no effort. Filed oldest first, so the page lists them the other way round.
  const compacted = await register({ handle: 'compacted', name: 'Compacted', role: 'worker' })
  const twice = aRun('A run that compacted twice', compacted, {
    servingAgent: 'compacted',
    runtime: 'claude-code',
    model: 'model-one',
    effort: 'high',
    compactions: [
      { at: '2026-10-14 07:20:04', what: A_COMPACTION_REPORTED_BY_CLAUDE_CODE },
      { at: '2026-10-14 07:28:07', what: A_COMPACTION_REPORTED_BY_CLAUDE_CODE },
    ],
  })
  const none = aRun('A Claude Code run with none recorded', compacted, { servingAgent: 'compacted', runtime: 'claude-code', model: 'model-one', effort: 'high' })
  const codex = aRun('A run on another runtime', compacted, { servingAgent: 'compacted', runtime: 'codex', model: 'model-two' })
  const unsaid = aRun('A run that said nothing', compacted, { servingAgent: 'compacted' })
  compactedRuns = [unsaid, codex, none, twice]

  // THE AGENT WITH NO CLAUDE CODE RUN AT ALL. Its count has nothing to count, and must not say zero.
  const onlyCodex = await register({ handle: 'only-codex', name: 'Only Codex', role: 'worker' })
  onlyCodexRun = aRun('Its one run, on another runtime', onlyCodex, { servingAgent: 'only-codex', runtime: 'codex', model: 'model-two', effort: 'medium' })

  // THE AGENT WHOSE RUNS DECLARED ONE MODEL AT TWO EFFORTS. A pair is the model and the effort together, so these
  // are two pairs and not one model counted three times.
  const twoEfforts = await register({ handle: 'two-efforts', name: 'Two Efforts', role: 'worker' })
  aRun('High, first', twoEfforts, { servingAgent: 'two-efforts', runtime: 'claude-code', model: 'model-one', effort: 'high' })
  aRun('Low', twoEfforts, { servingAgent: 'two-efforts', runtime: 'claude-code', model: 'model-one', effort: 'low' })
  aRun('High, again', twoEfforts, { servingAgent: 'two-efforts', runtime: 'claude-code', model: 'model-one', effort: 'high' })

  // THE ONE THING THE PAGE NEEDS TO BE DRAWN WITHOUT A SERVER: the actor it reads from the browser.
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
  storage.setItem('mole-office.actor', JSON.stringify({ type: 'human', id: THE_PERSON }))
  pp = (await import('../src/web/pages/ProfilePage.tsx')) as ProfileModule
  mode = await import('../src/web/lib/mode.ts')
  pages = {
    words: await import('../src/shared/i18n.ts'),
    sentences: await import('../src/web/lib/server-sentences.ts'),
    sayings: await import('../src/shared/dev-sayings.ts'),
  }
}, 60_000)

afterAll(async () => {
  await app.close()
  t.close()
})

// ============================================================ 1. the runs, and the sum on the agent

describe('the citizen’s page records each run, and sums the agent', () => {
  it('finds the runs through ranAs, newest first, with each model and effort as the run declared it', async () => {
    const reading = runsIn(await profileOf('two-models'))
    expect(reading.looked).toBe(true)
    expect(reading.runs.map((one) => one.id)).toEqual([runOnTwo, runOnOne])
    expect(reading.runs.map((one) => one.model)).toEqual(['model-two', 'model-one'])
    expect(reading.runs.map((one) => one.effort)).toEqual(['low', 'high'])
  })

  it('does not put the inspector’s run, or its tokens, on the page of the agent it checked', async () => {
    const reading = runsIn(await profileOf('two-models'))
    expect(reading.runs.some((one) => one.id === inspectorRun), 'the check is not this agent’s run').toBe(false)
    expect(reading.runs.some((one) => one.model === 'inspector-model')).toBe(false)
    expect(reading.totals.byModel.some((row) => row.name === 'inspector-model')).toBe(false)
    // AND IT IS ON THE INSPECTOR'S OWN PAGE, which is where the criterion counts it.
    const inspectors = runsIn(await profileOf('the-inspector'))
    expect(inspectors.runs.map((one) => one.id)).toEqual([inspectorRun])
    expect(inspectors.runs[0]?.usageReceipt?.inputTokens).toBe(999)
  })

  it('sums the receipts on the agent, and per model, through the one summation', async () => {
    const reading = runsIn(await profileOf('two-models'))
    const agent = reading.totals.byAgent.find((row) => row.name === 'two-models')
    expect(agent, 'the agent’s own total row').toBeDefined()
    expect(agent?.values.inputTokens, '100 + 200').toBe(300)
    expect(agent?.values.cachedInputTokens, '10 + 20').toBe(30)
    expect(agent?.supplied.inputTokens, 'two runs supplied it').toBe(2)
    expect(agent?.runs.length).toBe(2)
    expect(reading.totals.byModel.find((row) => row.name === 'model-one')?.values.inputTokens).toBe(100)
    expect(reading.totals.byModel.find((row) => row.name === 'model-two')?.values.inputTokens).toBe(200)
  })

  it('draws each run’s model, effort and tokens, and the sum on the agent', async () => {
    const drawn = drawnProfile(await profileOf('two-models'))
    expect(drawn, 'the first run’s declared model').toContain('model-one')
    expect(drawn, 'the second run’s declared model').toContain('model-two')
    expect(drawn, 'the first run’s declared effort').toContain('high')
    expect(drawn, 'the second run’s declared effort').toContain('low')
    expect(drawn, 'the sum on the agent, from ReceiptTotals').toContain('300 (2/2 runs)')
  })
})

// ============================================================ 2. the compactions, per run and summed, and which runs the count sees

/** The sentence the sum on the agent always says: where the session hook records a compaction. */
const ONLY_CLAUDE_CODE = 'The session hook records a compaction only on a Claude Code run, and only if the hook was set up for that run.'
const COMPACTIONS_ZERO = new RegExp(`${AGENT_RUNS_WORDS.compactions}:\\s*0`)

describe('a compaction is never inferred, and the count says which runs it can see', () => {
  it('gives each run the sentence its runtime earns, and draws the recorded times', async () => {
    const reading = runsIn(await profileOf('compacted'))
    expect(reading.runs.map((one) => one.id)).toEqual(compactedRuns)
    const sentences = [
      AGENT_RUNS_WORDS.runtimeNotSaid,
      AGENT_RUNS_WORDS.notReportedByThisRuntime,
      AGENT_RUNS_WORDS.noneRecordedOnClaudeCode,
      AGENT_RUNS_WORDS.reportedByTheSessionHook,
    ]
    expect(reading.runs.map((one) => one.compactionsSay)).toEqual(sentences)
    expect(reading.runs[3]?.compactions.map((one) => one.at)).toEqual(['2026-10-14 07:20:04', '2026-10-14 07:28:07'])
    const drawn = drawnProfile(await profileOf('compacted'))
    for (const sentence of sentences) expect(drawn).toContain(sentence)
    expect(drawn).toContain('2026-10-14 07:28:07')
    expect(drawn).not.toMatch(COMPACTIONS_ZERO)
  })

  it('says a Claude Code run with none recorded is that, and not that its runtime reports none', async () => {
    const reading = runsIn(await profileOf('two-models'))
    for (const run of reading.runs) {
      expect(run.compactions).toEqual([])
      expect(run.compactionsSay).toBe(AGENT_RUNS_WORDS.noneRecordedOnClaudeCode)
    }
    expect(reading.compactionsCounted.recorded).toBe(0)
    expect(reading.compactionsCounted.says).toBe(
      `No compaction is recorded on its Claude Code runs. The count covers its 2 Claude Code runs. ${ONLY_CLAUDE_CODE}`,
    )
    const drawn = drawnProfile(await profileOf('two-models'))
    expect(drawn).toContain(AGENT_RUNS_WORDS.noneRecordedOnClaudeCode)
    expect(drawn).not.toContain(AGENT_RUNS_WORDS.notReportedByThisRuntime)
    expect(drawn).not.toMatch(COMPACTIONS_ZERO)
  })

  it('sums the compactions on the Claude Code runs, and names the runs it cannot see', async () => {
    const counted = runsIn(await profileOf('compacted')).compactionsCounted
    expect(counted.recorded).toBe(2)
    expect(counted.claudeCodeRuns).toBe(2)
    expect(counted.otherRuntimeRuns).toBe(1)
    expect(counted.noRuntimeRuns).toBe(1)
    const says =
      `2 compactions are recorded across its Claude Code runs. The count covers its 2 Claude Code runs. ${ONLY_CLAUDE_CODE} ` +
      '1 run on another runtime is not counted, because nothing records its compactions. ' +
      '1 run did not say its runtime, so it is not counted.'
    expect(counted.says).toBe(says)
    expect(allInEnglish(counted.said), 'the codes say what the English says').toBe(says)
    expect(drawnProfile(await profileOf('compacted'))).toContain(says)
  })

  it('gives no number where it can see no run, and says why', async () => {
    const reading = runsIn(await profileOf('only-codex'))
    expect(reading.runs.map((one) => one.id)).toEqual([onlyCodexRun])
    const counted = reading.compactionsCounted
    expect(counted.recorded, 'nothing was counted, so there is no number').toBeNull()
    expect(counted.claudeCodeRuns).toBe(0)
    expect(counted.otherRuntimeRuns).toBe(1)
    expect(counted.noRuntimeRuns).toBe(0)
    const says =
      `No compaction can be counted, because none of its runs is a Claude Code run. ${ONLY_CLAUDE_CODE} ` +
      '1 run on another runtime is not counted, because nothing records its compactions.'
    expect(counted.says).toBe(says)
    const drawn = drawnProfile(await profileOf('only-codex'))
    expect(drawn).toContain(says)
    expect(drawn).not.toContain('No compaction is recorded')
    expect(drawn).not.toMatch(/\b0 compactions\b/)
    expect(drawn).not.toMatch(COMPACTIONS_ZERO)
  })
})

// ============================================================ 2b. the models and efforts the runs declared, summed

describe('the sum on the agent says the models and efforts its runs declared', () => {
  it('counts each model and effort, most runs first, and the runs that declared neither', async () => {
    expect(runsIn(await profileOf('compacted')).declared).toEqual({
      pairs: [
        { model: 'model-one', effort: 'high', runs: 2 },
        { model: 'model-two', effort: null, runs: 1 },
      ],
      neither: 1,
    })
    expect(runsIn(await profileOf('two-models')).declared).toEqual({
      pairs: [
        { model: 'model-two', effort: 'low', runs: 1 },
        { model: 'model-one', effort: 'high', runs: 1 },
      ],
      neither: 0,
    })
    expect(runsIn(await profileOf('no-receipt')).declared).toEqual({ pairs: [{ model: 'model-one', effort: null, runs: 2 }], neither: 0 })
    expect(runsIn(await profileOf('two-efforts')).declared).toEqual({
      pairs: [
        { model: 'model-one', effort: 'high', runs: 2 },
        { model: 'model-one', effort: 'low', runs: 1 },
      ],
      neither: 0,
    })
  })

  it('draws each one with its count, and an effort nobody declared as not said', async () => {
    const drawn = drawnProfile(await profileOf('compacted'))
    expect(drawn).toContain('Model model-one, effort high: 2 runs')
    expect(drawn).toContain(`Model model-two, effort ${AGENT_RUNS_WORDS.notSaid}: 1 run`)
    expect(drawn).toContain('1 run declared neither a model nor an effort.')
    const efforts = drawnProfile(await profileOf('two-efforts'))
    expect(efforts).toContain('Model model-one, effort high: 2 runs')
    expect(efforts).toContain('Model model-one, effort low: 1 run')
    // NOTHING IS SAID ABOUT RUNS THAT DECLARED NEITHER when every run declared something.
    expect(drawnProfile(await profileOf('two-models'))).not.toContain('declared neither')
  })
})

// ============================================================ 2c. the same sentences on a Chinese page

describe('the runs panel on a Chinese page', () => {
  afterEach(() => pages.words.setWordLanguage('en'))

  it('draws every compaction sentence, per run and summed, in Chinese', async () => {
    const said = await profileOf('compacted')
    const counted = runsIn(said).compactionsCounted
    const perRun = [
      AGENT_RUNS_WORDS.runtimeNotSaid,
      AGENT_RUNS_WORDS.notReportedByThisRuntime,
      AGENT_RUNS_WORDS.noneRecordedOnClaudeCode,
      AGENT_RUNS_WORDS.reportedByTheSessionHook,
      AGENT_RUNS_WORDS.noReceipt,
    ]
    pages.words.setWordLanguage('zh')
    const drawn = drawnProfile(said)
    for (const english of [...perRun, ...counted.said.map(inEnglish)]) expect(drawn, english).not.toContain(english)
    for (const english of perRun) {
      expect(pages.sentences.sentenceOnThePage(english), english).toMatch(/[一-鿿]/)
      expect(drawn, english).toContain(pages.sentences.sentenceOnThePage(english))
    }
    const inChinese = pages.sayings.saidOnThePage(counted.said, counted.says)
    expect(inChinese).toMatch(/[一-鿿]/)
    expect(drawn).toContain(inChinese)
  })
})

// ============================================================ 3. the timeline's place says why it is empty

describe('the timeline’s place says it is not built', () => {
  it('names the withdrawal and the day, and draws no timeline', async () => {
    const drawn = drawnProfile(await profileOf('two-models'))
    expect(drawn).toContain('not built')
    expect(drawn).toContain('step log')
    expect(drawn).toContain('11 September 2026')
    expect(runsIn(await profileOf('two-models')).timelineSays).toBe(AGENT_RUNS_WORDS.timeline)
  })
})

// ============================================================ 4. no receipt is not zero tokens

describe('a run with no receipt says so and is not counted as zero', () => {
  it('says the receipt is missing and keeps it out of the supplied counts', async () => {
    const reading = runsIn(await profileOf('no-receipt'))
    const missing = reading.runs.find((one) => one.id === runWithoutReceipt)
    expect(missing, 'the run with no receipt is listed').toBeDefined()
    expect(missing?.usageReceipt).toBeNull()
    expect(missing?.receiptSays).toBe(AGENT_RUNS_WORDS.noReceipt)
    expect(reading.totals.missingReceipts).toBe(1)
    const agent = reading.totals.byAgent.find((row) => row.name === 'no-receipt')
    expect(agent?.supplied.inputTokens, 'only the one run supplied a count').toBe(1)
    expect(agent?.values.inputTokens, 'the missing run added nothing').toBe(50)
    const drawn = drawnProfile(await profileOf('no-receipt'))
    expect(drawn).toContain(AGENT_RUNS_WORDS.noReceipt)
    // The markup puts the count in its own element, so the sentence and the number are asserted
    // across that boundary rather than as one unbroken string.
    expect(drawn).toMatch(/Without a receipt:<\/strong>\s*1/)
  })
})

// ============================================================ 5. the pictures, when a run asks for them

describe('the citizen’s page, photographed', () => {
  /**
   * PHOTOGRAPH THE PAGE AT THE WIDTHS AND IN BOTH THEMES when `RUNS_SHOTS` names a directory. The
   * mutation and control runs leave the variable unset and take no picture.
   */
  it.skipIf(!process.env['RUNS_SHOTS'])('photographs two runs on two models, runs with no receipts, and the runs the compaction count can and cannot see', async () => {
    const { mkdirSync } = await import('node:fs')
    const shots = process.env['RUNS_SHOTS'] as string
    mkdirSync(shots, { recursive: true })
    const live = await liveApp({ name: 'p91-runs', viewport: { width: 1440, height: 1000 }, workspace: 'default', database: t.file })
    try {
      for (const [handle, name] of [['two-models', 'two-models'], ['no-receipt', 'no-receipt'], ['compacted', 'compacted'], ['only-codex', 'only-codex']] as const) {
        await live.page.goto(`${live.site}/?mode=inspect#/who/agent/${handle}`, { timeout: 60_000 })
        await waitForThePage(live.page, 60_000)
        await live.page.getByTestId('profile-run').first().waitFor()
        for (const width of [1440, 990, 660, 390]) {
          for (const theme of ['light', 'dark'] as const) {
            await live.page.setViewportSize({ width, height: 1000 })
            await live.page.emulateMedia({ colorScheme: theme })
            await live.page.screenshot({ path: `${shots}/p91-${name}-${String(width)}-${theme}.png`, fullPage: true })
          }
        }
      }
    } finally {
      await live.stop()
    }
  }, 300_000)
})
