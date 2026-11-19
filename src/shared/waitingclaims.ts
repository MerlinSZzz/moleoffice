// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT A BODY OF BLOCKS SAYS IN PROSE, AND WHETHER IT ASSERTS A COUNT OF WHAT IS WAITING.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS IN THE LAYER THE BROWSER AND THE SERVER BOTH REACH
 * ---------------------------------------------------------------------------------------
 *
 * Wave 2 built one half of the count guard: an agent that tries to store "Nineteen things are
 * waiting on you" in a report body is refused, and a person is not. The other half is that when a
 * person DOES write one, the page draws the live count beside it and says so when the two disagree.
 * That half is drawn in a browser, and it must find the claim in exactly the way the write door
 * found it — the same phrases, the same number words, the same six-word span — or the mark appears
 * beside sentences the guard never saw and stays away from ones it did.
 *
 * So the reading lives here and `src/server/lib/summary.ts` re-exports it. There is one copy of the
 * rule, and this file imports nothing from `src/server` or from `src/web`, which is what lets both
 * of them have it.
 *
 * IT FINDS, IT DOES NOT REFUSE, AND IT DOES NOT DRAW. Whether a caller may write a claim is
 * `assertMayWriteACountOfWhatIsWaiting` in src/server/lib/records/asks-and-commitments.ts, which is where the actor is.
 * What a disagreement looks like on a screen is `SummaryBlocks.tsx`. This file answers two
 * questions about characters: what does this body say, and is there a count of what waits in it.
 */

import type { SummaryBlock } from './types.ts'

// ---------------------------------------------------------------------------- the words a reader reads

/**
 * THE PROSE OF A BODY OF BLOCKS, IN THE ORDER SOMEBODY READS IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * One thing only: telling a short form that was WRITTEN from one that was CUT. A short form
 * produced by taking the first sixty characters of a report is, by definition, the opening of what
 * a reader reads, and comparing the two is the one mechanical trace that leaves. See
 * `checkShortFormsAgainstBody` below, which is its only caller.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT LEAVES OUT, AND WHY THAT IS NOT A GAP
 * ---------------------------------------------------------------------------------------
 *
 * It collects the prose: headings, paragraphs, findings, list items, quotes, captions, the labels
 * and words in a table, a picture's text alternative, and what a path is called. It leaves out a
 * chart's numbers, a LaTeX string, a file path and a block of code, because none of those is prose
 * somebody would cut a summary out of, and putting them in would build a comparison string that
 * nobody ever read.
 *
 * SO THE COMPARISON IS NARROW ON PURPOSE. It is used to REFUSE a write, and a refusal that fires on
 * honest writing is worse than one that misses a case. What it catches is the case it was written
 * for, and the shape of the check is stated in the refusal so nobody has to guess.
 *
 * IT IS THE FIELDS OF `proseFieldsOfBlocks` BELOW WITH A SPACE BETWEEN THEM, and not a second walk.
 * Which fields of which block kinds hold prose is written once, there. Two walks would be the
 * defect this repository keeps finding: a block kind gaining a prose field in one of them and not
 * in the other, with nothing failing.
 */
export function proseOfBlocks(blocks: readonly SummaryBlock[]): string {
  return proseFieldsOfBlocks(blocks)
    .map((one) => one.text)
    .join(' ')
}

/** One prose field of one block: whose words they are, where they sit, and what that place is called. */
export interface ProseField {
  /** The block whose own shape declares these words. */
  blockId: string
  /**
   * The outermost of the handed-in blocks these words are inside.
   *
   * A section, a set of columns, a grid, a set of tabs and a `beside` hold blocks of their own, and
   * a reading length draws the container rather than the blocks in it — so the container is the
   * thing a part covers and the thing a reader is pointed at. For a block that is not inside one of
   * those, this is the block's own id.
   */
  ownerId: string
  /**
   * What this field is called on that block: `text`, `detail`, `caption`, `items[2].label`.
   *
   * It is the name the writer of the report used, so a refusal can say which of a block's fields
   * was copied. Nothing looks a field up by it.
   */
  field: string
  /** The words, with the space at each end taken off. Never empty. */
  text: string
}

