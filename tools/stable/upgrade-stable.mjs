#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Run with --config /absolute/config.json [--dry]. The JSON is the whole release configuration. With
 * "emergency": true it is an emergency release, which names no receipt.
 * `closedVerification: {command, timeoutMs, checks, abortDeadlineMs, maxClosedMs}` holds ordinary admission closed
 * until the configured read-only verifier passes; recovery also verifies the previous generation while closed. In place
 * of command it may name `verifiers`, a list of {command, checks, phases, prepare?} that run one after another within
 * the one timeoutMs. With `remintMap`, a whole path, the candidate and then the explicit database are re-minted after
 * their migration, by a second command `npm run db:migrate -- --remint <map>`. Past
 * abortDeadlineMs with no pass it rolls back; past maxClosedMs it stops with the office closed. While closed, a mark
 * beside the database refuses every start. With --resume <stable Git folder>/stable-upgrade.lock, the command that mark
 * names, a closed upgrade that did not finish goes on from its journal: it publishes only after a verifier pass, or
 * rolls back. The dry run prints the untranslated-word count; the real run puts a count above zero in the AFTER notice.
 * With --back the same transaction returns the office to the previous completed stable version; its
 * configuration names no database, port, settings or versions, which come from the serving office.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkTheWayBackConfig, resumeStableUpgrade, retryStableUpgradeNotice, returnToThePreviousStable, upgradeStable, validateUpgradeConfig } from './stable-upgrade-transaction.mjs'
import { beginUpgradePreflight, noticeRetryTimeout, retainUpgradeRefusal, upgradeOfficeRequest } from './stable-upgrade-notices.mjs'
import { THE_LONGEST_RECEIPT_REPLY } from './stable-upgrade-evidence.mjs'

export async function main(args = process.argv.slice(2), env = process.env) {
  let file
  let retry
  let resume
  let dry = false
  let back = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && !file && args[i + 1]) file = args[++i]
    else if (args[i] === '--retry-notice' && !retry && args[i + 1]) retry = args[++i]
    else if (args[i] === '--resume' && !resume && args[i + 1]) resume = args[++i]
    else if (args[i] === '--dry' && !dry) dry = true
    else if (args[i] === '--back' && !back) back = true
    else throw new Error('Usage: node tools/stable/upgrade-stable.mjs [--back] --config <file> [--dry], or --retry-notice <private-journal>, or --resume <stable Git folder>/stable-upgrade.lock')
  }
  if (resume) {
    if (file || dry || back || retry) throw new Error('--resume cannot be combined with --config, --dry, --back or --retry-notice.')
    // Only the request timeout is read here. The resume reads and checks the whole journal itself.
    const timeoutMs = JSON.parse(readFileSync(resume, 'utf8').split('\n')[0]).config.health.timeoutMs
    const result = await resumeStableUpgrade(resume, { officeRequest: upgradeOfficeRequest(env, timeoutMs), say: (line) => process.stderr.write(line + '\n') })
    if (result.notices?.says) process.stderr.write(result.notices.says + '\n')
    if (result.gateCountSpool) process.stderr.write(result.gateCountSpool.says + '\n')
    if (result.resume) process.stderr.write(`The office stays closed. ${result.resume} goes on from here.\n`)
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return result.state === 'published' && result.notices?.state !== 'pending' ? 0 : 1
  }
  if (retry) {
    if (file || dry || back) throw new Error('--retry-notice cannot be combined with --config, --dry or --back.')
    const officeRequest = upgradeOfficeRequest(env, noticeRetryTimeout(retry))
    const result = await retryStableUpgradeNotice(retry, { officeRequest })
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    if (result.notices.says) process.stderr.write(result.notices.says + '\n')
    if (result.gateCountSpool) process.stderr.write(result.gateCountSpool.says + '\n')
    return result.notices.state === 'filed' ? 0 : 1
  }
  if (!file) throw new Error('Name the explicit JSON configuration with --config <file>.')
  let preflight
  let announcementAttempted = false
  try {
    const config = JSON.parse(readFileSync(file, 'utf8'))
    if (!dry) {
      preflight = beginUpgradePreflight(config)
      if (preflight.unavailable) process.stderr.write(preflight.unavailable + '\n')
    }
    if (back) checkTheWayBackConfig(config)
    else validateUpgradeConfig(config)
    const officeRequest = upgradeOfficeRequest(env, config.health.timeoutMs, dry)
    // An emergency release names no receipt, so there is none to read. The release check reads its switch and message.
    if (config.emergency !== true) {
      const evidencePath = `/api/records/${encodeURIComponent(config.evidence.recordId)}/revisions/1`
      const authorization = await officeRequest({ method: 'GET', path: evidencePath, longestReply: THE_LONGEST_RECEIPT_REPLY })
      // The read asks for as long an answer as every receipt-evidence read. A longer answer is still cut, which is not the office refusing.
      if (authorization.cut === true) throw new Error(`The office's answer to ${evidencePath} was cut, so the upgrade cannot read the evidence whole. No local evidence fallback exists.`)
      if (authorization.status !== 200 || authorization.cut || authorization.location) throw new Error(`The canonical officeRequest evidence read was refused (${authorization.status}). No local evidence fallback exists.`)
    }
    const result = await (back ? returnToThePreviousStable : upgradeStable)(config, { dry, officeRequest, env, say: (line) => process.stderr.write(line + '\n'), onStep: (event) => { if (event.step === 'notice-before') announcementAttempted = true } })
    if (result.notices?.says) process.stderr.write(result.notices.says + '\n')
    if (result.gateCountSpool) process.stderr.write(result.gateCountSpool.says + '\n')
    if (result.untranslatedWordsSays) process.stderr.write(result.untranslatedWordsSays + '\n')
    if (dry) { process.stdout.write(result.says + '\n'); for (const line of result.plan) process.stderr.write(line + '\n') }
    const { says, ...detail } = result
    process.stdout.write(JSON.stringify(dry ? detail : result, null, 2) + '\n')
    return ['published', 'dry'].includes(result.state) && result.notices?.state !== 'pending' ? 0 : 1
  } catch (error) {
    if (announcementAttempted) throw new Error(`${error.message}. An announcement may have been attempted; inspect the retained transaction and notice journals. No final result is claimed.`)
    const retained = dry ? '' : ` ${retainUpgradeRefusal(preflight, error)}`
    throw new Error(`${error.message}. No upgrade announcement was attempted.${retained}`)
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main() } catch (error) { console.error(`Stable upgrade refused: ${error.message}. No upgrade completion is claimed.`); process.exitCode = 1 }
}
