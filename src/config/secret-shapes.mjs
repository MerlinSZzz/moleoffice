// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OFFICE'S OWN SECRET-SHAPE CHECK, in one place. src/shared/terminals.ts re-exports it for the server and the pages.
 *
 * Plain JavaScript, because the session hook runs on Node 18, which cannot load a TypeScript file, and the hook stores
 * a command line screened by this check (src/config/session-process.mjs).
 */

/**
 * THE SHAPES A SECRET TAKES. The terminal's keeping keeps a line with one of these shapes, and the terminal view says
 * how many kept lines have one. The message door stores a message with one
 * and reminds its writer, and never refuses it; a page asks the person once before the send. Named by what they are, so a reminder can say which, and keyed, so a page can say it in its
 * own language. Read by the terminal's keeping and by the message door (problem __4iR4FkFAGS); there is no second list.
 * Kept wide on purpose: a reminder about an ordinary sentence costs the person one press, and a key kept costs far more.
 */
export const SECRET_SHAPE_NAMES = /** @type {const} */ ({
  privateKey: 'a private key',
  awsKey: 'an AWS key',
  apiKey: 'an API key',
  githubToken: 'a GitHub token',
  slackToken: 'a Slack token',
  googleKey: 'a Google key',
  bearerToken: 'a bearer token',
  givenAValue: 'a password or a key given a value',
  passwordOption: 'a password on a command line',
  passwordAfterP: 'a password glued to -p',
  passwordInUrl: 'a URL with a password in it',
  longRun: 'a long run of letters and digits',
  generatedWord: 'a word that looks generated, as a key is',
})
/** @typedef {keyof typeof SECRET_SHAPE_NAMES} SecretShape */

