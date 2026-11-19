// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE GATE RULE, AND NOW ONE CARRIER TO DRIVE IT THROUGH.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, AND WHAT CHANGED UNDER IT
 * ---------------------------------------------------------------------------------------
 *
 * A gate says how much a dependency blocks. It used to be writable in TWO places: on a `blocks`
 * link, and on a pipeline step's `needs`. One meaning, two carriers, two separate write paths —
 * `createLink` in server/lib/records.ts and the pipeline shape check in shared/kinds.ts.
 *
 * Half the rule lived in each. `gateIsWellFormed` in shared/work.ts held "a partial gate must say
 * how far", and "a hard gate must not say how far" existed only inside the step check. The stages
 * audit of 2026-08-10 measured what that cost: `{"kind":"hard","upTo":"…"}` was **stored** on a
 * link and **refused** on a step, so the rule the server published at `GET /api/kinds` was false
 * for half the gates in the product. Nothing failed, because nothing drove the two paths together.
 *
 * THE SECOND CARRIER IS GONE. A pipeline block is a record, so what a block waits on is a `blocks`
 * link like every other dependency, and there is exactly one write path a gate can arrive through.
 * This file therefore does three things rather than one:
 *
 *   1. Drives every gate shape through the one real write path and compares it against the
 *      predicate in shared/work.ts — the same drift test, with one carrier instead of two.
 *   2. ASSERTS THAT THERE IS STILL ONLY ONE CARRIER. A second nested shape publishing gate rules
 *      would be the old defect coming back, and it would come back silently.
 *   3. ASSERTS THAT WHAT IS PUBLISHED IS WHAT IS ENFORCED, BOTH WAYS. Added 2026-08-10, after the
 *      migration was found to have deleted the rules' only publication along with the shape that
 *      carried it — see the note above those tests for what that cost.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WOULD MAKE EACH TEST BELOW FAIL
 * ---------------------------------------------------------------------------------------
 *
 *   ENFORCED NOWHERE — *a hard gate that says how far is refused* fails, because it states the
 *   decision itself rather than comparing two implementations of it.
 *
 *   ENFORCED SOMEWHERE ELSE AS WELL — *the gate has one carrier* fails, because it looks for any
 *   other place in the contract that claims to enforce a gate.
 *
 *   ENFORCED BUT NOT PUBLISHED — *publishes a rule for every gate the write path refuses* fails,
 *   because it drives the broken gate through the write path and then looks for the sentence in
 *   the served document.
 *
 *   PUBLISHED BUT NOT ENFORCED — *publishes no gate rule the write path does not apply* fails,
 *   because it reads the document and requires a refused gate to exist for every rule in it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { ALL_ROUTE_NOTES } from '../src/server/api/kinds.ts'
import { KIND_SPECS, SHAPE_SPECS, describeKinds } from '../src/shared/kinds.ts'
import { LINK_TYPES } from '../src/shared/types.ts'
import {
  GATE_FAULTS,
  GATE_FAULT_RULES,
  GATE_KINDS,
  gateFault,
  gateIsWellFormed,
  type Gate,
  type GateFault,
} from '../src/shared/work.ts'

let t: TestDb

beforeAll(async () => {
  t = await freshDb()
}, 120_000)
afterAll(() => {
  t.close()
})

// ------------------------------------------------------------------------------ the gates

interface GateCase {
  /** How a person would say it, so a failure names the gate rather than an index. */
  name: string
  gate: Gate
  /** What shared/work.ts says is wrong with it, or null when nothing is. */
  fault: GateFault | null
}

const CASES: readonly GateCase[] = [
  { name: 'a hard gate that says nothing more', gate: { kind: 'hard' }, fault: null },
  {
    name: 'a partial gate that names a stage',
    gate: { kind: 'partial', upTo: 'kinematics checked in simulation' },
    fault: null,
  },
  { name: 'a partial gate that does not say how far', gate: { kind: 'partial' }, fault: 'partial_without_upTo' },
  {
    name: 'a hard gate that says how far',
    gate: { kind: 'hard', upTo: 'bench tuning without the arm' },
    fault: 'hard_with_upTo',
  },
]

// --------------------------------------------------------------------- driving the one carrier

/** What the write path did with a gate: took it, or refused it and said something. */
interface Attempt {
  accepted: boolean
  /** The refusal, or null when the write was taken. */
  message: string | null
}

/**
 * A different title every time.
 *
 * NOT BECAUSE THE DATABASE REQUIRES IT — `records_title_idx` stopped being UNIQUE on 17 August 2026.
 * Because a failure here names the record it was about, and two records of one name would make that
 * message say nothing.
 */
let n = 0

/**
 * Write the gate on a `blocks` link, through the same call POST /api/links makes.
 *
 * A fresh pair of records each time: creating the same link twice is idempotent by design, so a
 * reused pair would answer about the stored gate rather than about this one.
 */
