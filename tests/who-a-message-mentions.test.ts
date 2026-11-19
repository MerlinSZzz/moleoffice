// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW AN @ IS READ: ONE FUNCTION, READ BY THE SERVER AND THE PAGE.
 *
 * By criterion GM1 of a decision, a group message whose words @ members is delivered only to
 * them. The reading lives once in `whoAMessageMentions` in src/shared/groups.ts, so the server's
 * delivery and the page's drawing cannot disagree about who was addressed. This file measures the
 * reading itself; the delivery that rests on it is in
 * tests/a-group-mention-decides-who-is-told.test.ts.
 *
 * The rule, as the wave-3 brief states it: a word that starts with @ right after a space or the
 * start of a line, matched against the group's members by handle and by the name the chat draws,
 * without regard to case. An @ that matches nobody is words, not an address.
 */

import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'
import { describe, expect, it } from 'vitest'
import { EVERYONE_MENTION_WORDS, whoAMessageMentions, type Mentionable } from '../src/shared/groups.ts'
import type { ParticipantRef } from '../src/shared/participants.ts'

const secretary: ParticipantRef = { kind: 'agent', id: THE_TEST_OFFICES_SECRETARY.handle }
const QUILL: ParticipantRef = { kind: 'agent', id: 'quill-1' }
const ANNA: ParticipantRef = { kind: 'agent', id: 'anna' }
const ALLY: ParticipantRef = { kind: 'agent', id: 'all' }

const MEMBERS: Mentionable[] = [
  { who: secretary, handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name },
  { who: QUILL, handle: 'quill-1', name: 'Quill' },
  { who: ANNA, handle: 'anna', name: 'Anna' },
  { who: ALLY, handle: 'all', name: 'All' },
]

/** The ids the reading answered, sorted, for a short assertion. */
function ids(body: string): string[] {
  return whoAMessageMentions(body, MEMBERS)
    .who.map((one) => one.id)
    .sort()
}

describe('who a message @s', () => {
  it('names a member by handle and by the name the chat draws', () => {
    expect(ids(`@${THE_TEST_OFFICES_SECRETARY.handle} look at this`)).toEqual([THE_TEST_OFFICES_SECRETARY.handle])
    expect(ids('@Quill look at this')).toEqual(['quill-1'])
  })

  it('does not care about case', () => {
    expect(ids(`@${THE_TEST_OFFICES_SECRETARY.handle.toUpperCase()} and @qUiLl`)).toEqual([THE_TEST_OFFICES_SECRETARY.handle, 'quill-1'])
  })

  it('reads an @ at the start of the line as an address', () => {
    expect(ids(`@${THE_TEST_OFFICES_SECRETARY.handle}`)).toEqual([THE_TEST_OFFICES_SECRETARY.handle])
    expect(ids(`first line\n@${THE_TEST_OFFICES_SECRETARY.handle}`)).toEqual([THE_TEST_OFFICES_SECRETARY.handle])
  })

  it('does not read an @ in the middle of a word', () => {
    expect(ids(`write to me@${THE_TEST_OFFICES_SECRETARY.handle}.example`)).toEqual([])
  })

  it('does not let a name run into the letters after it', () => {
    expect(ids(`@${THE_TEST_OFFICES_SECRETARY.handle}x is not a member`)).toEqual([])
    expect(ids('@ann is not a member')).toEqual([])
  })

  it('reads an @ followed by punctuation as the member', () => {
    expect(ids(`@${THE_TEST_OFFICES_SECRETARY.handle}, please`)).toEqual([THE_TEST_OFFICES_SECRETARY.handle])
    expect(ids('@Quill.')).toEqual(['quill-1'])
  })

  it('lets the longest name win, so two alike members are told apart', () => {
    const alike: Mentionable[] = [
      { who: { kind: 'agent', id: 'ann' }, handle: 'ann', name: 'Ann' },
      { who: ANNA, handle: 'anna', name: 'Anna' },
    ]
    const reading = whoAMessageMentions('@Anna called', alike)
    expect(reading.who.map((one) => one.id)).toEqual(['anna'])
  })

  it('names a member once however many times they are @d', () => {
    expect(ids(`@${THE_TEST_OFFICES_SECRETARY.handle} and again @${THE_TEST_OFFICES_SECRETARY.handle}`)).toEqual([THE_TEST_OFFICES_SECRETARY.handle])
  })

  it('treats an @ that matches nobody as words', () => {
    expect(ids('hello @nobody')).toEqual([])
    expect(whoAMessageMentions('hello @nobody', MEMBERS).everyone).toBe(false)
  })

  it('reads @所有人 and @all as everybody, and never as a member called all', () => {
    for (const word of EVERYONE_MENTION_WORDS) {
      const reading = whoAMessageMentions(`@${word} listen`, MEMBERS)
      expect(reading.everyone, `@${word} is not read as everybody`).toBe(true)
      expect(reading.who, `@${word} named the member called all`).toEqual([])
    }
  })

  it('does not read @alliance or @所有人算 as the everybody word', () => {
    expect(whoAMessageMentions('@alliance is a different word', MEMBERS).everyone).toBe(false)
    expect(ids('@alliance is a different word')).toEqual([])
  })
})
