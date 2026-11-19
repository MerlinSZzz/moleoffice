// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE SUMMONS MAIL'S WORDS AND ITS ONE SHAPE, in one place for the office and for the mail tool.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS HERE
 * ---------------------------------------------------------------------------------------
 *
 * One decision moves the summons mail out of the office into a tool, and two others say how: the tool
 * reads each summons with a key of its own and mails it, from a program that runs on its
 * own. Until the office's own mail is taken out, the office
 * and the tool both send this letter, and a second copy of its words would be two letters that drift
 * apart. So the words, the header encoding and the whole message are here, in JavaScript that the
 * server imports and a tool under tools/ runs as it is. So are the check of one address and
 * `withoutAddresses`, which both of them pass a mail server's words through before anybody else
 * reads them.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE LETTER CARRIES, AND WHAT IT NEVER DOES
 * ---------------------------------------------------------------------------------------
 *
 * Who called, how urgent, and the one-line title the summons door has already checked (aTitleTheMailMayCarry in
 * src/server/lib/summons.ts). No link, no address of the office, and nothing else the office holds. A summons the
 * tool could not read is mailed as exactly that: it names the summons and guesses nothing about it.
 */

/** An address: one mailbox, with nothing else on the line. */
export const AN_ADDRESS = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]+$/

/**
 * WHAT A MAIL SERVER OR THE NETWORK SAID, WITH EVERY ADDRESS TAKEN OUT. A refusal can echo the mailbox it refused
 * and a network error names the machine it could not reach, and these sentences go into the office's database, to the
 * secretary who called, and into the mail tool's log. An IPv6 address is taken out as well: a group of hex digits with
 * `::` in it, or with at least three colons, which no clock time or port has.
 * @param {string} text
 */
