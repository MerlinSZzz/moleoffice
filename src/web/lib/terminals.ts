// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A PAGE REACHES THE OFFICE'S TERMINALS. Wave 13u, round 2.
 *
 * The doors are in src/server/api/terminals.ts, and the shapes they answer are in src/shared/terminals.ts.
 * Every door is the person's only. This file is the one place a page asks them, so the terminal
 * management page and an agent's profile page read the same way.
 *
 * READING A TERMINAL is a GET that stays open, carrying server-sent events: first `screen`, the terminal's
 * screen as it is now with the lines above it, then `output` and `resized` as they come, then `ended` or `closed`. It is
 * read with fetch rather than EventSource, as the page's own channel is (src/web/lib/channel.ts), because
 * only fetch carries the office's headers and the page's cookie. It is not counted as a request in
 * flight, because it never settles: the page would never be marked ready.
 *
 * TYPING is a POST per batch of keys, one at a time. Keys pressed while a POST is out wait, and go
 * together in the next one, so they reach the terminal in the order they were pressed (the doors' header
 * says why two POSTs at once could arrive in either order).
 */

import { t } from '@shared/i18n.ts'
import type { AnAgentsQuickInputs } from '@shared/quick-inputs.ts'
import type {
  AnAgentsPane,
  AnAgentsSteps,
  AWayBack,
  TerminalReading,
  TheHolderAsShown,
  TheHolderRestarted,
  TheKeeping,
  TheLastLine,
  TheTerminalsNow,
  TypedFrom,
} from '@shared/terminals.ts'
import { HOME_MOVED_HEADER } from '../../config/visit-headers.mjs'
import { ApiError, moleOfficeHeaders, moleOfficeRequest, readFault } from '../api.ts'
import { theRefusalInWords } from '../components/ui.tsx'
import { whereRequestsGo } from './visiting.ts'
import { theWorldThatAnswered, WORLD_HEADER } from './world.ts'

/**
 * WHAT A REFUSED REQUEST SAYS, in the page's language when the server gave the refusal a code
 * (src/shared/refusal-codes.ts, TERMINAL_REFUSAL_CODES), and in its own sentence otherwise.
 */
export function whatARefusalSays(err: unknown): string {
  if (err instanceof ApiError) return theRefusalInWords(err.message, err.fault)
  return err instanceof Error ? err.message : String(err)
}

/** Every terminal, and where the holder stands. */
export function theTerminals(): Promise<TheTerminalsNow> {
  return moleOfficeRequest<TheTerminalsNow>('/api/terminals')
}

/** What opening an agent in a terminal answers (src/server/lib/terminal-agents.ts, AnAgentOpened). Never a key. */
export interface AnAgentOpened {
  terminal: TerminalReading
  session: string
  key: { given: boolean; says: string }
  says: string
}

/** Open a registered agent in a terminal the office holds, in its start folder (POST /api/terminals/agents). */
export function openTheAgentInATerminal(agent: string, cols?: number, rows?: number): Promise<AnAgentOpened> {
  return moleOfficeRequest('/api/terminals/agents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agent, ...(cols === undefined ? {} : { cols }), ...(rows === undefined ? {} : { rows }) }),
  })
}

/** The way back to an agent's newest run: its command, and what the press would do now (GET …/way-back). Wave 13u, round 10. */
export function theWayBack(agent: string): Promise<AWayBack> {
  return moleOfficeRequest(`/api/terminals/agents/${encodeURIComponent(agent)}/way-back`)
}

/** Run the way back to that run in a terminal the office holds (POST …/way-back). `session` is the run's record. */
export function bringItBack(agent: string, session: string, cols?: number, rows?: number): Promise<AnAgentOpened> {
  return moleOfficeRequest(`/api/terminals/agents/${encodeURIComponent(agent)}/way-back`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ session, ...(cols === undefined ? {} : { cols }), ...(rows === undefined ? {} : { rows }) }),
  })
}

/** Where an agent's tmux pane is, and the office's view of it if one is open (GET …/pane). Way B. */
export function thePaneOf(agent: string): Promise<AnAgentsPane> {
  return moleOfficeRequest(`/api/terminals/agents/${encodeURIComponent(agent)}/pane`)
}

