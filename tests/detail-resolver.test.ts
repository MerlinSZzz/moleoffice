// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DETAIL RESOLVER, PROVED AGAINST THE LIVE CORPUS.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS PROVES AND WHY IT NEEDED REAL ROWS
 * ---------------------------------------------------------------------------------------
 *
 * `detailOf` may return only characters it read from a stored field. That claim cannot be checked
 * against invented rows, because an invented row is written to suit the resolver. So the eleven
 * rows below were read out of `data/panelx.db` READ-ONLY on 20 August 2026 and pasted here whole:
 * the exact title, the exact summary, the exact stored short forms. Every answer the resolver gives
 * is then compared BYTE FOR BYTE against the field its own answer names.
 *
 * THEY ARE A REAL OBSERVATION AND THEY ARE DATED. The corpus moves. If a row is edited in the live
 * database, this fixture is what the resolver was proved against on that day and it still holds; it
 * is not a claim about what the record says now. The annotation row's id is made up; every other field is as
 * it was read.
 *
 * The eleven were chosen to cover the cases the supply decision has to survive: the one record in
 * the corpus holding written short forms, a body written and a body never written, a record with no
 * summary at all, a machine-cut session title, an annotation title written by `annotationTitle`,
 * the longest title in the corpus, and a summary far over the gist budget.
 *
 * ---------------------------------------------------------------------------------------
 * THE CORPUS AS IT STOOD, measured 20 August 2026, read-only
 * ---------------------------------------------------------------------------------------
 *
 *   541 live records · 541 with a title · 430 with a summary · 971 answerable slots at rungs 2 and 3
 *   1 record holds any written short form at all (a label and a gist on report m2Q0CybxoGNF)
 *   241 titles run over the rung-2 word budget · 136 summaries sit inside the rung-3 budget
 *   7 records have a written body: 5 of 5 reports, 2 of 27 modules
 *   0 records record `titleDerived`, so every title today reads `unrecorded`
 */

import { describe, expect, it } from 'vitest'
import {
  DETAIL_DEFAULTS,
  DETAIL_KEY_EVERYWHERE,
  DETAIL_PRECEDENCE,
  DETAIL_SURFACES,
  RUNGS,
  RUNG_SPECS,
  type DetailAnswer,
  type DetailSource,
  type DetailSurface,
  type Rung,
  type ShortFormStanding,
  detailKeyForHere,
  detailKeyForSurface,
  detailOf,
  isDetailSurface,
  isRung,
  ladderFrom,
  positionOf,
  rungFor,
} from '../src/shared/detail.ts'
import { BY_PART_LEVELS, SHORT_FORM_LEVELS, SHORT_FORM_SPECS, countWords } from '../src/shared/zoom.ts'
import type { ShortFormState } from '../src/server/lib/zoom.ts'

// ============================================================================ the corpus fixture

interface StoredForm {
  text: string
  madeFrom: { seq: number; contentHash: string }
  writtenBy: string
}

interface CorpusRow {
  why: string
  id: string
  kind: string
  title: string
  summary: string | null
  shortForms: Record<string, StoredForm> | null
  declaresShortForms: boolean
  body: { field: string; written: boolean } | null
}