function onALink(gate: Gate): Attempt {
  n += 1
  const blocker = t.api.createRecord({ workspaceId: 'default', kind: 'problem', title: `The real arm is in pieces (${n})`, actor: t.api.HUMAN })
  const blocked = t.api.createRecord({ workspaceId: 'default', kind: 'module', title: `YuMi digital twin (${n})`, actor: t.api.HUMAN })
  try {
    t.api.createLink({ fromId: blocker.id, toId: blocked.id, type: 'blocks', gate, actor: t.api.HUMAN })
    return { accepted: true, message: null }
  } catch (err) {
    if (!(err instanceof t.api.PanelError)) throw err
    expect(err.status, `a refused link should be a 400, not ${err.status}`).toBe(400)
    // A refusal stores nothing. Half a gate stored is worse than the write never happening: it
    // reads as a qualified dependency that says less than it looks like it says.
    expect(t.api.resolveLinks(blocker.id), 'a refused gate left a link behind').toHaveLength(0)
    return { accepted: false, message: err.message }
  }
}

/**
 * The same gate on a dependency BETWEEN TWO BLOCKS, which is what a step's `needs` became.
 *
 * It goes through `createLink` too, and that is the point of the test rather than an incidental
 * detail: the dependency graph inside a pipeline stopped being a second system.
 */
function betweenTwoBlocks(gate: Gate): Attempt {
  n += 1
  const pipeline = t.api.createRecord({ workspaceId: 'default', kind: 'pipeline', title: `Transplant v2 (${n})`, data: { blockIds: [] }, actor: t.api.HUMAN })
  const first = t.blocks.addBlock(pipeline.id, { name: 'Sense the pot', state: 'done' }, t.api.HUMAN)
  const second = t.blocks.addBlock(pipeline.id, { name: 'Plan the approach', state: 'blocked' }, t.api.HUMAN)
  try {
    t.api.createLink({ fromId: first.block.id, toId: second.block.id, type: 'blocks', gate, actor: t.api.HUMAN })
    return { accepted: true, message: null }
  } catch (err) {
    if (!(err instanceof t.api.PanelError)) throw err
    expect(err.status, `a refused link should be a 400, not ${err.status}`).toBe(400)
    return { accepted: false, message: err.message }
  }
}

// -------------------------------------------------------------------------------- the tests

