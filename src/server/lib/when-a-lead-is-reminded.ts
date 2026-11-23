// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER THE WRITE DOOR REMINDS A MESSAGE'S WRITER ABOUT ITS LEAD.
 *
 * A lead takes its reader to a place. It is right when the place is a report written for one of the message's readers,
 * a part of such a report, a page where they must act, or a record the waiting list holds for the person. Those get no
 * reminder. Everything else is reminded: a report written for somebody else, a report nobody can be found in, a plan, a
 * line of a plan, any other record, and a target the door cannot read.
 *
 * NOTHING IS REFUSED. The message and its lead are stored as sent; this only decides whether the answer carries the
 * sentence in src/shared/when-to-send-a-lead.mjs.
 *
 * A REPORT'S READER IS IN ITS FREE-TEXT `for`. The first words of it, up to the first punctuation mark or joining word,
 * are compared with each reader's own words. Case, spaces and a leading "the" are set aside on both sides. The person
 * also answers to a fixed list of role words below. A reader the office cannot find gives only its id, or only the role
 * words for the person.
 */

import { leadOfRecord } from '@shared/messages.ts'
import { isTargetKind, recordNamedByTarget, type Target } from '@shared/targets.ts'
import { readParticipant } from '../db/read-participant.ts'
import { getRecord } from './records/reading.ts'
import { readWaiting } from './waiting.ts'

type AReader = { kind: 'person' | 'agent'; id: string }

/**
 * THE WORDS A PERSON ANSWERS TO BESIDES THEIR OWN NAME AND TITLE. These are matched, never shown: they are here so a
 * report written to the person by a role gets no reminder, not so a page prints them.
 */
const THE_ROLE_WORDS_FOR_A_PERSON = ['person', 'owner', '主人', '办公室的主人', '管理员']

/** Where the first words of a report's `for` end, in English and in Chinese. */
const THE_MARKS_THAT_END_A_NAME = [',', ';', ':', '.', '(', '[', '{', '，', '；', '：', '。', '（', '【', '〔', '和']

/** The first words of a report's `for`: up to the first mark above, or before `and` or `who` as whole words. */
function theFirstWordsOf(phrase: string): string {
  let cut = phrase.length
  for (const mark of THE_MARKS_THAT_END_A_NAME) {
    const at = phrase.indexOf(mark)
    if (at !== -1 && at < cut) cut = at
  }
  for (const joining of [/\band\b/i, /\bwho\b/i]) {
    const at = phrase.search(joining)
    if (at !== -1 && at < cut) cut = at
  }
  return phrase.slice(0, cut)
}

/** Whether two names are the same once case, spaces and a leading "the" are set aside. */
function theSameWords(one: string, other: string): boolean {
  const setAside = (words: string): string => {
    const lower = words.toLowerCase().trim()
    const withoutThe = lower.startsWith('the ') ? lower.slice('the '.length) : lower
    return withoutThe.replaceAll(' ', '')
  }
  const mine = setAside(one)
  return mine !== '' && mine === setAside(other)
}

/** Every word one reader answers to, from its own registry row. */
function theWordsOfAReader(reader: AReader): string[] {
  const found = readParticipant(reader)
  if (reader.kind === 'agent') {
    if (found === null) return [reader.id]
    const agent = found as { id: string; handle: string; name: string }
    return [agent.id, agent.handle, agent.name]
  }
  if (found === null) return [...THE_ROLE_WORDS_FOR_A_PERSON]
  const addressAs = (found as { addressAs?: { name?: string; title?: string } }).addressAs
  const said = [addressAs?.name, addressAs?.title].filter(
    (one): one is string => typeof one === 'string' && one !== '',
  )
  return [...said, ...THE_ROLE_WORDS_FOR_A_PERSON]
}

/** The message's readers, from its `to` list, ignoring anything that is not a person or an agent with an id. */
function theReadersOf(message: { data: Record<string, unknown> }): AReader[] {
  const to = message.data['to']
  if (!Array.isArray(to)) return []
  const readers: AReader[] = []
  for (const one of to) {
    if (one === null || typeof one !== 'object') continue
    const held = one as Record<string, unknown>
    const kind = held['kind']
    const id = held['id']
    if ((kind === 'person' || kind === 'agent') && typeof id === 'string' && id !== '') readers.push({ kind, id })
  }
  return readers
}

/** True when the door should answer with the sentence; false for a message with no lead and for a lead that is right. */
export function leadIsReminded(message: { kind: string; data: Record<string, unknown> }): boolean {
  const lead = leadOfRecord(message)
  if (lead === null) return false
  const target = (lead as Record<string, unknown>)['target']
  if (target === null || typeof target !== 'object' || Array.isArray(target)) return true
  const kind = (target as Record<string, unknown>)['kind']
  if (typeof kind !== 'string' || !isTargetKind(kind)) return true
  if (kind === 'page') return false
  const named = recordNamedByTarget(target as Target)
  if (named === null) return true
  const record = getRecord(named)
  if (record === null) return true
  const readers = theReadersOf(message)
  if (record.kind === 'report') {
    const forWords = record.data['for']
    if (typeof forWords !== 'string') return true
    const first = theFirstWordsOf(forWords)
    return !readers.some((reader) => theWordsOfAReader(reader).some((word) => theSameWords(first, word)))
  }
  if (!readers.some((reader) => reader.kind === 'person')) return true
  // readWaiting reads a lot, so it is called only here: for a record that is not a report, and only when the person is
  // one of the message's readers.
  return !readWaiting().items.some((item) => item.id === record.id)
}