const CORPUS: readonly CorpusRow[] = [
  {
    "why": "the one record holding stored short forms",
    "id": "m2Q0CybxoGNF",
    "kind": "report",
    "title": "Round eight: pointing at anything, saying what you mean, and the one act that was missing",
    "summary": "The campaign that built semantic addressability, semantic zoom and durable human intent, reported from inside the product it built — with what is usable, what is not, and the six-times pattern that no test ever caught.",
    "shortForms": {
      "label": {
        "text": "Round eight",
        "madeFrom": {
          "seq": 1,
          "contentHash": "43225b52bbab2598"
        },
        "writtenBy": "human"
      },
      "gist": {
        "text": "Point at anything, comment on exactly those words, and have PanelX read the comments back. Six times something was built that nothing could reach, and only a person found it.",
        "madeFrom": {
          "seq": 1,
          "contentHash": "43225b52bbab2598"
        },
        "writtenBy": "human"
      }
    },
    "declaresShortForms": true,
    "body": {
      "field": "data.blocks",
      "written": true
    }
  },
  {
    "why": "a report with a written body and no short forms",
    "id": "2DSI7ro3JHoC",
    "kind": "report",
    "title": "Round four: the integrated pass over the whole product",
    "summary": "What each thing you named does now, what four first-time readers and three hostile checkers found, what is still wrong, and the two questions only you can answer.",
    "shortForms": null,
    "declaresShortForms": true,
    "body": {
      "field": "data.blocks",
      "written": true
    }
  },
  {
    "why": "a module with a written body",
    "id": "Cp5s3fdToSb3",
    "kind": "module",
    "title": "Tray clamp",
    "summary": "Printed two-finger gripper for the YuMi right arm. v3 shell failed at effort 15; reprint pending.",
    "shortForms": null,
    "declaresShortForms": true,
    "body": {
      "field": "data.summaryBlocks",
      "written": true
    }
  },
  {
    "why": "a module whose body has never been written",
    "id": "YcX_MjHTeYYH",
    "kind": "module",
    "title": "Close-up camera",
    "summary": "ZED mini on the right wrist. Mount printed and calibrated; clearance check still open.",
    "shortForms": null,
    "declaresShortForms": true,
    "body": {
      "field": "data.summaryBlocks",
      "written": false
    }
  },
  {
    "why": "a task with no summary",
    "id": "0Yk5iSFA_SWz",
    "kind": "task",
    "title": "UX review probe — check whether the force gauge return is actually blocked",
    "summary": null,
    "shortForms": null,
    "declaresShortForms": false,
    "body": null
  },
  {
    "why": "a block with no summary and a title over the title budget",
    "id": "vNbdsz9aHQYq",
    "kind": "block",
    "title": "Moisture-led closing loop › Read the probe image at 25 fps",
    "summary": null,
    "shortForms": null,
    "declaresShortForms": false,
    "body": null
  },
  {
    "why": "a session whose title is a 60-character machine cut",
    "id": "ve1LxsEmFxVQ",
    "kind": "session",
    "title": "UX-9 stale-problem reconciliation against executable reality",
    "summary": "Re-checks every open PanelX-workspace problem by running the check its record names, and updates only the ones the evidence settles.",
    "shortForms": null,
    "declaresShortForms": false,
    "body": null
  },
  {
    "why": "an annotation, whose title is written by annotationTitle",
    "id": "Madeup200007",
    "kind": "annotation",
    "title": "The explanation is not necessary",
    "summary": null,
    "shortForms": null,
    "declaresShortForms": false,
    "body": null
  },
  {
    "why": "a record whose title fits the label budget and whose summary fits the gist budget",
    "id": "dsp07WoJbh5Q",
    "kind": "module",
    "title": "SoilPen tip geometry",
    "summary": "Filed by the touch session and not written up yet: how thick the silicone pad can be and still let the fingers close on a 50 mm cube.",
    "shortForms": null,
    "declaresShortForms": true,
    "body": {
      "field": "data.summaryBlocks",
      "written": false
    }
  },
  {
    "why": "the longest title in the corpus",
    "id": "Bfrh5gi1SBwI",
    "kind": "problem",
    "title": "A pipeline's record answers with six opaque block ids and no block titles, so reading the shape of a pass costs a second sweep of every record",
    "summary": "GET /api/records/<pipeline> resolves links in both directions but not the pipeline's own ordered blockIds, which are the one thing a pipeline is for.",
    "shortForms": null,
    "declaresShortForms": false,
    "body": null
  },
  {
    "why": "a problem with a summary far over the gist budget",
    "id": "ONkx85Ufkhr_",
    "kind": "problem",
    "title": "The migration branch that re-files a block's history was run by nothing",
    "summary": "Decision 1 says changes.record_id must be repointed at the block; the live corpus has no field=data.steps rows, so neither the data nor the tests ever ran that branch — fixed here by three tests. A second record, Uz4_RYZJJaEZ, links to this one as contradicting it: it reads the same facts as an open problem because the branch has still moved zero real rows. Both readings are on the same evidence — this record is about the branch being untested, that one is about it being unexercised — and a reader should take both.",
    "shortForms": null,
    "declaresShortForms": false,
    "body": null
  }
]

