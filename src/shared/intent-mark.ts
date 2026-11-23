// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MARK THE PERSON PUTS ON A MESSAGE TO AN AGENT, TO SAY WHAT THEY WANT BACK. The answers are none, just ask, or
 * proposal first, on wave 13n's proposal, align, which the person asked for on 21 November 2026, and give options, which
 * the person asked for on 22 November 2026.
 *
 * It is stored on the message as `data.intent`, so no migration was needed. Only the person sets it, on a message they
 * write, at the moment they write it: an agent's message carries none, and a later write may not set, change or take it
 * off (src/server/lib/records.ts asks the two refusals below). A message written before the field existed has none.
 *
 * EVERY PLACE AN AGENT READS A MESSAGE HANDS IT THE MARK AND ONE SENTENCE: the inbox reads and GET /api/messages/:id
 * (`theIntentOnTheWire`, from `asMessage` in src/server/lib/messages.ts), and the hand-over envelope
 * (`deliveryEnvelope` in ./messages.ts) as the waiter and the dsh hook print it. A message with no mark, or marked
 * none, gains nothing anywhere: none asks nothing of the agent.
 *
 * AND THE PROMPT OF A RUN THE WORKER STARTS for a message (src/worker/prompt.ts): the worker hands `promptFor` the mark
 * from the message record, a run it carries on after a restart, or a resume the person pressed, and `promptFor` hands it
 * to `deliveryEnvelope`, so the run reads the same last line before the words.
 */

import { sayInEnglish, type Say } from './i18n.ts'
import { trimmed } from './intent.ts'
import { isAnUnreadableMessageLabels, isLabelColour, LABEL_COLOURS, LONGEST_LABEL, LONGEST_LABEL_DESCRIPTION, LONGEST_LABEL_INSTRUCTION, readMessageLabel, type LabelColour, type MessageLabel, type MessageLabelEntry, type TheStoredMessageLabels } from './message-label.ts'

/** The five marks, as stored. Give options is stored as a mark of its own, so a message keeps what the person chose. */
export const INTENT_MARKS = ['none', 'just-ask', 'proposal-first', 'align', 'give-options'] as const
export type IntentMark = (typeof INTENT_MARKS)[number]

/** The four marks that ask something of the agent, and so the four a reply can break. */
export type AnIntentThatAsks = Exclude<IntentMark, 'none'>

/** The mark a stored message holds, or null because nobody set one. */
export function intentOf(data: Record<string, unknown>): IntentMark | null {
  const held = data['intent']
  return typeof held === 'string' && (INTENT_MARKS as readonly string[]).includes(held) ? (held as IntentMark) : null
}

/** Whether a mark asks something of the agent. */
export function anIntentThatAsks(intent: unknown): intent is AnIntentThatAsks {
  return intent === 'just-ask' || intent === 'proposal-first' || intent === 'align' || intent === 'give-options'
}

// ============================================================================ flags
//
// THE FOUR SHIPPED FLAGS AND THE PERSON'S OWN ARE ONE KIND: A FLAG. Each has a name, a description shown under the name
// in the menu, an instruction handed to the agent, a short word on the flag left of Send, a colour the flag is drawn in,
// and a colour the words it marks are drawn in. The shipped four and 'No mark' keep any of these the person changed in
// the `shipped_flags` column of `people` (migration 0346); a thing left out is its default. The person's own flags are
// the entries of `chat_labels`, each with its word and colour as before and the four new fields optional.

/**
 * The four flags the office ships, in menu order. 'No mark' is not a flag: it is the menu's entry that takes a flag off.
 * Give options comes fourth, after align, as decided.
 */
export const SHIPPED_FLAGS = ['just-ask', 'proposal-first', 'align', 'give-options'] as const
export type ShippedFlag = (typeof SHIPPED_FLAGS)[number]

/** The menu entry that takes a flag off. It hands the agent nothing. */
export const NO_MARK = 'none'

/** One thing a flag of the person's own may also hold, beside its word and colour. */
export interface AStoredShippedFlag {
  name?: string
  description?: string
  instruction?: string
  shortWord?: string
  colour?: LabelColour
  wordsColour?: LabelColour
}

/**
 * WHAT THE `shipped_flags` COLUMN HOLDS: one JSON object keyed by the four shipped flags and 'No mark'. A thing left out
 * is its default, so an empty object is every default. 'No mark' holds only its name.
 */
