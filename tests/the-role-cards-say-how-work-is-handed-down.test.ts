// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE THREE ROLE CARDS SAY HOW WORK IS HANDED DOWN. The secretary decides what is to be made and how it is accepted;
 * the supervisor decides which worker or which supervisor makes which whole outcome, which steps cannot be left out
 * because they wait on something outside, and how it accepts the result; the worker decides how to make it. A
 * supervisor may hand a whole outcome to another supervisor as a package and stands to it as the secretary does.
 *
 * The cards are the shipped file's own words. This test reads them as data and fails if any one of the three loses the
 * part that is its own. Nothing here checks a card's prose beyond those parts.
 *
 * MUTATION: delete the secretary's sentence "It decides what is to be made and how it is accepted." from
 * src/config/roles.json. The secretary case goes red. Removing the supervisor's or the worker's sentence turns its own
 * case red, and no other case.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'

interface ARoleCard {
  name: string
  duties: string
}

const roles = JSON.parse(readFileSync(join(process.cwd(), 'src/config/roles.json'), 'utf8')) as { cards: ARoleCard[] }
const card = (name: string): ARoleCard => {
  const found = roles.cards.find((one) => one.name === name)
  expect(found, `the ${name} card is in the shipped roles file`).toBeDefined()
  return found as ARoleCard
}

it('says the secretary decides what is to be made and how it is accepted', () => {
  expect(card('secretary').duties).toContain('It decides what is to be made and how it is accepted.')
})

it('says the supervisor decides the whole outcomes, the outside waits and its acceptance, and may hand a whole outcome to another supervisor as a package', () => {
  const duties = card('supervisor').duties
  expect(duties).toContain('It decides which worker or which supervisor makes which whole outcome, which steps cannot be left out because they wait on something outside, and how it accepts the result.')
  expect(duties).toContain('It may hand a whole outcome to another supervisor as a package, and stands to it as the secretary does.')
})

it('says the worker decides how to make the outcome it is given', () => {
  expect(card('worker').duties).toContain('The worker decides how to make the outcome it is given.')
})
