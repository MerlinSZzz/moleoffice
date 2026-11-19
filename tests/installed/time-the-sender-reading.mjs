// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW LONG AN INSTALLED OFFICE ON WINDOWS TAKES TO READ WHICH PROGRAM SENT A REQUEST, AND WHERE THE TIME GOES.
 *
 * Inside the installed Windows app, a request with no key is read before its handler: one PowerShell script says which
 * process holds the request's connection (src/server/lib/windows-probe.ts). On a Windows 11 machine on 12 November 2026
 * that reading took 10.6 to 14.1 seconds, and a reading that takes more than ten is refused with 503. The probe now
 * writes one line to the office's log for each reading. This tool sends a few requests with no key, each on a
 * connection of its own, and prints for each how long its answer took and what the log's line says of its reading.
 *
 * Run it with the installed office's own Node, against a test office, with the office's address and its service log:
 *
 *   resources\office\runtime\node.exe time-the-sender-reading.mjs --api http://127.0.0.1:<port> --log <the log>
 *
 * The service log is the database's path with `.service.log` after it. `--alone <n>` is how many requests go one after
 * another (5), and `--together <n>` how many go at the same moment after them (3). The office is named only by --api:
 * nothing is read from the environment. The tool reads only the office's answers and the lines the office writes to its
 * log after the tool starts. It needs nothing from a checkout.
 *
 * Kept apart from what it runs, so a test can import `readTheLine` and hold it to the probe's own line.
 */

import { closeSync, openSync, readSync, statSync } from 'node:fs'
import { request } from 'node:http'
import { pathToFileURL } from 'node:url'

/** The door each request asks: the pairing state, which the window's page reads before it is paired. It changes nothing. */
const THE_DOOR = '/api/office/pairing'

/** How long the tool waits for the log's line about each reading after the last answer, in milliseconds. */
const THE_LOGS_WAIT = 30_000

/**
 * @typedef {{ peerPort: number, serverPort: number, ms: number, failed: null,
 *   where: { queuedMs: number, startingMs: number, ranMs: number } | null,
 *   steps: { connection: number, owners: number, server: number, again: number } | null, theWindow: boolean }
 *   | { peerPort: number, serverPort: number, ms: number, failed: string }} AReading
 */

/**
 * READ ONE LINE OF THE LOG: the probe's line about a reading, or null for any other line. A line the service wrote as
 * JSON is read from its message.
 * @param {string} text
 * @returns {AReading | null}
 */