/** One fixture row, as the resolver needs to see it. Nothing is trimmed on the way in. */
function sourceOf(row: CorpusRow): DetailSource {
  return {
    title: row.title,
    summary: row.summary,
    shortForms: row.shortForms,
    declaresShortForms: row.declaresShortForms,
    body: row.body,
  }
}

/**
 * The stored value at a field path, read straight off the fixture row.
 *
 * THIS IS THE OTHER HALF OF THE BYTE-EQUALITY PROOF. The resolver names the field it read; this
 * reads that field independently; the two strings must be identical characters. A resolver that
 * cut, padded or joined anything would fail here, and so would one that named the wrong field.
 */
function storedAt(row: CorpusRow, field: string): string | null {
  if (field === 'title') return row.title
  if (field === 'summary') return row.summary
  const shortForm = /^data\.shortForms\.(\w+)$/.exec(field)
  if (shortForm !== null) {
    const level = shortForm[1] ?? ''
    return row.shortForms?.[level]?.text ?? null
  }
  return null
}

const withShortForms = CORPUS.find((row) => row.id === 'm2Q0CybxoGNF')!
const reportWithABody = CORPUS.find((row) => row.id === '2DSI7ro3JHoC')!
const moduleWithNoBody = CORPUS.find((row) => row.id === 'YcX_MjHTeYYH')!
const taskWithNoSummary = CORPUS.find((row) => row.id === '0Yk5iSFA_SWz')!
const shortTitleAndGistSizedSummary = CORPUS.find((row) => row.id === 'dsp07WoJbh5Q')!
const longestTitle = CORPUS.find((row) => row.id === 'Bfrh5gi1SBwI')!

// ============================================================================ the ladder

describe('the seven rungs', () => {
  it('is the written lengths plus the whole thing, shortest first', () => {
    expect(RUNGS).toEqual([...SHORT_FORM_LEVELS, ...BY_PART_LEVELS, 'full'])
    expect(RUNGS.map(positionOf)).toEqual([1, 2, 3, 4, 5, 6, 7])
    // FULL IS ALWAYS THE LAST SEAT AND ITS NUMBER IS COUNTED. A sixth authored length landed on 30
    // August 2026 and Full's position was the literal 6 until that day, which would have put Full
    // and the fifth length on one seat with nothing failing.
    expect(positionOf('full')).toBe(SHORT_FORM_LEVELS.length + BY_PART_LEVELS.length + 1)
  })

  it('does not make the whole thing storable', () => {
    // If this fails, somebody added `full` to SHORT_FORM_LEVELS. That declares a storable
    // `shortForms.full` field on every body kind in kinds.ts and lets POST /api/records/:id/
    // short-forms write a copy of a record's body beside that record's body.
    expect(SHORT_FORM_LEVELS).not.toContain('full')
    expect(RUNGS).toContain('full')
  })

  it('takes every budget and every noun from the one declaration in zoom.ts', () => {
    for (const level of SHORT_FORM_LEVELS) {
      const spec = RUNG_SPECS[level]
      expect(spec.noun).toBe(SHORT_FORM_SPECS[level].noun)
      expect(spec.what).toBe(SHORT_FORM_SPECS[level].what)
      expect(spec.words).toEqual({ min: SHORT_FORM_SPECS[level].minWords, max: SHORT_FORM_SPECS[level].maxWords })
    }
    expect(RUNG_SPECS.full.words).toBeNull()
  })

  it('gives every position an accessible phrase, and no two are the same', () => {
    const phrases = RUNGS.map((rung) => RUNG_SPECS[rung].phrase)
    expect(phrases.filter((phrase) => phrase.trim() === '')).toEqual([])
    expect(new Set(phrases).size).toBe(RUNGS.length)
    expect(RUNG_SPECS.full.phrase).toBe('the whole thing')
  })

  it('knows a rung word from anything else', () => {
    expect(isRung('gist')).toBe(true)
    expect(isRung('full')).toBe(true)
    expect(isRung('editorial')).toBe(false)
    expect(isRung(3)).toBe(false)
    expect(isRung(undefined)).toBe(false)
  })

  it('walks the asked rung, then every longer one, then every shorter one', () => {
    expect(ladderFrom('label')).toEqual(['label', 'title', 'gist', 'outline', 'sketch', 'digest', 'full'])
    expect(ladderFrom('gist')).toEqual(['gist', 'outline', 'sketch', 'digest', 'full', 'title', 'label'])
    expect(ladderFrom('full')).toEqual(['full', 'digest', 'sketch', 'outline', 'gist', 'title', 'label'])
    for (const rung of RUNGS) {
      expect([...ladderFrom(rung)].sort()).toEqual([...RUNGS].sort())
    }
  })
})

