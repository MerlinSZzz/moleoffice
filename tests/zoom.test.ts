// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHORTER FORMS OF ONE PIECE OF WRITING: the declaration, the budgets, and the two rules
 * that stop a short form being a cut.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS BEING PROVED HERE
 * ---------------------------------------------------------------------------------------
 *
 * Every screen in Mole Office that has no room for a whole report today cuts the text with an ellipsis.
 * A cut is not a shorter form: it keeps whichever words came first, which on a report is the setup
 * rather than the result. So the lengths are semantic roles with word budgets, and the two
 * things that must hold are that each length is written for its own job and that none of them is
 * produced by slicing something longer.
 *
 * ---------------------------------------------------------------------------------------
 * ONE WHOLE-RECORD FORM IS STORED NOW, AND THAT MOVED WHERE THE CUTTING RULE IS ASKED
 * ---------------------------------------------------------------------------------------
 *
 * Criterion A14b of design/pointing-reopened/ACCEPTANCE.md, 3 September 2026: reading length 2 IS
 * the record's own `title` column and length 3 IS its own `summary`, so `data.shortForms` holds one
 * whole-record form, the label, and the by-part structure. Two budgets went with the two lengths —
 * a title and a summary are targets and neither is refused for its length — and the comparison of
 * one stored form against a longer stored one has a single form left to make it about. So the
 * cutting rule is asked here against the RECORD'S OWN WRITING, which is where it still bites, and
 * the cases that used to pair a label against a gist say above them what they used to assert.
 *
 * The other half — whether a stored short form still describes the record it was written from — is
 * in tests/zoom-api.test.ts, because it needs the revision ledger.
 *
 * WHY THE DECLARATION IS TESTED AGAINST ITSELF. `SHORT_FORM_SPECS` publishes an example at every
 * length, and those examples are served at GET /api/kinds as what a caller should copy. An example
 * that breaks its own budget is documentation instructing somebody to be refused.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { freshDb, type TestDb } from './helpers.ts'
import { KIND_SPECS, SHAPE_SPECS, kindHoldsPartsLevels, validateData, validateShape } from '../src/shared/kinds.ts'
import { RECORD_KINDS, type RecordKind } from '../src/shared/types.ts'
import {
  PARTS_KEY,
  SHORT_FORMS_FIELD,
  SHORT_FORM_LEVELS,
  SHORT_FORM_SPECS,
  atLevel,
  budgetProblem,
  countWords,
  isCutOf,
  looksCut,
  maxCharacters,
  readStoredShortForms,
  shortFormProblems,
  textsOf,
  type ShortFormLevel,
} from '../src/shared/zoom.ts'

type SummaryLib = typeof import('../src/server/lib/summary.ts')

let t: TestDb
let summary: SummaryLib

beforeAll(async () => {
  // summary.ts reaches records.ts and through it the database, so it may only be imported once
  // MOLE_OFFICE_DB points at a throwaway file. Nothing in this file writes a row, so one office
  // for the file answers everything below.
  t = await freshDb()
  summary = await import('../src/server/lib/summary.ts')
}, 60_000)

afterAll(() => {
  t.close()
})

/** A revision pair the shape checker accepts. Nothing in this file asks the ledger about it. */
const MADE_FROM = { seq: 1, contentHash: 'aaaaaaaaaaaaaaaa' }

const form = (text: string, writtenBy: 'agent' | 'human' = 'agent') => ({ text, madeFrom: MADE_FROM, writtenBy })

/** The paths a refusal named, so a test reads what a caller would be told. */
function refusalPaths(kind: RecordKind, data: Record<string, unknown>): string[] {
  const result = validateData(kind, data)
  return result.ok ? [] : result.errors.map((e) => e.path)
}

function refusalText(kind: RecordKind, data: Record<string, unknown>): string {
  const result = validateData(kind, data)
  return result.ok ? '' : result.errors.map((e) => e.message).join(' ')
}

// ============================================================================ the declaration

