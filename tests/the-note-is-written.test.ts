// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PERSON POINTED AT SOMETHING AND SAID SOMETHING, AND PANELX KEPT IT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG, MEASURED
 * ---------------------------------------------------------------------------------------
 *
 * Phase 3 built the annotation — the record that holds what somebody wrote against a thing — and
 * nothing in the browser wrote one. A full review in Chromium on 18 August 2026 (start a review,
 * select prose, right-click, type, press Add to review, reload) left
 * `GET /api/records?kind=annotation` empty: the composer was still writing a row in
 * `agent_messages`, which is round seven's shape and dies with the conversation.
 *
 * Two more things were measured in the same session, and they are the same defect seen from two
 * sides — the product asking who a comment is for before it will keep a single word:
 *
 *   BOTH PRESSES WERE REFUSED UNTIL AN AGENT WAS CHOSEN. "Say who this is for. Mole Office will not pick
 *   one for you" was the answer to somebody trying to write a remark on a paragraph. The design's
 *   rule is the opposite and is written in one line: an annotation is NEVER refused because of who
 *   it might be sent to.
 *
 *   AND THE RECIPIENT PANEL WAS ASKED ABOUT NOTHING. It named three kinds of thing by hand, so a
 *   comment on a block of a report, a row or a cell asked the ranking about nothing at all — and
 *   the panel then said "You did not point at anything, so nothing here is ranked" three inches
 *   below a chip naming the paragraph the person had pointed at. Every agent that had worked on
 *   that report was left off the list.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE HOLDS TO
 * ---------------------------------------------------------------------------------------
 *
 * There is no DOM in this runner, so what is checked is the request the browser builds and the
 * markup each component renders. The end-to-end version — right-click, type, press, and ask the
 * server what it stored — is tests/seven-surfaces.test.ts, which drives a real browser.
 */

import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { TARGET_KINDS, targetSpec, type Target, type TargetKind } from '../src/shared/targets.ts'
import type { Mark } from '../src/server/lib/agents.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { createI18n } from '../src/shared/i18n.ts'

const { t } = createI18n('en')

type Api = typeof import('../src/web/api.ts')
type Recipients = typeof import('../src/web/components/agent/Recipients.tsx')
type Talk = typeof import('../src/web/components/agent/TalkBox.tsx')
type Bar = typeof import('../src/web/components/agent/ReviewBar.tsx')
type Marks = typeof import('../src/web/components/agent/marks.ts')

let apiModule: Api
let recipients: Recipients
let talk: Talk
let bar: Bar
let marks: Marks
let review: typeof import('../src/web/lib/review.ts')

/** Every request the browser made while a test was running. */
interface Asked {
  url: string
  method: string
  body: unknown
}
let asked: Asked[] = []

beforeAll(async () => {
  // src/web/api.ts reads window.localStorage at module scope, exactly as tests/agent-talk.test.ts
  // says, so the smallest stand-in goes in before anything is imported. Nothing here is under test.
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage,
    sessionStorage: storage,
    location: { hash: '', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  // THE SERVER, STOOD IN FOR. What is under test is the request this browser builds, so the reply
  // is the smallest thing the caller reads and nothing here pretends to be Mole Office.
  ;(globalThis as unknown as { fetch: unknown }).fetch = (url: string, init?: RequestInit) => {
    asked.push({
      url,
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    })
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve({ record: { id: 'note-1' }, incomplete: [] }),
      text: () => Promise.resolve('{}'),
    })
  }
  apiModule = await import('../src/web/api.ts')
  recipients = await import('../src/web/components/agent/Recipients.tsx')
  talk = await import('../src/web/components/agent/TalkBox.tsx')
  bar = await import('../src/web/components/agent/ReviewBar.tsx')
  marks = await import('../src/web/components/agent/marks.ts')
  review = await import('../src/web/lib/review.ts')
})

const render = (el: React.ReactElement): string => renderToStaticMarkup(el)

/** One target of every kind, built from the declaration so no field name is typed out here. */
function anyTargetOf(kind: TargetKind): Target {
  const ids: Record<string, string> = { kind }
  for (const field of targetSpec(kind).identifies) ids[field.key] = field.example
  return ids as unknown as Target
}

// ============================================================================ the note is written

