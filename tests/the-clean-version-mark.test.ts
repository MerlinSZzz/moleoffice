// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECKOUT THAT CARRIES THE CLEAN VERSION'S MARK IS THE CLEAN VERSION ONLY WITHOUT design/ AND WITHOUT A READABLE
 * LIST OF THE OWNER'S CONTENT. scripts/the-clean-version-mark.mjs works that out in one place, for the bundle's check
 * and for step 0 of every package script, and answers null or one sentence.
 *
 * Every checkout here is a folder made under one scratch folder, removed when this file ends. The list of the owner's
 * content here is made up from names the public tree already holds, in the list's own format; nothing here reads the
 * owner's list.
 *
 * MUTATIONS: a function that never refuses, one that forgets design/, one that forgets the list, and one that refuses
 * an unmarked checkout each turn a case here red.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { aTestDatabaseFolder, removeThisTestFolder } from './a-test-folder.ts'
import { THE_CLEAN_VERSION_MARK } from './the-copyright-line.ts'
import { THE_OWNERS_CONTENT, THE_OWNERS_CONTENT_SETTING, theOwnersContentIn } from './the-owners-content-list.ts'
import { whyThisIsNotTheCleanVersion } from '../scripts/the-clean-version-mark.mjs'

const temporary = aTestDatabaseFolder('clean-version-mark')
afterAll(() => removeThisTestFolder(temporary))
let serial = 0

/** A list that was read: one made-up entry of each kind. */
const A_READ_LIST = {
  notRead: null,
  content: theOwnersContentIn(
    [
      '# kind: name', 'quill',
      '# kind: real name', 'lark',
      '# kind: handle', 'wren',
      '# kind: research word', 'tamp',
      '# kind: account name', 'clerk',
      '# kind: account email', 'clerk@example.invalid',
      '# kind: machine', 'kiln-keeper',
      '# kind: port', '6143',
      '',
    ].join('\n'),
  ),
}

/** No list was read, as where the setting is not set. */
const NO_LIST = { notRead: `${THE_OWNERS_CONTENT_SETTING} is not set, so no file of the owner's content was read.`, content: null }

/** A checkout of its own under the scratch folder, with the mark or without it, and with design/ or without it. */
function aCheckout({ marked, design }: { marked: boolean; design: boolean }): string {
  const root = join(temporary, `checkout-${String(++serial)}`)
  mkdirSync(join(root, 'src'), { recursive: true })
  writeFileSync(join(root, 'src', 'a-file.ts'), 'export const A_FILE = 1\n')
  if (marked) {
    mkdirSync(join(root, '.mole-office'))
    writeFileSync(join(root, THE_CLEAN_VERSION_MARK), '{}\n')
  }
  if (design) {
    mkdirSync(join(root, 'design'))
    writeFileSync(join(root, 'design', 'a-note.md'), '# A note\n')
  }
  return root
}

/** The sentence's start and end, around what the checkout also holds. */
const theSentence = (root: string, also: string) =>
  `The checkout ${root} carries the clean version's mark, ${THE_CLEAN_VERSION_MARK}, and also ${also}, so it is not the clean version, and nothing is packed.`

describe('a checkout marked as the clean version is one only without design/ and without the list', () => {
  it('refuses a marked checkout that also holds design/', () => {
    const root = aCheckout({ marked: true, design: true })
    expect(whyThisIsNotTheCleanVersion(root, NO_LIST)).toBe(theSentence(root, 'a design/ folder'))
  })

  it("refuses a marked checkout where a list of the owner's content was read, and names both when design/ is there too", () => {
    const root = aCheckout({ marked: true, design: false })
    const theList = `a readable list of the owner's content, the file ${THE_OWNERS_CONTENT_SETTING} names`
    expect(whyThisIsNotTheCleanVersion(root, A_READ_LIST)).toBe(theSentence(root, theList))
    const both = aCheckout({ marked: true, design: true })
    expect(whyThisIsNotTheCleanVersion(both, A_READ_LIST)).toBe(theSentence(both, `a design/ folder and ${theList}`))
  })

  it('lets a marked checkout with neither through', () => {
    expect(whyThisIsNotTheCleanVersion(aCheckout({ marked: true, design: false }), NO_LIST)).toBeNull()
  })

  it('leaves an unmarked checkout alone, with design/ and a list or without them', () => {
    for (const design of [true, false]) {
      for (const list of [A_READ_LIST, NO_LIST]) {
        expect(whyThisIsNotTheCleanVersion(aCheckout({ marked: false, design }), list), `design/ ${String(design)}, ${String(list.notRead)}`).toBeNull()
      }
    }
  })

  it('judges by the list this process read when it is given none', () => {
    const root = aCheckout({ marked: true, design: false })
    expect(whyThisIsNotTheCleanVersion(root)).toBe(whyThisIsNotTheCleanVersion(root, THE_OWNERS_CONTENT))
  })
})