describe('the three whole-record lengths are declared once, and the declaration obeys itself', () => {
  it('names three lengths, shortest budget first, each with a job and a word budget', () => {
    expect(SHORT_FORM_LEVELS).toEqual(['label', 'title', 'gist'])
    for (const level of SHORT_FORM_LEVELS) {
      const spec = SHORT_FORM_SPECS[level]
      expect(spec.level, 'the key and the spec agree').toBe(level)
      expect(spec.noun.length, `${level}.noun`).toBeGreaterThan(2)
      // THE WORD IN FRONT OF THE NOUN IS DECLARED AND NOT WORKED OUT. `an account` was the length
      // that made this a field: every refusal in the file writes the article, and a guess from the
      // first letter is wrong for ordinary English words. The account is retired and the field is
      // not, because the next length somebody adds may take `an` too.
      expect(['a', 'an'], `${level}.article`).toContain(spec.article)
      expect(spec.what.length, `${level}.what`).toBeGreaterThan(30)
      expect(spec.maxWords, `${level} budget`).toBeGreaterThanOrEqual(spec.minWords)
    }
    // The budgets grow. Two lengths may overlap — a title may be shorter than a label, because they
    // are different jobs — but the CEILINGS have to climb or the three are not three lengths.
    const ceilings = SHORT_FORM_LEVELS.map((level) => SHORT_FORM_SPECS[level].maxWords)
    expect(ceilings).toEqual([...ceilings].sort((a, b) => a - b))
    expect(new Set(ceilings).size, 'no two lengths share a ceiling').toBe(ceilings.length)
  })

  it('publishes an example at every length that fits that length, because a caller copies it', () => {
    for (const level of SHORT_FORM_LEVELS) {
      expect(budgetProblem(level, SHORT_FORM_SPECS[level].example), `${level} example`).toBeNull()
    }
  })

  it('publishes examples that are not cuts of each other, which is the rule they demonstrate', () => {
    const texts = Object.fromEntries(SHORT_FORM_LEVELS.map((level) => [level, SHORT_FORM_SPECS[level].example]))
    expect(shortFormProblems(texts), 'the declared examples break the declared rule').toEqual([])
  })
})

// ============================================================================ the budgets

describe('a word budget has two ends and both are enforced', () => {
  it('refuses a gist too short to be one, because that is a label in the gist\'s place', () => {
    // A screen that asked for the useful conclusion would be handed a name, with nothing saying so.
    const problem = budgetProblem('gist', 'It cracked')
    expect(problem).toContain('2 words')
    expect(problem).toContain('at least 20')
  })

  it('refuses a label too long to be one', () => {
    const problem = budgetProblem('label', 'The printed wrist mount cracked under load during the handover trial')
    expect(problem).toContain('at most 5')
  })

  it('refuses a blank one and says to leave the length out instead', () => {
    const problem = budgetProblem('label', '   ')
    expect(problem).toContain('blank')
    expect(problem).toContain('Leave the level out')
  })

  it('refuses anything ending in an ellipsis, in both spellings, because that is the end of a cut', () => {
    expect(looksCut('The printed wrist mount cracks at…')).toBe(true)
    expect(looksCut('The printed wrist mount cracks at...')).toBe(true)
    expect(looksCut('The printed wrist mount cracked.')).toBe(false)
    expect(budgetProblem('label', 'Wrist mount cracks…')).toContain('ellipsis')
  })

  it('counts a Chinese character as a word, so a Chinese label is judged like any other', () => {
    // WHY THIS IS HERE AND NOT SPECULATIVE. Words were counted by splitting on spaces until 6
    // September 2026, so a whole paragraph of Chinese counted as ONE word and sailed through a
    // five-word budget, while a real four-character label was refused for being shorter than two.
    // Titles in this corpus are written in Chinese — tests/presentation-api.test.ts files a module
    // called 夹具标定 — so both cases are real rather than imagined.
    const short = '夹具标定'
    expect(countWords(short), 'four characters of Chinese are four words').toBe(4)
    expect(budgetProblem('label', short), 'a real short label passes on its own terms').toBeNull()

    const paragraph = '夹'.repeat(maxCharacters('label') + 1)
    expect(countWords(paragraph)).toBe(maxCharacters('label') + 1)
    expect(budgetProblem('label', paragraph)).toContain('may be at most 5')
  })

  it('still catches a long run with no spaces in a script that has them', () => {
    // THE CHARACTER CEILING IS WHAT IS LEFT FOR LATIN. One enormous token is one word however much
    // is written in it, and no word count in any script can see that.
    // The title's low end is one word, so this level is where the ceiling is what answers.
    const oneHugeToken = 'a'.repeat(maxCharacters('title') + 1)
    expect(countWords(oneHugeToken), 'one token is one word').toBe(1)
    const problem = budgetProblem('title', oneHugeToken)
    expect(problem).toContain('characters')
  })

  it('judges the low end by characters where there is no space to count words by', () => {
    // THIS TEST FOUND A DEFECT AND THE PRODUCT CHANGED. Written first, it failed on `夹具标定`: a real
    // four-character label was refused for being one word where two were wanted, so the low end
    // falls back to characters for a text with no spaces. What that must NOT do is leave the low end
    // unjudged, which is the second line below.
    //
    // IT SURVIVED THE COUNT CHANGE OF 6 SEPTEMBER 2026, and the third line is why. `countWords` now
    // counts a Chinese character as a word, so the fallback is no longer what carries `夹具标定` —
    // but the test secretary's name is still one word, and every one-word name a registry holds needs it.
    expect(budgetProblem('gist', '夹'), 'one character is not a gist in any script').toContain('at least 20')
    expect(budgetProblem('gist', '夹'.repeat(30)), 'thirty characters of it is').toBeNull()
    expect(budgetProblem('label', THE_TEST_OFFICES_SECRETARY.name), 'a one-word name is a name').toBeNull()
    expect(budgetProblem('gist', 'far too short'), 'and three English words are not a conclusion').toContain('at least 20')
  })
})