export type StoredShippedFlags = {
  'just-ask'?: AStoredShippedFlag
  'proposal-first'?: AStoredShippedFlag
  align?: AStoredShippedFlag
  'give-options'?: AStoredShippedFlag
  none?: { name?: string }
}

/** A flag as every reader gets it: the six things, after the defaults are applied. */
export interface AFlagOfThePersons {
  /**
   * `just-ask`, `proposal-first`, `align`, `give-options`, `none`, or `label:<the word in lower case>` for one of the
   * person's own.
   */
  id: string
  kind: 'shipped' | 'own' | 'none'
  name: string
  description: string | null
  instruction: string | null
  shortWord: string
  colour: LabelColour
  wordsColour: LabelColour
}

/** A person's whole list of flags, in the order the menu draws them, with 'No mark' last. */
export interface TheFlagsOfAPerson {
  shipped: readonly [AFlagOfThePersons, AFlagOfThePersons, AFlagOfThePersons, AFlagOfThePersons]
  own: readonly AFlagOfThePersons[]
  noMark: AFlagOfThePersons
  /** Every entry in menu order: the four shipped flags, the person's own, then 'No mark'. */
  all: readonly AFlagOfThePersons[]
}

/** The word each shipped flag's name, description, instruction and short word default to. */
const THE_SHIPPED_WORDS: Readonly<Record<ShippedFlag, { name: Parameters<Say>[0]; description: Parameters<Say>[0]; instruction: Parameters<Say>[0]; shortWord: Parameters<Say>[0] }>> = {
  'just-ask': { name: 'message.intent.name.justAsk', description: 'chat.intent.description.justAsk', instruction: 'message.intent.justAsk', shortWord: 'chat.intent.short.justAsk' },
  'proposal-first': { name: 'message.intent.name.proposalFirst', description: 'chat.intent.description.proposalFirst', instruction: 'message.intent.proposalFirst', shortWord: 'chat.intent.short.proposalFirst' },
  align: { name: 'message.intent.name.align', description: 'chat.intent.description.align', instruction: 'message.intent.align', shortWord: 'chat.intent.short.align' },
  'give-options': { name: 'message.intent.name.giveOptions', description: 'chat.intent.description.giveOptions', instruction: 'message.intent.giveOptions', shortWord: 'chat.intent.short.giveOptions' },
}

/**
 * THE COLOUR EACH SHIPPED FLAG IS DRAWN IN UNTIL THE PERSON CHANGES IT, one colour each, as the person asked. It is
 * applied when the flag is read and never stored, so a shipped flag whose colour the person has not changed takes this
 * colour in an office that already exists. Before, every shipped flag was blue, and Settings stored no colour equal to
 * that default, so a person who once chose blue by hand for a shipped flag now sees this colour instead.
 */
export const THE_SHIPPED_COLOURS: Readonly<Record<ShippedFlag, LabelColour>> = {
  'just-ask': 'pink',
  'proposal-first': 'light-blue',
  align: 'orange',
  // Forest green is a colour of its own, so this flag is not drawn in the green a person may give a flag of their own.
  'give-options': 'forest-green',
}

/** One line of text, with no space at either end, and at most `longest` characters, or a sentence saying what is wrong. */
function readOneLine(value: unknown, what: string, longest: number): { ok: true; text: string } | { ok: false; why: string } {
  if (typeof value !== 'string') return { ok: false, why: `${what} must be one line of text.` }
  if (value.trim() === '') return { ok: false, why: `${what} is empty.` }
  if (value !== value.trim()) return { ok: false, why: `${what} may not start or end with a space; "${value}" does.` }
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)) return { ok: false, why: `${what} must be on one line.` }
  if ([...value].length > longest) return { ok: false, why: `${what} may have ${String(longest)} characters at most; it has ${String([...value].length)}.` }
  return { ok: true, text: value }
}

/**
 * THE ONE STRICT READING OF A STORED OR SENT `shipped_flags` VALUE. It answers what it read, or a sentence saying what
 * is wrong. The shipped four may hold any of the six things; 'No mark' holds only its name, because it has nothing to
 * tell an agent.
 */
