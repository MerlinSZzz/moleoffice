// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * EVERY ROLE CARD HAS ALL ITS PARTS, ITS POWERS ARE REAL, AND ITS MUST-READ LINE NAMES CHAPTERS.
 *
 * Criterion P13 of design/permissions/ACCEPTANCE.md: different duties have different powers
 * and different things to know. *Measured: a card with a missing part is refused; a card
 * naming a chapter absent from design/rules/ACCEPTANCE.md's list fails the same test.* That list is
 * read from the default set, src/config/rules/default-regulations.json, and from the export, now (see below).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT CHANGED HERE, AND WHY THE FILE HAS A NEW NAME
 * ---------------------------------------------------------------------------------------
 *
 * This was `a-role-card-has-all-seven-parts.test.ts` and it read `THE_SEVEN_PARTS`, `card.may`,
 * `card.mayNot`, `card.saidButNotChecked` and `card.whoMayGrantIt`. Criteria P56 and P57 took every
 * one of those off the card: a card is a name, its duties and its powers, powers are a tree, and no
 * May or May-not list is written anywhere. So the assertions that read those fields are gone, and
 * what replaces them is the tree — a card naming a power nothing declares, a step whose role does
 * not match the card at that rung, a power added twice, and a card that both stands on a step and
 * names its own powers. **The old assertions were not weakened; the fields they read no longer
 * exist**, and this note is here so nobody has to diff two files to learn that.
 *
 * THE CARDS AND THE DEFAULT SET SHARE ONE LIST, AND ONLY THE CHAPTERS NAME A CHAPTER. `src/config/roles.json` holds the
 * numbers of the chapters a card may point at. Each chapter is a record in the office. A new office copies its chapters
 * from the default set, `src/config/rules/default-regulations.json`, and the office this repository is developed in
 * exports its own to `src/config/rules/chapters.json`. This file makes the three one list: add, drop or renumber a
 * chapter in either without changing the cards, or the other way round, and this goes red. A card that must read a
 * chapter the default set does not hold would point every new office's agents at nothing.
 *
 * A CHAPTER'S NAME LIVES IN ONE PLACE (problem aObarxX8mTWm; invariant 9). Until 3 October 2026 roles.json also typed
 * each chapter's name, and five chapter names had drifted from the chapter records (1, 3, 6, 8 and 9), which this file then
 * listed as known differences. The secretary decided on 2 October 2026 that the cards stop typing names: roles.json names a
 * chapter by its number only, and the boot refuses an entry that carries a name. Since wave 13w every reader takes the
 * name from the office's chapter records (`theChaptersOfTheCards` in src/server/lib/chapters.ts on the
 * server, `theNameOfAChapter` in src/shared/office-rules.ts on the pages), and not from the export. This file holds that
 * the file names none, and that a card's must-read line and GET /api/roles give each chapter the name the office's own
 * record gives it.
 *
 * A CARD IS REFUSED AT THE BOOT AND NOT AT A REQUEST. A role nothing can enforce must never be
 * served, so `readTheRoleCards` throws and the server does not start. The refusals below are proved
 * by handing that reader a card file with the fault in it, which is how a person would meet them.
 *
 * A ROLE CHAPTER IS READ BY ONE CARD, IN FULL. A chapter record may carry a role mark, and that mark names the
 * card that reads it. No other card names it, and that card reads it in full.
 *
 * Mutation for the restricted-card case: make `theActsACardIsKeptTo` return null for a card marked
 * `refusedEverythingElse`; the case then loses the tool card's one permitted act.
 *
 * Mutation for the role-chapter case: take the worker card's chapter 13 entry out of its must-read list; the new
 * case then finds the worker card reading no chapter the office marks for it.
 */

import { describe, expect, it } from 'vitest'
import { apiApp, buildTheFirstOfficeInAHook, freshDb } from './helpers.ts'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OPERATIONS } from '../src/shared/ops.ts'
import {
  MOST_POWERS_ON_A_CARD,
  THE_PARTS_OF_A_CARD,
  theActsACardIsKeptTo,
  theCardOffTheTree,
  powerNamesOn,
  type RolesDeclaration,
} from '../src/shared/roles.ts'
import { forgetTheRoleCards, readTheRoleCards, theRoleCardsFile } from '../src/server/lib/roles.ts'
import { chaptersFrom } from '../src/worker/rules.ts'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_MAILER_CARD_THAT_LEFT, THE_SUMMONS_POWER_THAT_LEFT } from './the-mailer-card-that-left.ts'