// ============================================================================ no cutting

describe('no short form is made by cutting a longer one', () => {
  it('knows the opening of a text from a text that merely starts the same way', () => {
    const full = 'The printed wrist mount cracks at fifteen newtons. The trials need twenty.'
    expect(isCutOf('The printed wrist mount cracks', full), 'a slice of the front').toBe(true)
    expect(isCutOf('the  PRINTED wrist mount', full), 'spacing and case are flattened first').toBe(true)
    expect(isCutOf(full, full), 'a copy is a cut of nothing at all, which is the same fault').toBe(true)
    expect(
      isCutOf('The printed wrist mount is out of the handover trials', full),
      'sharing an opening is not being a cut, and refusing that would refuse honest writing',
    ).toBe(false)
    expect(isCutOf('newtons. The trials', full), 'the middle is not the opening').toBe(false)
  })

  it('is not defeated by one character of punctuation, which is what it used to be', () => {
    // THE DEFECT THIS REPLACES, MEASURED. The comparison was a prefix test on the whole flattened
    // string. So a cut ending mid-sentence passed the moment somebody typed a full stop after it,
    // and a mid-sentence truncation of a misleading opening was stored as a gist and read back as
    // current. The comparison is now over WORDS, with the punctuation at each end of a word off.
    const full =
      'Everything on the bench passed the first check and the rig ran overnight without a single complaint ' +
      'from anybody watching it. The gripper dropped the part on the ninth cycle.'
    const cut = 'Everything on the bench passed the first check and the rig ran overnight'
    expect(isCutOf(cut, full), 'the plain cut').toBe(true)
    expect(isCutOf(`${cut}.`, full), 'a full stop is not writing').toBe(true)
    expect(isCutOf(`${cut}!`, full)).toBe(true)
    expect(isCutOf(`${cut},`, full)).toBe(true)
    expect(isCutOf(`${cut}…`, full), 'and an ellipsis was never the only mark').toBe(true)
    expect(isCutOf(`"${cut}"`, full), 'quoting it does not make it written').toBe(true)
  })

  it('catches a cut that landed in the middle of a word, because a character count does that', () => {
    const full = 'The printed wrist mount cracks at fifteen newtons.'
    expect(isCutOf('The printed wrist mount crac', full)).toBe(true)
    expect(isCutOf('The printed wrist mount crackle', full), 'a different word is not a cut').toBe(false)
  })

  it('still says nothing about writing that changes one word, and Mole Office says so out loud', () => {
    // THE HONEST LIMIT. No comparison of text can tell a cut somebody reworded from writing, so this
    // is what the check does NOT catch, held open by a test rather than left for somebody to find.
    // src/shared/zoom.ts states it in its header and the write route states it in its own note.
    const full = 'The printed wrist mount cracks at fifteen newtons under the load the trials need.'
    expect(isCutOf('The printed wrist mount broke at fifteen newtons', full)).toBe(false)
  })

  /** A body a label could be sliced off the front of, for the two cases below. */
  const A_RECORD_THAT_SAYS_SOMETHING = [
    {
      id: 'b-1',
      type: 'text' as const,
      text: 'The printed wrist mount cracked at about fifteen newtons on three of four samples.',
    },
  ]

  /**
   * THIS CASE READ `refuses a label that is the opening of the gist beside it` UNTIL 3 SEPTEMBER
   * 2026, and it compared two forms stored side by side under `data.shortForms`. Criterion A14b of
   * design/pointing-reopened/ACCEPTANCE.md left ONE whole-record form there — the label — because
   * reading length 2 is the record's own `title` column now and length 3 is its own `summary`. So
   * there is no second stored form for a label to be the opening of, and the loop in
   * `shortFormProblems` that compares a shorter form with a longer one has no pair left to walk.
   *
   * THE RULE DID NOT GO WITH THE PAIR, so this asks it where it still bites: against the record's
   * own writing. `checkShortFormsAgainstBody` is the one place on the write path holding both a
   * body and the forms written from it, and it refuses the same fault in the same words.
   *
   * BOTH HALVES ARE ASKED IN ONE CASE ON PURPOSE. The budget half runs in the browser and holds no
   * body, so it cannot see this and says nothing; a reader who saw only that answer would think a
   * clean set had been checked for cutting. It has not.
   */
  it('refuses a label that is the opening of the record’s own writing, which no budget check can see', () => {
    expect(shortFormProblems({ label: 'The printed wrist' }), 'the budget half sees nothing wrong').toEqual([])
    expect(() =>
      summary.checkShortFormsAgainstBody({ label: form('The printed wrist') }, A_RECORD_THAT_SAYS_SOMETHING),
    ).toThrow(/is the opening of what this record says/)
  })

  it('says nothing about a label written for its own job', () => {
    expect(shortFormProblems({ label: SHORT_FORM_SPECS.label.example })).toEqual([])
    expect(() =>
      summary.checkShortFormsAgainstBody(
        { label: form(SHORT_FORM_SPECS.label.example) },
        A_RECORD_THAT_SAYS_SOMETHING,
      ),
    ).not.toThrow()
  })

  /**
   * THIS USED TO READ `reports a broken budget instead of comparing a form that is already wrong`,
   * and the second half of it — the comparison this seven-word label was held back from — went with
   * the pair, for the reason above. What it still asks is the half a writer acts on: the budget,
   * named with its number.
   */
  it('reports a broken budget on a label that runs over it', () => {
    const problems = shortFormProblems({ label: 'The printed wrist mount cracks at about' })
    expect(problems.map((p) => p.level)).toEqual(['label'])
    expect(problems[0]?.message).toContain('at most 5')
  })
})

