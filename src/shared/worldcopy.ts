// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { readStoredWord as t } from './i18n.ts'
import { en } from './words/en.ts'
/**
 * WHAT A WORLD SAYS ABOUT BEING A COPY: the sentences, in one place. Criteria C33 and P80.
 *
 * Criterion C33: what the worlds ask of a person, and whether to read a report, was unclear, and
 * a world is a copy of the corpus taken when it started, so a handback filed afterwards on the live
 * office is not in it, and nothing in the world said so. Criterion P80: the copied world has the
 * database and not the picture files, so the world's own page says why its faces differ.
 *
 * THE WORDS LIVE HERE SO THE PAGE AND ITS TEST READ THE SAME STRING. A sentence typed once on the
 * page and again in the test is two copies free to drift; the test would then pass while the page
 * said something else. The page draws these, the test holds them, and a mutation in either is seen.
 *
 * NO REACT, NO FILESYSTEM, NO NETWORK. Both programs may import it, so the server test can hold the
 * words against what the server really does.
 */

/** The moment the copy was taken, in the words a reader already sees for a world's birth. */
export interface WhenTheCopyWasTaken {
  /** The world's name, so the sentence about a copy names which world. */
  name: string
  /** When it was born, in the office's local wall clock. */
  bornAt: string
}

/**
 * THAT THIS WORLD IS A COPY, TAKEN AT A STATED TIME. Criterion C33.
 *
 * It names the moment rather than saying "recently": a reader deciding whether a record they filed
 * is here needs the time, and a copy with no date on it is read as the present.
 */
export function theWorldIsACopyTakenAtSentence(world: WhenTheCopyWasTaken): string {
  return t('dev.worldhere.copyAt', { name: world.name, at: world.bornAt })
}

/**
 * THAT RECORDS FILED AFTER THAT LIVE ON THE PERSON'S OFFICE, NOT HERE. Criterion C33.
 *
 * This is the half that could not be found: report bOZAJTim_9M7 was filed on the live
 * office after the world was copied, so it was not in the world, and nothing in the world said so.
 */
export function recordsAfterTheCopyLiveOnTheirOfficeSentence(bornAt: string): string {
  return t('dev.worldhere.recordsAfter', { at: bornAt })
}

/**
 * WHY THE FACES DIFFER, IN THE WORDS OF WHAT MOLE OFFICE ACTUALLY DOES. Criterion P80.
 *
 * MEASURED ON A REAL COPIED WORLD, 12 September 2026, reading src/server/lib/avatars.ts:167-203.
 * A copied world has the database and not the picture files, so there are two cases and they are
 * not the same:
 *
 *   - A face Mole Office DREW is still drawn: its bytes are worked out from the participant, not
 *     stored (`origin === 'default'`, avatars.ts:172). That is why a copied world still has faces.
 *   - A picture somebody UPLOADED names a file, and a copy does not bring the file with it. There
 *     Mole Office REFUSES LOUDLY with a 410 and the sentence "Nothing was drawn in its place"
 *     (avatars.ts:189-196). It does NOT quietly draw a generated face over somebody's own picture.
 *
 * SO THE SENTENCE SAYS THE REFUSAL, not a fallback. Writing "faces fall back to generated ones"
 * would describe the opposite of what happens and would hide the missing file behind a drawn one,
 * which breaks the principle at the top of USER.md, "Never silently substitute semantics".
 */
export const THE_FACES_SENTENCE = en['dev.worldhere.faces']

export function theFacesSentence(): string {
  return t('dev.worldhere.faces')
}

/**
 * WHERE THE HANDBACK THIS WORLD BELONGS TO CAN BE READ. Criterion C33.
 *
 * This is the other half of the sentence above. A world is a copy taken when it starts, so the
 * handback that asks them to look at it is filed afterwards on their office. Report bOZAJTim_9M7 was looked for
 * in world 34233, and it was not there — because it never could
 * have been. Now the world names it and says where it is.
 *
 * WHY THE ADDRESS COMES FROM A HOME ROW. The office's home row holds the address the office answers
 * at, so the world knows where the office is without a second column to hold it, and without
 * inventing one. There are two places a world finds that row. A copy made by
 * tools/isolated-mole-office.mjs no longer carries it (the copy deletes it, so the world does not
 * read itself as the office), and such a world reads the office's own list, from the mirror, which
 * holds the office's live home row. A copy made some other way still carries the original's home
 * row. When neither gives an address, the sentence names the record and says plainly that it does
 * not know the address, rather than drawing a link that goes nowhere.
 *
 * NOTHING HERE CHECKS THAT THE RECORD EXISTS. A world is usually started before its handback is
 * written, which is the ordinary case and not a fault.
 */
export interface WhereTheHandbackIs {
  /** The handback's record id, or null because nobody tied this world to one. */
  handback?: string | null
}

/** What a world says when nobody tied it to a handback. A real answer, and the fifth invariant. */
export const NOBODY_TIED_THIS_WORLD_TO_A_HANDBACK = en['dev.worldhere.noHandback']

/**
 * One sentence naming the handback and where to read it.
 *
 * `officeAddress` is the address of the office this world was copied from, or null because the home
 * row carried none. The address is named in full because a person reading it inside a copy cannot
 * reach the office by a relative link: the copy is a different server.
 */
export function theHandbackThisWorldBelongsToSentence(world: WhereTheHandbackIs, officeAddress: string | null): string {
  const id = typeof world.handback === 'string' && world.handback.trim() !== '' ? world.handback.trim() : null
  if (id === null) return t('dev.worldhere.noHandback')
  if (officeAddress === null) {
    return t('dev.worldhere.handbackNoAddress', { id })
  }
  return t('dev.worldhere.handbackAt', { id, address: officeAddress })
}

/**
 * The address of the office a copy was taken from, or null because no home row here gives one.
 *
 * `theHomeRowBelongsTo` is non-null when this database still carries the original's home row, and
 * that row is the one read. When it is null, the row read is the live home row in `worlds`, which is
 * there when `worlds` is the office's own list read from its mirror, and is not there when `worlds`
 * is this world's own table.
 */
export function theOfficeAddressACopyCarries(
  worlds: readonly {
    kind: string
    databaseIdentity: string
    diedAt?: string | null
    address?: string | null
    addressForOtherMachines?: string | null
  }[],
  theHomeRowBelongsTo: string | null,
): string | null {
  const home =
    theHomeRowBelongsTo === null
      ? worlds.find((one) => one.kind === 'home' && (one.diedAt ?? null) === null)
      : worlds.find((one) => one.kind === 'home' && one.databaseIdentity === theHomeRowBelongsTo)
  if (home === undefined) return null
  // THE ADDRESS ANOTHER MACHINE REACHES IS PREFERRED, because the person reads the office from wherever they
  // are and 127.0.0.1 inside a copy means the copy's own machine. Problem 5mG-KxUAXObJ is the same
  // reading for the Worlds page.
  const other = typeof home.addressForOtherMachines === 'string' ? home.addressForOtherMachines.trim() : ''
  if (other !== '') return other
  const own = typeof home.address === 'string' ? home.address.trim() : ''
  return own === '' ? null : own
}
