#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The explicit first-handoff command. Validation precedes transport and SQLite imports. */
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export async function main(args = process.argv.slice(2), env = process.env) {
  let file, retry, prepared, prepare = false, dry = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && !file && args[i + 1]) file = args[++i]
    else if (args[i] === '--retry-notice' && !retry && args[i + 1]) retry = args[++i]
    else if (args[i] === '--dry' && !dry) dry = true
    else if (args[i] === '--prepare' && !prepare) prepare = true
    else if (args[i] === '--prepared' && !prepared && args[i + 1]) prepared = args[++i]
    else throw new Error('Usage: node tools/stable/bootstrap-stable.mjs --config <absolute-private-JSON> (--prepare | --prepared <private-state>) [--dry], or --retry-notice <private-journal>.')
  }
  if ((!file && !retry) || (retry && (file || dry || prepare || prepared))) throw new Error('Name one configuration, or one delivery-only retry journal.')
  if (retry) {
    const notices = await import('./stable-bootstrap-notices.mjs')
    const { bootstrapOfficeRequest } = await import('./stable-bootstrap-transport.mjs')
    const { retryStableBootstrapNotice } = await import('./stable-bootstrap-transaction.mjs')
    const result = await retryStableBootstrapNotice(retry, { officeRequest: bootstrapOfficeRequest(env, notices.bootstrapNoticeRetryTimeout(retry)) })
    process.stdout.write(JSON.stringify(result, null, 2) + '\n')
    return result.notices.state === 'filed' ? 0 : 1
  }
  if ((prepare && prepared) || (!prepare && !prepared)) throw new Error('Choose preparation or the exact retained prepared state.')
  if (!isAbsolute(file) || resolve(file) !== file || realpathSync(file) !== file) throw new Error('Configuration must be an existing canonical absolute file.')
  const stat = lstatSync(file)
  if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.nlink !== 1 || stat.size > 1024 * 1024) throw new Error('Configuration must be one private mode 0600 file owned by this user.')
  const config = JSON.parse(readFileSync(file, 'utf8'))
  const transaction = await import('./stable-bootstrap-transaction.mjs')
  const phase = prepare ? 'prepare' : 'handoff'
  if (prepared && prepared !== config.prepared?.path) throw new Error('The --prepared path must equal the pinned private prepared state.')
  transaction.validateBootstrapConfig(config, { phase, env })
  const { bootstrapOfficeRequest } = await import('./stable-bootstrap-transport.mjs')
  const result = await transaction.bootstrapStable(config, { phase, env, officeRequest: bootstrapOfficeRequest(env, config.health.timeoutMs, dry), dry, say: line => process.stderr.write(line + '\n') })
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  return ['PREPARED', 'published', 'dry'].includes(result.state) && !(result.liveBlocked && phase === 'handoff') && result.notices?.state !== 'pending' ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await main() }
  catch (error) { process.stderr.write(`Stable bootstrap refused: ${error.message}. No first-handoff completion is claimed.\n`); process.exitCode = 1 }
}
