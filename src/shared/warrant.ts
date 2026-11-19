// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A WARRANT: THE PERSON'S OWN WORDS, KEPT, SO AN AGENT CAN ACT ON THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT A WARRANT IS
 * ---------------------------------------------------------------------------------------
 *
 * A warrant is four things about something the person said: who said it, the words themselves, where
 * they said them, and when. An agent that carries one may make a governance write that is otherwise
 * refused to it. Nothing else changes: the same write, from the same agent, with no warrant, is
 * refused in exactly the words it was refused in before.
 *
 * A yes given in a terminal should let an agent keep those words and act on them later, rather than
 * the answer being no for ever. `design/messages/ACCEPTANCE.md` is the contract.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE RULE THAT MATTERS MORE THAN THE SHAPE
 * ---------------------------------------------------------------------------------------
 *
 * **`words` is what the person actually said, copied.** Never a paraphrase, never a summary, never a
 * sentence an agent wrote for them because it captures what they meant. The whole point of keeping the
 * words is that they can read them beside the act and say "no, that is not what I said". A paraphrase
 * makes that check impossible while looking exactly like a warrant that works.
 *
 * Nothing here can enforce that, and this file does not pretend to. What it enforces is everything
 * that CAN be checked — the words are not empty, the time is not in the future, the person is
 * somebody this installation knows — and what it makes possible is the check the owner does themselves,
 * by reading their own sentence on the record.
 *
 * ---------------------------------------------------------------------------------------
 * A WARRANT IS NEVER FILLED IN FOR THE CALLER
 * ---------------------------------------------------------------------------------------
 *
 * There is no default, no inference and no "the owner probably meant". A request either carries a
 * warrant or it does not. `readWarrant` returns a refusal for everything it cannot read, and a
 * missing warrant is not a case it handles at all — the guards handle that, by refusing the act in
 * the words they already refused it in.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE EIGHTH RULE, IN ONE OBJECT
 * ---------------------------------------------------------------------------------------
 *
 * `words` is layer one: what the person wrote, kept exactly. The act is layer three: strict,
 * canonical, and the only thing anything reads. Layer two — what the agent made of the person's words — is
 * the act it chose to make, and it is shown beside the words and attributed to the agent, never
 * folded into them.
 */

import { parseLocalStamp } from './time.ts'
// THE READER'S WORD FOR AN ACTOR TYPE, never the stored one. `human` is a column value; `person` is
// what somebody reads. One table, in shared/words.ts, and this sentence asks it like every other
// surface does — `tests/the-machine-word-gate.test.ts` is what fails when one stops.
import { actorTypeWord } from './words.ts'
// THE SENTENCES A PERSON READS ABOUT AN ACT ON THE PERSON'S WORDS are written once, in src/shared/words/en.ts
// under `g2b.onYourWords.*`, because the record page draws them through `t()` too. This file reads
// them with `readStoredWord`: English on the server, the page's language in a browser.
import { readStoredWord } from './i18n.ts'

// ---------------------------------------------------------------------------- the shape

/** The five things a warrant says. All five are required and none is defaulted. */
export interface Warrant {
  /** Who said it: a person id this installation knows. */
  saidBy: string
  /** The words themselves, exactly as the person said them. */
  words: string
  /** Where they were said. See `WARRANT_PLACES`. */
  where: string
  /** When they were said, local wall clock, the form every stamp in Mole Office is written in. */
  when: string
  /**
   * WHICH RECORDS THESE WORDS COVER. One id, or several, and never none.
   *
   * ADDED 3 SEPTEMBER 2026, BECAUSE A WARRANT WAS BOUND TO NOTHING. Verifier 6 sent one warrant on
   * one fork, got a 200, then sent the identical JSON on a different fork and got a 200 again.
   * Nothing tied a sentence to the act it was written for, so one sentence was a standing key: an
   * agent that had ever been told one governing thing could spend it on every governance act it
   * liked, on records that sentence never mentioned. Problem `TrWSYI1XYOSu` has the reproduction.
   *
   * WHAT IT DOES AND WHAT IT DELIBERATELY DOES NOT DO. It binds a warrant to records. It does not
   * count uses: a sentence naming three forks may be carried once for each of the three, and there
   * is no nonce and nothing marked spent. The person's sentence really can cover several records —
   * a sentence letting agents decide questions that arise in the middle of engineering covers every
   * such fork — and
   * the honest way to say that is to name them, not to leave the warrant naming nothing.
   */
  for: readonly string[]
}