describe('a comment is written down as a note, and nobody has to be named', () => {
  it('writes a record of kind annotation holding the words exactly as they were typed', async () => {
    asked = []
    const context = {
      target: { kind: 'reportBlock' as const, recordId: 'LKJQbOhAK3kz', blockId: 'b-prose' },
      span: { quote: 'the mast moved', from: 45, to: 59, field: 'data.blocks[#b-prose].text' },
    }
    const words = 'This does not match the run log. Which of the two was measured?'
    await apiModule.api.writeAnnotation({ body: words, context })

    expect(asked.length, 'writing a note should be one request').toBe(1)
    const [wrote] = asked
    expect(wrote?.method).toBe('POST')
    expect(wrote?.url).toContain('/api/records')
    const sent = wrote?.body as { kind: string; title: string; data: Record<string, unknown> }
    // A COMMENT IS NOW A MESSAGE WITH A TARGET (criterion M1), which is what this asserts. What it
    // guards has not changed: the comment is stored as a record with the words in it, not as a
    // message inside a conversation with an agent, which is the row this test was written over.
    expect(sent.kind, 'a comment is stored as a record of its own, not as a message in a conversation').toBe('message')
    expect(sent.data['target'], 'a comment says what on a page it is about').toBeDefined()
    expect(sent.data['body'], 'the words are kept exactly as they were typed').toBe(words)
    expect(sent.data['target']).toEqual(context)
    // NO `state` IS WRITTEN, AND THE SCHEMA IS WHAT SAYS SO. `annotation.state` in GET /api/kinds
    // reads "NOTHING DECIDES ANYTHING FROM THIS FIELD, AND IT IS ON ITS WAY OUT … Do not write it."
    // This wrote `queued` there until 25 August 2026 while another browser file decided from it,
    // which is one fact stored in two places. Where a comment has got to is `agent_messages.state`.
    expect(sent.data['state'], 'the composer must not write the field the schema forbids').toBe(undefined)
    // NOTHING ABOUT A RECIPIENT IS WRITTEN, and nothing about one was needed to write it.
    expect(Object.keys(sent.data).sort()).toEqual(['body', 'target'])
    // The title is the first words of what was written, cut at a space.
    expect(sent.title).toBe('This does not match the run log. Which of the two was …')
  })

  it('refuses to write a comment down only for want of words, never for want of a recipient', () => {
    // THE COMPOSER IS DRAWN THROUGH THE OVERLAY HOST, which needs a document, so what this runner
    // can hold is the question behind the press. The press itself is proved in Chromium by
    // tests/seven-surfaces.test.ts, which writes seven comments without choosing anybody.
    expect(talk.whyNotWriteItDown('')).toBe('Write what you want to say first.')
    expect(talk.whyNotWriteItDown('   ')).toBe('Write what you want to say first.')
    // WORDS AND NOBODY CHOSEN IS A COMPLETE COMMENT. This is the assertion that goes red the moment
    // anything makes writing a note wait on a decision about who reads it.
    expect(
      talk.whyNotWriteItDown('The mast moved, and this paragraph does not say so.'),
      'a comment was refused because nobody had been chosen for it',
    ).toBe(null)
  })

  it('still refuses to SEND with nobody chosen, because sending to nobody is not a thing', () => {
    const words = 'The mast moved, and this paragraph does not say so.'
    expect(talk.whyNotSendIt(words, null)).toBe(t('talk.sayWhoFirst'))
    expect(talk.whyNotSendIt('', null)).toBe('Write what you want to say first.')
    // THE CHOOSER IS THE CHAT'S OWN CONTACTS, criterion W4: a person or a registered agent, never a
    // session. With one chosen and words written, the send goes.
    const aContact: { kind: 'agent'; id: string } = { kind: 'agent', id: 'builder-aa' }
    expect(talk.whyNotSendIt(words, aContact)).toBe(null)
  })
})

// ============================================================================ who it could go to

