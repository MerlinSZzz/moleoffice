// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REPORTS AND NOTES LIST, PHOTOGRAPHED, AND THE RAIL ROW THAT SAYS WHAT IT HOLDS.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS IS A BROWSER TEST AND NOT A RENDER
 * ---------------------------------------------------------------------------------------
 *
 * Criterion E1 is about what a person meets: the list called Reports and notes must not draw a
 * message, and a message must still be reachable in the chat and at `#/messages`. A render to
 * static markup can prove the family no longer holds `message` and that NotesPage drops one it is
 * handed, but it cannot prove that the running product — the family filter, the page, the rail —
 * together show the report and the note and hide the message. This file opens the real page in a
 * real browser against a fixture holding one of each, and looks.
 *
 * It also holds the two pictures the handback names: the list at 1440 and 390 in light and dark,
 * and the rail beside it. When `NOTES_LIST_SHOTS` names a directory the pictures are written
 * there; without it the assertions still run and no file is made.
 */

import { mkdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { liveApp, type LiveApp } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

let live: LiveApp

/** Every write this fixture makes is the owner's, on the stated default project. */
const OWNER = { 'content-type': 'application/json', 'x-mole-office-workspace': 'default' }

async function file(kind: string, title: string, data: Record<string, unknown>, origin: Record<string, string> = OWNER): Promise<void> {
  const res = await fetch(`${live.api}/api/records`, {
    method: 'POST',
    headers: origin,
    body: JSON.stringify({ kind, title, data }),
  })
  expect(res.status, await res.clone().text()).toBe(201)
}

beforeAll(async () => {
  live = await liveApp({ name: 'notes-list-handback', viewport: { width: 1440, height: 1000 } })
  // AN AGENT THE REGISTRIES HOLD, so the message has a sender and the addressee gate is passed.
  await file('agent', 'Fixture writer', { handle: 'fixture-writer', runtime: 'claude-code', state: 'active' })
  // THE FOUR THE PICTURE HAS TO TELL APART. A report and a note are what the list holds; an
  // annotation stays with them (the secretary's line of 15 September: take `message` out and nothing else);
  // and the message must be nowhere on this page even though the project holds one.
  await file('report', 'Round four, measured', {
    for: THE_PERSON,
    date: '2026-09-15',
    blocks: [{ id: 'b-1', type: 'text', heading: 'What was found', text: 'The reach held for two hundred targets.' }],
  })
  await file('note', 'Wednesday morning', {
    date: '2026-09-15',
    body: 'The setting-14 print is still holding, so the sweep can wait for the PLA answer.',
  })
  await file('annotation', 'On the reach figures', {
    body: 'The second row is the one I do not trust yet.',
  })
  await file(
    'message',
    'The sweep is held for you',
    { body: 'Holding the sweep until you say whether to try PLA.', to: [{ kind: 'person', id: THE_PERSON }] },
    { ...OWNER, 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': 'fixture-writer' },
  )
}, 180_000)

afterAll(async () => {
  await live?.stop()
})

describe('the running Reports and notes list holds reports and notes, and not messages', () => {
  it('draws the report and the note, leaves the annotation and the message out, and says where messages are', async () => {
    await live.page.goto(`${live.site}/#/notes`, { waitUntil: 'domcontentloaded' })
    await live.page.getByText('Round four, measured').first().waitFor({ timeout: 30_000 })

    const text = (await live.page.textContent('body')) ?? ''
    expect(text, 'the report is not on the list').toContain('Round four, measured')
    expect(text, 'the note is not on the list').toContain('Wednesday morning')
    // CRITERION CHANGE: Reports lists only reports and notes, as question 9 of report n9Mjk3c_sJRu
    // says. So the annotation is not on it now.
    expect(text, 'an annotation is on the Reports page, which lists only reports and notes').not.toContain('On the reach figures')
    expect(text, 'a message is drawn on the Reports and notes list again').not.toContain('The sweep is held for you')
    expect(text, 'the message body is drawn here').not.toContain('Holding the sweep until you say')
    // AND THE PAGE LEADS A READER TO WHERE MESSAGES ARE, rather than leaving them unfindable.
    // Criterion change, by a decision. This was `expect(text).toContain('Messages')` over
    // the whole body, and the only 'Messages' there was the sidebar's Messages row. That row is gone:
    // messages are read in the chat, which filters by project, and the chat opens the Messages page.
    // So the page itself must say so. The pointer is looked for inside the page, not the sidebar.
    const pointer = live.page.locator('.rpts-where')
    expect(await pointer.count(), 'the page no longer says where messages are').toBe(1)
    expect(await pointer.textContent(), 'the pointer does not say that messages are read in the chat').toContain(
      'Messages are read in the chat',
    )
    expect(await pointer.locator('a[href="#/chat"]').textContent(), 'the pointer does not lead to the chat').toBe('Chat')
    expect(await pointer.locator('a[href="#/messages"]').textContent(), 'the pointer does not lead to the Messages page').toBe(
      'Messages',
    )

    // THE RAIL ROW'S OWN SENTENCE SAYS WHAT THE LIST HOLDS, and it is the row's `title`.
    const sentence = await live.page.locator('a.shell-link[href="#/notes"]').getAttribute('title')
    // CRITERION CHANGE, 28 September 2026: the page reads every project, not the selected one.
    expect(sentence, 'the rail row no longer says what the list holds').toBe(
      'Reports and notes of every project.',
    )

    const shots = process.env['NOTES_LIST_SHOTS']
    if (shots === undefined) return
    mkdirSync(shots, { recursive: true })
    for (const width of [1440, 390] as const) {
      for (const theme of ['light', 'dark'] as const) {
        await live.page.setViewportSize({ width, height: 1000 })
        await live.page.emulateMedia({ colorScheme: theme })
        await live.page.screenshot({
          path: `${shots}/notes-list-${String(width)}-${theme}.png`,
          fullPage: true,
        })
        // AND THE RAIL ON ITS OWN, so the row and its neighbours are readable in the picture.
        // At 390 the sidebar is a DRAWER and takes no width until it is opened, so the menu press
        // is what puts it on screen; at 1440 it is already in the flow. A taller window is used for
        // this one shot so the whole column fits: the row this handback is about sits below the
        // fold at 1000, and a picture that cuts it off would not show the sentence's row.
        await live.page.setViewportSize({ width, height: 1600 })
        if (width < 1024) await live.page.click('.shell-menu')
        await live.page.locator('.shell-side').screenshot({
          path: `${shots}/rail-${String(width)}-${theme}.png`,
        })
        if (width < 1024) await live.page.keyboard.press('Escape')
      }
    }
  }, 180_000)
})
