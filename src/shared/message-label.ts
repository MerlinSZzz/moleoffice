// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON'S OWN LABELS FOR THE MESSAGES THEY WRITE (wave 13y). The flag left of Send offers the marks of
 * ./intent-mark.ts; a person may also make labels of their own, and the flag lists them after the marks.
 *
 * A LABEL IS A SHORT WORD AND A COLOUR. It asks nothing of the agent: it is text that goes with the message, and the
 * colour is how the person's own screens draw it. The colour is one of `LABEL_COLOURS`, the set the page offers, and
 * nothing else is stored.
 *
 * THE PERSON KEEPS THEIR LIST ON THEIR OWN ROW, in the `chat_labels` column of `people` (migration 0341), so it
 * follows them to any machine. A null column means nobody has made one. A stored value the reader does not take is
 * answered as unreadable with the reader's sentences, never as null, so a page cannot write an empty list over it.
 *
 * ON A MESSAGE IT IS `data.label`, and its rules are those of `data.intent`: only the person sets it, on a message they
 * write, at the moment they write it, and a later write may not set, change or take it off
 * (src/server/lib/records/creating.ts and patching.ts ask the two refusals below). It need not be on the person's list
 * when it is read: the list may have changed since, and the message keeps the label it was sent with.
 */

/**
 * The colours a label may have, in the order the page offers them. The first six are each drawn in a colour of the
 * theme. Pink, light blue, orange and forest green are the colours the shipped flags are drawn in, and a person's own
 * label may take them too. Forest green is a colour of its own beside green, so the fourth shipped flag has one.
 */
export const LABEL_COLOURS = ['grey', 'red', 'amber', 'green', 'blue', 'purple', 'pink', 'light-blue', 'orange', 'forest-green'] as const
export type LabelColour = (typeof LABEL_COLOURS)[number]

/** The longest word a label may have, in characters. A label is drawn on the flag beside Send, where room is short. */
export const LONGEST_LABEL = 16

/** The most labels one person may keep. */
export const MOST_LABELS = 12

/**
 * THE LONGEST DESCRIPTION A FLAG MAY HAVE, in characters. The menu shows it under the flag's name on one line where it
 * can, so it is a short line rather than a sentence for the agent: the instruction is the field for the agent.
 */
export const LONGEST_LABEL_DESCRIPTION = 160

/**
 * THE LONGEST INSTRUCTION A FLAG MAY HAVE, in characters. It is handed to an agent with every message that uses the
 * flag, so it is allowed a paragraph: enough for what to do and what not to do, and short enough to read at a hand-over.
 */
export const LONGEST_LABEL_INSTRUCTION = 600

/** One label, as stored on the person's row and on a message. */
export interface MessageLabel {
  text: string
  colour: LabelColour
}

/**
 * ONE ENTRY OF THE PERSON'S OWN LIST: the word and colour of a label, and the four things a flag of their own may also
 * hold. A message stores only the word and colour, so `readMessageLabel` reads those two there and refuses the rest.
 */
export interface MessageLabelEntry extends MessageLabel {
  description?: string
  instruction?: string
  shortWord?: string
  wordsColour?: LabelColour
}

/**
 * LABELS THE ROW HOLDS THAT THIS BUILD'S READER DOES NOT TAKE, with the reader's sentences. It is a third answer
 * beside a list and null, and never null itself: null means nobody made a list, and a page that took it for null
 * would write an empty list over the labels the person made.
 */
export interface AnUnreadableMessageLabels {
  readonly unreadable: readonly string[]
}

/** What the office gives back for a person's labels: the list, unreadable with the reasons, or null because nobody made one. */
export type TheStoredMessageLabels = readonly MessageLabelEntry[] | AnUnreadableMessageLabels | null

export function isAnUnreadableMessageLabels(held: unknown): held is AnUnreadableMessageLabels {
  return typeof held === 'object' && held !== null && !Array.isArray(held) && 'unreadable' in held
}

/** One text field of an entry: one line, with no space at either end, and at most this many characters. */
function readOneLine(value: unknown, what: string, longest: number): { ok: true; text: string } | { ok: false; why: string } {
  if (typeof value !== 'string') return { ok: false, why: `${what} must be one line of text.` }
  if (value.trim() === '') return { ok: false, why: `${what} is empty.` }
  if (value !== value.trim()) return { ok: false, why: `${what} may not start or end with a space; "${value}" does.` }
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(value)) return { ok: false, why: `${what} must be on one line.` }
  if ([...value].length > longest) {
    return { ok: false, why: `${what} may have ${String(longest)} characters at most; it has ${String([...value].length)}.` }
  }
  return { ok: true, text: value }
}

/** True when this word is one of the colours. */
export function isLabelColour(value: unknown): value is LabelColour {
  return typeof value === 'string' && (LABEL_COLOURS as readonly string[]).includes(value)
}

/**
 * THE ONE STRICT READING OF ONE LABEL, sent or stored, on a message and on the person's list. It answers the label, or a
 * sentence saying what is wrong. Nothing is changed or dropped: the page takes the spaces off a typed word and shows
 * back what was stored, so a word with spaces around it is refused here.
 */
