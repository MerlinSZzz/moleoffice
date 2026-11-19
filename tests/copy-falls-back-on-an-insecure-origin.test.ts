// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE COPY PRESS TRIES THE OLD WAY BEFORE IT SAYS IT FAILED.
 *
 * Seen from another machine over its Tailscale address: the copy id press was blocked too. It should not be,
 * because the text is already on the page, and nothing needs to come from the server.
 *
 * Nothing was fetched from the server. A page served over plain http from another machine is an
 * insecure origin, and there the browser withholds `navigator.clipboard`; the helper in
 * src/web/lib/copy.ts then said "failed" with nothing else tried. The older copy command still works
 * on an insecure origin when it runs inside the press, so `copyTheOldWay` in that file tries it: a
 * textarea off the screen, selected, `document.execCommand('copy')`, removed at once.
 *
 * There is no DOM library in this repository, so the document here is a small fake that records
 * what was done to it. That is enough: the thing under test is what the helper asks the document
 * for and what it answers with, not the browser.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED. Control run first.
 *   - Return false from copyTheOldWay regardless of the command's answer: the first case goes red.
 *   - Skip `box.remove()`: the "leaves nothing behind" case goes red.
 *   - Report true when execCommand is absent: the third case goes red.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { copyTheOldWay } from '../src/web/lib/copy.ts'

type FakeBox = {
  value: string
  attributes: Record<string, string>
  style: Record<string, string>
  selected: boolean
  range: [number, number] | null
  setAttribute: (name: string, value: string) => void
  select: () => void
  setSelectionRange: (a: number, b: number) => void
  remove: () => void
}

function aFakeDocument(answer: boolean | 'absent') {
  const made: FakeBox[] = []
  const attached: FakeBox[] = []
  const commands: string[] = []
  const doc: Record<string, unknown> = {
    activeElement: null,
    body: {
      appendChild: (box: FakeBox) => {
        attached.push(box)
      },
    },
    createElement: (tag: string) => {
      if (tag !== 'textarea') throw new Error(`asked for a ${tag}, not a textarea`)
      const box: FakeBox = {
        value: '',
        attributes: {},
        style: {},
        selected: false,
        range: null,
        setAttribute(name, value) {
          box.attributes[name] = value
        },
        select() {
          box.selected = true
        },
        setSelectionRange(a, b) {
          box.range = [a, b]
        },
        remove() {
          const at = attached.indexOf(box)
          if (at >= 0) attached.splice(at, 1)
        },
      }
      made.push(box)
      return box
    },
  }
  if (answer !== 'absent') {
    doc['execCommand'] = (command: string) => {
      commands.push(command)
      return answer
    }
  }
  return { doc, made, attached, commands }
}

const hadDocument = 'document' in globalThis
const before = (globalThis as { document?: unknown }).document

afterEach(() => {
  if (hadDocument) (globalThis as { document?: unknown }).document = before
  else delete (globalThis as { document?: unknown }).document
})

describe('the copy press on an insecure origin', () => {
  it('puts the text in a box, runs the copy command, and reports what the browser answered', () => {
    const fake = aFakeDocument(true)
    ;(globalThis as { document?: unknown }).document = fake.doc
    expect(copyTheOldWay('sb5lkfnwYiux')).toBe(true)
    expect(fake.commands).toEqual(['copy'])
    expect(fake.made).toHaveLength(1)
    expect(fake.made[0]?.value).toBe('sb5lkfnwYiux')
    expect(fake.made[0]?.selected).toBe(true)
    expect(fake.made[0]?.range).toEqual([0, 'sb5lkfnwYiux'.length])
    // Read-only and off the screen, so nothing is typed into it and nothing jumps.
    expect(fake.made[0]?.attributes['readonly']).toBe('')
    expect(fake.made[0]?.style['position']).toBe('fixed')
  })

  it('leaves nothing behind, whether the command worked or not', () => {
    for (const answer of [true, false]) {
      const fake = aFakeDocument(answer)
      ;(globalThis as { document?: unknown }).document = fake.doc
      expect(copyTheOldWay('anything')).toBe(answer)
      expect(fake.attached).toHaveLength(0)
    }
  })

  it('says failed, not copied, where the browser has no copy command at all', () => {
    const fake = aFakeDocument('absent')
    ;(globalThis as { document?: unknown }).document = fake.doc
    expect(copyTheOldWay('anything')).toBe(false)
    expect(fake.commands).toEqual([])
  })

  it('says failed where there is no document, which is where the hook never runs anyway', () => {
    delete (globalThis as { document?: unknown }).document
    expect(copyTheOldWay('anything')).toBe(false)
  })
})