// ============================================================================ the two hard rules

describe('every character comes from storage', () => {
  it('returns the exact stored field it names, byte for byte, on every corpus row at every rung', () => {
    let checked = 0
    for (const row of CORPUS) {
      for (const rung of RUNGS) {
        const answer = detailOf(sourceOf(row), rung)
        if (answer.kind !== 'text') continue
        expect(storedAt(row, answer.field), `${row.id} asked ${rung} drew ${answer.drew} from ${answer.field}`).toBe(
          answer.text,
        )
        checked += 1
      }
    }
    // Eleven rows at seven rungs is seventy-seven answers. Fourteen of them are bodies — the five
    // rows whose kind declares one, asked for the whole thing, plus the three rows with a written
    // body reached from the outline, sketch and digest rungs, which supply no single string of
    // their own so the walk steps over them and reaches Full. The other sixty-three are text and
    // every one is checked here. The count is asserted so a resolver that quietly stopped answering
    // cannot pass. It was 55 over six rungs before the sixth length was declared.
    expect(checked).toBe(63)
  })

  it('never shortens anything to fit, and says how far over it ran instead', () => {
    // The longest title in the corpus is twenty-five words, asked for in a slot sized for ten.
    const answer = detailOf(sourceOf(longestTitle), 'title')
    expect(answer.kind).toBe('text')
    if (answer.kind !== 'text') return
    expect(answer.text).toBe(longestTitle.title)
    expect(countWords(answer.text)).toBeGreaterThan(SHORT_FORM_SPECS.title.maxWords)
    expect(answer.fit).toBe('overBudget')
  })

  it('says the words fit when they do', () => {
    const answer = detailOf(sourceOf(shortTitleAndGistSizedSummary), 'label')
    expect(answer.kind).toBe('text')
    if (answer.kind !== 'text') return
    expect(answer.drew).toBe('title')
    expect(answer.fit).toBe('inBudget')
  })

  it('has no budget at the whole thing, so nothing is ever over it', () => {
    const answer = detailOf(sourceOf(taskWithNoSummary), 'full')
    expect(answer.kind).toBe('text')
    if (answer.kind !== 'text') return
    expect(answer.fit).toBe('inBudget')
  })
})

describe('the ladder can never be empty', () => {
  it('answers every corpus row at every rung, because records.title is rung 2', () => {
    for (const row of CORPUS) {
      for (const rung of RUNGS) {
        const answer: DetailAnswer = detailOf(sourceOf(row), rung)
        expect(answer.kind, `${row.id} at ${rung}`).not.toBe('nothing')
      }
    }
  })

  it('says so plainly when the title column is blank, rather than drawing an empty string', () => {
    const answer = detailOf({ title: '   ', declaresShortForms: false }, 'title')
    expect(answer).toEqual({ kind: 'nothing', asked: 'title', why: 'theTitleColumnIsBlank' })
  })
})

