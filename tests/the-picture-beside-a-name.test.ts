// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE SCREENS DRAW FOR A PARTICIPANT: the picture, the name, the handle, the runtime, the state
 * and the retired mark, and the controls a person gets and an agent does not.
 *
 * Criteria M2 and M3 of design/messages/ACCEPTANCE.md, the browser half. A user may change an
 * agent's avatar and its name, and an avatar is a resource, like the interface's
 * appearance, which is why the owner's own picture, name and state are on the settings page.
 */

import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  avatarUrlFor,
  defaultAvatarAssetId,
  PRESENCE_BEFORE_ANYBODY_CHOOSES,
  PRESENCE_CHOICE_WORDS,
} from '../src/shared/participants.ts'
import type { ParticipantOnTheWire } from '../src/web/api.ts'
import { APPEARANCE_WORDS } from '../src/web/components/Appearance.tsx'
import { PICKER_WORDS } from '../src/web/components/AvatarPicker.tsx'
import { NOT_CHOSEN_WORDS } from '../src/web/components/BackToNotChosen.tsx'
import type { WhoIsWorking, WorkingRow } from '../src/server/lib/working.ts'

type AvatarModule = typeof import('../src/web/components/Avatar.tsx')
type AppearanceModule = typeof import('../src/web/components/Appearance.tsx')
type WorkingModule = typeof import('../src/web/pages/WorkingPage.tsx')

let avatar: AvatarModule
let appearance: AppearanceModule
let working: WorkingModule

/** Whoever the browser says it is writing as, which is what the agent controls are drawn on. */
const store = new Map<string, string>()

beforeAll(async () => {
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  avatar = await import('../src/web/components/Avatar.tsx')
  appearance = await import('../src/web/components/Appearance.tsx')
  working = await import('../src/web/pages/WorkingPage.tsx')
})

// ============================================================================ the picture

describe('the picture beside a name', () => {
  it('draws the address the server gave, with the name as its label', () => {
    const html = renderToStaticMarkup(
      h(avatar.Avatar, { kind: 'agent', id: 'builder-x', name: 'Builder X', url: '/api/assets/a-picture' }),
    )

    expect(html).toContain('src="/api/assets/a-picture"')
    expect(html).toContain('alt="Builder X"')
    expect(html).toContain('data-picture="chosen"')
  })

  it('says in its own label that it fell back, rather than swapping pictures in silence', () => {
    // A CHOSEN PICTURE THAT WILL NOT LOAD IS A REAL STATE: an archive carries the row and never the
    // file. Drawing the product's own picture under the same name with nothing said is a breach of
    // the principle at the top of USER.md, "Never silently substitute semantics".
    expect(avatar.avatarLabel('Builder X', 'chosen')).toBe('Builder X')
    expect(avatar.avatarLabel('Builder X', 'drawn')).toContain('drawn by Mole Office')
    expect(avatar.avatarLabel('Builder X', 'drawn')).toContain('could not be loaded')
  })

  it('does not say a picture was drawn when nothing could be drawn', () => {
    // THE THIRD STATE, AND IT IS THE ONE THAT WAS BEING LIED ABOUT. The server hands back the
    // drawing whenever nobody uploaded anything, so a failed picture usually has no other picture to
    // fall back to; and an upload and a drawing can both fail. In both cases the old label announced
    // a swap that had not happened. Problem `YY3ryy7FEpK2`.
    const said = avatar.avatarLabel('Builder X', 'none')
    expect(said).toContain('Builder X')
    expect(said).toContain('could not be loaded')
    expect(said, 'the label claims a drawing that is not on the screen').not.toContain('drawn by Mole Office')
  })

  it('knows the address of the drawing to fall back to, from the id alone', () => {
    expect(avatarUrlFor(defaultAvatarAssetId({ kind: 'agent', id: 'builder-x' }))).toBe(
      '/api/assets/avatar-default-agent-builder-x',
    )
  })
})

// ============================================================================ the roster row