/**
 * EVERY PROSE FIELD OF A BODY OF BLOCKS, ONE AT A TIME, IN THE ORDER SOMEBODY READS THEM.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THE FIELDS COME BACK SEPARATELY
 * ---------------------------------------------------------------------------------------
 *
 * Because a copy can start at any of them. `proseOfBlocks` joins a block's fields in order — a
 * callout gives its title and then its text, a finding its headline and then its detail — so a
 * check asking "is this the opening of that block" catches only a copy that starts at the block's
 * FIRST field. Measured on 3 September 2026: a part heading set to the first nine words of a
 * callout's TEXT was stored, 200, because the callout's prose opens with its title. Problem
 * `PaZ8ijY_4moz`.
 *
 * So this is the one list of where prose lives, and the two callers take it as each needs it:
 * `proseOfBlocks` joins it, and the cut rule in src/server/lib/summary.ts asks each field on its own.
 *
 * The switch is exhaustive over the block union, so a new kind of block stops this compiling rather
 * than quietly contributing nothing. What it leaves out, and why that is not a gap, is written in
 * `proseOfBlocks` above.
 */
export function proseFieldsOfBlocks(blocks: readonly SummaryBlock[]): ProseField[] {
  const found: ProseField[] = []
  const walk = (held: readonly SummaryBlock[], holder: string | null): void => {
    for (const block of held) {
      const ownerId = holder ?? block.id
      const add = (field: string, value: string | undefined): void => {
        if (value !== undefined && value.trim() !== '') {
          found.push({ blockId: block.id, ownerId, field, text: value.trim() })
        }
      }
      const inside = (blocks: readonly SummaryBlock[]): void => {
        walk(blocks, ownerId)
      }
      switch (block.type) {
        case 'text':
          add('heading', block.heading)
          add('text', block.text)
          break
        case 'heading':
          add('text', block.text)
          break
        case 'finding':
          add('text', block.text)
          add('detail', block.detail)
          break
        case 'callout':
          add('title', block.title)
          add('text', block.text)
          break
        case 'metrics':
          block.items.forEach((item, at) => {
            add(`items[${String(at)}].label`, item.label)
            add(`items[${String(at)}].value`, item.value)
            add(`items[${String(at)}].note`, item.note)
          })
          break
        case 'keyvalue':
          block.items.forEach((item, at) => {
            add(`items[${String(at)}].label`, item.label)
            add(`items[${String(at)}].value`, item.value)
          })
          break
        case 'list':
          block.items.forEach((item, at) => {
            add(`items[${String(at)}]`, item)
          })
          break
        case 'checklist':
          block.items.forEach((item, at) => {
            add(`items[${String(at)}].text`, item.text)
            add(`items[${String(at)}].note`, item.note)
          })
          break
        case 'timeline':
          block.items.forEach((item, at) => {
            add(`items[${String(at)}].when`, item.when)
            add(`items[${String(at)}].text`, item.text)
            add(`items[${String(at)}].detail`, item.detail)
          })
          break
        case 'quote':
          add('text', block.text)
          add('source', block.source)
          break
        case 'path':
          add('label', block.label)
          break
        case 'table':
          block.columns.forEach((column, at) => {
            add(`columns[${String(at)}].label`, column.label)
          })
          block.rows.forEach((row, down) => {
            row.cells.forEach((cell, across) => {
              if (typeof cell === 'string') add(`rows[${String(down)}].cells[${String(across)}]`, cell)
            })
          })
          add('caption', block.caption)
          break
        case 'image':
          add('alt', block.alt)
          add('caption', block.caption)
          break
        case 'audio':
        case 'video':
          // WHAT IS HEARD OR SEEN, IN WORDS, is prose somebody wrote to be read, as a picture's alt is.
          add('alt', block.alt)
          add('caption', block.caption)
          break
        case 'file':
          // A FILE'S CAPTION IS PROSE; the file itself is not, and is never read as writing. The
          // name, the size and the hash are facts about the file rather than words somebody wrote to
          // be read, so only the caption joins the comparison.
          add('caption', block.caption)
          break
        case 'chart':
        case 'math':
          add('caption', block.caption)
          break
        case 'code':
          // Deliberately nothing but the caption. A block of terminal output is not prose, and the
          // caption on one is added by the two cases above rather than here so the reason stays
          // with the reason.
          add('caption', block.caption)
          break
        case 'section':
          add('title', block.title)
          inside(block.blocks)
          break
        case 'columns':
          for (const column of block.columns) inside(column)
          break
        case 'grid':
          inside(block.blocks)
          break
        case 'tabs':
          // A TAB'S LABEL IS PROSE A READER READS, even though what is under an unopened tab is not
          // on the screen. The words are stored and a short form cut from them would still be a cut.
          block.tabs.forEach((tab, at) => {
            add(`tabs[${String(at)}].label`, tab.label)
            inside(tab.blocks)
          })
          break
        case 'beside':
          // A PART HAS NO WORDS OF ITS OWN. Its id is a name for pointing at it and is never read
          // as writing, so only what is inside it is walked. Same reason a column contributes
          // nothing itself.
          for (const part of block.parts) inside(part.blocks)
          break
        // A QUESTION'S WORDS ARE PROSE THE PERSON READS: the question and its
        // options, the sentence asking for words, a button's label and the question it asks first.
        case 'choice':
          add('question', block.question)
          block.options.forEach((option, at) => {
            add(`options[${String(at)}].label`, option.label)
          })
          break
        case 'fillin':
          add('asks', block.asks)
          break
        case 'button':
          add('label', block.label)
          add('confirm', block.confirm)
          break
        case 'box':
          add('title', block.title)
          inside(block.blocks)
          break
      }
    }
  }
  walk(blocks, null)
  return found
}
// ---------------------------------------------------------------------------- a count of what waits