describe('the agents a comment could go to are ranked against the record it is in', () => {
  it('asks about the record for every kind of thing that names one', () => {
    const asksAbout = (kind: TargetKind) => apiModule.rankingAsk({ target: anyTargetOf(kind) })
    for (const kind of TARGET_KINDS) {
      const holdsRecord = targetSpec(kind).recordIdentifier
      const ask = asksAbout(kind)
      if (holdsRecord !== null) {
        // A THING INSIDE A RECORD IS ASKED ABOUT AS THAT RECORD. This is the assertion that fails
        // when the mapping goes back to naming three kinds by hand: a block of a report, a row, a
        // cell, a node of a drawing and a note somebody left all carry a record id and all of them
        // were sent as nothing.
        const ids = anyTargetOf(kind) as unknown as Record<string, string>
        expect(ask, `pointing at a ${targetSpec(kind).noun} asked the ranking about nothing`).toEqual({
          kind: 'record',
          recordId: ids[holdsRecord],
        })
        continue
      }
      if (kind === 'planLine') {
        expect(ask).toEqual({ kind: 'planLine', planId: 'mJoNrYYP2XUb', lineId: 'He5aXRn5kzyH' })
        continue
      }
      if (kind === 'planLineFact') {
        expect(ask).toEqual({ kind: 'planLine', planId: 'mJoNrYYP2XUb', lineId: 'He5aXRn5kzyH' })
        continue
      }
      if (kind === 'scheduleBlock') {
        expect(ask).toEqual({ kind: 'scheduleBlock', windowId: 'w7dQ2Kx1mBvA' })
        continue
      }
      // NOTHING IS A REAL ANSWER for a page, a whole plan, a message and an unsent instruction:
      // nothing Mole Office holds says which agent worked on one, and guessing would be worse.
      expect(ask, `pointing at a ${targetSpec(kind).noun} should ask about nothing`).toBe(null)
    }
  })

  it('puts the record id on the request when a comment is on a paragraph of a report', async () => {
    asked = []
    await apiModule.api.agentRecipients({
      target: { kind: 'reportBlock', recordId: 'LKJQbOhAK3kz', blockId: 'b-prose' },
      span: { quote: 'the mast moved', from: 45, to: 59, field: 'data.blocks[#b-prose].text' },
    })
    expect(asked[0]?.url).toContain('/api/agent/recipients?record=LKJQbOhAK3kz')
  })


})


// ============================================================================ what is waiting