// ============================================================================ asking for one

describe('asking for a length nobody has written', () => {
  /**
   * THE PAIR THIS ASKS ABOUT TURNED ROUND ON 3 SEPTEMBER 2026, and what it asserts did not.
   *
   * It used to be `a row asked for a label and has room for one` while a gist was stored beside it,
   * and `written` came back `['gist']`. Criterion A14b of design/pointing-reopened/ACCEPTANCE.md
   * left the label as the only whole-record form stored under `data.shortForms`, so a stored gist
   * is not a thing this function is ever handed: `textsOf` reads the stored lengths and there is
   * one. The pair that still exists runs the other way — a paragraph asked for, a label written —
   * and the substitution would be worse, three words drawn where a reader expected a conclusion.
   */
  it('never hands back a different length, because a screen asked for a paragraph and has room for one', () => {
    const answer = atLevel({ label: 'Wrist mount load test' }, 'gist')
    expect(answer.found).toBe(false)
    if (answer.found) return
    expect(answer.wanted).toBe('gist')
    expect(answer.written, 'it says what DOES exist, so a caller can fall back in the open').toEqual(['label'])
    expect(answer.says).toContain(`Nobody has written a ${SHORT_FORM_SPECS.gist.noun}`)
  })

  it('tells apart "there is none at this length" from "there is nothing at all"', () => {
    const nothing = atLevel({}, 'gist')
    expect(nothing.found).toBe(false)
    if (nothing.found) return
    expect(nothing.written).toEqual([])
    expect(nothing.says).toContain('or any other short form')
  })

  it('hands back the words when they are there', () => {
    const answer = atLevel({ label: 'Wrist mount load test' }, 'label')
    expect(answer.found).toBe(true)
    if (!answer.found) return
    expect(answer.text).toBe('Wrist mount load test')
  })
})

