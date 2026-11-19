// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BOXES THAT WRITE A RECORD'S OWN FIELDS: that they exist, and that none of them invents
 * anything.
 *
 * An independent reviewer walked the product as a person and found that of everything Mole Office itself
 * says a human must supply, exactly two things had a control. The record page printed "data.due is
 * not filled in … send this in a PATCH when you know it" and offered Title and Summary; the deadline
 * report said "nobody has estimated any of the 1 piece named" and there was nowhere to say. These
 * tests are about the fix and about the four ways it could go wrong quietly:
 *
 *   1. A form written from a LIST rather than from the declaration. Every label, word and shape
 *      below is asserted against KIND_SPECS itself, so a form that stopped being derived stops
 *      passing — and a field ADDED to a kind gets a box without anybody editing the page.
 *   2. A control that writes a shape it cannot write whole. A nested object is refused outright by
 *      the write path, so half a Consequence is not a lesser write, it is no write at all.
 *   3. `data.due` reduced to a date box, which would turn a condition nobody can check into a
 *      deadline that can be late — the one thing shared/deadlines.ts exists to refuse.
 *   4. Absent, blank and zero drawn as one thing. Clearing a field has to be a deliberate act.
 *
 * WHY THEY LOOK LIKE THIS. The runner's environment is `node` and there is no DOM, so the pure
 * readers (`controlFor`, `draftValue`, `draftFrom`, `fieldForPath`) are called directly and the
 * components are rendered to static markup. What is NOT covered here is the round trip: that a
 * refused write shows the server's own sentence was measured in a browser against a copy of the
 * live corpus, and the sentence it printed is quoted in the report.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement as h, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  KIND_SPECS,
  SHAPE_SPECS,
  completenessOf,
  validateData,
  type FieldSpec,
} from '../src/shared/kinds.ts'
import { ITEM_STATES, RECORD_KINDS, type PanelRecord, type RecordKind } from '../src/shared/types.ts'

type RecordPage = typeof import('../src/web/pages/RecordPage.tsx')
type Ui = typeof import('../src/web/components/ui.tsx')

let rp: RecordPage
let ui: Ui

beforeAll(async () => {
  // These modules reach api.ts and router.tsx, which touch window while they are being evaluated.
  const store = new Map<string, string>()
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  rp = await import('../src/web/pages/RecordPage.tsx')
  ui = await import('../src/web/components/ui.tsx')
})

/** Markup with the hoisted <style> blocks removed, so a class name in the CSS is not evidence. */
function body(el: ReactElement): string {
  return renderToStaticMarkup(el).replace(/<style[^>]*>[\s\S]*?<\/style>/g, '')
}

let seq = 0
function record(kind: RecordKind, data: Record<string, unknown> = {}): PanelRecord {
  seq += 1
  return {
    id: `rec-${seq}`,
    kind,
    workspaceId: 'w1',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title: `Record ${seq}`,
    summary: null,
    data,
    createdAt: '2026-08-01 09:00:00',
    updatedAt: '2026-08-02 09:00:00',
    deletedAt: null,
  }
}

/** The declared field of a kind, by key, failing loudly rather than returning undefined. */
function fieldOf(kind: RecordKind, key: string): FieldSpec {
  const found = KIND_SPECS[kind].fields.find((f) => f.key === key)
  if (found === undefined) throw new Error(`${kind} declares no field "${key}"`)
  return found
}

// ============================================================================ nothing is invented

