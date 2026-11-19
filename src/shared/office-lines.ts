// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIXED LINES OF MOLE OFFICE'S, AND THEIR WORDS IN A LANGUAGE.
 *
 * Mole Office writes these lines in English and stores them as written:
 *   - "Mole Office restarted", when a restart of the API cut a run off before it answered
 *     (`SYSTEM_LINES.aRestartCutARunOff` in shared/groups.ts);
 *   - "You hold the <card> card", the one message an agent gets about the card it holds
 *     (`SYSTEM_LINES.youHoldACard`, built by src/server/lib/cardmessage.ts);
 *   - "Branched from another conversation", the first line of a conversation opened because another agent
 *     could not be reached (`SYSTEM_LINES.branchedFromAnother`, written by src/server/lib/worker.ts). Its
 *     sentence names the old agent, and is read back by its words with the name and handle in them
 *     (the review of wave 13n round 35, point 5);
 *   - "Back, as you asked", the line that brings a message back once at the time the person chose with Remind me
 *     later (`theBackAsYouAskedLine` below, written by src/server/lib/remind-me-later.ts), and "Back, as the
 *     secretary set it" where a secretary set that time for them under their grant (`theBackAsTheSecretarySetItLine`);
 *   - "A secretary added a provider" and "A secretary changed a provider", the lines that tell the person a secretary
 *     wrote to the provider table beside the Casting table (`theProviderAddedLine` and `theProviderChangedLine` below,
 *     written by src/server/lib/the-provider-table.ts). Their sentences name the row, the host and the key file's
 *     entry, and are read back by their words with those values in them.
 *
 * A Chinese page drew both in English (the re-review of wave 13n round 32). The words now live in the word
 * lists. The server stores them with the English reader, and a page reads a stored line back into its own
 * language from what the line says: the restart line by its exact words, and the card line by the card it names.
 * The stored rows are never rewritten.
 *
 * ONE PLACE FOR EACH LINE'S WORDS (invariant 9): the English the server stores and the words the page draws come
 * from the same word-list key, and the reader below recognises a stored line by asking the English reader for the
 * same key. A line written before these words moved here has the same English, so it is read back too.
 */

import { cardWord } from './card-words.ts'
import { sayInEnglish, type Say } from './i18n.ts'
import { wordWithSpacedValues } from './spacing.ts'
import { isMoleOffice, type ParticipantRef } from './participants.ts'
import { PROVIDER_PROGRAMS } from './the-provider-table.ts'

/** A line's few words and the whole sentence behind them, or null because the few words are all of it. */
export interface AFixedLine {
  line: string
  said: string | null
}

/** The restart line, in the reader's language. */
export function theRestartLine(say: Say): AFixedLine {
  return { line: say('officeLines.restart.line'), said: say('officeLines.restart.said') }
}

/** The branched line, in the reader's language. `name` and `handle` are the old agent's, as the press found them. */
export function theBranchedLine(say: Say, name: string, handle: string): { line: string; said: string } {
  return { line: say('officeLines.branched.line'), said: say('officeLines.branched.said', { name, handle }) }
}

/**
 * THE LINE THAT BRINGS A MESSAGE BACK, in the reader's language: the person pressed Remind me later on it, and the time
 * came, by a decision. src/server/lib/remind-me-later.ts writes it, about that message and
 * carrying its offer.
 */
export function theBackAsYouAskedLine(say: Say): AFixedLine {
  return { line: say('officeLines.backAsYouAsked.line'), said: say('officeLines.backAsYouAsked.said') }
}

/**
 * THE LINE THAT BRINGS A MESSAGE BACK WHERE A SECRETARY SET THE TIME FOR THE PERSON under their grant, in the reader's
 * language. The person did not press Remind me later, so the line does not say they asked for it; the delivery row keeps
 * which secretary did. Migration 0288 and src/server/lib/remind-me-later.ts.
 */
export function theBackAsTheSecretarySetItLine(say: Say): AFixedLine {
  return { line: say('officeLines.backAsTheSecretarySetIt.line'), said: say('officeLines.backAsTheSecretarySetIt.said') }
}

/**
 * TRUE WHEN THIS IS A LINE THAT BROUGHT A MESSAGE BACK: Mole Office wrote it, in either of the words above, as stored.
 * Needs you reads it, because unlike the office's other lines this one waits on the person: the time was set for them,
 * by them or by the secretary their grant carried.
 */
