// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SERVED READER: WHAT A dsh RUN'S RUNTIME SERVED IT, READ FROM ITS OWN TRANSCRIPT.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * Criterion HB1: a run's conditions are on its session record, written by the runner and not by
 * hand. `stop.mjs` calls `writeTheServed` below at the run's end, and this file is the reader
 * that decides the four numbers. It is a module of its own rather than lines inside stop.mjs
 * because a fixture-transcript test has to read the reader without running the hook, and because
 * a second hook that needs the same facts would import it rather than copy it.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE A TRANSCRIPT LIVES, AND THE ONE NAMED COPY
 * ---------------------------------------------------------------------------------------
 *
 * dsh stores every session under `$DSH_HOME/sessions/<project key>/<session id>/`, where the
 * project key encodes the run's working directory. The encoder below is copied, with its source
 * named, from the `projectKey` function of the installed dsh package
 * `@deepseek-ai/dsh-session-persistence-jsonl` (lib/index.js). A hook cannot import that package:
 * its module paths hold the repository, not dsh's node_modules. The currency of the office rule
 * that one fact is worked out in one place is spent here on purpose, and the comment that names
 * the source is what keeps the copy honest.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS COUNTED, AND THE ONE COUNTING RULE
 * ---------------------------------------------------------------------------------------
 *
 * The first stock-take of the office's flow (report `jDwkhne4tDWR`, block 2) counted a dsh
 * transcript's usage and named the rule this reader keeps: count `data.usage` on the assistant
 * messages, and NEVER the copies of the same numbers inside each message's `stream` array, which
 * the provider's transcript of its own streaming carries — counting them doubles the total.
 *
 * The model is the model the provider's responses carried: `source.model` on the assistant
 * messages, not a configured value. The temperature is read from the request-context events when
 * the provider reported one; where dsh carried none, the words "not reported" are stored — the
 * runner saying it cannot state a fact is a real answer, and a guessed number is not.
 *
 * THE VALUE IS NEVER A KEY. Nothing here reads a key file or prints what an env file held.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

/** The words a field holds when the runtime gave nothing for it. Absence of the whole `served` object is different: that reads as "not recorded". */
export const NOT_REPORTED = 'not reported'

/**
 * THE PROJECT DIRECTORY NAME dsh GIVES A WORKING DIRECTORY, copied from
 * `@deepseek-ai/dsh-session-persistence-jsonl`'s `projectKey`, which is named in the header above.
 */
export function projectKey(cwd) {
  if (cwd.length === 0) throw new Error('cannot encode an empty project path')
  let readable = ''
  let separatorRun = false
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
}

/**
 * THE TRANSCRIPT OF ONE dsh RUN, as a path, or null because nothing could be found.
 *
 * The dsh session id comes from the hook payload and names the directory. When the payload named
 * nothing usable, the newest transcript in the project's directory is taken — it is the run that
 * just ended, and a run's hook fires while its own session is the one being written.
 */
export function findTheTranscript(dshHome, cwd, sessionId) {
  try {
    const projectDir = join(dshHome, 'sessions', projectKey(cwd))
    let sessionDir = theSessionFolderNamed(projectDir, sessionId)
    if (sessionDir === null) {
      // THE NEWEST SESSION IN THE PROJECT DIRECTORY. A second-best answer still beats none when
      // the payload carried no session id; a wrong pick is refused by the cwd check inside.
      let newest = null
      let newestAt = -1
      for (const name of readdirSync(projectDir)) {
        const full = join(projectDir, name)
        try {
          const at = statSync(full).mtimeMs
          if (statSync(full).isDirectory() && at > newestAt) { newestAt = at; newest = full }
        } catch {
          // Not a directory we can stat; skip it.
        }
      }
      sessionDir = newest
    }
    return sessionDir === null ? null : theNewestTranscriptIn(sessionDir)
  } catch {
    return null
  }
}

/**
 * THE TRANSCRIPT OF THE dsh SESSION NAMED, and of no other, as a path, or null. Unlike
 * `findTheTranscript` it never takes the project's newest session in its place: the seal reads a
 * run's own log or none (tools/the-seal-receipt.mjs, condition 2).
 */
export function theTranscriptOfTheSession(dshHome, cwd, sessionId) {
  try {
    const sessionDir = theSessionFolderNamed(join(dshHome, 'sessions', projectKey(cwd)), sessionId)
    return sessionDir === null ? null : theNewestTranscriptIn(sessionDir)
  } catch {
    return null
  }
}