// ============================================================================ the supply decision

describe('records.title is rung 2 and records.summary is rung 3', () => {
  it('draws the title column for the title rung on a kind that stores no short forms', () => {
    const answer = detailOf(sourceOf(taskWithNoSummary), 'title')
    expect(answer).toMatchObject({
      kind: 'text',
      text: taskWithNoSummary.title,
      drew: 'title',
      from: 'title',
      field: 'title',
      gap: 'none',
    })
  })

  it('draws the summary column for the gist rung', () => {
    const answer = detailOf(sourceOf(shortTitleAndGistSizedSummary), 'gist')
    expect(answer).toMatchObject({
      kind: 'text',
      text: shortTitleAndGistSizedSummary.summary,
      drew: 'gist',
      from: 'summary',
      field: 'summary',
      gap: 'none',
    })
  })

  /**
   * THE TWO OVERRIDE ROWS ARE GONE AND THIS CASE IS THE REVERSE OF WHAT IT WAS.
   *
   * It used to assert `lets a written gist beat the summary column, which is what the override is
   * for`: rung 3 answered `data.shortForms.gist` where one was stored, and the summary column only
   * where none was. Criterion A14b of design/pointing-reopened/ACCEPTANCE.md ended that on 3
   * September 2026. Rung 3 IS the record's own summary column, there is no separate gist to
   * override it with, and what is stored under that key stays on disk undrawn.
   *
   * `m2Q0CybxoGNF` IS THE ROW THAT PROVES IT RATHER THAN AN INVENTED ONE. It is the one record in
   * this corpus that holds a stored gist, and it holds a different summary of its own, so the two
   * texts are distinguishable and the assertion can say which of them was drawn.
   */
  it('draws the summary column at the gist rung even where a gist is stored beside it', () => {
    const answer = detailOf(sourceOf(withShortForms), 'gist')
    expect(answer).toMatchObject({
      kind: 'text',
      text: withShortForms.summary,
      drew: 'gist',
      from: 'summary',
      field: 'summary',
      gap: 'none',
    })
    expect(answer).not.toMatchObject({ text: withShortForms.shortForms?.['gist']?.text })
  })

  /**
   * THE RUNG-2 OVERRIDE, AND THIS CASE HAS NOW BEEN REVERSED TWICE.
   *
   * It first asserted `never reads a title override, because the title column is how records
   * resolve by name`. That was reversed on 30 August 2026 — the write door had always accepted
   * `data.shortForms.title`, two reports stored one, and a table that would not read it back made
   * reading length 2 draw the level-1 label on all 18 reports in the corpus, problem
   * `vXVu-sub4wj4` — and the case became `lets a written title beat the title column`.
   *
   * CRITERION A14b PUT IT BACK, on other grounds. Reading length 2 is not an override of the title
   * column any more; it IS the title column. So a stored title form is not beaten by the column, it
   * is not read at all, and the two reports holding one keep it on disk. They are left there as
   * they are.
   */
  it('draws the title column at the title rung even where a title form is stored beside it', () => {
    const source: DetailSource = {
      ...sourceOf(withShortForms),
      shortForms: {
        title: { text: 'Every wave checked; half the plan never built', madeFrom: { seq: 1, contentHash: 'x' }, writtenBy: 'agent' },
      },
    }
    const answer = detailOf(source, 'title')
    expect(answer).toMatchObject({
      kind: 'text',
      text: withShortForms.title,
      drew: 'title',
      from: 'title',
      field: 'title',
      gap: 'none',
    })
    expect(answer).not.toMatchObject({ text: 'Every wave checked; half the plan never built' })
  })

  /** And the column answers rung 2 on the plain row too, which is every record in the corpus. */
  it('draws the title column at the title rung on a record with a label stored', () => {
    const answer = detailOf(sourceOf(withShortForms), 'title')
    expect(answer).toMatchObject({ kind: 'text', text: withShortForms.title, from: 'title', field: 'title' })
  })

  /**
   * A KIND WITH NO PLACE FOR A SHORT FORM READS ITS OWN TITLE TOO. This used to be about
   * `needsShortForms` on the rung-2 override row, which is the flag that stopped a task reporting a
   * field its kind does not declare; that row went with criterion A14b. What is left to check is
   * that a `shortForms` object carrying a retired key changes nothing on such a kind either.
   */
  it('ignores a stored title form on a kind that declares no short forms', () => {
    const source: DetailSource = {
      ...sourceOf(taskWithNoSummary),
      shortForms: {
        title: { text: 'a name on a kind with no place for one', madeFrom: { seq: 1, contentHash: 'x' }, writtenBy: 'agent' },
      },
    }
    expect(detailOf(source, 'title')).toMatchObject({ kind: 'text', text: taskWithNoSummary.title, field: 'title' })
  })

  it('falls to the title when nobody wrote a summary, and says the gist is unwritten', () => {
    const answer = detailOf(sourceOf(taskWithNoSummary), 'gist')
    expect(answer).toMatchObject({
      kind: 'text',
      text: taskWithNoSummary.title,
      asked: 'gist',
      drew: 'title',
      gap: 'unwritten',
    })
  })
})

