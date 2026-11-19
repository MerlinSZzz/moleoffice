// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FIELD A LINE ADDS TO A SHARED KIND JOINS THE KIND TABLE FROM A FILE OF THE LINE'S.
 *
 * The head comment of src/shared/kinds.ts says the way. A line's file under src/shared/kind-fields
 * exports the kind it adds to and its fields. src/shared/kind-fields/parts.ts names that file.
 * KIND_SPECS puts the line's fields after the kind's own fields and before the short forms field.
 * A key declared twice, or a kind with no spec, stops kinds.ts from loading, and the error names
 * both places.
 *
 * No line has such a file yet, and this round ships none. So each case stands a made list in for
 * parts.ts with vi.doMock and loads kinds.ts again. That runs the real join on parts the test makes.
 * The kind's own fields come from kinds.ts loaded with an empty list, never from a list copied here.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FieldSpec, FieldsOfALine } from '../src/shared/kinds.ts'
import type { RecordKind } from '../src/shared/types.ts'
import { SHORT_FORMS_FIELD } from '../src/shared/zoom.ts'

type Kinds = typeof import('../src/shared/kinds.ts')

/** src/shared/kinds.ts loaded afresh, with `parts` standing in for src/shared/kind-fields/parts.ts. */
async function kindsWith(parts: Record<string, FieldsOfALine>): Promise<Kinds> {
  vi.resetModules()
  vi.doMock('../src/shared/kind-fields/parts.ts', () => parts)
  return import('../src/shared/kinds.ts')
}

/** The error kinds.ts throws while it loads with `parts`, or a failure when it loads. */
async function refusalWith(parts: Record<string, FieldsOfALine>): Promise<string> {
  const loaded = await kindsWith(parts).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : String(error)),
  )
  if (loaded === null) throw new Error('kinds.ts loaded, and it should have refused these parts.')
  return loaded
}

/** A field this test makes. Its key is one the session kind does not declare. */
const made = (key: string, type = 'string'): FieldSpec => ({
  key,
  type,
  required: false,
  description: 'A field this test adds.',
  example: type === 'string' ? 'made by the test' : [],
})

afterEach(() => {
  vi.doUnmock('../src/shared/kind-fields/parts.ts')
  vi.resetModules()
})

describe('a field a line adds to a shared kind joins the kind table', () => {
  it('comes after the kind\'s own fields, by the order of the parts\' names, and before the short forms field', async () => {
    const own = await kindsWith({})
    const ownKeys = own.KIND_SPECS.session.fields.map((field) => field.key)
    expect(ownKeys.at(-1)).toBe(SHORT_FORMS_FIELD)
    const first = made('aFieldOfTheSecondPart')
    const second = made('anotherFieldOfTheSecondPart')
    const earlier = made('aFieldOfTheFirstPart')
    for (const key of [first.key, second.key, earlier.key]) expect(ownKeys).not.toContain(key)

    const joined = await kindsWith({
      sessionWaveB: { kind: 'session', fields: [first, second] },
      sessionWaveA: { kind: 'session', fields: [earlier] },
    })
    const fields = joined.KIND_SPECS.session.fields
    expect(fields.map((field) => field.key)).toEqual([...ownKeys.slice(0, -1), earlier.key, first.key, second.key, SHORT_FORMS_FIELD])
    expect(fields.find((field) => field.key === first.key)).toEqual(first)
  })

  it('is a field a write may hold, which the kind without the line\'s file refuses', async () => {
    const field = made('aFieldOfOneLine')
    const own = await kindsWith({})
    const joined = await kindsWith({ sessionWaveA: { kind: 'session', fields: [field] } })
    expect(own.validateData('session', { [field.key]: 'a value' }).ok).toBe(false)
    expect(joined.validateData('session', { [field.key]: 'a value' }).ok).toBe(true)
  })

  it('gives the kind the short forms with parts when the line\'s field holds blocks', async () => {
    const joined = await kindsWith({ sessionWaveA: { kind: 'session', fields: [made('blocksOfOneLine', 'SummaryBlock[]')] } })
    expect(joined.kindHoldsPartsLevels('session')).toBe(true)
  })

  it('stops kinds.ts loading when a line\'s file adds a key the kind already declares, and names both', async () => {
    const own = await kindsWith({})
    const declared = own.KIND_SPECS.session.fields[0]?.key
    if (declared === undefined) throw new Error('The session kind declares no field.')
    const said = await refusalWith({ sessionWaveA: { kind: 'session', fields: [made(declared)] } })
    for (const name of [declared, 'kinds.ts', 'sessionWaveA']) expect(said).toContain(name)
  })

  it('stops kinds.ts loading when a line\'s file adds the short forms key, and names both', async () => {
    const said = await refusalWith({ sessionWaveA: { kind: 'session', fields: [made(SHORT_FORMS_FIELD)] } })
    for (const name of [SHORT_FORMS_FIELD, 'shortFormsField', 'sessionWaveA']) expect(said).toContain(name)
  })

  it('stops kinds.ts loading when two lines\' files add one key, and names both', async () => {
    const field = made('aFieldTwoLinesAdd')
    const said = await refusalWith({
      sessionWaveA: { kind: 'session', fields: [field] },
      sessionWaveB: { kind: 'session', fields: [field] },
    })
    for (const name of [field.key, 'sessionWaveA', 'sessionWaveB']) expect(said).toContain(name)
  })

  it('stops kinds.ts loading when a line\'s file names a kind that has no spec', async () => {
    const own = await kindsWith({})
    const noKind = 'aKindNobodyDeclared'
    expect(Object.hasOwn(own.KIND_SPECS, noKind)).toBe(false)
    const said = await refusalWith({ aWaveOfNoKind: { kind: noKind as RecordKind, fields: [made('aFieldOfNoKind')] } })
    for (const name of [noKind, 'aWaveOfNoKind']) expect(said).toContain(name)
  })
})