export function readTheLine(text) {
  let line = text.trim()
  if (line.startsWith('{')) {
    try {
      const said = JSON.parse(line)
      if (typeof said?.msg === 'string') line = said.msg
    } catch {
      // Not JSON after all: read as it is.
    }
  }
  const failed = /^Windows did not say who holds the connection from port (\d+) to port (\d+), after (\d+) ms: (.*)$/su.exec(line)
  if (failed !== null) {
    return { peerPort: Number(failed[1]), serverPort: Number(failed[2]), ms: Number(failed[3]), failed: String(failed[4]) }
  }
  const read = /^Windows said who holds the connection from port (\d+) to port (\d+) in (\d+) ms: (.*?); (.*?)\. (It is (?:not )?the installed app's own window)\.$/su.exec(line)
  if (read === null) return null
  const where = /^(\d+) ms waiting behind other readings, (\d+) ms waiting for PowerShell to start, (\d+) ms from the script's turn to its answer$/u.exec(String(read[4]))
  const steps = /^in PowerShell, (\d+) ms reading the connection, (\d+) ms its owners and their parents, (\d+) ms this server and (\d+) ms the connection again$/u.exec(String(read[5]))
  return {
    peerPort: Number(read[1]),
    serverPort: Number(read[2]),
    ms: Number(read[3]),
    failed: null,
    where: where === null ? null : { queuedMs: Number(where[1]), startingMs: Number(where[2]), ranMs: Number(where[3]) },
    steps: steps === null ? null : { connection: Number(steps[1]), owners: Number(steps[2]), server: Number(steps[3]), again: Number(steps[4]) },
    theWindow: !String(read[6]).includes(' not '),
  }
}

/**
 * The words the tool prints about one reading.
 * @param {AReading} reading
 * @returns {string}
 */
function theReadingSaid(reading) {
  if (reading.failed !== null) return `The reading failed after ${String(reading.ms)} ms: ${reading.failed}`
  const where =
    reading.where === null
      ? 'The log does not say where that time went, because the reading ran in a PowerShell started for it.'
      : `It waited ${String(reading.where.queuedMs)} ms behind other readings and ${String(reading.where.startingMs)} ms for PowerShell to start. ` +
        `From the script's turn to its answer took ${String(reading.where.ranMs)} ms.`
  const steps =
    reading.steps === null
      ? 'PowerShell did not say how long each step took.'
      : `In PowerShell: ${String(reading.steps.connection)} ms reading the connection, ${String(reading.steps.owners)} ms its owners ` +
        `and their parents, ${String(reading.steps.server)} ms this server, ${String(reading.steps.again)} ms the connection again.`
  return `The reading took ${String(reading.ms)} ms. ${where} ${steps}`
}

/**
 * Send one request with no key, on a connection of its own, and say when it was answered and from which port it went.
 * @param {URL} api
 * @returns {Promise<{ peerPort: number | null, status: number | null, ms: number, code: string | null, error: string | null }>}
 */
function askOnce(api) {
  return new Promise((done) => {
    const sent = performance.now()
    /** @type {number | null} */
    let peerPort = null
    const asked = request({ host: api.hostname, port: Number(api.port), path: THE_DOOR, method: 'GET', agent: false }, (answer) => {
      let body = ''
      answer.setEncoding('utf8')
      answer.on('data', (piece) => (body += piece))
      answer.on('end', () => {
        /** @type {string | null} */
        let code = null
        try {
          const said = JSON.parse(body)
          if (typeof said?.code === 'string') code = said.code
        } catch {
          // Not JSON: no code.
        }
        done({ peerPort, status: answer.statusCode ?? null, ms: performance.now() - sent, code, error: null })
      })
    })
    asked.on('socket', (socket) => socket.on('connect', () => (peerPort = socket.localPort ?? null)))
    asked.on('error', (e) => done({ peerPort, status: null, ms: performance.now() - sent, code: null, error: e.message }))
    asked.setTimeout(60_000, () => asked.destroy(new Error('no answer within 60 seconds')))
    asked.end()
  })
}

/**
 * What the log holds after a given length, read as text.
 * @param {string} log
 * @param {number} from
 * @returns {string}
 */
function theLogAfter(log, from) {
  const size = statSync(log).size
  if (size <= from) return ''
  const fd = openSync(log, 'r')
  try {
    const bytes = Buffer.alloc(size - from)
    readSync(fd, bytes, 0, bytes.length, from)
    return bytes.toString('utf8')
  } finally {
    closeSync(fd)
  }
}

/**
 * The options, or a sentence that says what is missing.
 * @param {string[]} argv
 * @returns {{ api: URL, log: string, alone: number, together: number } | string}
 */
function theOptionsIn(argv) {
  /** @type {Record<string, string>} */
  const given = {}
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]
    const value = argv[i + 1]
    if (name === undefined || !name.startsWith('--') || value === undefined) return `The option ${JSON.stringify(name)} has no value.`
    given[name.slice(2)] = value
  }
  if (given['api'] === undefined) return 'Name the test office with --api http://127.0.0.1:<port>.'
  if (given['log'] === undefined) return "Name the test office's service log with --log <path>."
  let api
  try {
    api = new URL(given['api'])
  } catch {
    return `${JSON.stringify(given['api'])} is not an address.`
  }
  if (api.protocol !== 'http:' || api.port === '') return `${given['api']} is not an http address with a port.`
  const alone = Number(given['alone'] ?? 5)
  const together = Number(given['together'] ?? 3)
  if (!Number.isSafeInteger(alone) || alone < 0 || !Number.isSafeInteger(together) || together < 0 || alone + together === 0) {
    return '--alone and --together are whole numbers of requests, and at least one request is sent.'
  }
  return { api, log: given['log'], alone, together }
}

async function main() {
  const options = theOptionsIn(process.argv.slice(2))
  if (typeof options === 'string') {
    console.error(options)
    process.exit(2)
  }
  let from
  try {
    from = statSync(options.log).size
  } catch (e) {
    console.error(`The log ${options.log} cannot be read: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(2)
  }
  console.log(`Asking ${options.api.origin}${THE_DOOR} with no key: ${String(options.alone)} requests one after another, then ${String(options.together)} at the same moment.`)
  /** @type {{ which: string, asked: Awaited<ReturnType<typeof askOnce>> }[]} */
  const sent = []
  for (let i = 1; i <= options.alone; i += 1) sent.push({ which: `request ${String(i)}, alone`, asked: await askOnce(options.api) })
  const together = await Promise.all(Array.from({ length: options.together }, () => askOnce(options.api)))
  together.forEach((asked, i) => sent.push({ which: `request ${String(options.alone + i + 1)}, one of ${String(options.together)} together`, asked }))

  // EACH LINE IS WRITTEN WHEN ITS READING ENDS, which may be after a refusal has answered.
  /** @type {Map<number, AReading>} */
  const readings = new Map()
  const until = Date.now() + THE_LOGS_WAIT
  const wanted = sent.filter((one) => one.asked.peerPort !== null).length
  while (readings.size < wanted && Date.now() < until) {
    readings.clear()
    for (const text of theLogAfter(options.log, from).split(/\r?\n/u)) {
      const reading = readTheLine(text)
      if (reading !== null && reading.serverPort === Number(options.api.port)) readings.set(reading.peerPort, reading)
    }
    if (readings.size < wanted) await new Promise((later) => setTimeout(later, 500))
  }

  for (const { which, asked } of sent) {
    const answered =
      asked.status === null
        ? `was not answered (${String(asked.error)}) after ${String(Math.round(asked.ms))} ms`
        : `was answered ${String(asked.status)}${asked.code === null ? '' : ` (${asked.code})`} in ${String(Math.round(asked.ms))} ms`
    const reading = asked.peerPort === null ? undefined : readings.get(asked.peerPort)
    const read =
      reading === undefined
        ? `No line in the log is about its connection${asked.peerPort === null ? '' : ` from port ${String(asked.peerPort)}`}, so the office did not read it, or wrote nothing about it.`
        : theReadingSaid(reading)
    console.log(`${which}: GET ${THE_DOOR} ${answered}. ${read}`)
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main()