// ============================================================================ reading what is stored

describe('reading short forms out of a stored record', () => {
  it('leaves out anything that is not a whole short form rather than half-reading it', () => {
    const stored = readStoredShortForms({
      label: form('Wrist mount load test'),
      title: { text: 'no revision here', writtenBy: 'agent' },
      gist: { text: 'no author here', madeFrom: MADE_FROM },
    })
    expect(Object.keys(stored)).toEqual(['label'])
    expect(textsOf(stored)).toEqual({ label: 'Wrist mount load test' })
    // The other two half-written shapes. They used to ride along on `card` and `brief`; those keys
    // are retired as reading lengths, so the shapes are asked about on the three that are left.
    expect(Object.keys(readStoredShortForms({ title: 'a bare string' })), 'not an object').toEqual([])
    expect(
      Object.keys(readStoredShortForms({ gist: { text: '   ', madeFrom: MADE_FROM, writtenBy: 'agent' } })),
      'a text that is only spaces',
    ).toEqual([])
    // A WHOLE FORM UNDER A RETIRED KEY IS STILL NOT A READING LENGTH. This case used to be `card`
    // and `brief` carrying half-written values; the keys are retired now, so what is asked here is
    // that a perfectly-formed one under one of them comes back as nothing at all.
    expect(
      Object.keys(readStoredShortForms({ account: form('The printed wrist mount cracked under load') })),
      'a retired key',
    ).toEqual([])
  })

  it('answers with nothing at all for a value that is not an object', () => {
    expect(readStoredShortForms(null)).toEqual({})
    expect(readStoredShortForms(['label'])).toEqual({})
    expect(readStoredShortForms(undefined)).toEqual({})
  })
})

// ============================================================================ the record contract

describe('which kinds carry short forms', () => {
  it('gives the written levels to every kind, including an annotation', () => {
    // THE DECISION: agreed, it should always have been allowed, and every kind is best given a
    // semantic level below its whole content — every kind may carry a level-1 name, by a decision from proposal
    // `dYDv5is4UTUJ`. Before it, only `module` and `report` had a place for one, so a chat link
    // to a problem drew the problem's whole twenty-word title.
    //
    // EVERY KIND, COUNTED RATHER THAN LISTED, so a twenty-seventh kind cannot arrive without one.
    const without = RECORD_KINDS.filter((kind) => !KIND_SPECS[kind].fields.some((f) => f.key === SHORT_FORMS_FIELD))
    expect(without, 'kinds with no place for a level-1 name').toEqual([])
    // An annotation is what a person wrote, kept exactly, and it was the one deliberate exception
    // before that decision. The label is a NAME for the annotation rather than a shortening of it:
    // the person's own words are untouched and are still what every screen draws.
    expect(KIND_SPECS.annotation.fields.map((f) => f.key)).toContain(SHORT_FORMS_FIELD)
  })

  it('gives the by-part levels to the kinds that hold blocks, and to no other kind', () => {
    // THE PAIRING IS THE TEST. Levels 4, 5 and 6 are written by part and a part names the ids of the
    // blocks it covers, so a kind with no blocks has nothing for a part to cover. The kinds whose
    // short-forms field carries `parts` are exactly the kinds declaring a SummaryBlock[] field.
    // Adding a third such kind and forgetting the by-part levels, or the other way round, is what
    // this catches, rather than a list here that would be the same fact written twice.
    const withBody: RecordKind[] = []
    const withParts: RecordKind[] = []
    for (const kind of RECORD_KINDS) {
      const fields = KIND_SPECS[kind].fields
      if (fields.some((f) => f.type === 'SummaryBlock[]')) withBody.push(kind)
      if (kindHoldsPartsLevels(kind)) withParts.push(kind)
      // AND THE SHAPE A KIND IS GIVEN SAYS THE SAME THING, so the schema a caller reads and the
      // question the code asks cannot come apart.
      const declared = fields.find((f) => f.key === SHORT_FORMS_FIELD)?.type
      expect(declared, `the shape of ${kind}'s short forms`).toBe(
        kindHoldsPartsLevels(kind) ? 'ShortFormsWithParts' : 'ShortForms',
      )
    }
    expect(withBody, 'the kinds that hold a body').toEqual(['module', 'report'])
    expect(withParts).toEqual(withBody)
    // AND THE SHAPE WITHOUT PARTS DOES NOT DECLARE THE KEY AT ALL, so GET /api/kinds/task does not
    // publish a field a task can never hold.
    expect(SHAPE_SPECS.ShortForms?.fields.map((f) => f.key)).not.toContain(PARTS_KEY)
    expect(SHAPE_SPECS.ShortFormsWithParts?.fields.map((f) => f.key)).toContain(PARTS_KEY)
  })

  it('publishes the three rules in English on both shapes, because a caller cannot read the function', () => {
    for (const name of ['ShortForms', 'ShortFormsWithParts']) {
      const rules = SHAPE_SPECS[name]?.rules ?? []
      expect(rules.length, `${name} rules`).toBe(3)
      expect(rules.join(' ')).toContain('cutting')
      expect(rules.join(' ')).toContain('word budget')
      expect(rules.join(' '), 'the rule that no level says more than the record').toContain('more than the record')
    }
  })
})