/**
 * A STORED SENTENCE THAT SAYS HOW MANY THINGS ARE WAITING ON THE PERSON.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Report `NHtlTgnKAG8h`, block `b-6`, reads "Nineteen things are waiting on you" and then names
 * four of them. The other fifteen are in a repository file. That number was true on the day it was
 * typed and is a claim about the corpus, so it goes wrong on its own, in a body nothing recomputes.
 *
 * `GET /api/waiting` is the one reading of what waits on the person. A body that asserts its own
 * count is a second one, free to disagree — and it is worse than a second reading, because it is
 * frozen. This function is how a write can be refused before that lands.
 *
 * ---------------------------------------------------------------------------------------
 * IT FINDS, IT DOES NOT REFUSE
 * ---------------------------------------------------------------------------------------
 *
 * It reads the prose of a body and answers what it found, or null. Whether a caller may write it is
 * `assertMayWriteACountOfWhatIsWaiting` in lib/records/asks-and-commitments.ts, which is where the actor is and where
 * every other governance guard lives. A person is not refused; an agent is. The split is deliberate:
 * this file has no actor and no opinion about one.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT READS THE STORED BODY AND NOT THE SOURCE FILES
 * ---------------------------------------------------------------------------------------
 *
 * The first version of this check was going to grep `.tsx` files and server reply constants for a
 * digit next to "waiting on you". That test would have been green through the whole failure it
 * exists to prevent: the number is the word "Nineteen", spelled out, in a row of the database.
 */

/**
 * The phrases reserved to the one reading. Written once, and the refusal prints them.
 *
 * They are the four `settings-and-governance.md` §8.7 names, plus "needs you" — which is "need you"
 * with a person as the subject and is the same claim. A phrase is matched as a sequence of words,
 * lower case, so "Waiting On You" and "waiting on you," both count.
 */
export const RESERVED_WAITING_PHRASES: readonly string[] = [
  'waiting on you',
  'waiting for you',
  'need you',
  'needs you',
  'only you can',
]

/**
 * THE NUMBER WORDS, BECAUSE THE FAILURE THIS CATCHES IS SPELLED OUT.
 *
 * A check for digits alone would have passed over `Nineteen` — the actual sentence in the actual
 * corpus — and returned the same failure the following week. `about twenty` is caught for the same
 * reason: an approximate count of what waits on a person is still a count.
 *
 * It stops at the words somebody writing a report would type. `nineteen thousand` is two of these
 * in a row and is caught by the first.
 */
export const NUMBER_WORDS: readonly string[] = [
  'zero',
  // NO "one", AND THE REASON IS MEASURED. In English "one" is a pronoun at least as often as a
  // number: "this one is waiting on you" is ordinary writing about a single record, and reading it
  // as a count would refuse an agent for a sentence that asserts nothing. The consequence is stated
  // rather than hidden: "One thing is waiting on you" is NOT caught, and a body that says it is
  // stored. That is a gap in this check and it is the narrower mistake — a guard that fires on
  // honest writing is worse than one that misses a case, which is the rule `proseOfBlocks` above
  // already states for the comparison it makes.
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
  'thirty',
  'forty',
  'fifty',
  'sixty',
  'seventy',
  'eighty',
  'ninety',
  'hundred',
  'thousand',
  'dozen',
]