/** One row of the roster, with everything the registry gives it. */
function aRow(participant: WorkingRow['participant']): WorkingRow {
  return {
    agentId: 'rec-1',
    handle: 'builder-x',
    title: 'The record title nobody edits',
    agentState: 'active',
    runtime: 'claude-code',
    participant,
    workState: { state: null, word: null, says: 'nobody has said', answer: 'nothing-recorded', since: null, because: null, saidBy: null },
    presence: {
      agentId: 'rec-1',
      workspaceId: 'panelx',
      presence: 'offline',
      word: 'Offline',
      says: 'nothing is open',
      lastSeenAt: null,
      quietForMinutes: null,
      openAttachments: 0,
      liveRuns: 0,
      inputs: [],
    } as unknown as WorkingRow['presence'],
    doing: null,
    doingFrom: null,
    attachment: null,
    domains: [],
    overlaps: [],
    writeConflicts: 0,
    lastProgress: { at: null, from: 'nothing has been seen', agoMinutes: null },
    inThisStateMinutes: null,
  }
}

function aReading(rows: WorkingRow[]): WhoIsWorking {
  return {
    workspaceId: 'panelx',
    computedAt: '2026-09-04 09:00:00',
    rows,
    counts: { agents: rows.length, active: rows.length, retired: 0, withWorkState: 0, openDomains: 0, overlaps: 0, writeConflicts: 0 },
    unregistered: [],
    absences: [],
    note: 'One agent.',
    machinery: { resolverVersion: 'x', transitionStore: { exists: false, says: 'not built' } },
  }
}