// ============================================================================ the gaps

describe('nothing is there, against nobody should put anything there', () => {
  it('says a task has no place for a label at all', () => {
    const answer = detailOf(sourceOf(taskWithNoSummary), 'label')
    expect(answer).toMatchObject({ asked: 'label', drew: 'title', gap: 'notOnThisKind' })
  })

  it('says a module has a place for a label and nobody has written one', () => {
    const answer = detailOf(sourceOf(shortTitleAndGistSizedSummary), 'label')
    expect(answer).toMatchObject({ asked: 'label', drew: 'title', gap: 'unwritten' })
  })

  it('answers the whole thing with the body, and says when nobody has written one', () => {
    expect(detailOf(sourceOf(moduleWithNoBody), 'full')).toEqual({
      kind: 'body',
      field: 'data.summaryBlocks',
      asked: 'full',
      drew: 'full',
      gap: 'unwritten',
    })
    expect(detailOf(sourceOf(reportWithABody), 'full')).toEqual({
      kind: 'body',
      field: 'data.blocks',
      asked: 'full',
      drew: 'full',
      gap: 'none',
    })
  })

  it('never hands a shorter form to a surface that asked for the whole thing', () => {
    // A module with no body written could be answered with its 15-word summary. It is not: a report
    // page drawing a gist as though it were the report is the substitution this product bans.
    const answer = detailOf(sourceOf(moduleWithNoBody), 'full')
    expect(answer.kind).toBe('body')
  })

  it('walks down to a shorter rung when the kind has no body at all', () => {
    const answer = detailOf(sourceOf(taskWithNoSummary), 'full')
    expect(answer).toMatchObject({ kind: 'text', asked: 'full', drew: 'title', gap: 'notOnThisKind' })
  })
})

// ============================================================================ who wrote the words

describe('a cut is never presented as something somebody wrote', () => {
  it('says nobody recorded how the title came to say what it says, on every corpus row', () => {
    for (const row of CORPUS) {
      const answer = detailOf(sourceOf(row), 'title')
      if (answer.kind !== 'text' || answer.from !== 'title') continue
      expect(answer.written, row.id).toBe('unrecorded')
    }
  })

  it('says the title was cut from the record when the record says so', () => {
    const answer = detailOf({ ...sourceOf(taskWithNoSummary), titleDerived: true }, 'title')
    expect(answer).toMatchObject({ written: 'cutFromBody' })
  })

  it('says the title was written when the record says that instead', () => {
    const answer = detailOf({ ...sourceOf(taskWithNoSummary), titleDerived: false }, 'title')
    expect(answer).toMatchObject({ written: 'atThisLength' })
  })

  it('treats a stored short form and a summary as written at their own length', () => {
    expect(detailOf(sourceOf(withShortForms), 'label')).toMatchObject({
      from: 'shortForm',
      written: 'atThisLength',
    })
    expect(detailOf(sourceOf(shortTitleAndGistSizedSummary), 'gist')).toMatchObject({
      from: 'summary',
      written: 'atThisLength',
    })
  })
})