/** The folder of the session an id names, under each spelling dsh has used for it, or null. */
function theSessionFolderNamed(projectDir, sessionId) {
  const wanted = typeof sessionId === 'string' && sessionId.trim() !== ''
    ? [sessionId, `session-${sessionId}`, ...sessionId.startsWith('session-') ? [sessionId.slice('session-'.length)] : []]
    : []
  for (const name of wanted) {
    try {
      if (statSync(join(projectDir, name)).isDirectory()) return join(projectDir, name)
    } catch {
      // Not this spelling; try the next.
    }
  }
  return null
}

/** The newest transcript file in one session's folder, or null. */
function theNewestTranscriptIn(sessionDir) {
  const files = readdirSync(sessionDir).filter((one) => /\.jsonl(\.zstd)?$/.test(one) && one.startsWith('session'))
  if (files.length === 0) return null
  // dsh writes v3 zstd frames today; take the newest whatever it spelled itself.
  let best = null
  let bestAt = -1
  for (const one of files) {
    try {
      const at = statSync(join(sessionDir, one)).mtimeMs
      if (at > bestAt) { bestAt = at; best = one }
    } catch {
      // Gone between listing and reading; skip it.
    }
  }
  return best === null ? null : join(sessionDir, best)
}

/**
 * THE SIZE OF ONE FILE, or null. The brief path is what run-agent.sh was given, and a file gone
 * by the run's end is a real answer: null, which the caller stores as the words "not reported".
 */
export function sizeOfTheBrief(path) {
  if (typeof path !== 'string' || path.trim() === '') return null
  try { return statSync(path).size } catch { return null }
}

/**
 * ONE TRANSCRIPT'S FILES, read into the three facts, with the brief's bytes beside them.
 *
 * `text` is the decompressed JSONL. Each line is one event. The three facts:
 *   - assistant/message events carry `usage.inputTokens` — every line counted once, top-level
 *     only, standing for the steward's rule above; and `message.source.model`, the model each
 *     response was served under;
 *   - request/context events may carry `temperature`, the number the session ran at.
 */
export function theServedOfATranscript(text, briefBytes) {
  const inputs = []
  const models = []
  const temperatures = []
  for (const line of String(text).split('\n')) {
    if (line.trim() === '') continue
    let event
    try { event = JSON.parse(line) } catch { continue }
    if (event === null || typeof event !== 'object') continue
    const data = event['data']
    if (data === null || typeof data !== 'object') continue
    if (event['type'] === 'assistant/message') {
      const usage = data['usage']
      if (usage !== null && typeof usage === 'object' && Number.isFinite(usage['inputTokens'])) inputs.push(usage['inputTokens'])
      const message = data['message']
      const source = message !== null && typeof message === 'object' ? message['source'] : null
      if (source !== null && typeof source === 'object' && typeof source['model'] === 'string' && source['model'] !== '') models.push(source['model'])
    }
    if (event['type'] === 'request/context' && Number.isFinite(data['temperature'])) temperatures.push(data['temperature'])
  }
  const distinctTemperatures = [...new Set(temperatures)]
  const distinctModels = [...new Set(models)]
  return {
    model: distinctModels.length === 0 ? NOT_REPORTED : distinctModels.join(', '),
    temperature: distinctTemperatures.length === 1 ? distinctTemperatures[0] : NOT_REPORTED,
    briefBytes: briefBytes === null ? NOT_REPORTED : briefBytes,
    contextTokens: {
      largestTurn: inputs.length === 0 ? NOT_REPORTED : Math.max(...inputs),
      total: inputs.length === 0 ? NOT_REPORTED : inputs.reduce((one, sum) => sum + one, 0),
    },
  }
}

/**
 * WHERE EACH ZSTD FRAME OF A BUFFER ENDS, as a list of the frames' bytes in order.
 *
 * The walk reads the frame format of RFC 8878. A frame is its magic number, a header, a run of
 * blocks and an optional checksum. The header's first byte says how long the rest of the header
 * is. Each block starts with a 3-byte header that gives its type, its size and whether it is the
 * last block. A skippable frame (magic 0x184D2A50 to 0x184D2A5F) is its magic, a 4-byte length and
 * that many bytes; it holds no text, so it is left out of the list.
 *
 * The frames are found by walking, not by searching for the magic number's four bytes. The same
 * four bytes can occur inside compressed data.
 *
 * It throws when the bytes are not whole frames: an unknown magic number, a reserved bit or block
 * type, or a frame that runs past the end of the buffer.
 */