describe('one gate rule, on the one carrier a gate can live on', () => {
  it('answers the same as the predicate, for every gate', () => {
    // THE DRIFT TEST. The write path and `gateIsWellFormed` go into one assertion, so either one
    // differing from the other fails here and the failure prints which.
    for (const { name, gate, fault } of CASES) {
      const predicate = gateIsWellFormed(gate)
      const link = onALink(gate)
      expect({ link: link.accepted, predicate }, `${name}: the write path and gateIsWellFormed must agree`).toEqual({
        link: fault === null,
        predicate: fault === null,
      })
    }
  })

  it('answers the same between two blocks as between any other two records', () => {
    // A dependency inside a pipeline used to be checked by a different function with a different
    // half of the rule. It is the same link and the same check now, and this is what says so.
    for (const { name, gate, fault } of CASES) {
      expect(betweenTwoBlocks(gate).accepted, `${name}: a gate between two blocks`).toBe(fault === null)
    }
  })

  it('names the same fault for every gate, in one declaration', () => {
    // The predicate is `gateFault` with the reason dropped, and nothing else may decide either.
    for (const { name, gate, fault } of CASES) {
      expect(gateFault(gate), name).toBe(fault)
      expect(gateIsWellFormed(gate), name).toBe(fault === null)
    }
  })

  it('exercises every fault the rule can name', () => {
    // Stops this file going stale. A third fault added to GATE_FAULTS has no case here until
    // somebody writes one, and until then this says so rather than passing quietly.
    const covered = new Set(CASES.map((c) => c.fault).filter((f): f is GateFault => f !== null))
    expect([...GATE_FAULTS].filter((f) => !covered.has(f)), 'faults with no case above').toEqual([])
  })

  // ---------------------------------------------------------------- the decision, stated once

  it('refuses a partial gate that does not say how far', () => {
    const gate: Gate = { kind: 'partial' }
    expect(onALink(gate).accepted).toBe(false)
    expect(onALink(gate).message).toContain('upTo')
    expect(onALink(gate).message).toContain('partial')
  })

  it('refuses a hard gate that says how far', () => {
    // THE DECISION, and the half that was missing until 2026-08-10: refused, not ignored. Ignoring
    // would store a stage nothing reads, and drop a sentence the author wrote without telling them.
    const gate: Gate = { kind: 'hard', upTo: 'this should be refused' }
    expect(onALink(gate).accepted, 'a hard gate carrying upTo was stored').toBe(false)
    expect(onALink(gate).message).toContain('upTo')
  })

  it('tells the caller WHICH fault it committed, and not the other one', () => {
    // AGREEING ON THE VERDICT IS NOT AGREEING. When the hard-gate half moved into `gateFault`, the
    // link path started refusing this gate and went on giving the only reason it had ever known:
    // `{"kind":"hard","upTo":"…"}` came back 400 saying "A partial gate has to say how far", which
    // is about a request the caller did not make.
    const hard = String(onALink({ kind: 'hard', upTo: 'bench tuning without the arm' }).message)
    expect(hard, 'the refusal must say the gate is hard').toContain('hard')
    expect(hard, 'a hard gate carrying a stage is not "a partial gate that says nothing"').not.toMatch(
      /A partial gate has to say how far|is required and is not there/,
    )
    // It has to offer the two gates the author might have meant, because only they know which.
    expect(hard, 'the refusal must offer "partial" as the other reading').toContain('partial')

    const partial = String(onALink({ kind: 'partial' }).message)
    expect(partial, 'the refusal must say the gate is partial').toContain('partial')
    expect(partial, 'a partial gate with no stage is not "a hard gate carrying one"').not.toMatch(
      /must not say how far|must NOT carry/,
    )
  })

  // ------------------------------------------------------------------ there is only one carrier

  it('has exactly one carrier, and nothing nested claims to be a second', () => {
    // THE OLD DEFECT, GUARDED AGAINST COMING BACK. `StepNeed` was a nested shape that published and
    // enforced its own half of this rule, and the two halves drifted for months with nothing
    // failing. Nothing nested may publish a gate rule again; if a shape needs one, the gate has
    // grown a second carrier and this file has to be rewritten rather than quietly extended.
    for (const shape of Object.values(SHAPE_SPECS)) {
      for (const rule of shape.rules ?? []) {
        expect(rule, `${shape.name} publishes a gate rule, so a gate has two carriers again`).not.toContain('gate')
      }
    }
    // A pipeline's own rules are about its ORDER, not about what waits on what. Order and
    // dependency were one field until a block became a record, and keeping them apart is the point.
    expect(KIND_SPECS.pipeline.rules?.join(' ')).not.toContain('gate')
  })

  it('names no second carrier in the ENGLISH an agent reads at GET /api', () => {
    // THE SAME DEFECT AS THE TEST ABOVE, IN THE OTHER DOCUMENT, AND IT WAS LIVE UNTIL 2026-08-10.
    // The `StepNeed` shape was deleted and its `rules` went with it, which the test above now
    // guards. What nobody looked at was the ROUTE NOTE: `POST /api/links` went on telling callers
    // "for step-to-step order inside a pipeline the gate goes on the step's own `needs`", months
    // after `needs` stopped existing. An agent that believed it would have written a gate into a
    // key POST /api/records/:id/blocks refuses, and the README tells agents to read GET /api
    // INSTEAD of the source, so there was nowhere else for them to find out.
    //
    // THE RULE, checked without reading English: in any published sentence about a gate, every
    // identifier written in backticks must be a name this contract really has. `needs` was not one
    // — it had been deleted — and that is how the stale sentence is caught. Nothing about the
    // sentence's meaning is parsed, so nothing here can be argued with.
    //
    // MOST OF THE LIST IS DERIVED RATHER THAN TYPED. The link types come from LINK_TYPES and the
    // gate words from GATE_KINDS, so a link type renamed tomorrow moves this check with it instead
    // of leaving a list to fall behind — which is the defect this file is about, and it would be
    // absurd to rebuild it inside the test that watches for it. Only the four gate field names are
    // written out, because they are the fields whose existence is the subject here: adding a fifth
    // is somebody asserting that a gate has grown another place to live.
    const namesThisContractHas = new Set([
      'gate', // the key on the wire
      'upTo', // the half a partial gate must carry
      'gateUpTo', // the stored column, which the export and the import both name
      'gateLabel', // the read side: the same pair said in words
      'gateProblem', // the read side: what is wrong with a stored pair that cannot be read
      ...GATE_KINDS,
      ...Object.keys(LINK_TYPES),
    ])

    const offenders: string[] = []
    for (const [endpoint, note] of Object.entries(ALL_ROUTE_NOTES)) {
      // Sentence by sentence, so an identifier in a sentence about something else is not dragged in
      // by a note that happens to mention a gate somewhere.
      for (const sentence of note.split(/(?<=\.)\s+/)) {
        if (!/\bgate\b/i.test(sentence)) continue
        for (const [, identifier] of sentence.matchAll(/`([A-Za-z][A-Za-z0-9_.]*)`/g)) {
          if (identifier === undefined || namesThisContractHas.has(identifier)) continue
          offenders.push(`${endpoint}: \`${identifier}\` — "${sentence.trim().slice(0, 120)}"`)
        }
      }
    }

    expect(
      offenders,
      'a published sentence about a gate names an identifier that is not one a gate can live on. ' +
        'Either the prose is stale — that is what this test was written for — or a gate really has ' +
        'a second carrier, in which case this whole file needs rewriting rather than this list extending.',
    ).toEqual([])

    // Not vacuous: the notes really are full of gate prose with backticked identifiers in it, so an
    // empty offender list means the check looked and found nothing wrong.
    const examined = Object.values(ALL_ROUTE_NOTES)
      .flatMap((note) => note.split(/(?<=\.)\s+/))
      .filter((sentence) => /\bgate\b/i.test(sentence) && /`[A-Za-z]/.test(sentence))
    expect(examined.length, 'sentences about a gate that name an identifier').toBeGreaterThan(2)
  })

  // -------------------------------------------------------- published is what enforced, both ways
  //
  // THE DEFECT THESE FOUR WERE WRITTEN FOR, MEASURED ON 2026-08-10. Deleting the `StepNeed` shape
  // deleted the only publication of the gate rules with it — they had been served as that shape's
  // `rules`, from GATE_FAULT_RULES — and left the imports standing in shared/kinds.ts. So the
  // product went on REFUSING `{"kind":"hard","upTo":"…"}` while its schema document said nothing
  // about a hard gate at all, and the test above passed the whole time, because it read the
  // constant rather than the document an agent is told to read.
  //
  // A rule you can only find out about by being refused is the same defect as a rule that is
  // published and not enforced. Both were live in this product this month, on this one rule.

  it('publishes, at GET /api/kinds, the vocabulary and the rules from the declarations themselves', () => {
    // Through JSON, because an agent reads bytes. A rule that survives as an object and not as a
    // reply is not published.
    const wire = JSON.parse(JSON.stringify(describeKinds().gate)) as {
      kinds: string[]
      rules: string[]
      examples: Gate[]
    }
    expect(wire.kinds, 'the published gate vocabulary').toEqual([...GATE_KINDS])
    expect(wire.rules, 'the published gate rules').toEqual(GATE_FAULTS.map((fault) => GATE_FAULT_RULES[fault]))
  })

  it('publishes a rule for every gate the write path refuses', () => {
    // Direction one. Drive each broken gate through the real write path, then require the document
    // to contain the sentence for the fault it committed. This is what failed before today.
    const published = describeKinds().gate.rules
    for (const { name, gate, fault } of CASES) {
      if (fault === null) continue
      expect(onALink(gate).accepted, `${name}: should have been refused`).toBe(false)
      expect(
        published,
        `${name}: the write path refuses this gate and GET /api/kinds does not say the rule it broke`,
      ).toContain(GATE_FAULT_RULES[fault])
    }
  })

  it('publishes no gate rule the write path does not apply', () => {
    // Direction two, and it is not the same test. A document may also be wrong by claiming MORE
    // than the code does, which is the half that was true of this product before the hard-gate rule
    // moved into `gateFault`: the schema published a rule the link path did not enforce.
    const published = describeKinds().gate.rules
    const demonstrated = new Set(
      CASES.filter((c): c is GateCase & { fault: GateFault } => c.fault !== null).map((c) => GATE_FAULT_RULES[c.fault]),
    )
    expect(
      published.filter((rule) => !demonstrated.has(rule)),
      'published as a rule of the gate, and no gate above is refused for breaking it',
    ).toEqual([])
  })

  it('publishes examples the write path really stores, one of each kind', () => {
    // The rules are both about whether `upTo` is there, and prose about the presence of a key is
    // harder to act on than an object to copy. So the examples are held to the same standard as the
    // rules: each goes through the write path, and one that cannot be stored cannot be published.
    const { kinds, examples } = describeKinds().gate
    expect(examples.map((gate) => gate.kind), 'one published example per gate kind').toEqual([...kinds])
    for (const example of examples) {
      expect(gateFault(example), `the published example ${JSON.stringify(example)}`).toBeNull()
      expect(onALink(example).accepted, `the published example ${JSON.stringify(example)} was refused`).toBe(true)
    }
  })

  // ----------------------------------------------------------------------- a blank stage

  it('treats a blank stage as no stage', () => {
    // One question — does this gate name a stage — asked once, so the two halves of the rule cannot
    // come to different views of what an empty string is.
    expect(gateFault({ kind: 'partial', upTo: '   ' })).toBe('partial_without_upTo')
    expect(gateFault({ kind: 'hard', upTo: '   ' })).toBeNull()
    expect(onALink({ kind: 'partial', upTo: '   ' }).accepted).toBe(false)
    expect(onALink({ kind: 'hard', upTo: '   ' }).accepted).toBe(true)
  })
})