export function isABroughtBackLine(line: { sentBy: ParticipantRef | null; body: string }): boolean {
  if (line.sentBy === null || !isMoleOffice(line.sentBy)) return false
  return line.body === theBackAsYouAskedLine(sayInEnglish).line || line.body === theBackAsTheSecretarySetItLine(sayInEnglish).line
}

/** TRUE WHEN THE LINE THAT BROUGHT A MESSAGE BACK SAYS A SECRETARY SET THE TIME FOR THE PERSON, under their grant. */
export function isABroughtBackLineTheSecretarySet(line: { sentBy: ParticipantRef | null; body: string }): boolean {
  return line.sentBy !== null && isMoleOffice(line.sentBy) && line.body === theBackAsTheSecretarySetItLine(sayInEnglish).line
}

/** The name and handle a stored branched sentence names, or null because it is not that sentence. */
function theAgentAStoredBranchedSentenceNames(said: string): { name: string; handle: string } | null {
  const [name, handle] = ['\u0001', '\u0002']
  const written = theBranchedLine(sayInEnglish, name, handle).said
  // THE ENGLISH SENTENCE AS A PATTERN: its words exactly, the name wherever the sentence names it, the handle once.
  let pattern = ''
  let namedYet = false
  for (const part of written.split(/(\u0001|\u0002)/u)) {
    if (part === name) {
      pattern += namedYet ? '\\k<name>' : '(?<name>.+?)'
      namedYet = true
    } else if (part === handle) pattern += '(?<handle>.+?)'
    else pattern += part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  }
  const found = new RegExp(`^${pattern}$`, 'su').exec(said)
  return found?.groups === undefined ? null : { name: found.groups['name']!, handle: found.groups['handle']! }
}

/** What a provider line names: the agent that wrote, the row, and what the row is for, sends to and names. */
export interface AProviderLinesValues {
  /** The agent that wrote, as it named itself. Only an agent holding the act's card gets past the gate. */
  agent: string
  id: string
  name: string
  /** The row's programs, as "codex, opencode". */
  programs: string
  /** The host of the row's base address, never the whole address. */
  host: string
  keyName: string
}

/** What the changed line names besides: the programs, host and key name the row had before the change. */
export interface AChangedProviderLinesValues extends AProviderLinesValues {
  programsBefore: string
  hostBefore: string
  keyNameBefore: string
}

/** THE LINE THAT TELLS THE PERSON A SECRETARY ADDED A PROVIDER, in the reader's language. It names no key's value. */
export function theProviderAddedLine(say: Say, values: AProviderLinesValues): { line: string; said: string } {
  return { line: say('officeLines.aSecretaryAddedAProvider.line'), said: say('officeLines.aSecretaryAddedAProvider.said', { ...values }) }
}

/** THE LINE THAT TELLS THE PERSON A SECRETARY CHANGED A PROVIDER, in the reader's language. It names no key's value. */
export function theProviderChangedLine(say: Say, values: AChangedProviderLinesValues): { line: string; said: string } {
  return { line: say('officeLines.aSecretaryChangedAProvider.line'), said: say('officeLines.aSecretaryChangedAProvider.said', { ...values }) }
}

/** THE SHAPE EACH VALUE OF A PROVIDER LINE TAKES, as the provider table's rules let it be stored. */
const A_PROGRAM = `(?:${PROVIDER_PROGRAMS.join('|')})`
const THE_PROVIDER_VALUE_SHAPES: Readonly<Record<keyof AChangedProviderLinesValues, string>> = {
  agent: '.+?',
  id: '[a-z0-9-]{2,40}',
  name: '.+?',
  programs: `${A_PROGRAM}(?:, ${A_PROGRAM})*`,
  host: '[^\\s/?#@]+',
  keyName: '[a-z0-9-]+',
  programsBefore: `${A_PROGRAM}(?:, ${A_PROGRAM})*`,
  hostBefore: '[^\\s/?#@]+',
  keyNameBefore: '[a-z0-9-]+',
}

/**
 * THE VALUES A STORED PROVIDER SENTENCE NAMES, read back by its English words, or null because it is not that sentence.
 * `written` makes the English sentence from the values it is given, each named once.
 */
function theValuesAStoredProviderSentenceNames<V extends AProviderLinesValues>(written: (values: V) => string, names: readonly (keyof V & string)[], said: string): V | null {
  const marks = Object.fromEntries(names.map((name, at) => [name, String.fromCodePoint(0xe000 + at)])) as unknown as V
  let pattern = ''
  for (const part of written(marks).split(/([\ue000-\ue0ff])/u)) {
    const name = part.length === 1 ? names[part.codePointAt(0)! - 0xe000] : undefined
    pattern += name === undefined ? part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&') : `(?<${name}>${THE_PROVIDER_VALUE_SHAPES[name as keyof AChangedProviderLinesValues]})`
  }
  const found = new RegExp(`^${pattern}$`, 'su').exec(said)
  return found?.groups === undefined ? null : (found.groups as unknown as V)
}