export function withoutAddresses(text) {
  return text
    .replace(/[^\s<>()"',;:]+@[^\s<>()"',;:]+/g, '<a mail address>')
    .replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g, '<a machine address>')
    .replace(/\[?[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}\]?/gi, (found) =>
      found.includes('::') || found.split(':').length > 3 ? '<a machine address>' : found,
    )
}

/** How each urgency is said in the mail and in the office's message. */
export const URGENCY_WORDS = Object.freeze({ now: '急，请尽快来', soon: '不急，有空时来' })

/**
 * THE ONE TEMPLATE. Who calls, how urgent, a one-line title; nothing else, and no address or link of the office.
 * @param {{ who: string, title: string, urgency: 'now' | 'soon' }} input
 * @returns {{ subject: string, body: string }}
 */
export function theSummonsMail(input) {
  return {
    subject: `Mole Office：${input.who} 叫你（${URGENCY_WORDS[input.urgency]}）`,
    body:
      `${input.who} 在 Mole Office 里叫你，${URGENCY_WORDS[input.urgency]}：\n` +
      `${input.title}\n\n` +
      '请打开 office 看。这封信只是提醒，不带内容；回信不会被读到。\n',
  }
}

/**
 * THE LETTER FOR A SUMMONS THE TOOL COULD NOT READ: it names the summons and says nothing of who or how urgent, since
 * nothing about it could be read (problem 3E3Ygyzz-zwO: a guess is never passed on as a summons).
 * @param {string} id
 * @returns {{ subject: string, body: string }}
 */
export function theUnreadableSummonsMail(id) {
  return {
    subject: 'Mole Office：有一个召唤读不出来',
    body:
      `Mole Office 里有一个召唤读不出来（${id}），所以这封信说不出是谁叫你、有多急。\n\n` +
      '请打开 office 看。这封信只是提醒，不带内容；回信不会被读到。\n',
  }
}

/**
 * THE LETTER A PRESS ON THE TOOL'S PAGE SENDS, to show the list and the account work, and nothing more.
 * @returns {{ subject: string, body: string }}
 */
export function theTestMail() {
  return {
    subject: 'Mole Office：这是一封测试邮件',
    body: '这是邮件工具发的测试邮件。收到它，就说明召唤会从这个账号发到这个地址。\n\n这封信只是提醒，不带内容；回信不会被读到。\n',
  }
}

/**
 * Base64 in lines of 76, as a mail body or an attachment carries it. Text is taken as UTF-8.
 * @param {string | Buffer} text
 */
export function inLines(text) {
  const flat = (typeof text === 'string' ? Buffer.from(text, 'utf8') : text).toString('base64')
  return (flat.match(/.{1,76}/g) ?? []).join('\r\n')
}

/**
 * A HEADER OUTSIDE ASCII, AS RFC 2047 CARRIES IT: encoded words of at most 75 characters, folded onto lines of their
 * own. Each word holds whole characters of at most 45 bytes, whose base64 is 60 characters.
 * @param {string} text
 */
export function headerWords(text) {
  /** @type {string[]} */
  const words = []
  let chunk = ''
  for (const one of text) {
    if (chunk !== '' && Buffer.byteLength(chunk + one, 'utf8') > 45) {
      words.push(chunk)
      chunk = ''
    }
    chunk += one
  }
  if (chunk !== '') words.push(chunk)
  return words.map((word) => `=?UTF-8?B?${Buffer.from(word, 'utf8').toString('base64')}?=`).join('\r\n ')
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * THE MAIL'S DATE, IN THIS COMPUTER'S OWN TIME WITH ITS OFFSET SAID, as RFC 5322 writes it: `Sun, 27 Sep 2026 21:05:09
 * +0100`. A mail reader compares it across zones, so the offset is stated (chapter 4 rule 8); it was written in GMT with
 * toUTCString until the letter moved here, which is the UTC stamp that rule keeps out of the tools.
 * @param {Date} when
 */
export function theMailDate(when) {
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0')
  const east = -when.getTimezoneOffset()
  const offset = `${east < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(east) / 60))}${pad(Math.abs(east) % 60)}`
  return (
    `${DAYS[when.getDay()]}, ${pad(when.getDate())} ${MONTHS[when.getMonth()]} ${String(when.getFullYear())} ` +
    `${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())} ${offset}`
  )
}

/**
 * THE WHOLE MESSAGE AS SMTP'S DATA CARRIES IT, ending in the line that holds one dot. `to` is every address it goes to;
 * `messageId` is made by the caller, so this stays a function of what it is given.
 *
 * THE MESSAGE-ID ENDS IN THE SENDING ACCOUNT'S OWN DOMAIN (problem SvYupfTs3E4r): it ended in "mole-office", which is no
 * domain, and a Message-ID with no full domain name is a known sign spam filters weigh; the owner's first test letter
 * went to their spam folder. The body stays base64, as mail programs send text that is not plain English.
 *
 * A LETTER WITH ATTACHMENTS is multipart/mixed: the body first, then each attachment under its own name, as the
 * owner's decision says. A letter without one stays a single text part, byte for byte, as every
 * summons is. The boundary is made from the Message-ID, and no base64 line can hold it, because base64 has no "-".
 * @param {{ from: string, fromName: string, to: string[], subject: string, body: string, date: Date, messageId: string, attachments?: { name: string, content: Buffer }[] }} input
 */
export function theMessage(input) {
  const domain = input.from.includes('@') ? input.from.slice(input.from.lastIndexOf('@') + 1) : 'mole-office.invalid'
  const headers = [
    `From: ${input.fromName} <${input.from}>`,
    `To: ${input.to.map((one) => `<${one}>`).join(', ')}`,
    `Subject: ${headerWords(input.subject)}`,
    `Date: ${theMailDate(input.date)}`,
    `Message-ID: <${input.messageId}@${domain}>`,
    'MIME-Version: 1.0',
  ]
  const text = ['Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', inLines(input.body)]
  const attachments = input.attachments ?? []
  if (attachments.length === 0) return [...headers, ...text, '.', ''].join('\r\n')
  const boundary = `mole-office-${input.messageId}`
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    ...text,
    ...attachments.flatMap((one) => [
      `--${boundary}`,
      'Content-Type: application/octet-stream',
      `Content-Disposition: attachment;\r\n filename*=UTF-8''${aParameterValue(one.name)}`,
      'Content-Transfer-Encoding: base64',
      '',
      inLines(one.content),
    ]),
    `--${boundary}--`,
    '.',
    '',
  ].join('\r\n')
}

/**
 * A FILE'S NAME AS A HEADER PARAMETER CARRIES IT (RFC 2231 and RFC 5987): UTF-8, with every byte outside the few
 * characters a parameter may hold written as %XX.
 * @param {string} name
 */
function aParameterValue(name) {
  return encodeURIComponent(name).replace(/['()*]/g, (one) => `%${one.charCodeAt(0).toString(16).toUpperCase()}`)
}
