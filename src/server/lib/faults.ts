// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FAULT ON A PAGE IS FILED AS A PROBLEM, ONCE PER FAULT PER READING. Criterion E4, the filing half.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * perm-5a built the drawing half: a page that stops while it is being drawn says so where the page
 * was, and a press that stops says so beside the press. Both drew the words and wrote nothing, so a
 * fault the owner met on Sunday was gone on Monday unless they had told somebody.
 *
 * Criterion E4 in design/entries/ACCEPTANCE.md: the loud failure
 * carries its words, and it is written to the office as a problem with the page, the press and the
 * words, so the owner never has to open a browser console.
 *
 * ---------------------------------------------------------------------------------------
 * THE OFFICE FILES IT, NOT THE READER AND NOT THE PERSON
 * ---------------------------------------------------------------------------------------
 *
 * The browser writes as the person: its requests carry `human` and the person's name, because a browser is
 * where they work. A problem filed with those headers would say THE PERSON found and reported the fault,
 * which is a false name in a permanent change log about something no person did.
 *
 * So this writes as `mole-office/the-api-server` — the name this server already writes under when it
 * acts on its own, which src/server/lib/inspection.ts uses for the same reason and which no registry
 * holds. The route does not pass the caller's actor in at all, so there is no way for the attribution
 * to come from the request.
 *
 * ---------------------------------------------------------------------------------------
 * ONCE PER FAULT PER READING, AND WHY THE READING IS THE BROWSER'S TO NAME
 * ---------------------------------------------------------------------------------------
 *
 * A fault while drawing happens again on every re-render, and React re-renders a page many times a
 * second while somebody moves the pointer over it. Filing each one would put a hundred identical
 * problems in front of them, which is the opposite of what E4 asks for.
 *
 * The same fault is: the same message, on the same page, within one reading. A READING is one
 * browser tab from the moment the page is opened until the tab is closed; the browser makes an id
 * for it and keeps it in `sessionStorage`, so a reload is the same reading and a second tab is a
 * different one. The server cannot work that out for itself — every request from one tab looks like
 * every request from another — so the browser names it and this stores the name it was given.
 *
 * A REPEAT IS ANSWERED WITH THE PROBLEM THAT IS ALREADY THERE, never with silence: the panel draws
 * the problem's id either way, so a reader who meets the fault twice is pointed at the same record
 * rather than at nothing the second time.
 */

import { createRecordWithReport, listRecords, type Actor } from './records.ts'

/**
 * WHO FILES A FAULT. The office itself, and it is not the caller.
 *
 * `mole-office/the-api-server` is the name this server writes under when it acts on its own; no
 * registry holds it and none ever will. src/server/lib/inspection.ts declares the same actor for
 * the same reason, and both say so out loud rather than sharing a constant across two subjects that
 * have nothing else in common.
 */
const THE_OFFICE: Actor = { type: 'agent', id: 'mole-office/the-api-server' }

/** Where a filed fault's own facts live on the problem record. */
export const THE_FAULT_ON_A_PROBLEM = 'theFault'

/** What the browser saw, as it reaches this file. Every field is the browser's own word for it. */
export interface AFaultOnAPage {
  /** The fault's own message, unchanged. Never rewritten and never shortened. */
  message: string
  /** The page it happened on, by the name the reader sees in the rail. */
  page: string | null
  /** The press that led there, or null because nothing on the page had been pressed. */
  press: string | null
  /** The address the reader was at, as the browser's own hash. */
  route: string | null
  /** Which reading of the product this was: one browser tab, from opening to closing. */
  reading: string
  /** Whether it stopped while the page was drawn or while a press was sending. */
  what: 'while-drawing' | 'while-sending'
}

/** What filing one answered with. */
export interface TheFaultWasFiled {
  /** The problem record holding this fault. */
  problem: string
  /** True when this request wrote it, false when the same fault in this reading already had one. */
  filed: boolean
  /** One sentence for a reader, saying which of the two happened. */
  says: string
}

/**
 * WHAT THE PROBLEM IS CALLED, in the words a person reads in a list.
 *
 * The page and what stopped, and never the fault's own message: a message is a developer's sentence,
 * often a hundred characters of it, and a list of problems titled with those is a list nobody scans.
 * The message is the first thing in the symptom instead, where it has room.
 */