/** The keys a warrant has, and the only ones. Anything else is a caller sending a different shape. */
export const WARRANT_KEYS = ['saidBy', 'words', 'where', 'when', 'for'] as const

/** The four that are plain text. `for` is a list and is read on its own. */
const WARRANT_TEXT_KEYS = ['saidBy', 'words', 'where', 'when'] as const

/**
 * WHERE THE WORDS WERE SAID. Two bare words and two that name a record.
 *
 * `terminal` is a conversation with an agent at a shell — the case this was made for, and the
 * one place Mole Office holds no copy of the words at all, which is exactly why the words are stored
 * here rather than referred to. `ui` is Mole Office itself. `message:<id>` and `comment:<id>` name a row
 * this installation holds, so a reader can go and read the original.
 *
 * THE LIST IS CLOSED, and a place outside it is refused rather than stored. Free text here would give
 * a dozen spellings of "terminal" and no answer to "where did they say this" worth reading.
 */
export const WARRANT_PLACES = ['terminal', 'ui'] as const
/** The two that name a record, written as `<word>:<id>`. */
export const WARRANT_PLACES_WITH_AN_ID = ['message', 'comment'] as const

/**
 * What a place is, in the words a person reads, or undefined for a word that is not a place. Used
 * to build the line under an act and the refusals below. `id` is what follows the colon of a place
 * that names a row; the two places that name none take no id.
 */
function placeInWords(word: string, id: string | undefined): string | undefined {
  if (id === undefined) {
    if (word === 'terminal') return readStoredWord('g2b.onYourWords.place.terminal')
    if (word === 'ui') return readStoredWord('g2b.onYourWords.place.ui')
    return undefined
  }
  if (word === 'message') return readStoredWord('g2b.onYourWords.place.message', { id })
  if (word === 'comment') return readStoredWord('g2b.onYourWords.place.comment', { id })
  return undefined
}

// ---------------------------------------------------------------------------- reading one

/** What `readWarrant` answers: the warrant, or the sentence that says why it is not one. */
export type WarrantReading = { warrant: Warrant; refusal?: undefined } | { warrant?: undefined; refusal: string }

/**
 * The sentence every refusal about a warrant ends on, so an agent is never left without a next step.
 *
 * Written once because it is the RULE and not the fault: five refusals would otherwise be five
 * sentences free to come to disagree about what a warrant is.
 */
const WHAT_A_WARRANT_IS =
  'A warrant is what the person actually said, kept whole, and what it is for: ' +
  '{"saidBy":"<who>","words":"<their words, copied>","where":"terminal | ui | message:<id> | comment:<id>",' +
  '"when":"YYYY-MM-DD HH:MM","for":["<the record this act is on>"]}. Copy their words. Never ' +
  'paraphrase them, never summarise them, and never write a sentence for them — the whole reason the ' +
  'words are kept is so they can read them beside the act and say it is not what they said. And name ' +
  'every record the words cover in `for`, because one sentence is not a key to everything.'

/**
 * Read what a caller sent as a warrant.
 *
 * `knownPerson` is the one person this installation has a name for, handed in rather than imported,
 * so this file states no identity of its own. `now` is the moment to judge `when` against, handed in
 * for the same reason `localStamp` takes a moment: a function that read the clock could not be tested
 * against a time it did not choose.
 */