/**
 * HOW CLOSE A QUANTITY HAS TO BE TO THE PHRASE, IN WORDS, FOR THE TWO TO BE ONE CLAIM.
 *
 * Six. "Nineteen things are waiting on you" is three; "about twenty of these need you" is four. A
 * report that counts something in one sentence and uses the phrase two sentences later is not
 * making one claim, and a span wide enough to join those would refuse honest writing.
 *
 * The span is counted in words rather than characters, because the prose this reads is already a
 * list of words and a long title between the two would otherwise widen the gap for no reason.
 */
export const QUANTITY_SPAN_IN_WORDS = 6

/** What was found: the phrase, the quantity beside it, and the words around them. */
export interface CountOfWhatIsWaiting {
  /** The reserved phrase, as it is written in `RESERVED_WAITING_PHRASES`. */
  phrase: string
  /**
   * The quantity as the writer typed it — `Nineteen`, `19`, `twenty` — with markdown's own marker
   * characters taken off each end. See `withoutMarkdownMarkers`: `**Nineteen` is the word
   * `Nineteen` marked bold, and the stars are not part of the number.
   */
  quantity: string
  /** The words either side of the two, so a refusal can quote what it is refusing. */
  passage: string
}

/**
 * MARKDOWN'S OWN MARKER CHARACTERS, TAKEN OFF EACH END OF A WORD.
 *
 * A report's prose is markdown. A paragraph that opens `**Nineteen things are waiting on you**`
 * holds the number as the characters `**Nineteen`, and a reader never sees those two stars: they
 * are an instruction to draw the word bold, and the word drawn is `Nineteen`.
 *
 * WHY IT MATTERS HERE. The quantity found below is quoted straight back at a person, twice — in
 * the refusal an agent gets from `assertMayWriteACountOfWhatIsWaiting`, and in the mark the record
 * page draws. Without this, Mole Office's own sentence read *this says “**Nineteen”* on the corpus
 * report the owner complains about, at first paint. The product was writing raw markdown in its
 * own voice.
 *
 * WHAT IS TAKEN OFF, AND WHAT IS NOT. Only `*`, `_`, `~` and a backtick, and only where they run
 * along one end of a word. Those four are what markdown uses to mark emphasis, strong emphasis,
 * strikethrough and inline code around a run of words. A full stop, a comma, a bracket and a
 * quotation mark stay: they are the writer's punctuation and a reader sees them.
 *
 * THE WRITER'S PUNCTUATION MAY SIT OUTSIDE THE MARKER, so the marker is not always the last
 * character. The corpus report's own sentence ends `...are waiting on you**,` — the comma is
 * outside the closing stars. Measured on 26 August 2026 against a copy of the corpus. So each end
 * is read as "a run of the writer's punctuation, then a run of markers", and only the markers go.
 *
 * A MARKER INSIDE A WORD IS LEFT ALONE, and that is not a detail: this product quotes its own
 * stored words back at people — `worked_around`, `derived_from`, `not_started` — and deleting the
 * underscores out of one would be this file corrupting the very thing it is quoting.
 *
 * IT CHANGES WHAT IS QUOTED, NOT WHAT IS FOUND. `word` below already strips every character that is
 * not a letter or a number from both ends, so `**Nineteen` was already read as the quantity
 * `nineteen` and the write guard already refused it. This only changes which characters are handed
 * back to be shown.
 */
function withoutMarkdownMarkers(word: string): string {
  return word.replace(/^([^\p{L}\p{N}]*?)[*_~`]+/u, '$1').replace(/[*_~`]+([^\p{L}\p{N}]*)$/u, '$1')
}

/**
 * The prose as a list of words, lower case, with the punctuation at each end of every word taken
 * off — the same reading `isCutOf` makes of a body, so a full stop cannot get a claim past this.
 *
 * A run of characters that is nothing but markdown markers is dropped rather than kept as an empty
 * word: it is a mark on the page, not a word somebody reads, and counting it as a word would let it
 * take up one of the six places the span below looks across.
 */