export function titleOfAFault(fault: AFaultOnAPage): string {
  const where = fault.page === null ? 'A page' : `The ${fault.page} page`
  return fault.what === 'while-drawing'
    ? `${where} stopped while it was being drawn`
    : `A press on ${fault.page === null ? 'a page' : `the ${fault.page} page`} stopped before it finished`
}

/** The symptom, which is the whole of what the browser could see, in order of use to a reader. */
export function symptomOfAFault(fault: AFaultOnAPage): string {
  const lines = [
    fault.what === 'while-drawing'
      ? 'The page stopped while it was being drawn, so what the reader was looking at was replaced by the fault.'
      : 'A press stopped before it finished, and the rest of the page stayed as it was.',
    `The fault said: ${fault.message}`,
    fault.page === null ? 'Nobody named the page.' : `The page: ${fault.page}.`,
    fault.press === null
      ? 'Nothing on the page had been pressed when it stopped.'
      : `The press that led there: ${fault.press}.`,
    fault.route === null ? 'Nobody recorded the address.' : `The address the reader was at: ${fault.route}.`,
  ]
  return lines.join('\n')
}

/**
 * THE PROBLEM THIS FAULT ALREADY HAS IN THIS READING, or null because it has none.
 *
 * It reads the problems of this project and compares three stored fields. A query on JSON inside a
 * column would be faster and would tie this rule to SQLite's own JSON functions; the number of
 * problems in a project is in the hundreds, and reading them is what every other reader here does.
 */
function theProblemThisFaultAlreadyHas(workspaceId: string, fault: AFaultOnAPage): string | null {
  for (const row of listRecords({ workspaceId, kind: 'problem' })) {
    const extra = (row.data as { extra?: unknown } | undefined)?.extra
    if (typeof extra !== 'object' || extra === null) continue
    const said = (extra as Record<string, unknown>)[THE_FAULT_ON_A_PROBLEM]
    if (typeof said !== 'object' || said === null) continue
    const its = said as Partial<AFaultOnAPage>
    if (its.reading === fault.reading && its.message === fault.message && (its.page ?? null) === fault.page) {
      return row.id
    }
  }
  return null
}

/**
 * FILE ONE FAULT, or answer with the problem this reading already filed for it.
 *
 * NOTHING ABOUT THE CALLER REACHES THE RECORD. The actor is this file's own, the words are the
 * browser's, and the route hands over neither the person's headers nor the reader's name.
 */
export function fileAFault(workspaceId: string, fault: AFaultOnAPage): TheFaultWasFiled {
  const already = theProblemThisFaultAlreadyHas(workspaceId, fault)
  if (already !== null) {
    return {
      problem: already,
      filed: false,
      says:
        'This fault was already filed in this reading of the product, so nothing new was written. The problem ' +
        `holding it is ${already}.`,
    }
  }
  const made = createRecordWithReport({
    workspaceId,
    kind: 'problem',
    title: titleOfAFault(fault),
    summary: fault.message,
    data: {
      symptom: symptomOfAFault(fault),
      state: 'open',
      // WHO FOUND IT, in words rather than as an id: nobody found this. A page stopped and the
      // office wrote down what it stopped with, which is a different sentence from a person or an
      // agent noticing something.
      found_by: 'the office, when the page stopped in front of a reader',
      whose_move: 'agent',
      // WHERE IT WAS SEEN. The address, because that is what somebody else needs to open to meet it.
      ...(fault.route === null ? {} : { seen_in: [fault.route] }),
      // AND THE FAULT'S OWN FACTS, kept apart from the prose so a second reading of the same fault
      // can be recognised without reading English. `extra` is the `problem` kind's declared place
      // for what has no field of its own, and inventing a key beside it would be refused.
      extra: {
        [THE_FAULT_ON_A_PROBLEM]: {
          message: fault.message,
          page: fault.page,
          press: fault.press,
          route: fault.route,
          reading: fault.reading,
          what: fault.what,
        },
      },
    },
    actor: THE_OFFICE,
  })
  return {
    problem: made.record.id,
    filed: true,
    says: `The office filed this fault as problem ${made.record.id}. Nothing you were reading was written to.`,
  }
}