export function readShippedFlags(value: unknown): { ok: true; flags: StoredShippedFlags } | { ok: false; why: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, why: 'The shipped flags must be an object with a part for each shipped flag, or null.' }
  }
  const held = value as Record<string, unknown>
  const unknown = Object.keys(held).filter((key) => !(SHIPPED_FLAGS as readonly string[]).includes(key) && key !== NO_MARK)
  if (unknown.length > 0) return { ok: false, why: `The shipped flags hold only just-ask, proposal-first, align, give-options and none; it was sent ${unknown.join(', ')} as well.` }
  const flags: StoredShippedFlags = {}
  for (const id of SHIPPED_FLAGS) {
    const one = held[id]
    if (one === undefined) continue
    if (typeof one !== 'object' || one === null || Array.isArray(one)) {
      return { ok: false, why: `The settings for ${id} must be an object.` }
    }
    const said = one as Record<string, unknown>
    const extra = Object.keys(said).filter((key) => !['name', 'description', 'instruction', 'shortWord', 'colour', 'wordsColour'].includes(key))
    if (extra.length > 0) return { ok: false, why: `The settings for ${id} hold a name, a description, an instruction, a short word, a colour and a words colour; they were sent ${extra.join(', ')} as well.` }
    const kept: AStoredShippedFlag = {}
    for (const [key, longest, what] of [
      ['name', LONGEST_LABEL, `The name of ${id}`],
      ['description', LONGEST_LABEL_DESCRIPTION, `The description of ${id}`],
      ['instruction', LONGEST_LABEL_INSTRUCTION, `The instruction of ${id}`],
      ['shortWord', LONGEST_LABEL, `The short word of ${id}`],
    ] as const) {
      if (said[key] === undefined) continue
      const read = readOneLine(said[key], what, longest)
      if (!read.ok) return read
      kept[key] = read.text
    }
    for (const [key, what] of [['colour', 'flag colour'], ['wordsColour', 'words colour']] as const) {
      if (said[key] === undefined) continue
      if (!isLabelColour(said[key])) return { ok: false, why: `The ${what} of ${id} must be one of: ${LABEL_COLOURS.join(', ')}.` }
      kept[key] = said[key]
    }
    flags[id] = kept
  }
  if (held[NO_MARK] !== undefined) {
    const one = held[NO_MARK]
    if (typeof one !== 'object' || one === null || Array.isArray(one)) return { ok: false, why: 'The settings for none must be an object holding only a name.' }
    const said = one as Record<string, unknown>
    const extra = Object.keys(said).filter((key) => key !== 'name')
    if (extra.length > 0) return { ok: false, why: `No mark holds only its name; it was sent ${extra.join(', ')} as well.` }
    if (said['name'] === undefined) {
      flags.none = {}
    } else {
      const read = readOneLine(said['name'], 'The name of No mark', LONGEST_LABEL)
      if (!read.ok) return read
      flags.none = { name: read.text }
    }
  }
  return { ok: true, flags }
}

/**
 * BUILD A PERSON'S LIST OF FLAGS FROM BOTH STORED VALUES, with the defaults applied. Settings, the flag's menu, the
 * bubble, the wire and the mark-broken press all call this, so they cannot read one person's flags two ways.
 */
export function theFlagsOf(
  shipped: StoredShippedFlags | null,
  labels: TheStoredMessageLabels,
  say: Say = sayInEnglish,
): TheFlagsOfAPerson {
  const shippedFlags = SHIPPED_FLAGS.map((id): AFlagOfThePersons => {
    const stored = shipped?.[id] ?? {}
    const words = THE_SHIPPED_WORDS[id]
    const colour = stored.colour ?? THE_SHIPPED_COLOURS[id]
    return {
      id,
      kind: 'shipped',
      name: stored.name ?? say(words.name),
      description: stored.description ?? say(words.description),
      instruction: stored.instruction ?? say(words.instruction),
      shortWord: stored.shortWord ?? say(words.shortWord),
      colour,
      wordsColour: stored.wordsColour ?? colour,
    }
  }) as [AFlagOfThePersons, AFlagOfThePersons, AFlagOfThePersons, AFlagOfThePersons]
  const ownLabels = labels === null || isAnUnreadableMessageLabels(labels) ? [] : labels
  const own = ownLabels.map((entry): AFlagOfThePersons => ({
    id: `label:${entry.text.toLocaleLowerCase()}`,
    kind: 'own',
    name: entry.text,
    description: entry.description ?? null,
    instruction: entry.instruction ?? null,
    shortWord: entry.shortWord ?? entry.text,
    colour: entry.colour,
    wordsColour: entry.wordsColour ?? entry.colour,
  }))
  const noMark: AFlagOfThePersons = {
    id: NO_MARK,
    kind: 'none',
    name: shipped?.none?.name ?? say('chat.intent.name.none'),
    description: null,
    instruction: null,
    shortWord: '',
    colour: 'grey',
    wordsColour: 'grey',
  }
  return { shipped: shippedFlags, own, noMark, all: [...shippedFlags, ...own, noMark] }
}