export function readWarrant(
  sent: unknown,
  at: {
    knownPerson: string
    now: string
    /**
     * THE RECORD THIS REQUEST IS ACTING ON. The warrant's `for` has to name it.
     *
     * Handed in rather than read off the warrant, because it is a fact about the REQUEST and a
     * warrant that decided for itself which record it was about would be binding nothing again.
     */
    actingOn: string
    /**
     * DOES THIS INSTALLATION HOLD THE MESSAGE OR THE COMMENT THE WARRANT CITES?
     *
     * Handed in for the reason `knownPerson` is: this file opens no database and names no table.
     * It is asked only for a place that carries an id — `terminal` and `ui` are places with nothing
     * to look up, and asking about them would be inventing a row for them to be.
     */
    placeExists: (where: string) => boolean
    /**
     * MAY A NEW WARRANT CITE THAT PLACE? Null when it may, otherwise one sentence saying what was
     * missing. Asked only after `placeExists` said the place is held.
     *
     * Once the person has closed the key window, a warrant may cite a message or a comment written
     * after the close only when they wrote it and their key proved it. Handed in for the reason
     * `placeExists` is. The server's answer is `whyTheCitedPlaceMayNotBeCited` in
     * src/server/lib/warrants.ts.
     */
    whyThePlaceMayNotBeCited: (where: string) => string | null
  },
): WarrantReading {
  if (sent === null || typeof sent !== 'object' || Array.isArray(sent)) {
    return {
      refusal:
        `A warrant has to be an object with four keys — ${WARRANT_KEYS.join(', ')} — and this request sent ` +
        `${Array.isArray(sent) ? 'a list' : typeof sent === 'string' ? 'a string' : String(sent)}. ` +
        `Nothing was written. ${WHAT_A_WARRANT_IS}`,
    }
  }
  const object = sent as Record<string, unknown>

  const extra = Object.keys(object).filter((key) => !(WARRANT_KEYS as readonly string[]).includes(key))
  if (extra.length > 0) {
    // REFUSED RATHER THAN IGNORED, for the reason a misspelt actor header is: `wordss` silently
    // dropped is a warrant with no words that reads as one, and the act would go through carrying
    // nothing the person could check.
    return {
      refusal:
        `A warrant has four keys and this one also carries ${extra.sort().join(', ')}. Nothing was written. ` +
        `An unknown key is refused rather than dropped: a misspelt one would leave the key it was meant to be ` +
        `empty, and the act would be made on a warrant carrying nothing. ${WHAT_A_WARRANT_IS}`,
    }
  }

  const missing = WARRANT_TEXT_KEYS.filter((key) => typeof object[key] !== 'string')
  if (missing.length > 0) {
    return {
      refusal:
        `A warrant needs ${missing.join(', ')}, and this one ` +
        `${missing.length === 1 ? 'does not carry it' : 'does not carry them'} as text. Nothing was written. ` +
        `${WHAT_A_WARRANT_IS}`,
    }
  }

  // `for` IS A LIST AND IS READ ON ITS OWN, before the four text keys are looked at, because a
  // warrant that names nothing is not a warrant about this act however good its words are.
  const covers = object['for']
  if (!Array.isArray(covers) || covers.some((one) => typeof one !== 'string')) {
    return {
      refusal:
        `A warrant says which records the person's words cover, and \`for\` has to be a list of record ids. ` +
        `This one sent ${covers === undefined ? 'nothing' : Array.isArray(covers) ? 'a list with something in it that is not text' : `a ${typeof covers}`}. ` +
        `Nothing was written. ${WHAT_A_WARRANT_IS}`,
    }
  }
  const forIds = (covers as string[]).map((one) => one.trim())
  if (forIds.length === 0 || forIds.some((one) => one === '')) {
    return {
      refusal:
        `A warrant says which records the person's words cover, and this one names ` +
        `${forIds.length === 0 ? 'none: `for` is an empty list' : 'a blank id'}. Nothing was written. A warrant ` +
        `that names no record is a sentence that opens every act there is, which is what this field exists to ` +
        `stop. ${WHAT_A_WARRANT_IS}`,
    }
  }

  const saidBy = (object['saidBy'] as string).trim()
  const words = object['words'] as string
  const where = (object['where'] as string).trim()
  const when = (object['when'] as string).trim()

  // 1. THE WORDS. Checked first, because a warrant with nothing in it is the one failure that makes
  // every other check pointless: the act would be made and there would be nothing to show for it.
  if (words.trim() === '') {
    return {
      refusal:
        `A warrant carries the person's own words and this one carries none: \`words\` is empty. Nothing was ` +
        `written. There would be nothing to draw beside the act and nothing for them to check it against, ` +
        `which is the whole of what a warrant is for. ${WHAT_A_WARRANT_IS}`,
    }
  }

  // 2. WHO SAID IT. One person, and the name is Mole Office's own — the same rule every governance guard
  // states, asked here because a warrant naming somebody else is a name and not somebody it knows.
  if (saidBy !== at.knownPerson) {
    return {
      refusal:
        `A warrant says who said the words, and this one names "${saidBy}", which is not somebody Mole Office can ` +
        `place. Nothing was written. Mole Office is for one person and the name it has for them is its own — it is ` +
        `the name it writes when a request names nobody at all. ${WHAT_A_WARRANT_IS}`,
    }
  }

  // 3. WHERE. A closed list, so that "where did they say this" has an answer worth reading.
  if (!placeIsKnown(where)) {
    return {
      refusal:
        `A warrant says where the person said the words, and "${where}" is not one of the places Mole Office knows. ` +
        `Nothing was written. Send "terminal" for a conversation at a shell, "ui" for Mole Office itself, ` +
        `"message:<id>" for a message it holds, or "comment:<id>" for a comment. ${WHAT_A_WARRANT_IS}`,
    }
  }

  // 3b. AND IS THE THING IT CITES REALLY THERE. Asked only of the two places that name a row.
  //
  // ADDED 3 SEPTEMBER 2026. `where: "message:NOSUCHIDxxxx"` was accepted and drawn on the record page
  // as if a reader could go and read it. A citation nobody can follow is worse than none: it looks
  // like evidence. Problem `TrWSYI1XYOSu` has the reproduction.
  if (placeNamesARow(where) && !at.placeExists(where)) {
    const [word, id] = [where.slice(0, where.indexOf(':')), where.slice(where.indexOf(':') + 1)]
    return {
      refusal:
        `A warrant says where the person said the words, and this one cites ` +
        `${placeInWords(word, `"${id}"`) ?? `${word} "${id}"`}, which Mole Office does not hold. Nothing was written. A citation is there so a reader can go ` +
        `and read the original, so one that leads nowhere is refused rather than stored — it would be drawn ` +
        `beside the act looking exactly like evidence. Send "terminal" when the words were said at a shell, ` +
        `which is the case Mole Office keeps no copy of and the reason the words themselves are stored here.`,
    }
  }

  // 3c. AND MAY A NEW WARRANT CITE IT. Once the key window is closed, only the person's proved words
  // written after the close may be cited; what was written before the close stands.
  if (placeNamesARow(where)) {
    const missing = at.whyThePlaceMayNotBeCited(where)
    if (missing !== null) {
      const [word, id] = [where.slice(0, where.indexOf(':')), where.slice(where.indexOf(':') + 1).trim()]
      return {
        refusal:
          `A warrant says where the person said the words, and this one cites ` +
          `${placeInWords(word, `"${id}"`) ?? `${word} "${id}"`}. ${missing} Nothing was written. Since the person closed the key window, a warrant may cite a ` +
          `message or a comment written after the close only when they wrote it and their key proved it. Ask them to ` +
          `write their words in Mole Office from a browser or a device that holds their key, and cite that.`,
      }
    }
  }

  // 4. WHEN. Read as local wall clock, the way every stamp in this product is read.
  const said = parseLocalStamp(when)
  if (said === null) {
    return {
      refusal:
        `A warrant says when the person said the words, and "${when}" is not a time Mole Office can read. Nothing ` +
        `was written. Send local wall-clock time, YYYY-MM-DD HH:MM or YYYY-MM-DD HH:MM:SS — never a timezone ` +
        `and never UTC, because every stamp in Mole Office is the clock the person was standing in. ` +
        `${WHAT_A_WARRANT_IS}`,
    }
  }
  const moment = parseLocalStamp(at.now)
  if (moment !== null && said > moment) {
    return {
      refusal:
        `A warrant says when the person said the words, and this one says ${when}, which is later than now ` +
        `(${at.now}). Nothing was written. Words said in the future have not been said, so there is nothing to ` +
        `act on. ${WHAT_A_WARRANT_IS}`,
    }
  }

  // 5. AND IS IT FOR THIS ACT. The last question, because it is the only one that is about the
  // request rather than about the warrant, and a caller reading the refusals in order should be told
  // what is wrong with its warrant before being told the warrant is not this act's.
  if (!forIds.includes(at.actingOn)) {
    return {
      refusal:
        `A warrant says which records the person's words cover, and this one covers ` +
        `${forIds.map((one) => `"${one}"`).join(', ')}. This request acts on "${at.actingOn}", which it does not ` +
        `name. Nothing was written. One sentence is not a key to every act: name the record this act is on in ` +
        `\`for\`, and if the person's words really do cover several records, list all of them — a warrant may be ` +
        `carried once for each record it names.`,
    }
  }

  return { warrant: { saidBy, words, where, when, for: forIds } }
}