describe('whether a written short form is still current', () => {
  it('says nobody checked when the caller passed nothing from the ledger', () => {
    expect(detailOf(sourceOf(withShortForms), 'label')).toMatchObject({ standing: 'cannot_check' })
  })

  it('reports what the ledger said, and works nothing out itself', () => {
    const source: DetailSource = { ...sourceOf(withShortForms), standing: { label: 'out_of_date' } }
    expect(detailOf(source, 'label')).toMatchObject({ standing: 'out_of_date' })
    const current: DetailSource = { ...sourceOf(withShortForms), standing: { label: 'current' } }
    expect(detailOf(current, 'label')).toMatchObject({ standing: 'current' })
  })

  it('treats the two columns as current, because they are the record', () => {
    expect(detailOf(sourceOf(taskWithNoSummary), 'title')).toMatchObject({ standing: 'current' })
    expect(detailOf(sourceOf(shortTitleAndGistSizedSummary), 'gist')).toMatchObject({ standing: 'current' })
  })

  it('uses the same three words the server uses', () => {
    // A compile-time check, not a runtime one: `ShortFormState` is a type. If either side gains or
    // loses a word, `npx tsc --noEmit` fails here.
    //
    // THREE OF THE SERVER'S WORDS ARE NOT ABOUT STANDING AND ARE TAKEN OUT BY NAME. `none` is nobody
    // wrote one, `cannot_write` is a level this record cannot have at all (the kind has no place for
    // it or the record is too short), and `is_the_record` is the seventh position, which is the
    // record itself and cannot be out of date with respect to itself. None is a state a written form
    // can be in, so none has a word on this side. Every other word has to match in both directions.
    type NotAStanding = 'none' | 'cannot_write' | 'is_the_record'
    type ServerSideMatchesOurs = Exclude<ShortFormState, NotAStanding> extends ShortFormStanding ? true : never
    type OursMatchesServerSide = ShortFormStanding extends Exclude<ShortFormState, NotAStanding> ? true : never
    const oneWay: ServerSideMatchesOurs = true
    const theOther: OursMatchesServerSide = true
    expect([oneWay, theOther]).toEqual([true, true])
  })
})

// ============================================================================ how much a surface says