/** The shipped flag a message's mark names, or null because the mark is none or unknown. */
export function theFlagFor(intent: unknown, flags: TheFlagsOfAPerson): AFlagOfThePersons | null {
  if (!anIntentThatAsks(intent)) return null
  return flags.shipped.find((one) => one.id === intent) ?? null
}

/**
 * The person's own flag a message's label names, found by its word ignoring case, or null because the label is no
 * longer on their list. A flag taken off the list is handed over as its word only.
 */
export function theFlagForLabel(label: MessageLabel | null, flags: TheFlagsOfAPerson): AFlagOfThePersons | null {
  if (label === null) return null
  const word = label.text.toLocaleLowerCase()
  return flags.own.find((one) => one.name.toLocaleLowerCase() === word) ?? null
}

/** THE INSTRUCTION OF THE FLAG THE MESSAGE USES, or null because it has none. */
export function whatTheMarkAsks(intent: unknown, flags?: TheFlagsOfAPerson | null): string | null {
  if (!anIntentThatAsks(intent)) return null
  const list = flags === undefined ? theFlagsOf(null, null) : flags
  if (list === null) return null
  return theFlagFor(intent, list)?.instruction ?? null
}

/** The label's instruction, or null because the flag is no longer on the person's list or has none. */
export function whatTheLabelAsks(label: MessageLabel | null, flags: TheFlagsOfAPerson | null): string | null {
  if (label === null || flags === null) return null
  return theFlagForLabel(label, flags)?.instruction ?? null
}

/** The mark's name, as a person reads it. */
export function theNameOfTheMark(intent: AnIntentThatAsks, flags?: TheFlagsOfAPerson | null): string {
  const list = flags === undefined ? theFlagsOf(null, null) : flags
  return (list === null ? null : theFlagFor(intent, list)?.name) ?? sayInEnglish(THE_SHIPPED_WORDS[intent].name)
}

/**
 * THE MARK AS A READ HANDS IT OVER: the mark, and the person's instruction for it when there is one. A message with no
 * mark gains no field at all, so every reply about it is what it was before the mark existed. `flags` is the sender's
 * list, read once per read; null means nobody's row could be read, and then no instruction is handed over.
 */
export function theIntentOnTheWire(
  data: Record<string, unknown>,
  flags?: TheFlagsOfAPerson | null,
): { intent?: IntentMark; whatTheMarkAsks?: string } {
  const intent = intentOf(data)
  if (intent === null) return {}
  const asks = whatTheMarkAsks(intent, flags)
  return asks === null ? { intent } : { intent, whatTheMarkAsks: asks }
}

/** Why a person's flag of their own may not be given to an agent as a whole label on a message. */
export const A_MESSAGE_LABEL_HOLDS_ONLY_A_WORD_AND_A_COLOUR =
  'A message stores only a label\u2019s word and colour. The description, instruction, short word and words colour are ' +
  'on the person\u2019s list of flags, not on the message. Nothing was written.'

/** Why an agent, or anybody but the person, may not put the mark on a message. */
export const THE_INTENT_MARK_IS_THE_PERSONS =
  '`intent` is the mark the person puts on a message they write, to say what they want back, and only the person ' +
  "sets it. An agent's message carries no mark. Leave the field out. Nothing was written."

/** Why a later write may not touch the mark. */
export const THE_INTENT_MARK_IS_SET_WHEN_WRITTEN =
  '`intent` is set when the person writes a message, and a later write may not set, change or take it off, because ' +
  'the agent was handed the message with the mark it had. Write a new message instead. Nothing was written.'

/** Why an agent, or anybody but the person, may not put marked parts on a message. */
export const THE_MARKED_PARTS_ARE_THE_PERSONS =
  '`markedParts` are the parts of a message the person marked, and only the person sets them on a message they write. ' +
  "An agent's message carries none. Leave the field out. Nothing was written."