describe('the roster row', () => {
  const registered = {
    id: 'builder-x',
    name: 'The one that reads code',
    avatarUrl: '/api/assets/avatar-default-agent-builder-x',
    state: 'reading the migration tests',
    stateAt: '2026-09-04 08:00:00',
    retired: false,
    retiredBecause: null,
      startedBy: null,
  }

  it('draws the picture, registry name and state, with the handle and runtime in Developer', () => {
    const html = renderToStaticMarkup(
      h(working.WorkingReading, { reading: aReading([aRow(registered)]), inspect: false }),
    )

    expect(html).toContain('/api/assets/avatar-default-agent-builder-x')
    // THE REGISTRY'S NAME AND NOT THE RECORD'S TITLE. A person may change one without touching the
    // other, and drawing the title over it would hide the edit they just made.
    expect(html).toContain('The one that reads code')
    expect(html).not.toContain('The record title nobody edits')
    // Plan 7FEOshq3mBGG keeps machine identity in Developer mode.
    expect(html).not.toContain('class="wrk-handle num"')
    expect(html).not.toContain('claude-code')
    const developer = renderToStaticMarkup(
      h(working.WorkingReading, { reading: aReading([aRow(registered)]), inspect: true }),
    )
    expect(developer).toContain('class="wrk-handle num">builder-x')
    expect(developer).toContain('claude-code')
    expect(html).toContain('reading the migration tests')
  })

  it('tells the two answers to "what is it doing" apart, and says whose words each is', () => {
    // THE ROW ANSWERS THIS TWICE AND THE TWO ANSWERS ARE DIFFERENT FACTS. One is the state the
    // agent set about itself in the registry; the other is the line the run serving it wrote. They
    // used to be drawn with no label and with absence lines in the same words, so a row said what
    // an agent was doing and then said it had not said what it was doing, four lines apart.
    // Problem `9C9UiAIUpLW2`. Neither may be drawn as the other, and neither may be unnamed.
    const html = renderToStaticMarkup(
      h(working.WorkingReading, { reading: aReading([aRow(registered)]), inspect: false }),
    )

    expect(html).toContain('Says about itself')
    expect(html).toContain('reading the migration tests')
    expect(html).toContain('Current work')
  })

  it('keeps the two missing answers under separate labels, as short marks', () => {
    const html = renderToStaticMarkup(
      h(working.WorkingReading, { reading: aReading([aRow({ ...registered, state: null, stateAt: null })]), inspect: false }),
    )

    // Plan 7FEOshq3mBGG: the labels distinguish the questions; ordinary emptiness is a mark.
    const self = html.match(/<p class="wrk-said-state">([\s\S]*?)<\/p>/)?.[1] ?? ''
    const doing = html.match(/<p class="wrk-doing">([\s\S]*?)<\/p>/)?.[1] ?? ''
    expect(self).toContain('Says about itself')
    expect(self).toMatch(/class="px-absent"[^>]*>—/)
    expect(doing).toContain('Current work')
    expect(doing).toMatch(/class="px-absent"[^>]*>—/)
    expect(html).not.toContain('it has set no state')
    expect(html).not.toContain('no run of it has written a line about its work')
  })

  it('marks a retired agent and gives the reason the record gave', () => {
    const html = renderToStaticMarkup(
      h(
        working.WorkingReading,
        {
          reading: aReading([aRow({ ...registered, retired: true, retiredBecause: 'The campaign it was for finished.' })]),
          inspect: false,
        },
      ),
    )

    expect(html).toContain('retired')
    expect(html).toContain('The campaign it was for finished.')
  })

  it('keeps the editor open when the page says it is open, and says what the last write landed', () => {
    // WHY THIS IS A TEST ABOUT A PROP. Every render here is a fresh mount, which is exactly what a
    // write causes: the write reloads the reading, the reading rebuilds every row. When the row
    // held "is my editor open" in its own state, a fresh mount was always closed — so changing a
    // name and then a picture cost two presses of Edit, and nothing said the first change had been
    // saved. Problem `01gd2UhM8FSB`. A static render can only draw this panel open if openness
    // comes from outside the row, so this assertion cannot pass with the state held inside it.
    const html = renderToStaticMarkup(
      h(working.WorkingReading, {
        reading: aReading([aRow(registered)]),
        inspect: false,
        editor: { openFor: 'builder-x', said: 'Name stored.' },
      }),
    )

    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Name stored.')

    // WHAT IS NOT HELD HERE, said plainly: this runner has no DOM, so nothing below presses the
    // button. What the press does with these two values is in AgentAppearance.tsx beside them.
  })

  it('leaves every other row closed, and draws one row line on nobody else', () => {
    const html = renderToStaticMarkup(
      h(working.WorkingReading, {
        reading: aReading([aRow(registered)]),
        inspect: false,
        editor: { openFor: 'somebody-else', said: 'Name stored.' },
      }),
    )

    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('Name stored.')
  })

  it('draws what the record says when nothing has mapped the agent, and no picture', () => {
    // ABSENCE BEATS A GUESS. A record written round the door has no registry row, and inventing a
    // picture for it would say somebody had chosen one.
    const html = renderToStaticMarkup(h(working.WorkingReading, { reading: aReading([aRow(null)]), inspect: false }))

    expect(html).toContain('The record title nobody edits')
    expect(html).not.toContain('/api/assets/')
  })
})

// ============================================================================ your own appearance