/** Is this one of the four places? The two bare words, and the two that name a record. */
function placeIsKnown(where: string): boolean {
  if ((WARRANT_PLACES as readonly string[]).includes(where)) return true
  return placeNamesARow(where)
}

/** Is this a place written as `<word>:<id>`, so there is a row to go and look for? */
export function placeNamesARow(where: string): boolean {
  const colon = where.indexOf(':')
  if (colon <= 0) return false
  const word = where.slice(0, colon)
  const id = where.slice(colon + 1)
  return (WARRANT_PLACES_WITH_AN_ID as readonly string[]).includes(word) && id.trim() !== ''
}

// ---------------------------------------------------------------------------- reading a stored one

/**
 * A WARRANT AS IT WAS STORED, or null when the stored text is not one.
 *
 * ONE READER, BECAUSE THREE SURFACES SERVE IT. The record page reads it through
 * `lib/warrants.ts`, the version history reads it through `lib/revisions.ts`, and both have to make
 * the same thing of the same row. Two readers of one column is this repository's named recurring
 * defect, and it is worse here than most: the two would disagree about what somebody said.
 *
 * IT IS NOT `readWarrant`. That one judges a warrant a caller is sending NOW, against this moment
 * and against the record being acted on. This one reads back a row that was already judged, and
 * asks only whether the text still says the five things.
 *
 * A ROW WITH NO `for` IS READ AS NAMING NOTHING, and that is the truth about the row rather than a
 * guess. `for` was added on 3 September 2026; the 31 acts written earlier that day carry four keys,
 * and an empty list says exactly what they say — this warrant named no records. It is not a value
 * the door can produce today, because a warrant naming nothing is refused.
 */