describe('the write gate refuses a short form that was not written', () => {
  const BLOCKS = [{ id: 'b-1', type: 'text', text: 'The mount cracked at fifteen newtons on three of four samples.' }]

  it('refuses a label over its budget, naming the level and the number', () => {
    const paths = refusalPaths('report', {
      blocks: BLOCKS,
      [SHORT_FORMS_FIELD]: { label: form('The printed wrist mount cracked under load during the handover trial') },
    })
    expect(paths).toEqual(['data.shortForms.label.text'])
    expect(refusalText('report', {
      blocks: BLOCKS,
      [SHORT_FORMS_FIELD]: { label: form('The printed wrist mount cracked under load during the handover trial') },
    })).toContain('at most 5')
  })

  it('refuses a half-written one rather than storing a form with no revision behind it', () => {
    const paths = refusalPaths('report', {
      blocks: BLOCKS,
      [SHORT_FORMS_FIELD]: { label: { text: 'Wrist mount load test', writtenBy: 'agent' } },
    })
    expect(paths).toEqual(['data.shortForms.label.madeFrom'])
  })

  it('refuses "system" as the author, because Mole Office writes none of these itself', () => {
    const paths = refusalPaths('report', {
      blocks: BLOCKS,
      [SHORT_FORMS_FIELD]: { label: form('Wrist mount load test', 'system' as 'agent') },
    })
    expect(paths).toEqual(['data.shortForms.label.writtenBy'])
  })

  /**
   * THIS SET USED TO BE A LABEL AND A GIST, and the case was called `accepts a set that was written
   * at each length`. Criterion A14b of design/pointing-reopened/ACCEPTANCE.md left one whole-record
   * length under this field — the label — because reading lengths 2 and 3 are the record's own
   * `title` and `summary` columns now.
   *
   * THE SHAPE STILL ACCEPTS A RETIRED KEY AND THAT IS DELIBERATE, so it is asked here rather than
   * left to be discovered. Records in this project hold text under `gist`; a shape that refused the
   * name would make every one of them unwritable, so what refuses a NEW gist is the write door on
   * the server — `settleShortForms` in src/server/lib/zoom.ts — which can ask the ledger whether
   * this record ever held those words. The browser cannot ask that question.
   */
  it('accepts the one whole-record length still written under this field, and a retired key beside it', () => {
    const result = validateData('report', {
      blocks: BLOCKS,
      [SHORT_FORMS_FIELD]: { label: form('Wrist mount load test') },
    })
    expect(result.ok ? [] : result.errors.map((e) => e.message)).toEqual([])
    const legacy = validateData('report', {
      blocks: BLOCKS,
      [SHORT_FORMS_FIELD]: { label: form('Wrist mount load test'), gist: form(SHORT_FORM_SPECS.gist.example) },
    })
    expect(legacy.ok ? [] : legacy.errors.map((e) => e.message), 'a record holding a gist became unwritable').toEqual(
      [],
    )
  })

  /**
   * THE LENGTH THIS ASKS ABOUT WAS THE GIST until criterion A14b made length 3 the record's own
   * summary column. The budget on that column is a target and nothing is refused for its length, so
   * the shape has no gist budget left to break. The label still has one, and it is the same
   * question: the browser must refuse what the server would refuse.
   */
  it('checks the shape on its own too, so the browser gets the same answer as the server', () => {
    const bad = validateShape('ShortForms', {
      label: form('The printed wrist mount cracked under load during the handover trial'),
    })
    expect(bad.ok).toBe(false)
    expect(bad.ok ? '' : bad.errors.map((e) => e.message).join(' ')).toContain('at most 5')
    const good = validateShape('ShortForms', { label: form(SHORT_FORM_SPECS.label.example) })
    expect(good.ok ? [] : good.errors.map((e) => e.message)).toEqual([])
  })
})