describe('the comments somebody has written and nobody has sent', () => {
  /**
   * One stored comment. `id` is a parameter because whether a comment has gone out is now answered
   * BY ID, from the server's list, rather than read off the record.
   */
  const noteOf = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    kind: 'annotation' as const,
    workspaceId: 'panelx',
    ownerId: THE_TEST_OFFICES_OWNER.id,
    title: 'Which number was measured?',
    summary: null,
    data: {
      body: 'Which number was measured?',
      context: { target: { kind: 'reportBlock', recordId: 'r1', blockId: 'b-1' } },
      ...over,
    },
    createdAt: '2026-08-18 10:00:00',
    updatedAt: '2026-08-18 10:00:00',
    deletedAt: null,
    incompleteCount: 0,
    writtenOrder: 1,
  })
  const note = (over: Record<string, unknown> = {}) => noteOf('n1', over)

  /**
   * A COMMENT WRITTEN THE WAY THE SCHEMA NOW INSTRUCTS: no `state` field at all.
   *
   * `annotation.state` in GET /api/kinds says "NOTHING DECIDES ANYTHING FROM THIS FIELD … Do not
   * write it", and since 25 August 2026 the composer does not. `annotation` is not human-only, so
   * an agent following the schema writes exactly this shape too.
   */
  const noteWithNoState = (id: string) => {
    const built = noteOf(id)
    const { state: _dropped, ...rest } = built.data as Record<string, unknown>
    return { ...built, data: rest }
  }

  it('reads the ones still waiting and counts the ones it cannot read', () => {
    const read = marks.notesWaiting(
      [noteOf('n1'), noteOf('n2'), noteOf('n3', { body: 42 }), noteOf('n4', { context: null })],
      ['n2'],
    )
    // A SENT COMMENT IS READ TOO, AND THIS TEST USED TO REQUIRE THAT IT WAS NOT.
    //
    // Skipping it meant a comment vanished from the thing it was left on at the moment its result
    // started to matter: a report carrying four comments, one of them sent, drew "3 comments
    // waiting" and the fourth was nowhere. That is the design's "handled comments remain
    // inspectable" broken, and the contract's "the value works in one view and disappears from the
    // other". Both are now read; each says which it is, and the mark draws them differently.
    expect(read.notes.length).toBe(2)
    expect(read.notes[0]?.body).toBe('Which number was measured?')
    // WHICH ONE HAS GONE IS THE SERVER'S LIST AND NOT THE RECORD'S FIELD. Both records say
    // `state: 'queued'`; the second is in the list, so it is the one that has gone out.
    expect(read.notes[0]?.sent).toBe(false)
    expect(read.notes[1]?.sent).toBe(true)
    // A COMMENT THAT CANNOT BE READ IS COUNTED, never dropped quietly.
    expect(read.unreadable).toBe(2)
  })

  it('reads a comment that has no state field at all, and says whether it has gone from the one store', () => {
    // THIS IS THE SHAPE THE PRODUCT NOW WRITES, AND IT USED TO BE DROPPED ON THE FLOOR.
    //
    // The old reader kept a record only when `data.state` read `queued` or `sent`. A comment with
    // no state failed that test, so it was drawn nowhere and was not counted as unreadable either:
    // somebody's own words, stored and invisible, with no number saying anything was missing.
    const read = marks.notesWaiting([noteWithNoState('n1'), noteWithNoState('n2')], ['n2'])
    expect(read.notes.length, 'a comment with no state field is still a comment').toBe(2)
    expect(read.unreadable, 'and it is not unreadable — it reads perfectly well').toBe(0)
    expect(read.notes[0]?.sent, 'nothing has carried n1, so it is still waiting').toBe(false)
    expect(read.notes[1]?.sent, 'the server says n2 has gone out').toBe(true)
    // AND IT IS DRAWN ON THE THING IT WAS LEFT ON, which is the whole point of reading it.
    const drawn = marks.marksOfNotes(read.notes)
    expect(drawn.length).toBe(1)
    expect(drawn[0]?.key).toBe('reportBlock/r1/b-1')
    expect(drawn[0]?.waiting).toBe(1)
    expect(drawn[0]?.sent).toBe(1)
  })

  it('a comment that has gone out is drawn as gone even though its record still reads queued', () => {
    // THE REGRESSION THIS PAIR OF FILES CARRIED FOR A WHOLE WAVE. Every writer of `state: 'sent'`
    // on the record was deleted, so a sent comment reads `queued` there for ever. A reader on that
    // field draws it as still waiting; a reader on the one store draws it as gone.
    const stillSaysQueued = noteOf('n1', { state: 'queued' })
    const read = marks.notesWaiting([stillSaysQueued], ['n1'])
    expect(read.notes[0]?.sent).toBe(true)
    const drawn = marks.marksOfNotes(read.notes)
    expect(drawn[0]?.waiting, 'it is not waiting on anybody').toBe(0)
    expect(drawn[0]?.sent).toBe(1)
  })

  it('marks the thing a waiting note points at, so a comment is not stored and then invisible', () => {
    const read = marks.notesWaiting([noteOf('n1'), noteOf('n2')], [])
    const fromNotes = marks.marksOfNotes(read.notes)
    expect(fromNotes.length).toBe(1)
    expect(fromNotes[0]?.key).toBe('reportBlock/r1/b-1')
    expect(fromNotes[0]?.waiting).toBe(2)
    // And a mark from a queued message about the same thing is added to it rather than replacing it.
    const fromMessages: Mark[] = [
      { key: 'reportBlock/r1/b-1', target: fromNotes[0]!.target, waiting: 1, threads: [], spans: [] },
    ]
    const both = marks.bothKinds(fromMessages, fromNotes)
    expect(both.length).toBe(1)
    expect(both[0]?.waiting).toBe(3)
  })

  it('draws a waiting note with its words and says nobody has been chosen for it', () => {
    const drawn = render(
      h(bar.NoteWaiting, {
        note: {
          id: 'n1',
          body: 'The mast moved, and this paragraph does not say so.',
          context: {
            target: { kind: 'reportBlock' as const, recordId: 'r1', blockId: 'b-1' },
            span: { quote: 'the mast moved', from: 45, to: 59, field: 'data.blocks[#b-1].text' },
          },
          sent: false,
        },
        chosen: null,
        carried: false,
        // Nothing has gone and no membership is written down, so the words may still be changed;
        // collecting has finished, so this comment may be handed to an agent.
        mayChange: true,
        mayGo: true,
        editing: false,
        onEditing: () => {},
        onChoose: () => {},
      }),
    )
    expect(drawn).toContain('The mast moved, and this paragraph does not say so.')
    expect(drawn).toContain('the mast moved')
    expect(drawn).toContain('Block of a report')
    // NOT A WARNING. No recipient chosen is the ordinary state of a comment somebody has just written.
    expect(drawn).toContain(t('review.pane.read.nobodyChosen'))
    expect(drawn).toContain('Choose a recipient')
  })
})
