#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { theMailToolFolder } from '../../src/config/the-mail-tool.mjs'
import { THE_MOST_LETTER_BYTES, sendMailToTheList, theSavedAddresses } from '../mail-the-summonses.mjs'

/** @param {number} bytes */
const inDigits = (bytes) => String(bytes).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const THE_MOST_IN_MB = `${String(THE_MOST_LETTER_BYTES / (1024 * 1024))} MB`

/**
 * Which of the talk's own limits stopped it, with the limit's number, before the login as after it.
 * @param {import('../mail-the-summonses.mjs').ACut} cut
 */
const theCutSaid = (cut) => cut.why === 'silence'
  ? `Nothing passed between this computer and the mail server for ${cut.seconds} seconds, so the talk was stopped.`
  : `The talk went past ${cut.seconds} seconds, the most these letters are given, so it was stopped.`

const HELP = `Usage: node tools/stable/send-mail.mjs --subject <subject> --body-file <UTF-8 file> [--attach <file>]...
Sends one supplied letter to the mail tool's saved recipients using its saved GNOME account.
Each --attach adds one file, under its own name. The body file and the attachments together may be at most
${inDigits(THE_MOST_LETTER_BYTES)} bytes (${THE_MOST_IN_MB}); the account's own server may take less.
Run in the host user's logged-in account session. MAIL_TOOL_DIR selects the existing mail tool folder.
The office and the summons service may be stopped. Nothing is installed, polled or retried.
Exit 0: every recipient accepted; 1: send failed or partial; 2: help, invalid input, or no saved recipient to send to.
`

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    process.stdout.write(HELP)
    return 2
  }
  const values = new Map()
  /** @type {string[]} */
  const attached = []
  for (let at = 0; at < args.length; at += 2) {
    const flag = args[at]
    const value = args[at + 1]
    const known = flag === '--subject' || flag === '--body-file' || flag === '--attach'
    if (!known || values.has(flag) || value === undefined || value.startsWith('--')) {
      process.stderr.write(`Invalid arguments. ${HELP}`)
      return 2
    }
    if (flag === '--attach') attached.push(value)
    else values.set(flag, value)
  }
  const subject = values.get('--subject')
  const file = values.get('--body-file')
  if (typeof subject !== 'string' || subject.trim() === '' || /[\x00-\x1f\x7f]/.test(subject) || typeof file !== 'string' || file === '') {
    process.stderr.write(`Supply a nonempty single-line subject and a body file. ${HELP}`)
    return 2
  }
  const bodyRefused = 'The body file must be readable, nonempty UTF-8 text in a regular file. Nothing was sent.\n'
  // AN ATTACHMENT IS NAMED BY ITS PLACE AMONG THE --attach FLAGS, never by its file, whose name goes into the letter.
  const attachmentRefused = (/** @type {number} */ at) => `Attachment ${String(at + 1)} must be a readable regular file. Nothing was sent.\n`
  // THE SIZES COME FIRST, so a letter over the limit is refused before a file is read whole.
  /** @type {number[]} */
  const sizes = []
  for (const [at, one] of [file, ...attached].entries()) {
    try {
      const found = statSync(one)
      if (!found.isFile()) throw new Error('not a regular file')
      sizes.push(found.size)
    } catch {
      process.stderr.write(at === 0 ? bodyRefused : attachmentRefused(at - 1))
      return 2
    }
  }
  const total = sizes.reduce((sum, size) => sum + size, 0)
  if (total > THE_MOST_LETTER_BYTES) {
    process.stderr.write(`The letter is ${inDigits(total)} bytes. Its body file and attachments together may be at most ${inDigits(THE_MOST_LETTER_BYTES)} bytes (${THE_MOST_IN_MB}). Nothing was sent.\n`)
    return 2
  }
  const changed = 'A file changed while it was read, so its size is not the one checked against the limit. Nothing was sent.\n'
  let body
  try {
    const bytes = readFileSync(file)
    if (bytes.length !== sizes[0]) {
      process.stderr.write(changed)
      return 2
    }
    body = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (body.trim() === '') throw new Error('empty body')
  } catch {
    process.stderr.write(bodyRefused)
    return 2
  }
  /** @type {{ name: string, content: Buffer }[]} */
  const attachments = []
  for (const [at, one] of attached.entries()) {
    let content
    try {
      content = readFileSync(one)
    } catch {
      process.stderr.write(attachmentRefused(at))
      return 2
    }
    if (content.length !== sizes[at + 1]) {
      process.stderr.write(changed)
      return 2
    }
    attachments.push({ name: basename(one), content })
  }
  const dir = theMailToolFolder()
  let recipients
  try {
    recipients = theSavedAddresses(dir)
  } catch {
    process.stderr.write('The saved recipient list could not be read. Nothing was sent.\n')
    return 2
  }
  if (recipients === null) {
    process.stderr.write(existsSync(dir)
      ? `The mail tool's folder at ${dir} holds no saved recipient list. Save one in the mail tool's entry on the Settings page. Nothing was sent.\n`
      : `There is no mail tool folder at ${dir}. MAIL_TOOL_DIR names the folder when it is somewhere else. Nothing was sent.\n`)
    return 2
  }
  if (recipients.length === 0) {
    process.stderr.write('The saved recipient list is empty. Nothing was sent.\n')
    return 2
  }
  const sent = await sendMailToTheList({
    dir,
    busctl: process.env['MAIL_TOOL_BUSCTL'] || 'busctl',
    smtpServer: process.env['MAIL_TOOL_SMTP_SERVER'],
  }, { subject, body, ...(attachments.length === 0 ? {} : { attachments }) }, recipients)
  if ('reason' in sent) {
    const why = sent.reason === 'no account' ? 'No account can send.'
      : sent.reason === 'pick one' ? 'Choose a sending account in the mail tool Settings.'
        : sent.reason === 'login refused' ? 'The mail server refused authentication.'
          : sent.reason === 'server not reached' ? 'The secure SMTP conversation could not be established.'
            : 'The saved account, account service or token could not be read.'
    process.stderr.write(`${why}${sent.cut === null ? '' : ` ${theCutSaid(sent.cut)}`} Nothing was sent.\n`)
    return 1
  }
  const count = (/** @type {'sent' | 'refused' | 'later'} */ outcome) => sent.letters.filter(one => one.outcome === outcome).length
  const accepted = count('sent')
  if (accepted === recipients.length) {
    process.stdout.write(`Sent: the mail server accepted ${accepted} of ${recipients.length} letters.\n`)
    return 0
  }
  const refused = count('refused')
  const said = [`${accepted > 0 ? 'Partial delivery' : 'Delivery failed'}: the mail server accepted ${accepted} of ${recipients.length} letters; refused ${refused}; unconfirmed ${count('later')}.`]
  // THE SERVER'S OWN WORDS CAN NAME THE ACCOUNT, so they are not printed; a letter with attachments may be over its size.
  if (refused > 0) said.push(`The account's mail server refused ${refused}.${attachments.length === 0 ? '' : ` Some mail servers take less than ${THE_MOST_IN_MB}, so a smaller letter may be taken.`}`)
  if (sent.cut !== null) said.push(theCutSaid(sent.cut))
  process.stderr.write(`${said.join(' ')} No retry was made.\n`)
  return 1
}

main().then(code => { process.exitCode = code }).catch(() => {
  process.stderr.write('The mail command failed. Delivery is unconfirmed. No retry was made.\n')
  process.exitCode = 1
})