describe('the form is built from the declaration', () => {
  /**
   * The one that catches a hand-written list. A state word typed into this page rather than read
   * off ITEM_STATES would be refused by the write path — which is the good case — and a word ADDED
   * to the vocabulary would simply never appear in the browser, silently, which is not.
   */
  it('offers a block exactly the state words the schema declares, and no others', () => {
    const field = fieldOf('block', 'state')
    const control = rp.controlFor('block', field)
    expect(control.at).toBe('words')
    if (control.at !== 'words') throw new Error('unreachable')
    expect([...control.words]).toEqual([...ITEM_STATES])

    const markup = body(
      h(rp.FieldWriter, {
        recordId: 'rec-1',
        kind: 'block',
        field,
        control,
        stored: undefined,
        records: [],
        onSaved: () => {},
      }),
    )
    const offered = [...markup.matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]).filter((v) => v !== '')
    expect(offered).toEqual([...ITEM_STATES])
  })

  /**
   * Every kind, every field: the control is worked out from the declared type, so a field whose
   * type this page cannot read has to say so rather than throw a page down or quietly vanish.
   */
  it('classifies every declared field of every kind without inventing or throwing', () => {
    for (const kind of RECORD_KINDS) {
      for (const field of KIND_SPECS[kind].fields) {
        const control = rp.controlFor(kind, field)
        expect(control.at, `${kind}.${field.key}`).toBeTruthy()
        if (control.at === 'words') {
          // The words are the declared ones, not a set typed here: every one of them has to appear
          // in the field's own declared type string.
          for (const word of control.words) expect(field.type, `${kind}.${field.key}`).toContain(`'${word}'`)
        }
      }
    }
  })

  /**
   * The drift guard on the one hand-written table in the feature. Four fields are deliberately NOT
   * offered a second box because a better control already writes them; the table names them by key,
   * and a key that stops being a declared field would silently make that field editable twice — an
   * obligation discharged from a select, with no note and no date.
   */
  it('every field said to be written elsewhere really is a field of that kind', () => {
    for (const [kind, fields] of Object.entries(rp.WRITTEN_ELSEWHERE)) {
      for (const key of Object.keys(fields ?? {})) {
        expect(
          KIND_SPECS[kind as RecordKind].fields.some((f) => f.key === key),
          `${kind}.${key} is named as written elsewhere but ${kind} declares no such field`,
        ).toBe(true)
        expect(rp.controlFor(kind as RecordKind, fieldOf(kind as RecordKind, key)).at).toBe('elsewhere')
      }
    }
  })

  /** The one key the browser has to know by name, pinned to the shape that declares it. */
  it('the record-reference key is a declared field of the shape it comes from', () => {
    expect(SHAPE_SPECS['PauseUntil']?.fields.some((f) => f.key === rp.RECORD_REF_KEY)).toBe(true)
  })
})

// ============================================================================ the missing field

describe('a field the record is missing gets a control where the absence is reported', () => {
  /**
   * `completenessOf` addresses a field as `data.<key>` and can also answer `data` or `kind`, which
   * are not fields. Every required field of every kind has to resolve back to its own declaration,
   * and the two that are not fields have to resolve to nothing rather than to a box for a key
   * called "kind".
   */
  it('resolves every required field of every kind from the path the page reports', () => {
    for (const kind of RECORD_KINDS) {
      for (const item of completenessOf(kind, {})) {
        const field = rp.fieldForPath(kind, item.path)
        expect(field, `${kind}: ${item.path}`).not.toBeNull()
        expect(`data.${field?.key}`).toBe(item.path)
      }
    }
    expect(rp.fieldForPath('module', 'kind')).toBeNull()
    expect(rp.fieldForPath('module', 'data')).toBeNull()
  })

  /** The panel that reports the absence draws the box, rather than sending the reader elsewhere. */
  it('the incompleteness panel renders the control it is handed, inside the line it belongs to', () => {
    const items = completenessOf('message', {})
    expect(items.length).toBeGreaterThan(0)
    const markup = body(
      h(ui.Incomplete, {
        items,
        what: 'message',
        control: (item) => h('span', { className: 'probe' }, `box for ${item.path}`),
      }),
    )
    expect(markup).toContain('box for data.body')
    // Inside the item, not appended after the list.
    expect(markup).toMatch(/id="incomplete-data\.body"[\s\S]*?box for data\.body[\s\S]*?<\/li>/)
  })

})

// ============================================================================ effort_hours