export function readMessageLabel(value: unknown): { ok: true; label: MessageLabel } | { ok: false; why: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, why: 'A label must be an object with text and colour.' }
  }
  const held = value as Record<string, unknown>
  const extra = Object.keys(held).filter((key) => key !== 'text' && key !== 'colour')
  if (extra.length > 0) return { ok: false, why: `A label holds only text and colour; it was sent ${extra.join(', ')} as well.` }
  if (typeof held['text'] !== 'string') return { ok: false, why: "A label's text must be a word." }
  const text = held['text']
  if (text.trim() === '') return { ok: false, why: "A label's text is empty." }
  if (text !== text.trim()) return { ok: false, why: `A label's text may not start or end with a space; "${text}" does.` }
  if (/[\p{Cc}\p{Zl}\p{Zp}]/u.test(text)) return { ok: false, why: "A label's text must be on one line." }
  if ([...text].length > LONGEST_LABEL) {
    return { ok: false, why: `A label's text may have ${String(LONGEST_LABEL)} characters at most; "${text}" has ${String([...text].length)}.` }
  }
  if (!isLabelColour(held['colour'])) {
    return { ok: false, why: `A label's colour must be one of: ${LABEL_COLOURS.join(', ')}.` }
  }
  return { ok: true, label: { text, colour: held['colour'] } }
}

/**
 * THE STRICT READING OF ONE ENTRY OF THE PERSON'S LIST. It passes the word and the colour to `readMessageLabel`, so
 * those two are still checked in one place, and reads the four fields a flag of their own may also hold.
 */
export function readMessageLabelEntry(value: unknown): { ok: true; label: MessageLabelEntry } | { ok: false; why: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, why: 'A label must be an object with text and colour.' }
  }
  const held = value as Record<string, unknown>
  const words = readMessageLabel({ text: held['text'], colour: held['colour'] })
  if (!words.ok) return words
  const extra = Object.keys(held).filter((key) => !['text', 'colour', 'description', 'instruction', 'shortWord', 'wordsColour'].includes(key))
  if (extra.length > 0) return { ok: false, why: `A label holds a word, a colour, a description, an instruction, a short word and a words colour; it was sent ${extra.join(', ')} as well.` }
  const entry: MessageLabelEntry = { ...words.label }
  if (held['description'] !== undefined) {
    const read = readOneLine(held['description'], "A label's description", LONGEST_LABEL_DESCRIPTION)
    if (!read.ok) return read
    entry.description = read.text
  }
  if (held['instruction'] !== undefined) {
    const read = readOneLine(held['instruction'], "A label's instruction", LONGEST_LABEL_INSTRUCTION)
    if (!read.ok) return read
    entry.instruction = read.text
  }
  if (held['shortWord'] !== undefined) {
    const read = readOneLine(held['shortWord'], "A label's short word", LONGEST_LABEL)
    if (!read.ok) return read
    entry.shortWord = read.text
  }
  if (held['wordsColour'] !== undefined) {
    if (!isLabelColour(held['wordsColour'])) {
      return { ok: false, why: `A label's words colour must be one of: ${LABEL_COLOURS.join(', ')}.` }
    }
    entry.wordsColour = held['wordsColour']
  }
  return { ok: true, label: entry }
}

/** THE STRICT READING OF A PERSON'S WHOLE LIST: each entry as `readMessageLabelEntry` reads it, no word twice, at most `MOST_LABELS`. */
export function readMessageLabels(value: unknown): { ok: true; labels: MessageLabelEntry[] } | { ok: false; why: string } {
  if (!Array.isArray(value)) return { ok: false, why: 'The labels must be a list, or null.' }
  if (value.length > MOST_LABELS) return { ok: false, why: `A person may keep ${String(MOST_LABELS)} labels at most; this list has ${String(value.length)}.` }
  const labels: MessageLabelEntry[] = []
  for (const one of value) {
    const read = readMessageLabelEntry(one)
    if (!read.ok) return read
    if (labels.some((kept) => kept.text.toLocaleLowerCase() === read.label.text.toLocaleLowerCase())) {
      return { ok: false, why: `Two labels have the word "${read.label.text}".` }
    }
    labels.push(read.label)
  }
  return { ok: true, labels }
}

/** The label a stored message holds, or null because none was put on it. */
export function labelOf(data: Record<string, unknown>): MessageLabel | null {
  const read = readMessageLabel(data['label'])
  return read.ok ? read.label : null
}

/**
 * THE LABEL AS A READ HANDS IT OVER, as the mark is handed over by `theIntentOnTheWire` in ./intent-mark.ts. A message
 * with no label gains no field, so every reply about it is what it was before labels existed. The instruction for the
 * person's flag is worked out by the office from their row and passed in; this file does not read a person.
 */
export function theLabelOnTheWire(
  data: Record<string, unknown>,
  instruction?: string | null,
): { label?: MessageLabel; whatTheLabelAsks?: string } {
  const label = labelOf(data)
  if (label === null) return {}
  return instruction === undefined || instruction === null || instruction === ''
    ? { label }
    : { label, whatTheLabelAsks: instruction }
}

/** Why an agent, or anybody but the person, may not put a label on a message. */
export const THE_LABEL_IS_THE_PERSONS =
  '`label` is a label the person puts on a message they write, and only the person sets it. An agent\u2019s message ' +
  'carries none. Leave the field out. Nothing was written.'

/** Why a later write may not touch the label. */
export const THE_LABEL_IS_SET_WHEN_WRITTEN =
  '`label` is set when the person writes a message, and a later write may not set, change or take it off, because ' +
  'the agent was handed the message with the label it had. Write a new message instead. Nothing was written.'
