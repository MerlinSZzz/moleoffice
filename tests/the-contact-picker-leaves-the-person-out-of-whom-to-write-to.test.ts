// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CONTACT PICKER LEAVES THE PERSON OUT OF WHOM TO WRITE TO.
 *
 * The contact picker, where the person chooses whom a comment or a review goes to, draws a row that cannot be chosen
 * with the message door's line, built in the page's language from the facts the door sent. The line says why the
 * agent cannot get messages and whom to write to instead. That list named the person first, and the picker is drawn
 * for the person, so the person pointing at the row was told to write to the person. The picker now builds the same
 * line with the person left out: the starter and the secretaries stay named, and when nobody is left the line has no
 * "instead" clause at all, keeping its first sentence and, where the setting refuses the message, the setting's
 * clause. A row the door sent no facts for keeps the English line it came with.
 *
 * WHAT IS MEASURED, each case with an English reader and a Chinese one:
 *   · a retired agent with a starter and two secretaries: the picker's line names the starter and both
 *     secretaries and holds neither the person's name nor the unnamed word for the person; the server's
 *     two-argument line built from the same facts still names the person, so the cut is the picker's;
 *   · an agent whose only alternative is the person, with the setting off: the picker's line is exactly
 *     `whyTheAgentCannotReceive`, the first sentence and nothing more;
 *   · the same agent refused by the setting: the picker's line is the server's line less the instead clause
 *     and its separator; it starts with the first sentence, holds the setting's clause, and is shorter than
 *     the server's line by exactly the instead clause and the separator;
 *   · no facts: the picker gives the English line exactly as it came, even when the page reads Chinese.
 *
 * MUTATION, one per case:
 *   · case 1: in `whyTheRowCannotBeChosen` (src/web/components/ContactsInOrder.tsx), pass `false` to
 *     `theCannotReceiveLine` instead of `true`; the person's name comes back into the picker's line;
 *   · case 2: the same mutation adds the instead clause, so the line is no longer the first sentence;
 *   · case 3: the same mutation adds the instead clause back, so the picker's line is the server's line;
 *   · case 4: making `whyTheRowCannotBeChosen` build a line when `cannotReceiveSaid` is null, instead of
 *     returning the English it was given, reddens it.
 *
 * Every name in this file is made up.
 */
import { describe, expect, it } from 'vitest'
import { createI18n, type Say } from '../src/shared/i18n.ts'
import { wordWithSpacedValues } from '../src/shared/spacing.ts'
import { theCannotReceiveLine, whyTheAgentCannotReceive, type TheCannotReceiveSaid } from '../src/shared/cannot-receive.ts'
import { whyTheRowCannotBeChosen } from '../src/web/components/ContactsInOrder.tsx'

const AGENT = 'Made-up Agent'
const PERSON = 'Made-up Person'
const STARTER = 'Made-up Starter'
const SECRETARY_ONE = 'Made-up Secretary One'
const SECRETARY_TWO = 'Made-up Secretary Two'

const READERS = [
  { language: 'English', say: createI18n('en').t },
  { language: 'Chinese', say: createI18n('zh').t },
] as const

/** The line the picker draws for a row that cannot be chosen. */
function thePickersLine(said: TheCannotReceiveSaid, say: Say): string {
  const line = whyTheRowCannotBeChosen({ cannotReceive: null, cannotReceiveSaid: said }, say)
  expect(line).not.toBeNull()
  return line as string
}

describe('the contact picker leaves the person out of whom to write to', () => {
  for (const { language, say } of READERS) {
    it(`names the starter and both secretaries, and never the person (${language})`, () => {
      const said: TheCannotReceiveSaid = {
        agent: AGENT,
        state: 'retired',
        bySetting: false,
        person: PERSON,
        starter: STARTER,
        secretaries: [SECRETARY_ONE, SECRETARY_TWO],
      }
      const picker = thePickersLine(said, say)
      const server = theCannotReceiveLine(said, say)
      expect(picker).toContain(STARTER)
      expect(picker).toContain(SECRETARY_ONE)
      expect(picker).toContain(SECRETARY_TWO)
      expect(picker).not.toContain(PERSON)
      expect(picker).not.toContain(say('cannotReceive.person.unnamed'))
      // THE CUT IS THE PICKER'S ALONE: the server's own call, with two arguments, still names the person.
      expect(server).toContain(PERSON)
    })

    it(`gives the first sentence and nothing more when only the person is left (${language})`, () => {
      const said: TheCannotReceiveSaid = {
        agent: AGENT,
        state: 'offline',
        bySetting: false,
        person: PERSON,
        starter: null,
        secretaries: [],
      }
      const picker = thePickersLine(said, say)
      expect(picker).toBe(whyTheAgentCannotReceive(said, say))
      // The server still says whom to write to; only the picker drops that clause.
      expect(theCannotReceiveLine(said, say)).toContain(PERSON)
    })

    it(`keeps the setting's clause and drops the instead clause when the setting refuses (${language})`, () => {
      const said: TheCannotReceiveSaid = {
        agent: AGENT,
        state: 'offline',
        bySetting: true,
        person: PERSON,
        starter: null,
        secretaries: [],
      }
      const picker = thePickersLine(said, say)
      const server = theCannotReceiveLine(said, say)
      const first = whyTheAgentCannotReceive(said, say)
      // THE BUILDER'S OWN PIECES, read through the word keys rather than typed here.
      const setting = say('cannotReceive.setting', {
        setting: say('settingsPanel.computer.refuseUnanswered'),
        place: say('cannotReceive.place', { settings: say('nav.settings'), category: say('settingsCats.cat.chat') }),
      })
      const between = say('cannotReceive.between')
      const instead = wordWithSpacedValues(say, 'cannotReceive.instead', { whom: PERSON })
      expect(server).toBe([first, setting, instead].join(between))
      expect(picker).toBe([first, setting].join(between))
      expect(picker.startsWith(first)).toBe(true)
      expect(picker).toContain(setting)
      expect(picker).not.toContain(PERSON)
      expect(server.length - picker.length).toBe(instead.length + between.length)
    })
  }

  it('gives the English line exactly as it came when the door sent no facts', () => {
    const english = createI18n('en').t
    const said: TheCannotReceiveSaid = {
      agent: AGENT,
      state: 'retired',
      bySetting: false,
      person: PERSON,
      starter: STARTER,
      secretaries: [SECRETARY_ONE],
    }
    const asItCame = theCannotReceiveLine(said, english)
    for (const noFacts of [null, undefined]) {
      expect(whyTheRowCannotBeChosen({ cannotReceive: asItCame, cannotReceiveSaid: noFacts }, createI18n('zh').t)).toBe(asItCame)
    }
  })
})