function theFramesOf(bytes) {
  const frames = []
  let at = 0
  while (at < bytes.length) {
    if (at + 4 > bytes.length) throw new Error('a frame is cut short')
    const magic = bytes.readUInt32LE(at)
    if (magic >= 0x184d2a50 && magic <= 0x184d2a5f) {
      if (at + 8 > bytes.length) throw new Error('a skippable frame is cut short')
      at += 8 + bytes.readUInt32LE(at + 4)
      if (at > bytes.length) throw new Error('a skippable frame is cut short')
      continue
    }
    if (magic !== 0xfd2fb528) throw new Error('the bytes are not a zstd frame')
    const start = at
    if (at + 5 > bytes.length) throw new Error('a frame header is cut short')
    const descriptor = bytes[at + 4]
    if ((descriptor & 0x08) !== 0) throw new Error('a frame header sets its reserved bit')
    const singleSegment = (descriptor >> 5) & 1
    let p = at + 5
    if (singleSegment === 0) p += 1
    p += [0, 1, 2, 4][descriptor & 3]
    p += [singleSegment, 2, 4, 8][descriptor >> 6]
    for (;;) {
      if (p + 3 > bytes.length) throw new Error('a block header is cut short')
      const header = bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16)
      const type = (header >> 1) & 3
      if (type === 3) throw new Error('a block has the reserved type')
      // An RLE block (type 1) stores one byte, however large the size it gives.
      p += 3 + (type === 1 ? 1 : header >>> 3)
      if ((header & 1) === 1) break
    }
    if ((descriptor & 0x04) !== 0) p += 4
    if (p > bytes.length) throw new Error('a frame is cut short')
    frames.push(bytes.subarray(start, p))
    at = p
  }
  return frames
}

/**
 * THE MOST TEXT A `.zstd` TRANSCRIPT IS DECODED TO, over all its frames together (review
 * OcaFB-eOWjWp, point 2). The limit on a transcript's size is on its compressed bytes, and a few
 * compressed MB can decode to many GB. Past this, the transcript has no text.
 */
export const THE_MOST_OF_A_TRANSCRIPTS_TEXT = 64 * 1024 * 1024

const PAST_THE_MOST = `its text is longer than ${String(THE_MOST_OF_A_TRANSCRIPTS_TEXT)} bytes, the most a transcript is decoded to`

/**
 * DECODE THE TRANSCRIPT'S BYTES INTO THE TEXT the reader reads: `{ text }`, or `{ text: null, why }`.
 * A plain jsonl file is read as it stands.
 *
 * A `.zstd` transcript is many zstd frames, one after another: dsh appends one frame each time it
 * writes to the file. One call to `zstdDecompressSync` on the whole file returns only the first
 * frame, which is the session header line and nothing else. So each frame is decompressed on its
 * own and the bytes are joined in order before they are read as text. Each frame may decode only to
 * what is left of THE_MOST_OF_A_TRANSCRIPTS_TEXT, so zstd stops a frame that would pass it.
 *
 * The read gives no text when the walk finds bytes that are not whole frames, when zstd refuses a
 * frame, or when the text would pass the most. It does so even when the frames before the bad one
 * decoded: a part of a transcript is not the transcript.
 */
export function theTextOfTheTranscript(path, bytes) {
  if (path.endsWith('.jsonl')) return { text: bytes.toString('utf8') }
  let frames
  try {
    frames = theFramesOf(bytes)
  } catch {
    return { text: null, why: 'its bytes are not whole zstd frames' }
  }
  const decoded = []
  let left = THE_MOST_OF_A_TRANSCRIPTS_TEXT
  for (const frame of frames) {
    let one
    try {
      // zstd will not take 0 here. With nothing left, a frame that decodes to any byte is past the most.
      one = zstdDecompressSync(frame, { maxOutputLength: Math.max(left, 1) })
    } catch (error) {
      return { text: null, why: error?.code === 'ERR_BUFFER_TOO_LARGE' ? PAST_THE_MOST : 'zstd refused one of its frames' }
    }
    left -= one.length
    if (left < 0) return { text: null, why: PAST_THE_MOST }
    decoded.push(one)
  }
  return { text: Buffer.concat(decoded).toString('utf8') }
}

/** The transcript's text, as theTextOfTheTranscript decodes it, or null. The caller turns null into the all-"not reported" object. */
export function textOfTheTranscript(path, bytes) {
  return theTextOfTheTranscript(path, bytes).text
}

/** The bytes of the transcript file, or null when it is gone or will not read. */
export function bytesOfTheTranscript(path) {
  try { return readFileSync(path) } catch { return null }
}
