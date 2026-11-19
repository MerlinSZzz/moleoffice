// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW A PAGE REACHES THE AGENT TOOLS LIST AND THE INSTALL PRESS. Wave 13u, round 3.
 *
 * The doors are in src/server/api/terminal-harnesses.ts and the shapes in src/shared/harnesses.ts. Both doors are the
 * person's only. The install press answers with the terminal it opened, which the page reads as any other terminal
 * (src/web/lib/terminals.ts).
 */

import type { HarnessListing, HarnessReading } from '@shared/harnesses.ts'
import type { TerminalReading } from '@shared/terminals.ts'
import { moleOfficeRequest } from '../api.ts'

/** Every agent tool the office runs, read now. */
export function theHarnesses(): Promise<{ harnesses: HarnessReading[] }> {
  return moleOfficeRequest<{ harnesses: HarnessReading[] }>('/api/harnesses')
}

/** Every agent tool as the office declares it, with no version read: the answer comes at once. */
export function theHarnessList(): Promise<{ harnesses: HarnessListing[] }> {
  return moleOfficeRequest<{ harnesses: HarnessListing[] }>('/api/harnesses?part=list')
}

/** Install the ticked tools: one terminal opens and runs each vendor's installer in turn. */
export function installTheHarnesses(harnesses: readonly string[]): Promise<{ terminal: TerminalReading; installing: string[] }> {
  return moleOfficeRequest('/api/harnesses/install', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ harnesses }),
  })
}