/** Show an agent's tmux pane in a terminal the office holds (POST …/pane). A view already open is answered with opened false. */
export function showThePaneOf(agent: string): Promise<{ opened: boolean; view: TerminalReading; pane: AnAgentsPane['pane'] }> {
  return moleOfficeRequest(`/api/terminals/agents/${encodeURIComponent(agent)}/pane`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
}

/** A sandboxed run's steps since the offset `after`, or from the start of the run when it is null (GET …/steps). Way C. */
export function theStepsOf(agent: string, after: number | null): Promise<AnAgentsSteps> {
  return moleOfficeRequest(`/api/terminals/agents/${encodeURIComponent(agent)}/steps${after === null ? '' : `?after=${String(after)}`}`)
}

/** The newest `limit` quick inputs asked for one agent, and when the next may be typed for it (GET /api/office/quick-inputs/asks). Wave 13u, round 21. */
export function theQuickInputAsksOf(agent: string, limit: number): Promise<AnAgentsQuickInputs> {
  return moleOfficeRequest(`/api/office/quick-inputs/asks?agent=${encodeURIComponent(agent)}&limit=${String(limit)}`)
}

/** Open the person's shell in a terminal the office holds: in the folder they named, or in their home folder when they named none (POST /api/terminals). */
export function openAShell(folder?: string): Promise<{ terminal: TerminalReading }> {
  return moleOfficeRequest('/api/terminals', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(folder === undefined ? {} : { folder }),
  })
}

