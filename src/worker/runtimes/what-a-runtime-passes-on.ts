// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT EACH RUNTIME PASSES ON OF THE MODEL AND THE EFFORT THE OFFICE CHOSE FOR A RUN, handed on to the adapters. Criterion U2.
 *
 * The table and its two readers, `whatItPassesOn` and `theRuntimesTheWorkerGives`, are written in
 * src/shared/what-a-runtime-passes-on.ts, because src/shared/kinds.ts reads them and a shared file may not import a
 * worker file. This file exports them again under the same names, so the adapters and the API server import them from
 * here as before.
 *
 * A SECOND TABLE, `HOW_EACH_COMMAND_TAKES_AN_EFFORT`, says how each runtime's command line takes an effort at all.
 * It is a different fact, written in src/config so the launcher can read it, and handed on from here.
 *
 * IT IMPORTS ONLY TYPES, THE SHARED TABLE AND THAT ONE TABLE, because it is the one file under src/worker/runtimes the
 * API server loads. The shared table imports nothing but types, and the one table imports nothing. An adapter loads
 * `os.ts`, and through `common.ts` a file outside src/, and the server loads neither.
 */
import type { THE_RUNTIMES_THE_OFFICE_DISPATCHES } from '../../shared/participants.ts'
import { HOW_EACH_COMMAND_TAKES_AN_EFFORT } from '../../config/how-a-command-takes-an-effort.mjs'
export { theRuntimesTheWorkerGives, whatItPassesOn, type WhatItPassesOn } from '../../shared/what-a-runtime-passes-on.ts'

/** A runtime word the office dispatches a run on, and so one with an adapter and a line in the table handed on below. */
type ADispatchedRuntime = (typeof THE_RUNTIMES_THE_OFFICE_DISPATCHES)[number]

/**
 * HOW A RUNTIME'S COMMAND LINE TAKES A REASONING EFFORT, written in src/config/how-a-command-takes-an-effort.mjs, whose
 * comment says how it differs from what a runtime passes on. It is handed on from here, so an adapter reads both facts
 * from this one file. Each line has an option or a setting, and one line per dispatched runtime, so a runtime added to
 * the office's list with no line there does not compile.
 */
export type HowItsCommandTakesAnEffort =
  | { readonly option: string; readonly setting: null; readonly environment: string | null }
  | { readonly option: null; readonly setting: string; readonly environment: string | null }
export { HOW_EACH_COMMAND_TAKES_AN_EFFORT }
HOW_EACH_COMMAND_TAKES_AN_EFFORT satisfies { readonly [R in ADispatchedRuntime]: HowItsCommandTakesAnEffort | null }
