// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { partHashOf } from '../src/server/db/version.ts'
import { revisionDataToStore, wholeRevisionData } from '../src/server/db/revision-stored-once.ts'

describe('revision part integrity', () => {
  it('stores each repeated JSON value by hash and rebuilds it from the earlier holder', () => {
    for (const value of [null, false, 0, 'text', ['chapter'], { text: 'chapter' }]) {
      const data = { extra: { roundChapters: value } }
      const stored = revisionDataToStore('session', data, { seq: 1, data, parts: null })
      expect(stored.parts).toEqual({ 'extra.roundChapters': 1 })
      expect(stored.data.extra).toEqual({ roundChapters: partHashOf(JSON.stringify(value)) })
      expect(wholeRevisionData({ recordId: 'fixture', seq: 2, ...stored }, () => ({ data, parts: null }))).toEqual(data)
    }
    expect(revisionDataToStore('session', { extra: {} }, { seq: 1, data: { extra: {} } }).parts).toBeNull()
  })

  it('refuses a missing, changed, indirect, or non-earlier holder', () => {
    const data = { extra: { roundChapters: { text: 'chapter' } } }
    const stored = revisionDataToStore('session', data, { seq: 1, data })
    const row = { recordId: 'fixture', seq: 2, ...stored }
    expect(() => wholeRevisionData(row, () => undefined)).toThrow(/revision 1/i)
    expect(() => wholeRevisionData(row, () => ({ data: { extra: { roundChapters: { text: 'changed' } } } }))).toThrow(/not the one/i)
    expect(() => wholeRevisionData(row, () => ({ data: stored.data, parts: stored.parts }))).toThrow(/names another/i)
    expect(() => wholeRevisionData({ ...row, parts: { 'extra.roundChapters': 2 } }, () => ({ data }))).toThrow(/earlier/i)
  })
})
