// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MAIL TOOL'S STATE, AS THE OFFICE PASSES IT ON: GET /api/office/mail-tool/state. The office on the tool's computer
 * asks the tool's own GET /state for the person and returns the answer as the tool gave it. It keeps none of it: no row,
 * no file and no line of its log.
 *
 * AND THE PERSON'S THREE PRESSES, PASSED ON THE SAME WAY: POST /api/office/mail-tool/addresses, /account and /test. The
 * office returns the tool's answer to each as the tool gave it, and keeps only that the person pressed.
 *
 * `State` is the tool's own answer. Its shape is the tool's, which the office does not read: the Settings page reads it
 * (`TheToolsState` in src/web/lib/the-mail-tool.ts).
 */

/** Why the office has no answer of the tool's to pass on. */
export type WhyTheToolWasNotRead =
  /** The office knows no address for the tool: it is not installed, not running, or has not said where it answers. */
  | 'no address'
  /** The office asked at the address it knows, and nothing answered there in time. */
  | 'no answer'
  /** The tool answered with a refusal, such as for a secret that is no longer its own. */
  | 'refused'
  /** Something answered at that address with a body that is not the tool's JSON. */
  | 'not the tool'

/** The office has no answer of the tool's to pass on, and why. */
export interface TheToolGaveNoAnswer {
  answered: false
  because: WhyTheToolWasNotRead
  /** The status of the answer that refused, or null when nothing answered. */
  status: number | null
  /** In English, for developer mode. It names no address and no secret. */
  says: string
}

export type TheMailToolThroughTheOffice<State = unknown> = { answered: true; state: State } | TheToolGaveNoAnswer

/** One press passed on: the tool's answer, what it did and its state after, or why the office has none. */
export type TheMailToolsChangeThroughTheOffice<Answer = { done: unknown; state: unknown }> =
  | { answered: true; answer: Answer }
  | TheToolGaveNoAnswer