describe('effort_hours, which the deadline report cannot work without', () => {
  it('is a number box on every kind that declares it', () => {
    for (const kind of ['task', 'block', 'obligation'] as const) {
      const field = fieldOf(kind, 'effort_hours')
      expect(rp.controlFor(kind, field), kind).toEqual({ at: 'number' })
    }
  })

  /**
   * ABSENT, BLANK AND ZERO ARE THREE DIFFERENT THINGS, and the whole point of the field is that
   * absent means nobody has estimated it. An empty box must not be a way of writing one.
   */
  it('sends zero as a number and refuses to send an empty box at all', () => {
    const number = { at: 'number' } as const
    expect(rp.draftValue(number, '0', '', [])).toEqual({ can: true, value: 0 })
    expect(rp.draftValue(number, '2.5', '', [])).toEqual({ can: true, value: 2.5 })
    const empty = rp.draftValue(number, '   ', '', [])
    expect(empty.can).toBe(false)
    if (empty.can) throw new Error('unreachable')
    expect(empty.because).toContain('deliberate act')
  })

  /**
   * A number that is not a number goes as it was typed, so the refusal is the server's own sentence
   * naming the field — the same one an agent gets — rather than a second opinion invented in a form.
   * The refusal it relies on is asserted here too, because it is the other half of the contract.
   */
  it('sends what was typed when it is not a number, and the write path names the field', () => {
    expect(rp.draftValue({ at: 'number' }, 'about a day', '', [])).toEqual({
      can: true,
      value: 'about a day',
    })
    const refused = validateData('obligation', { effort_hours: 'about a day' })
    expect(refused.ok).toBe(false)
    if (refused.ok) throw new Error('unreachable')
    expect(refused.errors[0]?.message).toContain('data.effort_hours')
    expect(refused.errors[0]?.message).toContain('must be a number')
  })
})

// ============================================================================ due

describe('data.due, which is three different facts', () => {
  /**
   * Only a date can make an obligation late. A single date box would take "when the reprint is on
   * the bench" and store it as a deadline, so the control has to let a person say which of the
   * three they mean — or not exist.
   */
  it('offers the three forms the shape declares, and is not a date box', () => {
    const field = fieldOf('obligation', 'due')
    const control = rp.controlFor('obligation', field)
    expect(control.at).toBe('forms')
    if (control.at !== 'forms') throw new Error('unreachable')
    expect(control.forms.map((f) => f.key)).toEqual(SHAPE_SPECS['PauseUntil']?.fields.map((f) => f.key))

    const markup = body(
      h(rp.FieldWriter, {
        recordId: 'rec-1',
        kind: 'obligation',
        field,
        control,
        stored: undefined,
        records: [],
        onSaved: () => {},
      }),
    )
    for (const form of control.forms) expect(markup).toContain(`<option value="${form.key}"`)
  })

  it('writes a date as the bare stamp and a condition as the object, never the other way round', () => {
    const control = rp.controlFor('obligation', fieldOf('obligation', 'due'))
    if (control.at !== 'forms') throw new Error('unreachable')
    expect(rp.draftValue(control, '2026-09-01', 'date', [])).toEqual({ can: true, value: '2026-09-01' })
    expect(rp.draftValue(control, 'the reprint is on the bench', 'condition', [])).toEqual({
      can: true,
      value: { condition: 'the reprint is on the bench' },
    })
  })

  /**
   * THE FORM YOU CHOSE REPLACES THE ONE THAT WAS THERE. `dataPatch` merges an object into an
   * object, so a bare `{recordId:…}` written over a stored `{condition:…}` leaves both — and the
   * record then says two different things about when it is owed, one of which nobody chose. Found
   * by driving this in a browser.
   *
   * The nulls that remove the others may only be sent where there is an object to merge into: a
   * null STORED is refused by the write path with "leave the key out entirely", so against an
   * absent field or a bare stamp the object goes on its own.
   */
  it('replaces the form that was stored instead of stacking a second one beside it', () => {
    const control = rp.controlFor('obligation', fieldOf('obligation', 'due'))
    if (control.at !== 'forms') throw new Error('unreachable')

    const overObject = rp.draftValue(control, 'the reprint is on the bench', 'condition', [], {
      date: '2026-09-01',
    })
    expect(overObject).toEqual({
      can: true,
      value: { date: null, condition: 'the reprint is on the bench', recordId: null },
    })

    const overNothing = rp.draftValue(control, 'the reprint is on the bench', 'condition', [], undefined)
    expect(overNothing).toEqual({ can: true, value: { condition: 'the reprint is on the bench' } })
    const overStamp = rp.draftValue(control, 'the reprint is on the bench', 'condition', [], '2026-09-01')
    expect(overStamp).toEqual({ can: true, value: { condition: 'the reprint is on the bench' } })
  })

  /**
   * A record is named by typing its title and stored as its id — nobody hunts a nanoid — and a
   * title nothing answers to is refused here rather than stored as an id that names nothing.
   */
  it('stores the id of the record whose title was typed, and refuses a title nothing answers to', () => {
    const control = rp.controlFor('obligation', fieldOf('obligation', 'due'))
    if (control.at !== 'forms') throw new Error('unreachable')
    const known = [{ id: 'T_FNIYu56FnA', title: 'Mole Office — database schema and migrations' }]
    expect(rp.draftValue(control, known[0]!.title, rp.RECORD_REF_KEY, known)).toEqual({
      can: true,
      value: { recordId: 'T_FNIYu56FnA' },
    })
    const missing = rp.draftValue(control, 'no record is called this', rp.RECORD_REF_KEY, known)
    expect(missing.can).toBe(false)
    if (missing.can) throw new Error('unreachable')
    expect(missing.because).toContain('No live record in this project is titled')
  })

  /** What is already stored opens the box that wrote it, in whichever of the two forms it is in. */
  it('opens the form the stored value is written in', () => {
    const control = rp.controlFor('obligation', fieldOf('obligation', 'due'))
    if (control.at !== 'forms') throw new Error('unreachable')
    expect(rp.draftFrom(control, '2026-09-01', [])).toEqual({ typed: '2026-09-01', form: 'date' })
    expect(rp.draftFrom(control, { condition: 'the reprint is on the bench' }, [])).toEqual({
      typed: 'the reprint is on the bench',
      form: 'condition',
    })
    // A stored id is shown as the title of the record it names, and as the id when nothing here
    // can name it — never blank, and never a guess.
    const known = [{ id: 'T_FNIYu56FnA', title: 'Mole Office — database schema and migrations' }]
    expect(rp.draftFrom(control, { recordId: 'T_FNIYu56FnA' }, known).typed).toBe(known[0]!.title)
    expect(rp.draftFrom(control, { recordId: 'gone' }, known).typed).toBe('gone')
  })
})