// The first office of this process is built in a hook, so each case below keeps its 5 s for what it tests.
buildTheFirstOfficeInAHook()

const REPO = fileURLToPath(new URL('..', import.meta.url))

/** Every act key a card is allowed to name, joined the way the boot joins it. */
const PUBLISHED_ACTS: (string | null)[] = ['decision.write', 'fork.settle', 'fork.replace', 'fork.reopen', 'fork.remove', 'act.revoke', 'ask.remove', 'plan.commit', 'direction.shelve', 'goal.confirm', 'import.accept', 'implementation.accept', 'office.scene-settings.change', 'regulation.revoke', 'module-graph.arrange', 'fork.pin', 'fork.reclassify', 'plan.shape', 'workdomain.change', 'implementation.retire', 'repository.repoint', 'restriction.dismiss', 'block.method.change']

function theCards(): RolesDeclaration {
  forgetTheRoleCards()
  return readTheRoleCards({ guardActKeys: PUBLISHED_ACTS })
}

/** The cards as they are on disk, with one thing changed, read back through the real reader. */
function cardsWithAChange(change: (decl: RolesDeclaration) => void): { threw: string | null } {
  const decl = JSON.parse(readFileSync(theRoleCardsFile(), 'utf8')) as RolesDeclaration
  change(decl)
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-roles-'))
  const file = join(dir, 'roles.json')
  writeFileSync(file, JSON.stringify(decl, null, 2))
  forgetTheRoleCards()
  try {
    readTheRoleCards({ guardActKeys: PUBLISHED_ACTS, file })
    return { threw: null }
  } catch (why) {
    return { threw: String((why as Error).message) }
  } finally {
    forgetTheRoleCards()
    // The reader has read the file and forgotten it, so its folder goes now. Until 29 September
    // 2026 nothing removed it, and one run of this file left fifteen (problem ToxCUBqVhdPI).
    rmSync(dir, { recursive: true, force: true })
  }
}

/** The default set every new office copies its chapters from, as the file holds it. */
const THE_DEFAULT_SET = 'src/config/rules/default-regulations.json'
function theDefaultSet(): { n: number; label: string }[] {
  return (JSON.parse(readFileSync(join(REPO, THE_DEFAULT_SET), 'utf8')) as { chapters: { n: number; label: string }[] }).chapters
}

/** The default set's role marks, by chapter number. */
function roleMarksInTheDefaultSet(): Map<number, string> {
  const chapters = (JSON.parse(readFileSync(join(REPO, THE_DEFAULT_SET), 'utf8')) as { chapters: { n: number; forRole?: string }[] }).chapters
  return new Map(chapters.flatMap((one) => (one.forRole === undefined ? [] : [[one.n, one.forRole] as [number, string]])))
}

/** The chapter numbers of the default set. */
function chapterNumbersInTheDefaultSet(): number[] {
  return theDefaultSet().map((one) => one.n)
}

/**
 * The chapter numbers of the export in src/config/rules/chapters.json, read through the one reader in
 * src/worker/rules.ts: the chapters of the office this repository is developed in.
 */
function chapterNumbersInTheExport(): number[] {
  return chaptersFrom(REPO).map((one) => one.n)
}


describe('the cards on disk are usable', () => {

  it('gives every card all the parts of the template', () => {
    const decl = theCards()
    for (const card of [...decl.cards, ...decl.personCards]) {
      for (const part of THE_PARTS_OF_A_CARD) {
        // `powers` IS THE ONE PART THAT IS NULL ON PURPOSE: a card on the tree takes its powers from
        // its rung, and null there is what says so. Every other part is present or the boot refuses.
        if (part === 'powers') continue
        expect(card[part], `the ${card.name} card has no ${part}`).toBeDefined()
      }
      expect(
        card.rung === null ? Array.isArray(card.powers) : card.powers === null,
        `the ${card.name} card names its powers the wrong way for where it stands`,
      ).toBe(true)
    }
  })

  it('names only acts this installation publishes', () => {
    const published = new Set<string>([...OPERATIONS.map((one) => one.name), ...(PUBLISHED_ACTS.filter((one) => one !== null) as string[])])
    for (const power of theCards().powers) {
      for (const one of power.acts) {
        expect(published, `the power ${power.name} names ${one.act}, which nothing publishes`).toContain(one.act)
      }
    }
  })

  it('keeps every card to at most the declared number of named powers', () => {
    const decl = theCards()
    for (const card of [...decl.cards, ...decl.personCards]) {
      const held = powerNamesOn(decl, card)
      expect(held.length, `the ${card.name} card holds ${String(held.length)} powers`).toBeLessThanOrEqual(
        MOST_POWERS_ON_A_CARD,
      )
    }
  })
})