// ============================================================================ a cut of the body

describe('a short form may not be a cut of the record it is about', () => {
  const BODY = [
    { id: 'b-1', type: 'heading' as const, text: 'What broke' },
    {
      id: 'b-2',
      type: 'text' as const,
      text: 'The printed wrist mount cracked at about fifteen newtons on three of four samples.',
    },
    { id: 'b-3', type: 'code' as const, code: 'pull_test --samples 4', language: 'bash' },
    { id: 'b-4', type: 'list' as const, items: ['14.2 N', '15.1 N', '15.4 N'] },
  ]

  it('collects the prose a reader reads, in order, and leaves the terminal output out', () => {
    const prose = summary.proseOfBlocks(BODY)
    expect(prose).toBe(
      'What broke The printed wrist mount cracked at about fifteen newtons on three of four samples. 14.2 N 15.1 N 15.4 N',
    )
    expect(prose, 'a block of commands is not prose somebody would cut a summary out of').not.toContain('pull_test')
  })

  /**
   * THE THREE CASES BELOW WERE WRITTEN ABOUT A GIST and now ask the same three questions about the
   * label. Criterion A14b of design/pointing-reopened/ACCEPTANCE.md made reading length 3 the
   * record's own `summary` column on 3 September 2026, so no gist is stored under `shortForms` any
   * more and `readStoredShortForms` — which is what this check reads through — never hands one
   * back. The label is the whole-record form that is still written there, so it is the one this
   * rule can still be asked about. Nothing about the rule changed: a form that is the opening of
   * what the record says was cut, not written, and the write is refused.
   */
  it('refuses a label that is the first words of the report, and says what the comparison was', () => {
    expect(() =>
      summary.checkModuleSummary('report', {
        blocks: BODY,
        [SHORT_FORMS_FIELD]: { label: form('What broke The printed') },
      }),
    ).toThrow(/is the opening of what this record says/)
  })

  it('accepts a label written from the whole of it', () => {
    expect(() =>
      summary.checkModuleSummary('report', {
        blocks: BODY,
        [SHORT_FORMS_FIELD]: { label: form(SHORT_FORM_SPECS.label.example) },
      }),
    ).not.toThrow()
  })

  it('reaches a module\'s curated summary under its own field name, not only a report', () => {
    expect(() =>
      summary.checkModuleSummary('module', {
        summaryBlocks: BODY,
        [SHORT_FORMS_FIELD]: { label: form('What broke The printed') },
      }),
    ).toThrow(/is the opening of what this record says/)
  })

  it('says nothing when the write does not carry the body, because it is not touching it', () => {
    // The same rule validate.ts already states about `data`: re-reading the stored body here would
    // refuse an edit to a short form because of a report somebody else rewrote last month. What
    // catches that case is the READ, which reports the short form as out of date.
    expect(() =>
      summary.checkModuleSummary('report', {
        [SHORT_FORMS_FIELD]: { label: form('What broke The printed') },
      }),
    ).not.toThrow()
  })
})

// ============================================================================ where truncation was

describe('the level a truncation was asking for', () => {
  it('gives the graph card the vocabulary it was cutting strings to reach', () => {
    // src/web/components/graph/card.ts cuts a fact value at a character count and reports that it
    // did. That is a label being asked for, and this is the budget it should be asked for at.
    const level: ShortFormLevel = 'label'
    expect(SHORT_FORM_SPECS[level].maxWords).toBe(5)
    expect(maxCharacters(level)).toBe(60)
  })
})