function wordsOf(prose: string): { word: string; raw: string }[] {
  return prose
    .split(/\s+/)
    .map((token) => withoutMarkdownMarkers(token))
    .filter((raw) => raw !== '')
    .map((raw) => ({ raw, word: raw.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') }))
}

/**
 * IS THIS WORD A QUANTITY? A number word, or digits and nothing else.
 *
 * DIGITS AND NOTHING ELSE is what keeps a date out of it. `2026-08-21` holds digits and is not a
 * count of anything, so a report saying "waiting on you since 2026-08-21" is honest writing and is
 * not refused. A thousands separator is allowed because people write 1,200.
 */
function isQuantity(word: string): boolean {
  if (NUMBER_WORDS.includes(word)) return true
  return /^\d+$/.test(word) || /^\d{1,3}(,\d{3})+$/.test(word)
}

/**
 * THE WORDS THAT MAKE A NUMBER A NAME AND NOT A COUNT. Problem ytvfmnKx5yeh.
 *
 * Wave 13q's round 11 report was refused for "round 11" standing within six words of "Needs you".
 * The 11 named a round; it counted nothing waiting on the person. A number right after one of these
 * nouns is the name of one thing, so it is passed over and the scan goes on to the next word: a
 * body that also says "5 things need you" is still refused.
 *
 * THE LIST IS NARROW ON PURPOSE. "things", "records" and "questions" are not here, because "5
 * things" is the count this guard exists to catch. A noun goes on the list only when a number after
 * it names one of them.
 */
export const NAMING_NOUNS: readonly string[] = [
  'round',
  'wave',
  'chapter',
  'rule',
  'step',
  'part',
  'piece',
  'version',
  'block',
  'entry',
  'item',
  'line',
  'page',
  'section',
  'phase',
  'criterion',
  'problem',
  'issue',
  'number',
  'no',
]

/** A month's name beside a number makes it a date: "5 October", "October 2026". */
const MONTH_NAMES: readonly string[] = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

/**
 * CHINESE NAMES A NUMBER BY THE CHARACTERS AROUND IT. "第 11 轮" is round 11, as is "第 11 章" chapter
 * 11: 第 before a number makes it an ordinal. "10 月", "5 日", "5 号" and "2026 年" are dates. A
 * number with only a measure word after it — "11 轮", "5 件" — is a count, and stays one.
 */
const CHINESE_ORDINAL_BEFORE = '第'
const CHINESE_DATE_AFTER = /^[月日号年]/u

/**
 * IS THE QUANTITY AT `near` A NAME — a round's number, a chapter's, a date — rather than a count?
 * Asked only of a word `isQuantity` already accepted.
 */
function namesSomething(words: readonly { word: string; raw: string }[], near: number): boolean {
  const before = words[near - 1]
  const after = words[near + 1]
  const word = words[near]
  if (word !== undefined && word.raw.startsWith('#')) return true
  if (before !== undefined && NAMING_NOUNS.includes(before.word)) return true
  if (before !== undefined && MONTH_NAMES.includes(before.word)) return true
  if (after !== undefined && MONTH_NAMES.includes(after.word)) return true
  if (before !== undefined && before.raw.endsWith(CHINESE_ORDINAL_BEFORE)) return true
  if (after !== undefined && CHINESE_DATE_AFTER.test(after.raw)) return true
  return false
}

/**
 * The count of what is waiting that this body asserts, or null.
 *
 * `blocks` is the validated body — every caller has one in hand, because the write path validates
 * the shape before it asks this.
 */
export function countOfWhatIsWaitingIn(blocks: readonly SummaryBlock[]): CountOfWhatIsWaiting | null {
  const words = wordsOf(proseOfBlocks(blocks))
  if (words.length === 0) return null
  for (const phrase of RESERVED_WAITING_PHRASES) {
    const parts = phrase.split(' ')
    for (let at = 0; at + parts.length <= words.length; at += 1) {
      if (!parts.every((part, step) => words[at + step]?.word === part)) continue
      const from = Math.max(0, at - QUANTITY_SPAN_IN_WORDS)
      const to = Math.min(words.length, at + parts.length + QUANTITY_SPAN_IN_WORDS)
      for (let near = from; near < to; near += 1) {
        // The phrase's own words are skipped: "one" inside "only you can" is not a quantity beside
        // the phrase, it is part of it.
        if (near >= at && near < at + parts.length) continue
        const found = words[near]
        if (found === undefined || !isQuantity(found.word)) continue
        if (namesSomething(words, near)) continue
        return {
          phrase,
          quantity: found.raw,
          passage: words
            .slice(from, to)
            .map((one) => one.raw)
            .join(' '),
        }
      }
    }
  }
  return null
}
// ------------------------------------------------------------------- the same claim, and the live count

/**
 * A COUNT A BODY ASSERTS, BESIDE THE ONE READING, WHEN THE TWO DO NOT AGREE.
 *
 * ---------------------------------------------------------------------------------------
 * THE THREE LAYERS, AND NONE OF THEM REPLACES ANOTHER
 * ---------------------------------------------------------------------------------------
 *
 * What a person wrote is stored exactly as typed and is not edited, hidden or annotated away — the eighth
 * rule says a human-facing box is not where rules are enforced by refusal, and the brief says human
 * wording is preserved. What Mole Office made of it is this mark. What is canonical is the one reading,
 * `GET /api/waiting`, which every band and badge already draws.
 *
 * ---------------------------------------------------------------------------------------
 * BOTH NUMBERS ARE DRAWN AND NEITHER IS TYPED
 * ---------------------------------------------------------------------------------------
 *
 * `stated` is the writer's own characters, quoted back — `Nineteen`, `19`, `about twenty` — because
 * quoting it is what lets a reader see that the mark is about THIS sentence. Markdown's marker
 * characters are not among those characters: a reader looking at the paragraph sees `Nineteen` in
 * bold, not `**Nineteen`, and Mole Office must not write markdown source in a sentence of its own. `live` is a number this
 * sentence never contains: it is counted from the same reading the band draws, handed in by the
 * caller. Nothing here computes a second reading of what waits, and nothing here can, which is the
 * point of taking it as an argument.
 *
 * THE LIVE NUMBER IS DRAWN IN DIGITS, and that is this repository's house rule for a count in prose
 * rather than a slip: `count(n, one, many)` on the record page writes `17 links`, not `seventeen
 * links`. The design's worked shape spells it out because the design is prose about prose.
 *
 * ---------------------------------------------------------------------------------------
 * WHEN THERE IS NO MARK
 * ---------------------------------------------------------------------------------------
 *
 * Three different silences, and none of them is a disagreement. The body asserts no count. The two
 * numbers agree. Or the stated quantity is not a number this can compare — `about twenty` is a
 * quantity for the write guard, which is right, because an approximate count of what waits is still
 * a count; it is not a number to hold arithmetic against, so no mark is drawn and the guard's own
 * behaviour is unchanged. A mark that fired on `about twenty` would be claiming a precision the
 * writer did not.
 */
export interface CountDisagreement {
  /** The reserved phrase and the quantity, as the write guard found them. */
  claim: CountOfWhatIsWaiting
  /** What the body says, as the writer typed it, without markdown's markers around it. */
  stated: string
  /** What the one reading says, counted from the same reply the band draws. */
  live: number
  /** The whole mark in one sentence, for a reader who is not counting anything. */
  sentence: string
}

/**
 * THE NUMBER WORDS AS NUMBERS, so a written-out quantity can be held against a counted one.
 *
 * IT IS THE SAME LIST AS `NUMBER_WORDS` AND NOT A SECOND ONE — the keys of this map are checked
 * against that list by tests/the-count-guard-is-drawn.test.ts, so a word added to one and not the
 * other is a red test rather than a quantity the guard catches and the mark cannot read.
 *
 * WHAT IS NOT HERE. `hundred`, `thousand` and `dozen` are quantities to the guard and are not
 * single numbers: "a hundred and six" is three words and reading it would be building an English
 * number parser inside a display rule. They are caught by the write guard and draw no mark, which
 * is the honest half of each.
 */
export const NUMBER_WORD_VALUES: Readonly<Record<string, number>> = {
  zero: 0,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
}

/**
 * The number a written quantity stands for, or null where it is not one this can compare.
 *
 * Null is the answer for `hundred`, `thousand` and `dozen`, and for anything that reads as a
 * quantity to the guard without being a single number. A caller that gets null draws no mark.
 */
export function quantityAsNumber(quantity: string): number | null {
  const word = quantity.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  const asWord = NUMBER_WORD_VALUES[word]
  if (asWord !== undefined) return asWord
  if (/^\d+$/.test(word)) return Number(word)
  if (/^\d{1,3}(,\d{3})+$/.test(word)) return Number(word.replace(/,/g, ''))
  return null
}

/**
 * The disagreement between what this body says and what the one reading says, or null.
 *
 * `live` is how many of the things this record links to are waiting on the person, counted by the
 * caller from `GET /api/waiting`. It is passed in rather than fetched because there is one reading
 * of what waits and a second fetch here would be a second moment of it.
 */
export function countDisagreementIn(
  blocks: readonly SummaryBlock[],
  live: number,
): CountDisagreement | null {
  const claim = countOfWhatIsWaitingIn(blocks)
  if (claim === null) return null
  const stated = quantityAsNumber(claim.quantity)
  if (stated === null || stated === live) return null
  return {
    claim,
    stated: claim.quantity,
    live,
    sentence:
      `this says “${claim.quantity}”; ${String(live)} of the things this record links to ` +
      `${live === 1 ? 'is' : 'are'} waiting on you`,
  }
}
