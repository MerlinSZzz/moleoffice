// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A PAGE REACHES THE AGENT TOOLS LIST AND THE INSTALL PRESS. Wave 13u, round 3.
 *
 * The doors are in src/server/api/terminal-harnesses.ts and the shapes in src/shared/harnesses.ts. Settings reads each
 * tool's sign-in and sends its Set up press from here too (src/web/components/settings/CodingToolsPanel.tsx). The
 * install press answers with the terminal it opened, which the page reads as any other terminal (src/web/lib/terminals.ts).
 */

import type { HarnessListing, HarnessReading, SignedIn, TheSetUpSent } from '@shared/harnesses.ts'
import type { Language } from '@shared/i18n.ts'
import type { TerminalReading } from '@shared/terminals.ts'
import type { TheUsersPathAsTheDoorSaysIt } from '../../config/the-users-own-path.mjs'
import { moleOfficeRequest } from '../api.ts'

/** Every agent tool the office runs, read now, and whether this server's start read the user's own PATH. */
export function theHarnesses(): Promise<{ harnesses: HarnessReading[]; usersPath: TheUsersPathAsTheDoorSaysIt }> {
  return moleOfficeRequest<{ harnesses: HarnessReading[]; usersPath: TheUsersPathAsTheDoorSaysIt }>('/api/harnesses')
}

/** Every agent tool as the office declares it, with no version read: the answer comes at once. */
export function theHarnessList(): Promise<{ harnesses: HarnessListing[]; usersPath: TheUsersPathAsTheDoorSaysIt }> {
  return moleOfficeRequest<{ harnesses: HarnessListing[]; usersPath: TheUsersPathAsTheDoorSaysIt }>('/api/harnesses?part=list')
}

/** Whether one agent tool is signed in, as its own status command says. */
export function theSignInOf(id: string): Promise<{ harness: string; signedIn: SignedIn; signingIn: boolean }> {
  return moleOfficeRequest(`/api/harnesses/${encodeURIComponent(id)}/signed-in`)
}

/** The Set up press: the person's ask to set up one tool, written as his message to the secretary the office picks. */
export function setUpTheTool(id: string, language: Language): Promise<TheSetUpSent> {
  return moleOfficeRequest(`/api/harnesses/${encodeURIComponent(id)}/set-up`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ language }),
  })
}

/** Install the ticked tools: one terminal opens and runs each vendor's installer in turn. */
export function installTheHarnesses(harnesses: readonly string[]): Promise<{ terminal: TerminalReading; installing: string[] }> {
  return moleOfficeRequest('/api/harnesses/install', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ harnesses }),
  })
}