// ============================================================================ where it stops

describe('a shape too big for one box says so instead of half-writing it', () => {
  /**
   * `consequence` carries the only safety mark in the product and `paused` carries a PauseUntil
   * inside it. Half a nested object is a hard refusal on the write path, so a box that could only
   * write half of one is a box that cannot succeed — and a field that simply vanished from the page
   * is how this whole defect looked in the first place.
   */
  it('refuses to draw a box for a nested object, and names the shape on the row', () => {
    for (const [kind, key] of [
      ['problem', 'consequence'],
      ['task', 'paused'],
      ['module', 'parts'],
      ['claim', 'numbers'],
      ['note', 'extra'],
    ] as const) {
      const control = rp.controlFor(kind, fieldOf(kind, key))
      expect(['no-control', 'elsewhere'], `${kind}.${key}`).toContain(control.at)
    }

    const markup = body(
      h(rp.DeclaredFields, {
        record: record('problem', { symptom: 'it hangs' }),
        editable: true,
        records: [],
        onChanged: () => {},
      }),
    )
    // THE SENTENCE SAYS WHAT KIND OF SHAPE IT IS AND THE ROW SAYS WHICH ONE. It used to read "a
    // Consequence, an object with its own fields … It takes bearer, what", and the same sentence
    // is drawn in Normal mode under a field being changed (problem 2E5-mceErAZI). The declared type
    // is this developer-mode panel's to show, beside the key.
    expect(markup).toContain('a group of fields that belong together')
    expect(markup).toContain('<code class="fw-type">Consequence</code>')
    expect(markup).not.toContain('bearer, what')
    // Said once, at the foot, rather than once per row with the same record id in it.
    expect(markup.match(/PATCH \/api\/records\//g)?.length).toBe(1)
    // The rows that CAN be written still offer a way in, so the panel is not simply a list of
    // refusals: a problem's symptom, its state and its source are all writable here.
    expect(markup).toContain('Write it')
    expect(markup).toContain('Change it')
  })


  /**
   * A select whose value matches no option draws its FIRST option as though it were selected, so a
   * record holding a word from before a vocabulary existed would have a word put on screen that is
   * not in it — in the one control whose job is to show which word is stored.
   */
  it('offers a stored word that is not in the vocabulary, said to be what it is', () => {
    const offered = rp.valueOptions('waiting', [...ITEM_STATES], '— pick —')
    expect(offered[0]).toEqual({
      value: 'waiting',
      label: 'waiting — stored on this record, and not one of the words this kind declares',
    })
    expect(offered.slice(1).map((o) => o.value)).toEqual([...ITEM_STATES])
    // Nothing stored: the placeholder, and it cannot be mistaken for a value.
    expect(rp.valueOptions('', [...ITEM_STATES], '— pick —')[0]).toEqual({ value: '', label: '— pick —' })
    // Stored and declared: no extra option, and no placeholder to fall back into.
    expect(rp.valueOptions('doing', [...ITEM_STATES], '— pick —').map((o) => o.value)).toEqual([...ITEM_STATES])
  })
})

/**
 * ---------------------------------------------------------------------------------------
 * EVERY WRITE FROM A SCREEN IS A MERGE
 * ---------------------------------------------------------------------------------------
 *
 * `PATCH /api/records/<id>` takes two bodies for a record's own fields. `dataPatch` merges what you
 * send into what is stored. `data` replaces the whole object, so every field it does not carry goes
 * — and a page cannot honestly ask for that. What a screen holds is a copy read when the page
 * loaded, and a field somebody else wrote since is in that copy at its old value or not in it at
 * all. So a page that sends `data` writes over work it never saw.
 *
 * IT DID. Ticking one checklist line on a module page sent the whole `data` object back, rebuilt
 * from the copy the page was rendered from. The server refuses that write now unless the caller
 * says the loss is meant, and the module view hands back only the field it changed.
 *
 * WHY A SOURCE SCAN AND NOT A PRESS. The runner's environment is `node` and there is no DOM, as the
 * header of this file says, so no test here can press a checklist chip and read what went over the
 * wire. What can be checked is that no call site in the app asks for the destructive body at all,
 * and that is the property: one `data` anywhere in `src/web` is a screen that can empty a record.
 */
describe('every write from a screen is a merge', () => {
  /** Every .ts and .tsx file under src/web, read once. */
  function webSources(): { path: string; text: string }[] {
    const root = fileURLToPath(new URL('../src/web', import.meta.url))
    const out: { path: string; text: string }[] = []
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
          out.push({ path: full.slice(root.length + 1), text: readFileSync(full, 'utf8') })
        }
      }
    }
    walk(root)
    return out
  }

  /**
   * Every `updateRecord(...)` call in one file, as the text between its brackets.
   *
   * BRACKET-MATCHED RATHER THAN REGEXPED. A patch object holds nested objects and arrays, so a
   * pattern that stopped at the first `}` would read half a call and miss what the other half asks
   * for. This walks to the bracket that closes the call and hands back everything inside it.
   */
  function updateRecordCalls(text: string): string[] {
    const calls: string[] = []
    const opener = 'updateRecord('
    for (let at = text.indexOf(opener); at !== -1; at = text.indexOf(opener, at + 1)) {
      let depth = 0
      let i = at + opener.length - 1
      for (; i < text.length; i += 1) {
        const ch = text[i]
        if (ch === '(') depth += 1
        else if (ch === ')') {
          depth -= 1
          if (depth === 0) break
        }
      }
      calls.push(text.slice(at, i + 1))
    }
    return calls
  }

  it('asks for the merge body and never the replacing one, anywhere in src/web', () => {
    const asked: string[] = []
    let calls = 0
    for (const file of webSources()) {
      for (const call of updateRecordCalls(file.text)) {
        calls += 1
        // `dataPatch:` contains `data` but is not it, so the key is matched on its own.
        const wholesale = /(^|[^A-Za-z])data\s*:/.test(call.replace(/dataPatch\s*:/g, 'MERGE:'))
        if (wholesale) asked.push(`${file.path}: ${call.replace(/\s+/g, ' ').slice(0, 140)}`)
      }
    }

    // THE CONTROL. A scan that found no call at all would pass this test while proving nothing,
    // which is the failure mode a source scan has and a press does not.
    expect(calls, 'no call to updateRecord was found in src/web, so this scan is checking nothing').toBeGreaterThan(0)

    expect(
      asked,
      'a screen sends `data`, which replaces a record\'s whole object. What a page holds is a copy read when it ' +
        'loaded, so this write empties every field written since, including fields the page never read. Send the ' +
        'fields being changed as `dataPatch`.',
    ).toEqual([])
  })

  it('never says a rewrite is meant, because a page is never in a position to mean it', () => {
    const asked: string[] = []
    for (const file of webSources()) {
      for (const call of updateRecordCalls(file.text)) {
        if (/(^|[^A-Za-z])replace\s*:/.test(call)) asked.push(file.path)
      }
    }
    expect(
      asked,
      'a screen sends `replace`, which tells the server a whole-object rewrite is meant. Only a caller that ' +
        'really is rewriting the record may say that, and a page holding a copy from page-load is not one.',
    ).toEqual([])
  })
})
