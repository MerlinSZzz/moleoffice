// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT THE SANDBOX MEMORY LIMIT LOOKS LIKE ON THE WIRE, read by the server and the page alike, on 6 October
 * 2026.
 *
 * GET /api/office/sandbox-memory-cap answers a reading and POST /api/office/sandbox-memory-cap answers what the person's press
 * did. The server builds both from src/config/sandbox-memory-cap.mjs (src/server/api/sandbox-memory-cap.ts) and the
 * Settings page draws them (src/web/components/SandboxMemoryCap.tsx). The shapes are written here once.
 */

/**
 * Whether the one limit on all sandboxes together holds, as systemd says. `other` is a limit that is not the one the
 * press sets; `unreadable` is no answer from systemd, never a guess.
 */
export type SandboxCapHeld = 'on' | 'off' | 'other' | 'unreadable'

/** The reading, and the exact commands the two presses run as administrator. */
export interface SandboxCapReading {
  held: SandboxCapHeld
  /** The limit in bytes, as systemd printed it, when there is one. */
  bytes: number | null
  /** The limit the press sets, in systemd's unit, e.g. "60G", and in bytes. */
  cap: string
  capBytes: number
  /** How much memory this computer has, in bytes, as the operating system says. */
  machineBytes: number
  /** The systemd slice every sandbox container is in. */
  slice: string
  /** What runs as administrator when the person turns the limit on, word for word. */
  onCommand: string
  /** What runs as administrator when the person takes it away, word for word. */
  offCommand: string
  /** The same reading in one English sentence. */
  says: string
}

/** The person's press: set the limit, or take it away. */
export interface SandboxCapPress {
  on: boolean
}

/**
 * What the person's press did. `already` and `not readable` ran nothing; `cancelled`, `not authorized` and `no dialog` changed
 * nothing; `done` means systemctl finished and the reading afterwards agrees.
 */
export type SandboxCapOutcome = 'done' | 'already' | 'cancelled' | 'not authorized' | 'no dialog' | 'failed' | 'not readable'

export interface SandboxCapDone {
  outcome: SandboxCapOutcome
  /** Why, in the words of the program that said it (English), when there is a why. */
  reason: string | null
  /** The same answer in one English sentence. */
  says: string
}
