// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHETHER A ROW IS ONE OF THE OFFICE'S OWN.
 * `theRowIsOneOfTheOfficesOwn` and the list it reads, `THE_OFFICES_OWN_PARTS`, were moved byte for byte out
 * of src/server/lib/own-rows.ts, with no change of behaviour. That file re-exports the function and imports
 * the list back, so the list gained the export word.
 */

import { THE_API_SERVER, THE_BROWSER_APP, THE_MESSAGE_WORKER, THE_TERMINAL_HOLDER } from '../config/own-rows.mjs'

/**
 * The four parts the office files rows for. The browser app's is filed by the Vite plugin, and the
 * terminal holder's by the server when it reaches the holder.
 */
export const THE_OFFICES_OWN_PARTS = [THE_API_SERVER, THE_MESSAGE_WORKER, THE_BROWSER_APP, THE_TERMINAL_HOLDER] as const

/**
 * WHETHER A ROW IS ONE OF THE OFFICE'S OWN, by its title. The close below and the running list's reading of a run's
 * process (`theProcessARunNames` in ./sessions.ts) both ask here, so they cannot disagree about which rows are the
 * office's. Their process is node, so it is read by its start time and not by which program it is.
 */
export function theRowIsOneOfTheOfficesOwn(title: string): boolean {
  return (THE_OFFICES_OWN_PARTS as readonly string[]).includes(title)
}