describe('the cards, the default set and the export share one chapter list', () => {
  it('declares exactly the chapters the default set holds, and the export, by number', () => {
    const declared = theCards().chapters.map((one) => one.number)
    expect(declared, THE_DEFAULT_SET).toEqual(chapterNumbersInTheDefaultSet())
    expect(declared, 'src/config/rules/chapters.json').toEqual(chapterNumbersInTheExport())
  })


  it("gives each chapter the office's own name on every card's must-read line and in GET /api/roles", async () => {
    // AN OFFICE THAT COPIED THE DEFAULT SET, as every new office does at its first start. Its names are the set's.
    const t = await freshDb()
    const { copyTheDefaultRegulationsOnce } = await import('../src/server/lib/default-regulations.ts')
    expect(copyTheDefaultRegulationsOnce().copied).toBe(theDefaultSet().length)
    const { app } = await apiApp()
    try {
      await app.ready()
      const headers = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON }
      const named = new Map(theDefaultSet().map((one) => [one.n, one.label]))
      // What GET /api/roles hands the pages: every chapter of the cards, named as this office's records name it.
      const roles = await app.inject({ method: 'GET', url: '/api/roles', headers })
      expect(roles.statusCode, roles.body).toBe(200)
      expect((roles.json() as { chapters: { number: number; name: string }[] }).chapters.map((one) => [one.number, one.name])).toEqual([
        ...named.entries(),
      ])
      // What an agent is told on its card: each chapter it must read, by this office's name.
      for (const card of theCards().cards) {
        const handle = `parts-${card.name}`
        const made = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload: { handle, name: handle, role: card.name } })
        expect(made.statusCode, made.body).toBe(201)
        const waiting = await app.inject({ method: 'GET', url: `/api/handles/${handle}/waiting`, headers })
        const first = (waiting.json() as { waiting: { messageId: string }[] }).waiting[0]
        expect(first, `the ${card.name} card's registration wrote no card message`).toBeDefined()
        const read = await app.inject({ method: 'GET', url: `/api/records/${first!.messageId}`, headers })
        const said = (read.json() as { record: { data: { saidInFull?: string } } }).record.data.saidInFull ?? ''
        for (const entry of card.mustRead.chapters) {
          expect(said, `the ${card.name} card's message`).toContain(`chapter ${String(entry.chapter)} ${named.get(entry.chapter) ?? '(none)'} at ${entry.level}`)
        }
      }
    } finally {
      await app.close()
      t.close()
    }
  }, 60_000)

  it('has every card reading only chapters the default set and the export hold', () => {
    const inTheSet = new Set(chapterNumbersInTheDefaultSet())
    const exported = new Set(chapterNumbersInTheExport())
    for (const card of theCards().cards) {
      for (const entry of card.mustRead.chapters) {
        expect(inTheSet, `the ${card.name} card must read chapter ${String(entry.chapter)}, which the default set does not hold`).toContain(
          entry.chapter,
        )
        expect(exported, `the ${card.name} card must read chapter ${String(entry.chapter)}, which the export does not hold`).toContain(
          entry.chapter,
        )
      }
    }
  })

  it('has each card reading, in full, every role chapter marked for it and no role chapter marked for another card', () => {
    const inTheDefaultSet = roleMarksInTheDefaultSet()
    const inTheExport = new Map(
      chaptersFrom(REPO).flatMap((one) => (one.forRole === undefined ? [] : [[one.n, one.forRole] as [number, string]])),
    )
    expect(
      [...inTheDefaultSet.entries()].sort((a, b) => a[0] - b[0]),
      'the default set and the export mark the same chapters for the same cards',
    ).toEqual([...inTheExport.entries()].sort((a, b) => a[0] - b[0]))
    const decl = theCards()
    for (const card of [...decl.cards, ...decl.personCards]) {
      const roleChaptersOnTheCard = card.mustRead.chapters
        .filter((entry) => inTheDefaultSet.has(entry.chapter))
        .sort((a, b) => a.chapter - b.chapter)
      const markedForTheCard = [...inTheDefaultSet.entries()]
        .filter(([, role]) => role === card.name)
        .map(([n]) => n)
        .sort((a, b) => a - b)
      expect(roleChaptersOnTheCard.map((one) => one.chapter), `the ${card.name} card's role chapters`).toEqual(markedForTheCard)
      for (const entry of roleChaptersOnTheCard) {
        expect(entry.level, `the ${card.name} card reads chapter ${String(entry.chapter)} at ${entry.level}`).toBe('full')
      }
    }
  })
})