describe('your own picture, name and state', () => {
  const me: ParticipantOnTheWire = {
    kind: 'person',
    id: THE_TEST_OFFICES_OWNER.id,
    name: THE_TEST_OFFICES_OWNER.name,
    handle: THE_TEST_OFFICES_OWNER.id,
    avatarUrl: `/api/assets/avatar-default-person-${THE_TEST_OFFICES_OWNER.id}`,
    homeWorld: 'aaaaaaaaaaaaaaaa',
    state: null,
    stateAt: null,
    createdAt: '2026-09-04 09:00:00',
    // Nobody has set how this person wishes to be addressed, so no setter is recorded either. The server always sends both fields.
    addressAs: {},
    addressAsSetBy: null,
  }

  /** The panel as it is drawn with nothing being edited, which is how it opens. */
  const drawn = (chosen: 'online' | 'offline' | 'invisible' | null = null): string =>
    renderToStaticMarkup(
      h(appearance.YourAppearance, {
        person: me,
        // Nobody has chosen, which the control draws as the word a person who never chose is read
        // as. It is a third labelled line under Name and Status; the two below are still two.
        presence: chosen,
        busy: null,
        fault: null,
        onName: () => {},
        onState: () => {},
        onPresence: () => {},
        onPresenceForgotten: () => {},
        onPicture: () => {},
        onPicked: () => {},
      }),
    )

  it('draws the picture and two labelled lines, and no second name under the first', () => {
    const html = drawn()
    expect(html).toContain(`/api/assets/avatar-default-person-${THE_TEST_OFFICES_OWNER.id}`)
    // THIS PANEL: Name: on the right, and Status: under it. Criterion M37.
    expect(html).toContain(APPEARANCE_WORDS.name)
    expect(html).toContain(THE_TEST_OFFICES_OWNER.name)
    expect(html).toContain(APPEARANCE_WORDS.status)
    // A STATUS NOBODY SET SAYS SO, and says it as a value rather than as a sentence.
    expect(html).toContain(APPEARANCE_WORDS.noState)
    expect(html, 'the old sentence about an unset state is still drawn').not.toContain('No state set.')
    // AND THE HANDLE IS NOT DRAWN AS A SECOND NAME, the unclear lower-case name under the name.
    expect(html, 'the lower-case handle is drawn under the owner’s name again').not.toContain('app-handle')
  })

  it('draws whether the owner is here as a third line, with the word for nobody having chosen', () => {
    // PROBLEM D7tLqVTctD2L. This panel is where a person sets their own facts and it could not set
    // this one; the only control was inside the chat panel. A person who has never chosen is drawn
    // as the word the server reads them as, from the shared constant rather than from a word
    // written here, so the panel and the server cannot disagree about what the default is.
    const html = drawn()
    expect(html).toContain(APPEARANCE_WORDS.here)
    expect(html).toContain(PRESENCE_CHOICE_WORDS[PRESENCE_BEFORE_ANYBODY_CHOOSES].word)
    expect(html).toContain(`data-choice="${PRESENCE_BEFORE_ANYBODY_CHOOSES}"`)
    // AND THE THREE ARE NOT ALL DRAWN AT ONCE: no three buttons in view; they stay hidden.
    expect(html, 'the three choices are drawn before anybody presses the dot').not.toContain('menuitemradio')
  })

  it('offers a way back to not chosen only once something has been chosen', () => {
    // Six of a person's settings keep "nobody has chosen" apart from "chose the usual thing", and only the
    // status line could be put back. An offer to undo something that never happened is not an offer, so nothing is
    // drawn until there is a choice.
    expect(drawn(null), 'the way back is offered before anything was chosen').not.toContain(
      NOT_CHOSEN_WORDS.press,
    )
    expect(drawn('invisible')).toContain(NOT_CHOSEN_WORDS.press)
  })

  it('puts a pencil on each of the two lines and nothing else to press them with', () => {
    const html = drawn()
    expect(html).toContain(APPEARANCE_WORDS.editName)
    expect(html).toContain(APPEARANCE_WORDS.editStatus)
    // THE OLD FIELDS ARE GONE. They were a box always open under a heading, which is not what the owner
    // asked for: the line is drawn as a line and a pencil opens it.
    expect(html, 'the old always-open name field is still drawn').not.toContain('Your name')
    expect(html, 'the old always-open state field is still drawn').not.toContain('What you are doing')
    expect(html, 'the old placeholder is still drawn').not.toContain('or write your own')
  })

  it('changes the picture by pressing it, with no presses of its own underneath', () => {
    const html = drawn()
    expect(html).toContain(APPEARANCE_WORDS.changePicture)
    // THE PICTURE IS CHANGED BY A PRESS ON IT, not by two buttons under it; "Use the drawn one" is not needed. The file
    // chooser moved into the picker, which opens when the picture is pressed; "Use the drawn one"
    // is gone outright.
    expect(html, 'the file chooser is still a press on this panel').not.toContain('Choose a picture')
    expect(html, '"Use the drawn one" is still drawn').not.toContain('Use the drawn one')
    expect(html, 'the picker is open before the picture is pressed').not.toContain(PICKER_WORDS.heading)
  })
})