/** Give a terminal a new size. Every reader of it sees the new size. */
export function resizeTheTerminal(id: string, cols: number, rows: number): Promise<{ terminal: TerminalReading }> {
  return moleOfficeRequest(`/api/terminals/${encodeURIComponent(id)}/resize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cols, rows }),
  })
}

/** End a terminal if it runs, and let the holder forget it. */
export function closeTheTerminal(id: string): Promise<{ closed: string; wasRunning: boolean }> {
  return moleOfficeRequest(`/api/terminals/${encodeURIComponent(id)}/close`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  })
}

/**
 * A TYPIST FOR ONE TERMINAL: `type` hands it keys, and it sends them one POST at a time, in order.
 * `onRefused` is told the sentence of a POST that was refused; the keys of that POST are not sent again.
 */
export function aTypist(id: string, onRefused: (sentence: string) => void): { type: (data: string) => void } {
  let waiting = ''
  let out = false
  const sendWhatWaits = async (): Promise<void> => {
    if (out || waiting === '') return
    const data = waiting
    waiting = ''
    out = true
    try {
      await moleOfficeRequest(`/api/terminals/${encodeURIComponent(id)}/input`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data }),
      })
    } catch (err) {
      onRefused(whatARefusalSays(err))
    } finally {
      out = false
    }
    await sendWhatWaits()
  }
  return {
    type: (data) => {
      waiting += data
      void sendWhatWaits()
    },
  }
}

/** What reading a terminal tells its reader, in order. */
export interface TerminalReader {
  /** The terminal, and its screen as it is now, written out for a fresh terminal to replay. */
  onScreen: (terminal: TerminalReading, screen: string) => void
  onOutput: (data: string) => void
  /** The terminal was given a new size, by this reader or another: every reader draws the one size. */
  onResized: (cols: number, rows: number) => void
  onEnded: (exit: { code: number; signal: number | null }) => void
  /** Somebody closed the terminal. The stream ends. */
  onClosed: () => void
  /** The holder ended the stream: it stopped, or this reader fell too far behind. The stream ends. */
  onGone: (says: string) => void
  /** The stream could not be opened, or broke: a refusal's sentence, or what went wrong. */
  onFailed: (sentence: string) => void
  /**
   * Where the terminal's typing came from: with the screen, and again each time an input is counted, by
   * point (d) of a decision. A reader that does not draw it leaves it out.
   */
  onTypedFrom?: (typedFrom: TypedFrom) => void
}

/** One server-sent event: its name and its data lines joined. */
function theEventsIn(block: string): { name: string; data: string } | null {
  if (block.startsWith(':')) return null
  let name = 'message'
  const data: string[] = []
  for (const line of block.split('\n')) {
    if (line.startsWith('event: ')) name = line.slice(7)
    else if (line.startsWith('data: ')) data.push(line.slice(6))
  }
  return data.length === 0 ? null : { name, data: data.join('\n') }
}

/**
 * READ ONE TERMINAL until `stop` is aborted or the stream ends. It does not open the stream again by
 * itself: a reader that wants to go on reads again, and is given the screen afresh.
 */
export async function readTheTerminal(id: string, reader: TerminalReader, stop: AbortSignal): Promise<void> {
  const headers = moleOfficeHeaders()
  headers.set('accept', 'text/event-stream')
  let res: Response
  try {
    res = await fetch(whereRequestsGo(`/api/terminals/${encodeURIComponent(id)}/stream`), { headers, credentials: 'include', signal: stop })
  } catch (err) {
    if (!stop.aborted) reader.onFailed(err instanceof Error ? err.message : String(err))
    return
  }
  // A STREAM FROM ANOTHER WORLD IS NOT DRAWN. theWorldThatAnswered puts the page's own banner up. IT IS
  // HANDED THE REPLY'S MOVED-HOME HEADER, as the transport hands it (criterion DF28). So during this page's
  // own move, a reply from the moved office is read as this page's new home, and the terminal is drawn.
  if (theWorldThatAnswered(res.headers.get(WORLD_HEADER), res.headers.get(HOME_MOVED_HEADER)) !== null) {
    void res.body?.cancel()
    reader.onFailed(t('terminals.view.otherWorld'))
    return
  }
  if (!res.ok || res.body === null) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      // The refusal had no body this could read; readFault then says what can be said from the status.
    }
    const fault = readFault(res.status, `/api/terminals/${id}/stream`, body)
    reader.onFailed(theRefusalInWords(fault.message, fault))
    return
  }
  const body = res.body.getReader()
  const decoder = new TextDecoder()
  let held = ''
  // A STREAM THAT ENDS WITH NO CLOSING EVENT was cut off: the office restarted, or let a reader that fell too
  // far behind go. The reader is told, so a view never goes on saying it is live when nothing comes.
  let told = false
  try {
    for (;;) {
      const next = await body.read()
      if (next.done) {
        if (!told && !stop.aborted) reader.onGone(t('terminals.view.cutOff'))
        return
      }
      held += decoder.decode(next.value, { stream: true })
      let at = held.indexOf('\n\n')
      while (at !== -1) {
        const event = theEventsIn(held.slice(0, at))
        held = held.slice(at + 2)
        at = held.indexOf('\n\n')
        if (event === null) continue
        const said = JSON.parse(event.data) as Record<string, unknown>
        if (event.name === 'screen') {
          reader.onScreen(said['terminal'] as TerminalReading, String(said['screen']))
          if (said['typedFrom'] !== undefined) reader.onTypedFrom?.(said['typedFrom'] as TypedFrom)
        } else if (event.name === 'typed-from') reader.onTypedFrom?.(said as unknown as TypedFrom)
        else if (event.name === 'output') reader.onOutput(String(said['data']))
        else if (event.name === 'resized') reader.onResized(Number(said['cols']), Number(said['rows']))
        else if (event.name === 'ended') reader.onEnded(said['exit'] as { code: number; signal: number | null })
        else if (event.name === 'closed') {
          told = true
          reader.onClosed()
        } else if (event.name === 'holder-gone') {
          told = true
          reader.onGone(String(said['says']))
        }
      }
    }
  } catch (err) {
    if (!stop.aborted) reader.onFailed(err instanceof Error ? err.message : String(err))
  }
}

/** The last line the person typed into a terminal, when the screen showed it, and whether it looks like a key. */
export function theLastLine(id: string): Promise<TheLastLine> {
  return moleOfficeRequest<TheLastLine>(`/api/terminals/${encodeURIComponent(id)}/last-line`)
}

/** Keep the line the person read as a note of theirs, their own words. The server refuses a line that changed since. */
export function keepMyLine(id: string, text: string): Promise<{ record: { id: string; title: string } }> {
  return moleOfficeRequest(`/api/terminals/${encodeURIComponent(id)}/keep-my-line`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  })
}

/** Whether a terminal keeps what the person types, and the note it keeps it in (wave 13u, round 4). */
export function theKeeping(id: string): Promise<TheKeeping> {
  return moleOfficeRequest<TheKeeping>(`/api/terminals/${encodeURIComponent(id)}/keeping`)
}

/** Turn keeping what the person types in one terminal on or off. */
export function setTheKeeping(id: string, on: boolean): Promise<TheKeeping> {
  return moleOfficeRequest<TheKeeping>(`/api/terminals/${encodeURIComponent(id)}/keeping`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ on }),
  })
}

/** Start the terminal holder when none runs, as mole-office start would. A holder that runs is left as it is. */
export function startTheHolder(): Promise<{ started: boolean }> {
  return moleOfficeRequest('/api/terminals/holder/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
}

/**
 * RESTART THE TERMINAL HOLDER the person was shown, ending every terminal it holds (wave 13u round 23). `shown` is the
 * holder and the terminals the confirming step listed; the door refuses, and stops nothing, when the holder or its
 * terminals are not what was shown.
 */
export function restartTheHolder(shown: TheHolderAsShown): Promise<TheHolderRestarted> {
  return moleOfficeRequest('/api/terminals/holder/restart', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expect: shown }),
  })
}