/** @type {ReadonlyArray<readonly [SecretShape, RegExp]>} */
const SECRET_SHAPES = [
  ['privateKey', /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ['awsKey', /\bAKIA[0-9A-Z]{16}\b/g],
  ['apiKey', /\bsk-[A-Za-z0-9_-]{16,}/g],
  ['githubToken', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/g],
  ['slackToken', /\bxox[abprs]-[A-Za-z0-9-]{10,}/g],
  ['googleKey', /\bAIza[0-9A-Za-z_-]{30,}/g],
  ['bearerToken', /\bbearer\s+[A-Za-z0-9._~+/-]{16,}/gi],
  // A NAME ENDING IN A SECRET'S WORD, GIVEN A VALUE, as a .env line or an export writes it: DB_PASSWORD=, GITHUB_TOKEN=,
  // export OPENAI_API_KEY="…", password: …. The word starts the name or follows an underscore or any other character that
  // is not a letter or a digit; \b would not do, because an underscore is a word character (check J5sHdzTwkRgr).
  ['givenAValue', /(?<![A-Za-z0-9])(?:pass(?:wd|word|phrase)?|pwd|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|credential|auth)s?["']?\s*[:=]\s*\S+/gi],
  ['passwordOption', /(?:^|\s)--password[=\s]\S+/g],
  // A PASSWORD GLUED TO -p, as mysql takes it; a port given to -p (ssh -p2222) is all digits and is not one. The password
  // is printable ASCII (wave 13w round 6): it stops at the first character that is not, so Chinese or full-width
  // punctuation after -p, as in a Windows command line, holds no password at all.
  ['passwordAfterP', /(?:^|\s)-p(?![0-9]+(?![!-~]))[!-,.-<>-~][!-<>-~]{3,}/g],
  ['passwordInUrl', /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:[^\s/@]+@/gi],
  // A RUN OF 32 OR MORE base64 or hex characters, holding a digit and a letter (aRunWithADigitAndALetter below). Slashes,
  // dots, hyphens and underscores break a run, so a path, a dotted name or a migration's file name is not one. An
  // underscore is base64url's, so a base64url key with one in it is caught here only when one part is 32 or more; it is
  // still caught whole as a generated word below when it mixes upper case, lower case and digits.
  ['longRun', /[A-Za-z0-9+=]{32,}/g],
]

/**
 * A GIT COMMIT ID, which is exactly 40 lower-case hex characters, is not a key. Agents' messages carry full commit ids all
 * day (message _wB1mehQp4KB). The office's own keys are 64 hex characters (src/server/lib/keys.ts), and so is a
 * sha256, so both are still caught.
 */
const A_COMMIT_ID = /^[0-9a-f]{40}$/

/**
 * A LONG RUN IS A KEY ONLY WHEN IT HOLDS A DIGIT AND A LETTER (problem 0VsAlpkCl6LF). A long camelCase code name holds
 * only letters, and a long setting name in capitals and underscores often does too; neither is a key. A random key of
 * 32 characters or more almost always holds both: 32 random base64 characters hold no digit about 1 time in 230, and 32
 * random hex characters hold no letter about 1 time in 3.4 million. THE TRADE: a key that happens to be all letters, or
 * all digits, is no longer caught by this shape. It is still caught when it mixes upper case, lower case and digits in
 * 20 characters or more (the generated word below), or when it has one of the named shapes above, such as sk-… or ghp_….
 */
/**
 * @param {string} run
 * @returns {boolean}
 */
function aRunWithADigitAndALetter(run) {
  return /[0-9]/.test(run) && /[A-Za-z]/.test(run)
}

/**
 * What looks like a secret in a piece of text: its shape, and the piece itself, which is for the caller never to keep.
 *
 * @typedef {{ shape: SecretShape, what: string, piece: string }} ASecretSeen
 */

/**
 * A word of 20 characters or more that mixes upper case, lower case and digits, as generated keys do. A word is judged
 * piece by piece, split at every character that is not a letter, a digit, an underscore or a plus (A_WORD_SPLITS_AT), so
 * a path that ends in a record id, or a list of record ids, is judged one id at a time (message _wB1mehQp4KB). The
 * split at hyphens is message 2eM75z7KVyaB: a name like mole-office-sandbox-launcher-AB12cd is a folder, and its
 * six-character tail is too short to judge. The split at every other such character is problem 0VsAlpkCl6LF: a word-list
 * key with a wave prefix, a call with its arguments, a quoted code name, or a record id followed by Chinese punctuation is
 * judged one name at a time. THE TRADE: a generated key written with one of these characters in it is caught only when
 * one part is 20 characters or more, or 32 or more for the long-run shape above. The keys this must catch keep their
 * random part whole: an office key is 64 hex characters, and sk-… or ghp_… tokens keep a part well over 20. A JWT is three
 * parts joined by dots, and each part is a long run of its own.
 */
const A_WORD_SPLITS_AT = /[^A-Za-z0-9_+]/

/**
 * A COMPACT UTC TIME, as a program names a folder or a file it made at that time: eight digits of the date, T, four or six
 * digits of the time and Z, standing at the start of a piece or after an underscore, and followed by an underscore or the
 * end (wave 13w round 10). Such a name has upper case, lower case and digits, and is 20 characters or more as
 * soon as a word follows the time, so it was judged a generated word. The time is no part of a key, so a piece is judged
 * on what is left without it, and a key with a time beside it is still judged on the key.
 */
const A_COMPACT_UTC_TIME = /(?<=^|_)\d{8}T\d{4}(?:\d{2})?Z(?=_|$)/g

/**
 * Whether one piece looks generated, judged without any compact UTC time in it.
 *
 * @param {string} piece
 * @returns {boolean}
 */
function aGeneratedLookingPiece(piece) {
  const judged = piece.replace(A_COMPACT_UTC_TIME, '')
  return judged.length >= 20 && /[a-z]/.test(judged) && /[A-Z]/.test(judged) && /[0-9]/.test(judged)
}

/**
 * @param {string} text
 * @returns {string | null}
 */
function aGeneratedLookingWord(text) {
  for (const word of text.split(/\s+/)) {
    for (const piece of word.split(A_WORD_SPLITS_AT)) {
      if (aGeneratedLookingPiece(piece)) return piece
    }
  }
  return null
}

/**
 * The first thing in a piece of text that looks like a secret, or null when nothing does.
 *
 * `isARecordId`, WHERE THE CALLER CAN ASK THE DATABASE, says a piece is an existing record's or agent's id, and such a piece is not a
 * key (problem __4iR4FkFAGS, message oA4sCtt5CeIZ). An id made before 6 October 2026 is 12 characters of letters,
 * digits, - and _, so about 1 in 4,096 begins with -p and has the shape of a password glued to -p. Only that shape can
 * match a whole id: the long run needs 32 characters and the generated word 20, and an id has 12, so the generated word
 * is not asked. THE SHAPE CANNOT TELL SUCH AN ID FROM A PASSWORD OF 10 ID CHARACTERS, so only an id the office holds is let
 * through, looked up at the time; an id made since then never begins with a dash (anOfficeId in src/server/lib/ids.ts,
 * decision cvQAUoJTDYbB).
 *
 * @param {string} text
 * @param {(piece: string) => boolean} [isARecordId]
 * @returns {ASecretSeen | null}
 */
export function whatLooksLikeASecret(text, isARecordId) {
  for (const [shape, pattern] of SECRET_SHAPES) {
    for (const found of text.matchAll(pattern)) {
      if (shape === 'longRun' && (A_COMMIT_ID.test(found[0]) || !aRunWithADigitAndALetter(found[0]))) continue
      const piece = found[0].trim()
      if (isARecordId !== undefined && isARecordId(piece)) continue
      return { shape, what: SECRET_SHAPE_NAMES[shape], piece }
    }
  }
  const word = aGeneratedLookingWord(text)
  return word === null ? null : { shape: 'generatedWord', what: SECRET_SHAPE_NAMES.generatedWord, piece: word }
}

/**
 * Why a line looks like a secret, or null when it does not.
 *
 * @param {string} text
 * @returns {string | null}
 */
export function whyThisLooksLikeASecret(text) {
  return whatLooksLikeASecret(text)?.what ?? null
}

/**
 * The marker put where a piece that looks like a secret was, naming its shape: `<an API key, not shown>`.
 *
 * @param {SecretShape} shape
 * @returns {string}
 */
export function theMarkerFor(shape) {
  return `<${SECRET_SHAPE_NAMES[shape]}, not shown>`
}

/**
 * Text with every piece that looks like a secret replaced by its marker, and the shapes that were replaced.
 *
 * @typedef {{ text: string, marked: SecretShape[] }} ScreenedText
 */

/**
 * TEXT THE OFFICE STORES OR SHOWS, WITH EVERY KEY-LIKE PIECE MARKED (wave 13u, round 10b). The same shapes as
 * `whatLooksLikeASecret`, applied to every match rather than the first. A message is refused when it holds a key; a
 * command line or a run's step is the program's own words, and is kept or shown with a marker in each such place.
 * Every match is found in the text as it was given, and matches that overlap are marked once, as the shape of the one
 * that starts first; so a marker is never read again as part of another match. The space a password option starts with
 * is kept, so the words around a marker stay apart. Text with nothing marked comes back unchanged.
 *
 * @param {string} text
 * @returns {ScreenedText}
 */
export function withSecretsMarked(text) {
  /** @type {{ start: number, end: number, shape: SecretShape }[]} */
  const found = []
  for (const [shape, pattern] of SECRET_SHAPES) {
    for (const one of text.matchAll(pattern)) {
      if (shape === 'longRun' && (A_COMMIT_ID.test(one[0]) || !aRunWithADigitAndALetter(one[0]))) continue
      const start = (one.index ?? 0) + (one[0].length - one[0].trimStart().length)
      found.push({ start, end: (one.index ?? 0) + one[0].length, shape })
    }
  }
  // A GENERATED WORD is judged piece by piece, as aGeneratedLookingWord splits it; a piece is a run of the characters
  // A_WORD_SPLITS_AT does not split at.
  for (const one of text.matchAll(/[A-Za-z0-9_+]{20,}/g)) {
    if (/[a-z]/.test(one[0]) && /[A-Z]/.test(one[0]) && /[0-9]/.test(one[0])) {
      found.push({ start: one.index ?? 0, end: (one.index ?? 0) + one[0].length, shape: 'generatedWord' })
    }
  }
  // Sorted by where each starts; a sort keeps the shapes' order between two that start together.
  found.sort((a, b) => a.start - b.start)
  /** @type {SecretShape[]} */
  const marked = []
  let screened = ''
  let at = 0
  for (const one of found) {
    if (one.start < at) {
      // INSIDE A PIECE ALREADY MARKED: the marked piece grows to cover this one too.
      at = Math.max(at, one.end)
      continue
    }
    screened += text.slice(at, one.start) + theMarkerFor(one.shape)
    if (!marked.includes(one.shape)) marked.push(one.shape)
    at = one.end
  }
  return { text: screened + text.slice(at), marked }
}