/** Why a later write may not touch the marked parts. */
export const THE_MARKED_PARTS_ARE_SET_WHEN_WRITTEN =
  '`markedParts` are set when the person writes a message, and a later write may not set, change or take them off, ' +
  'because the agent was handed the parts the message had. Write a new message instead. Nothing was written.'

/** Why parts and one flag on the whole message are not carried together. */
export const MARKED_PARTS_AND_A_WHOLE_FLAG =
  'A message carries marked parts or one flag on the whole message, not both. Take the whole `intent` or `label` ' +
  'off, or take `markedParts` off. Nothing was written.'

/** Why a part must carry exactly one flag. */
export const A_MARKED_PART_HOLDS_ONE_FLAG =
  'Every marked part carries exactly one flag: `intent` or `label`, never both and never none. Nothing was written.'

/** Why a part's own mark must be one that asks something. */
export const A_MARKED_PART_HOLDS_ONE_ASKING_MARK =
  'A marked part\u2019s `intent` must ask something: "just ask", "proposal first", "align" or "give options". A part ' +
  'that asks nothing is not marked. Nothing was written.'

/** Why a part must name a real run of the message's own words. */
export const A_MARKED_PART_IS_A_RUN_OF_THE_WORDS =
  'A marked part\u2019s `from`, `to` and `quote` must name a run of the message\u2019s own words: `to` after `from`, ' +
  'inside the words, and `quote` exactly those words. Nothing was written.'

/** Why a part may not hold only whitespace. */
export const A_MARKED_PART_HOLDS_VISIBLE_WORDS =
  'A marked part must hold words a person can see, not only spaces or line breaks. Nothing was written.'

/** Why a part may not start or end with a space. */
export const A_MARKED_PART_HAS_NO_SPACE_AT_EITHER_END =
  'A marked part may not start or end with a space or a line break. Take the space off its `from` or `to`. Nothing ' +
  'was written.'

/** Why two parts may not share a character. */
export const MARKED_PARTS_DO_NOT_OVERLAP =
  'Two marked parts may not share a character: one character is in at most one part. Nothing was written.'

/** Why a press naming a part's place has nothing to name there. */
export const THE_PART_NAMED_IS_NOT_ON_THE_MESSAGE =
  '`part` names a marked part by its place in the message\u2019s list, starting at 0, and this message has no part at ' +
  'that place. Nothing was written.'

/** The sentence for a change that would leave a part's words not matching the words at its place. */
export function theChangeOfWordsThatBreaksAPart(broken: readonly { quote: string; name: string }[]): string {
  const list = broken.map((one) => `"${one.quote}" marked "${one.name}"`).join('; ')
  return `This change would break the words ${list}. Make the change keeping those words where they are, or send a new ` +
    'message. Nothing was written.'
}

/** One marked part as it is stored on the message: a run of the person's words and the one flag they put on it. */
export interface AMarkedPart {
  from: number
  to: number
  quote: string
  intent?: AnIntentThatAsks
  label?: MessageLabel
}

/**
 * THE SENTENCE FOR A PART WHOSE LABEL IS NOT A WORD AND A COLOUR, built once from the label reader's own reason. The
 * office's reading and the test that proves it both take it from here.
 */
export function aMarkedPartLabelIsNotOne(why: string): string {
  return `A marked part\u2019s label is not one: ${why}`
}

/** Why a part is not an object with a run of words. */
export const A_MARKED_PART_IS_AN_OBJECT =
  'Every marked part is an object with `from`, `to`, `quote` and one flag. Nothing was written.'

/** Why `markedParts` is not a list of parts. */
export const MARKED_PARTS_ARE_A_LIST = '`markedParts` must be a list of parts. Nothing was written.'

/**
 * THE ONE READING OF A MESSAGE'S MARKED PARTS, asked of the data a write would store. It answers the parts with one
 * flag each and no overlap, all inside the message's words, or the sentence for the first fault. Nothing is repaired
 * and nothing is dropped: the page marks a run of the person's own words, so a value that is not those words is
 * refused rather than moved to the nearest words it could have meant.
 *
 * A message with no parts answers an empty list. A message with parts may not also carry a flag on the whole message
 * (`intent` that asks something, or `label`); a whole "none" asks nothing and sits beside them as it does anywhere.
 */