describe('a card that is not usable stops the server, rather than being half read', () => {
  it('refuses a card with a part missing, and names the part', () => {
    const { threw } = cardsWithAChange((decl) => {
      delete (decl.cards[0] as unknown as Record<string, unknown>)['whatEndsIt']
    })
    expect(threw).toContain('whatEndsIt')
    expect(threw).toContain('all 8 parts')
  })

  it('refuses a card that must read a chapter nothing declares, and says which', () => {
    const { threw } = cardsWithAChange((decl) => {
      decl.cards[0]?.mustRead.chapters.push({ chapter: 47, level: 'full' })
    })
    expect(threw).toContain('chapter 47')
    expect(threw).toContain(THE_DEFAULT_SET)
    expect(threw).not.toContain('CODE.md')
  })

  it("refuses a chapter in the list that carries a name, and says the name is read from the office's chapter records", () => {
    // PROVED BY MUTATION on 13 October 2026: with the refusal's old words back, which named src/config/rules/chapters.json,
    // this case went red.
    const { threw } = cardsWithAChange((decl) => {
      const first = decl.chapters[0] as unknown as Record<string, unknown>
      first['name'] = 'A name typed into the cards by this test'
    })
    expect(threw).toContain('carries a name')
    expect(threw).toContain('GET /api/office-regulations')
    expect(threw).not.toContain('chapters.json')
  })

  it('refuses a power naming an act nothing publishes, and says where the acts come from', () => {
    const { threw } = cardsWithAChange((decl) => {
      decl.powers[0]?.acts.push({ act: 'world.domination', inWords: 'Take over' })
    })
    expect(threw).toContain('world.domination')
    expect(threw).toContain('src/shared/ops.ts')
  })

  it('refuses a card naming a power this declaration does not hold', () => {
    const { threw } = cardsWithAChange((decl) => {
      const offTheTree = decl.cards.find((one) => one.rung === null)
      if (offTheTree === undefined) throw new Error('no card off the tree')
      offTheTree.powers = [...(offTheTree.powers ?? []), 'Everything']
    })
    expect(threw).toContain('Everything')
    expect(threw).toContain('does not hold')
  })

  it('refuses a card that stands on the tree and also names its own powers', () => {
    const { threw } = cardsWithAChange((decl) => {
      const onTheTree = decl.cards.find((one) => one.rung !== null)
      if (onTheTree === undefined) throw new Error('no card on the tree')
      onTheTree.powers = ['Records']
    })
    expect(threw).toContain('powers: null')
  })

  // THE TOOL'S CARD THESE MUTATIONS START FROM IS PUT BACK FIRST. The mailer card was the one card
  // refused everything else, and it left the declaration on 1 October 2026.
  // The reader still holds the rule for such a card, so each mutation below adds the old card and its
  // power back to its own copy of the file, then breaks it.
  const withTheToolsCard = (decl: RolesDeclaration): void => {
    decl.cards.push(structuredClone(THE_MAILER_CARD_THAT_LEFT))
    decl.powers.push(structuredClone(THE_SUMMONS_POWER_THAT_LEFT))
  }

  it('keeps a restricted tool card to its own powers and out of the checker place', () => {
    const decl = theCards()
    withTheToolsCard(decl)

    expect(theCardOffTheTree(decl)?.name).toBe('inspector')
    const keptTo = theActsACardIsKeptTo(decl, 'mailer')
    expect(keptTo).not.toBeNull()
    expect([...(keptTo ?? [])]).toEqual(['office.read-summonses'])
    expect(theActsACardIsKeptTo(decl, 'inspector')).toBeNull()
  })

  // This test cites the owner's decision.
  it('keeps refusedEverythingElse to true, on a card off the tree that holds a power', () => {
    expect(cardsWithAChange(withTheToolsCard).threw, 'the old tool card is refused as it stands').toBeNull()
    const onTheTree = cardsWithAChange((decl) => {
      const card = decl.cards.find((one) => one.rung !== null)
      if (card === undefined) throw new Error('no card on the tree')
      card.refusedEverythingElse = true
    })
    expect(onTheTree.threw).toContain('is also refused everything else')
    const holdingNothing = cardsWithAChange((decl) => {
      withTheToolsCard(decl)
      const card = decl.cards.find((one) => one.refusedEverythingElse === true)
      if (card === undefined) throw new Error('no card is refused everything else')
      card.powers = []
    })
    expect(holdingNothing.threw).toContain('could do nothing at all')
    const notTrue = cardsWithAChange((decl) => {
      withTheToolsCard(decl)
      const card = decl.cards.find((one) => one.refusedEverythingElse === true)
      if (card === undefined) throw new Error('no card is refused everything else')
      ;(card as unknown as Record<string, unknown>)['refusedEverythingElse'] = 'yes'
    })
    expect(notTrue.threw).toContain('something other than true')
  })

  it('refuses a step of the tree that adds a power some other step already added', () => {
    const { threw } = cardsWithAChange((decl) => {
      const top = decl.tree[decl.tree.length - 1]
      if (top === undefined) throw new Error('no tree')
      top.adds = [...top.adds, 'Records']
    })
    expect(threw).toContain('Records')
    expect(threw).toContain('added twice')
  })

  it('refuses a step whose role is not the card standing at that rung', () => {
    const { threw } = cardsWithAChange((decl) => {
      const step = decl.tree[0]
      if (step === undefined) throw new Error('no tree')
      step.role = 'inspector'
    })
    expect(threw).toContain('inspector')
    expect(threw).toContain('one rung')
  })

  it('refuses one act filed under two powers, so who may perform it has one answer', () => {
    const { threw } = cardsWithAChange((decl) => {
      const first = decl.powers[0]
      const second = decl.powers[1]
      if (first === undefined || second === undefined) throw new Error('too few powers')
      second.acts = [...second.acts, { act: String(first.acts[0]?.act), inWords: 'again' }]
    })
    expect(threw).toContain('under two powers')
  })

  it('refuses a card naming more powers than the cap, and says how many it names', () => {
    // EVERY DECLARED POWER HAS TO BE NAMED FIRST. The cap equals the number the file declares, so a
    // card cannot go over it by naming the ones that exist — which is why this mutation adds one. The
    // first version of this test only counted the powers on the real cards, and removing the cap
    // from the boot left it green: nothing was over it, so nothing could go under it.
    const { threw } = cardsWithAChange((decl) => {
      decl.powers.push({ name: 'Everything else', whatItIs: 'Whatever is left.', acts: [{ act: 'record.read', inWords: 'Read' }] })
      const offTheTree = decl.cards.find((one) => one.rung === null)
      if (offTheTree === undefined) throw new Error('no card off the tree')
      offTheTree.powers = decl.powers.map((one) => one.name)
    })
    expect(threw).toContain(String(MOST_POWERS_ON_A_CARD + 1))
    expect(threw).toContain('at most')
  })

  it('accepts a card with 200 words of duties, because duties have no word limit', () => {
    // The owner took the word limit off a card's duties.
    const { threw } = cardsWithAChange((decl) => {
      const card = decl.cards[0]
      if (card === undefined) throw new Error('no card')
      card.duties = new Array(200).fill('word').join(' ')
    })
    expect(threw).toBeNull()
  })

  it('refuses an elevation rule naming a card or a power that is not there', () => {
    const { threw } = cardsWithAChange((decl) => {
      decl.elevation.onlyThisCardCanHoldIt = 'chancellor'
      decl.elevation.givesThePower = 'Everything'
    })
    expect(threw).toContain('chancellor')
    expect(threw).toContain('Everything')
  })

  it('names every problem at once, rather than the first one', () => {
    const { threw } = cardsWithAChange((decl) => {
      delete (decl.cards[0] as unknown as Record<string, unknown>)['whatEndsIt']
      delete (decl.cards[1] as unknown as Record<string, unknown>)['reportsTo']
    })
    expect(threw).toContain('whatEndsIt')
    expect(threw).toContain('reportsTo')
    // Two parts deleted, four sentences: each missing part is named once as a missing part and once
    // by the check that reads it. Both are useful and neither is the other, so both are printed.
    expect(threw).toContain('things to fix')
    expect(threw).toContain('does not say what ends it')
    expect(threw).toContain('does not say who it reports to')
  })
})