const THE_ADDED_LINES_VALUES = ['agent', 'id', 'name', 'programs', 'host', 'keyName'] as const
const THE_CHANGED_LINES_VALUES = [...THE_ADDED_LINES_VALUES, 'programsBefore', 'hostBefore', 'keyNameBefore'] as const

/** The few words of the card message, in the reader's language. `card` is the card's stored name, such as "worker". */
export function theCardLine(say: Say, card: string): string {
  // A CARD NAMED IN LATIN LETTERS is spaced from the Chinese words around it by the one spacing rule.
  return wordWithSpacedValues(say, 'officeLines.youHoldACard', { card })
}

/** The card a stored card line names, or null because the line is not the card line. */
function theCardAStoredLineNames(body: string): string | null {
  const mark = '\u0000'
  const [before, after] = theCardLine(sayInEnglish, mark).split(mark)
  if (before === undefined || after === undefined) return null
  if (!body.startsWith(before) || !body.endsWith(after) || body.length <= before.length + after.length) return null
  return body.slice(before.length, body.length - after.length)
}

/**
 * THE WORDS A PAGE DRAWS FOR ONE OF THESE STORED LINES, or null because the line is none of them. The caller
 * has already checked that Mole Office sent it.
 *
 *   - the restart line: its few words in the page's language, and its sentence too where the stored sentence is
 *     the one Mole Office writes; any other stored sentence, or none, is kept as it is, because nothing here can
 *     say it in other words;
 *   - the card line: its few words in the page's language, with the card's word for a declared card and the
 *     stored name for any other. Its sentence is the card's handbook written for the agent, and is kept as stored;
 *   - the branched line: its few words in the page's language, and its sentence too where the stored sentence is
 *     the one Mole Office writes, with the name and handle it stored; any other stored sentence is kept as it is;
 *   - the two provider lines: the same, with the values their stored sentence names.
 */
export function theWordsOfAFixedOfficeLine(say: Say, line: { body: string; saidInFull?: string | null }): AFixedLine | null {
  const stored = line.saidInFull ?? null
  const restart = theRestartLine(sayInEnglish)
  if (line.body === restart.line) {
    const here = theRestartLine(say)
    return { line: here.line, said: stored === restart.said ? here.said : stored }
  }
  const branched = theBranchedLine(sayInEnglish, '', '')
  if (line.body === branched.line) {
    const named = stored === null ? null : theAgentAStoredBranchedSentenceNames(stored)
    return { line: say('officeLines.branched.line'), said: named === null ? stored : theBranchedLine(say, named.name, named.handle).said }
  }
  const back = theBackAsYouAskedLine(sayInEnglish)
  if (line.body === back.line) {
    const here = theBackAsYouAskedLine(say)
    return { line: here.line, said: stored === back.said ? here.said : stored }
  }
  const backForThePerson = theBackAsTheSecretarySetItLine(sayInEnglish)
  if (line.body === backForThePerson.line) {
    const here = theBackAsTheSecretarySetItLine(say)
    return { line: here.line, said: stored === backForThePerson.said ? here.said : stored }
  }
  if (line.body === sayInEnglish('officeLines.aSecretaryAddedAProvider.line')) {
    const named = stored === null ? null : theValuesAStoredProviderSentenceNames<AProviderLinesValues>((values) => theProviderAddedLine(sayInEnglish, values).said, THE_ADDED_LINES_VALUES, stored)
    return { line: say('officeLines.aSecretaryAddedAProvider.line'), said: named === null ? stored : theProviderAddedLine(say, named).said }
  }
  if (line.body === sayInEnglish('officeLines.aSecretaryChangedAProvider.line')) {
    const named = stored === null ? null : theValuesAStoredProviderSentenceNames<AChangedProviderLinesValues>((values) => theProviderChangedLine(sayInEnglish, values).said, THE_CHANGED_LINES_VALUES, stored)
    return { line: say('officeLines.aSecretaryChangedAProvider.line'), said: named === null ? stored : theProviderChangedLine(say, named).said }
  }
  const card = theCardAStoredLineNames(line.body)
  if (card !== null) return { line: theCardLine(say, cardWord(card, (key) => say(key))), said: stored }
  return null
}
