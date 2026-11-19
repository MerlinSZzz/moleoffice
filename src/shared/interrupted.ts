// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SHAPE OF ONE INTERRUPTED RUN, as the server sends it and the page draws it. Criterion W7.
 * src/server/lib/interrupted.ts works out which runs these are; this file only says their shape, so
 * the server and the page cannot disagree about it.
 */

import type { ParticipantRef } from '@shared/participants.ts'

/** Why a run cannot be resumed, as a code the page says in its own language. */
export type WhyItCannotResume = 'no-conversation' | 'another-folder' | 'message-gone' | 'agent-gone'

/** What was measured about one tool's own resume after a kill mid-turn. */
export type WhatWasMeasured = 'resumes' | 'takes-the-id' | 'not-measured'

/** One interrupted run, as the page shows it. */
export interface AnInterruptedRun {
  session: string
  /** Paused by a shutdown, or ended without answering. */
  how: 'paused' | 'crashed'
  agent: { id: string; handle: string } | null
  message: { id: string; title: string } | null
  /**
   * When it stopped, in local time: when it was paused, or when its record first said the state it
   * holds now. Null when nobody recorded when it stopped.
   */
  stoppedAt: string | null
  /** Why it stopped, in the words written on its record when it stopped. */
  why: string | null
  runtime: string | null
  conversation: string | null
  /** Whether one press can resume it, and if not, why not. */
  resume: { can: true } | { can: false; because: WhyItCannotResume }
  /** What was measured about this tool's resume after a kill mid-turn. */
  measured: WhatWasMeasured
  /** The press that asked for a resume, while the worker has not started it, or null. */
  asked: { by: ParticipantRef | null; at: string } | null
  /** Why the last asked resume could not be started, in the worker's words, or null. */
  failed: string | null
}
