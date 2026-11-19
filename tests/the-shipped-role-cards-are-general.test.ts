// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ROLE CARDS SHIP IN GENERAL WORDS (wave 13w, round 4). src/config/roles.json ships with the product, and a
 * fresh office copies its words into one role card text record per card (src/server/lib/card-words.ts). So the
 * file is written for any office and any person, not for the one it was developed in:
 *
 *   - the owner-content screen of the merge tool (tools/merge-tool/owner-content.mjs) finds nothing on any line
 *     of it, refused or reminded, and no entry of its allow-list is needed to let a line through;
 *   - an English string says "the person" or "they", never he, his, him or himself;
 *   - Chinese is written only in a `zh` field;
 *   - no string names a file under design/, CLAUDE.md or AGENTS.md, cites a criterion by its code, or carries a
 *     date.
 *
 * THE FLOW CODES STAY. The words of a flow may change, but the code at its start is the one part the office acts
 * on: `whereTheFirstTaskIs` in src/server/lib/cardmessage.ts reads F11, F12 and F13 from a card's flow to say
 * where an agent's first task is. So each card keeps the codes it has, and the note on flows names all three.
 *
 * The question rule on every card, and the secretary's steps by number, were held by the cards'
 * found-problem-steps test until it was deleted on 12 November 2026.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { theRoleCardsFile } from '../src/server/lib/roles.ts'
import { theHitsOn } from '../tools/merge-tool/owner-content.mjs'
import { THE_PATTERNS } from './the-owners-content-patterns.ts'

const THE_FILE = 'src/config/roles.json'
const text = readFileSync(theRoleCardsFile(), 'utf8')
const declaration = JSON.parse(text) as {
  whatFlowIs: string
  cards: { name: string; flow?: string }[]
  personCards: { name: string; flow?: string }[]
}




describe('the shipped role cards', () => {
  it('give the owner-content screen nothing to find on any line', () => {
    const lines = text.split('\n')
    expect(lines.length, 'the declaration was read').toBeGreaterThan(50)
    const hits = lines.flatMap((line, at) =>
      theHitsOn(THE_FILE, line, { patterns: THE_PATTERNS }).map((hit) => `line ${String(at + 1)}: ${hit.pattern} "${hit.words}"`),
    )
    expect(hits).toEqual([])
  })



})

describe('the flow codes', () => {
  const KEPT: Record<string, string[]> = {
    worker: ['F13'],
    supervisor: ['F12', 'F13'],
    secretary: ['F11', 'F13'],
    inspector: ['F13'],
  }

  it('stay on the cards that carry them, because the office reads them', () => {
    for (const [name, codes] of Object.entries(KEPT)) {
      const card = declaration.cards.find((one) => one.name === name)
      expect(card, `the ${name} card`).toBeDefined()
      expect(card?.flow?.match(/\bF1\d\b/g) ?? [], `the ${name} card's flow codes`).toEqual(codes)
    }
  })

})