export function warrantAsStored(stored: unknown): Warrant | null {
  if (typeof stored !== 'string' || stored.trim() === '') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(stored)
  } catch {
    // A stored value that is not JSON is a row no reader can describe. Rule 4 asks that a caught
    // exception says what it did, and this one does: null, and every caller leaves the act out
    // rather than inventing a shape for it. The stored row itself is untouched and readable raw.
    return null
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  const one = parsed as Record<string, unknown>
  if (WARRANT_TEXT_KEYS.some((key) => typeof one[key] !== 'string')) return null
  const covers = one['for']
  return {
    saidBy: one['saidBy'] as string,
    words: one['words'] as string,
    where: one['where'] as string,
    when: one['when'] as string,
    for: Array.isArray(covers) ? covers.filter((id): id is string => typeof id === 'string') : [],
  }
}

// ---------------------------------------------------------------------------- what a screen says

/**
 * THE MARK. Four words, drawn wherever a surface would otherwise say only who did something.
 *
 * It is short because it sits in a row beside a name. The words themselves are drawn from the
 * warrant, never from here.
 */
export const ON_THE_OWNERS_WORDS = "On the person's words"

/**
 * The line under an act: who made it, and where and when the person said what it stands on.
 *
 * WRITTEN HERE AND NOT IN THE THREE SURFACES THAT DRAW IT. The record page, the forks desk and the
 * waiting list all say this, and three copies of one sentence are three things free to come to
 * disagree about what an act on somebody's words is. The words themselves are never in this
 * sentence: they are drawn on their own, as a quotation, so a reader can tell the person's sentence
 * from Mole Office's.
 */
export function whoActedOnThoseWords(act: { actorType: string; actorId: string; warrant: Warrant }): string {
  return readStoredWord('g2b.onYourWords.said', {
    actor: actorTypeWord(act.actorType).text,
    id: act.actorId,
    where: wherePlainly(act.warrant.where),
    when: act.warrant.when,
  })
}

/**
 * Where the words were said, in the words a person reads. A place with an id is `<word>:<id>`, and
 * a place with no words here is given back as it was stored rather than guessed at.
 */
export function wherePlainly(where: string): string {
  const colon = where.indexOf(':')
  if (colon <= 0) return placeInWords(where, undefined) ?? where
  return placeInWords(where.slice(0, colon), where.slice(colon + 1)) ?? where
}

/**
 * The line under a revoked act: who took it back, and when.
 *
 * The act is not deleted and this sentence is why: a person who revoked something is entitled to see
 * that it happened and that it was undone, rather than to find both gone.
 */
export function whoRevokedIt(act: { revokedByType: string; revokedById: string; revokedAt: string }): string {
  return readStoredWord('g2b.onYourWords.revoked', {
    actor: actorTypeWord(act.revokedByType).text,
    id: act.revokedById,
    at: act.revokedAt,
  })
}