describe('the ten surfaces', () => {
  it('has a default for each, and they are the ones the contract names', () => {
    expect(DETAIL_SURFACES.length).toBe(10)
    // `reportContent` READ `full` UNTIL 15 SEPTEMBER 2026. The owner's act 3a of that day made a record page open
    // at reading level 2, the authored summary line, so the surface default is
    // `title`. A REPORT opens at Full again since the owner's act of
    // 16 September 2026, applied in `rungFor` for the report kind, with the
    // level-2 default kept for modules and everywhere else; the resolver's own tests below hold
    // that.
    expect(DETAIL_DEFAULTS).toEqual({
      home: 'gist',
      review: 'title',
      composer: 'label',
      recipients: 'title',
      messages: 'gist',
      reportIndex: 'title',
      reportContent: 'title',
      moduleCards: 'gist',
      graph: 'title',
      tables: 'title',
    })
    for (const surface of DETAIL_SURFACES) {
      expect(isRung(DETAIL_DEFAULTS[surface]), surface).toBe(true)
    }
  })

  it('knows one of its own names from anything else', () => {
    expect(isDetailSurface('home')).toBe(true)
    expect(isDetailSurface('rail.modules')).toBe(false)
    expect(isDetailSurface('gist')).toBe(false)
  })

  it('keeps one spelling of each stored key', () => {
    expect(DETAIL_KEY_EVERYWHERE).toBe('mole-office.detail')
    expect(detailKeyForSurface('home')).toBe('mole-office.detail.home')
    expect(detailKeyForHere('home')).toBe('mole-office.detail.local.home')
    const keys = DETAIL_SURFACES.flatMap((surface) => [detailKeyForSurface(surface), detailKeyForHere(surface)])
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('what decides how much a surface says', () => {
  const surface: DetailSurface = 'home'

  it('is one array, strongest first', () => {
    expect(DETAIL_PRECEDENCE.map((spec) => spec.decider)).toEqual([
      'here',
      'thisSurface',
      'everywhere',
      'recommended',
      'default',
    ])
    for (const spec of DETAIL_PRECEDENCE) {
      expect(spec.why.trim(), spec.decider).not.toBe('')
      expect(spec.where.trim(), spec.decider).not.toBe('')
    }
  })

  it('uses the code default when nobody has said anything', () => {
    expect(rungFor(surface, null)).toEqual({
      rung: 'gist',
      decider: 'default',
      why: DETAIL_PRECEDENCE[4]?.why,
    })
  })

  it('lets the thing being read ask, and lets any of the person settings beat it', () => {
    expect(rungFor(surface, null, 'sketch')).toMatchObject({ rung: 'sketch', decider: 'recommended' })
    expect(rungFor(surface, null, 'sketch', { everywhere: 'outline' })).toMatchObject({
      rung: 'outline',
      decider: 'everywhere',
    })
    expect(rungFor(surface, null, 'sketch', { everywhere: 'outline', thisSurface: 'title' })).toMatchObject({
      rung: 'title',
      decider: 'thisSurface',
    })
    expect(
      rungFor(surface, null, 'sketch', { everywhere: 'outline', thisSurface: 'title', here: 'label' }),
    ).toMatchObject({ rung: 'label', decider: 'here' })
  })

  it('carries the reason from the array, so the screen and the code cannot say different things', () => {
    for (const spec of DETAIL_PRECEDENCE) {
      if (spec.decider === 'default') continue
      const choice =
        spec.decider === 'recommended'
          ? rungFor(surface, null, 'outline')
          : rungFor(surface, null, undefined, { [spec.decider]: 'outline' })
      expect(choice.decider).toBe(spec.decider)
      expect(choice.why).toBe(spec.why)
    }
  })

  it('skips a stored value that is not a rung rather than trusting it', () => {
    expect(rungFor(surface, null, undefined, { here: 'enormous', thisSurface: 'outline' })).toMatchObject({
      rung: 'outline',
      decider: 'thisSurface',
    })
    expect(rungFor(surface, null, undefined, { here: null, thisSurface: 7, everywhere: '' })).toMatchObject({
      rung: 'gist',
      decider: 'default',
    })
  })

  it('answers for all ten surfaces with nothing stored', () => {
    for (const name of DETAIL_SURFACES) {
      const choice = rungFor(name, null)
      expect(choice.rung, name).toBe(DETAIL_DEFAULTS[name])
    }
  })
})

// ============================================================================ the two axes stay apart

describe('detail and reading style are different axes', () => {
  it('shares no word with any reading style', async () => {
    // The style axis says how writing is SET. This axis says how much of it there is. A word on
    // both is the two axes fusing again, which is the defect this cluster exists to undo. The real
    // list is imported rather than retyped, so it cannot be a stale copy of the styles.
    // The smallest stand-in that lets the browser modules load, as eleven other test files here do.
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    }
    ;(globalThis as unknown as { window: unknown }).window = {
      localStorage: storage,
      sessionStorage: storage,
      location: { hash: '', search: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    const sb = await import('../src/web/components/SummaryBlocks.tsx')
    const styleWords = sb.BLOCKS_PROFILES.flatMap((profile) => [profile.id, profile.name.toLowerCase()])
    for (const rung of RUNGS) {
      expect(styleWords, rung).not.toContain(rung)
      expect(styleWords, rung).not.toContain(RUNG_SPECS[rung].noun.toLowerCase())
    }
  })
})
