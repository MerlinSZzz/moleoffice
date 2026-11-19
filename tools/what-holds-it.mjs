// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The ledger's answer to "does a live world hold these ports or this database?", asked and judged in
 * one place. A cleanup that would free a port or delete a database asks GET /api/resources/holding
 * first and refuses if a live world holds it: db:reset about its database, and a world's stop about
 * its two ports and its copy's database. Each cleanup says its own sentence and decides which failure
 * to ask, if any, it may go on past. What was asked and what counts as the ledger's answer are worked
 * out here, once.
 *
 * AN ANSWER THAT DOES NOT SAY WHAT IT IS ABOUT IS NOT THE LEDGER'S ANSWER ABOUT THIS THING. The door
 * says the question back in `askedAbout`. An answer about other ports or another database is refused
 * like an error answer, and never read as "nothing holds it".
 */
import { settingValue } from '../src/config/settings.mjs'
import { anAgentsToolHeaders } from '../for-agents/agent-key.mjs'

/** How long the office has to answer, in seconds. An office that hangs still holds what it serves. */
export const LEDGER_WAIT_S = 10

/**
 * True only for the ledger's answer about exactly these ports, in this order, and this database.
 * @param {unknown} answer
 * @param {{ ports: number[], database: string | null }} asked
 */
export function isTheLedgersAnswer(answer, asked) {
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (!object(answer) || !object(answer.askedAbout)) return false
  const about = answer.askedAbout
  return about.database === asked.database && Array.isArray(about.ports) && about.ports.length === asked.ports.length &&
    about.ports.every((port, n) => port === asked.ports[n]) && Array.isArray(answer.holders) && typeof answer.says === 'string'
}

/**
 * @typedef {{ got: 'nothing-holds-it' }
 *   | { got: 'held', says: string }
 *   | { got: 'refused' | 'timeout' | 'unreachable', message: string }
 *   | { got: 'an-error-answer' | 'not-the-ledgers', status: number, replied: string, text: string }} WhatTheLedgerSaid
 *
 * `refused` is a refused connection: nothing listens at the address. `timeout` is no answer within
 * LEDGER_WAIT_S. `unreachable` is any other failure to ask. `an-error-answer` is a status other than
 * 200, and `not-the-ledgers` a 200 that is not the ledger's answer about what was asked. `replied` is
 * the office's own error words when it gave some, and otherwise the first of what came back, which
 * `text` always is.
 */

/**
 * Ask the ledger at `api` whether a live world holds `ports` or `database`, as the agent this shell
 * runs for or else as `tool`. It never throws: every way the asking can end is one of the answers above.
 * @param {{ api: string, workspace: string, tool: string, ports?: number[], database?: string | null }} question
 * @returns {Promise<WhatTheLedgerSaid>}
 */
export async function askWhatHoldsIt({ api, workspace, tool, ports = [], database = null }) {
  const asked = { ports, database }
  const query = [
    ...(ports.length === 0 ? [] : ['ports=' + ports.map(String).join(',')]),
    ...(database === null ? [] : ['database=' + encodeURIComponent(database)]),
  ].join('&')
  let reply
  let text
  try {
    const self = settingValue('MOLE_OFFICE_AGENT') ?? null
    reply = await fetch(`${api}/api/resources/holding?${query}`, {
      headers: { 'x-mole-office-workspace': workspace, ...anAgentsToolHeaders({ self, withoutAKey: self ?? tool }) },
      signal: AbortSignal.timeout(LEDGER_WAIT_S * 1000),
      redirect: 'manual',
    })
    text = await reply.text()
  } catch (error) {
    const message = String(error?.cause?.message ?? error?.message ?? error)
    if (error?.name === 'TimeoutError') return { got: 'timeout', message }
    if (error?.cause?.code === 'ECONNREFUSED') return { got: 'refused', message }
    return { got: 'unreachable', message }
  }
  let answer = null
  try {
    answer = JSON.parse(text)
  } catch {
    // Not JSON: said with the status and the first of what came back.
  }
  const first = text.slice(0, 300)
  const replied = typeof answer?.error === 'string' ? answer.error : first
  if (reply.status !== 200) return { got: 'an-error-answer', status: reply.status, replied, text: first }
  if (!isTheLedgersAnswer(answer, asked)) return { got: 'not-the-ledgers', status: reply.status, replied, text: first }
  return answer.holders.length === 0 ? { got: 'nothing-holds-it' } : { got: 'held', says: answer.says }
}