export function readTheMarkedParts(data: Record<string, unknown>): { ok: true; parts: AMarkedPart[] } | { ok: false; why: string } {
  const held = data['markedParts']
  if (held === undefined) return { ok: true, parts: [] }
  if (!Array.isArray(held)) return { ok: false, why: MARKED_PARTS_ARE_A_LIST }
  const whole = intentOf(data)
  if ((whole !== null && whole !== 'none') || (data['label'] !== undefined && data['label'] !== null)) {
    return { ok: false, why: MARKED_PARTS_AND_A_WHOLE_FLAG }
  }
  const body = typeof data['body'] === 'string' ? data['body'] : ''
  const parts: AMarkedPart[] = []
  for (const one of held) {
    if (typeof one !== 'object' || one === null || Array.isArray(one)) return { ok: false, why: A_MARKED_PART_IS_AN_OBJECT }
    const said = one as Record<string, unknown>
    const from = said['from']
    const to = said['to']
    const quote = said['quote']
    if (
      typeof from !== 'number' ||
      typeof to !== 'number' ||
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      to <= from ||
      to > body.length ||
      typeof quote !== 'string' ||
      body.slice(from, to) !== quote
    ) {
      return { ok: false, why: A_MARKED_PART_IS_A_RUN_OF_THE_WORDS }
    }
    const run = trimmed(body, from, to)
    if (run === null) return { ok: false, why: A_MARKED_PART_HOLDS_VISIBLE_WORDS }
    if (run.from !== from || run.to !== to) return { ok: false, why: A_MARKED_PART_HAS_NO_SPACE_AT_EITHER_END }
    const hasIntent = said['intent'] !== undefined
    const hasLabel = said['label'] !== undefined
    if (hasIntent === hasLabel) return { ok: false, why: A_MARKED_PART_HOLDS_ONE_FLAG }
    if (hasIntent) {
      const intent = said['intent']
      if (!anIntentThatAsks(intent)) return { ok: false, why: A_MARKED_PART_HOLDS_ONE_ASKING_MARK }
      parts.push({ from, to, quote, intent })
      continue
    }
    const label = readMessageLabel(said['label'])
    if (!label.ok) return { ok: false, why: aMarkedPartLabelIsNotOne(label.why) }
    parts.push({ from, to, quote, label: label.label })
  }
  const inOrder = [...parts].sort((a, b) => a.from - b.from)
  for (let at = 1; at < inOrder.length; at += 1) {
    if (inOrder[at]!.from < inOrder[at - 1]!.to) return { ok: false, why: MARKED_PARTS_DO_NOT_OVERLAP }
  }
  return { ok: true, parts }
}

/**
 * THE MARKED PARTS AS EVERY READ HANDS THEM OVER: the run, its flag, the flag's name in the person's words, and the
 * instruction the office handed over for it. A message with no parts gains no field at all, and a message's own name
 * for "No mark" is handed over beside them so the rest line can use it.
 */
export function theMarkedPartsOnTheWire(
  data: Record<string, unknown>,
  flags?: TheFlagsOfAPerson | null,
): { markedParts?: AMarkedPartOnTheWire[]; noMarkName?: string } {
  const read = readTheMarkedParts(data)
  if (!read.ok || read.parts.length === 0) return {}
  const list = flags ?? theFlagsOf(null, null)
  return {
    markedParts: read.parts.map((part): AMarkedPartOnTheWire => {
      if (part.intent !== undefined) {
        return {
          from: part.from,
          to: part.to,
          quote: part.quote,
          intent: part.intent,
          name: theNameOfTheMark(part.intent, list),
          whatItAsks: whatTheMarkAsks(part.intent, list) ?? undefined,
        }
      }
      const label = part.label as MessageLabel
      const flag = theFlagForLabel(label, list)
      return {
        from: part.from,
        to: part.to,
        quote: part.quote,
        label,
        name: flag?.name ?? label.text,
        whatItAsks: flag?.instruction ?? undefined,
      }
    }),
    noMarkName: list.noMark.name,
  }
}

/** One marked part as every hand-over is given it: where it is, its words, its flag and the person's instruction. */
export interface AMarkedPartOnTheWire {
  from: number
  to: number
  quote: string
  intent?: AnIntentThatAsks
  label?: MessageLabel
  /** The flag's name, as the person reads it, or the label's own word when the flag is no longer on their list. */
  name: string
  /** The instruction the person set for that flag, when the office handed one over. */
  whatItAsks?: string
}
