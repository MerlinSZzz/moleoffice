// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE STAND-IN: WHAT ANSWERS ON THE OFFICE'S PORT WHILE THE DEV SUPERVISOR HAS NO SERVER RUNNING.
 *
 * `tools/serve-dev.mjs` holds the listening socket for its whole life and hands it to each server
 * as file descriptor 3 (problem `xGeC_iM6jxYl`). In an ordinary restart nothing else is needed: the
 * kernel holds new connections in the socket's queue until the new server takes them. But a server
 * that fails to start, crashes, waits out a backoff, is refused by the guard or waits for the
 * service lock leaves the socket with nobody taking from the queue, and a request would wait for
 * ever instead of being told why.
 *
 * So serve-dev starts this in those cases, on the same descriptor. It answers every request at
 * once with 503, the reason serve-dev gave it, `retry-after` and `STAND_IN_HEADER` naming the
 * supervisor's pid. It never answers 200 and never claims to be the office.
 *
 * IT NEVER RUNS BESIDE A SERVER SERVE-DEV STARTS. Two processes taking from one queue would split the
 * requests between them. serve-dev stops this and waits for it to exit before it starts a server.
 * It does run beside a server serve-dev has told to stop and cannot yet see gone: one still alive
 * after SIGTERM and SIGKILL, or one that did not answer within its time (check `qCP4OR2YDwvZ`).
 * It also runs beside a server that has said its migrations began, until it says they ended
 * (check `m5X4lu3B2F7L`, `migration-markers.mjs`). In every case seen, that server takes nothing
 * from the queue: it has closed its listener or not opened one yet. If one still took a request,
 * that request would be its to answer or not.
 *
 * SO IT ANSWERS IN AN ORDINARY RESTART TOO. Every start says its migrations began, also when there
 * are none to run, so each request waiting in the queue at that moment is answered 503 by this.
 * Wave 13x, round 8 measured it: a read sent 213 ms after a change, before the old server was told
 * to stop, was answered by this 1.37 s later, in a 47 ms migrations check. The callers the office
 * starts therefore ask again after this answer, which says nothing was read or written.
 *
 * IT GOES WITH ITS SUPERVISOR. It is in serve-dev's own process group, so a stop of that group
 * stops it. It also looks once a second for serve-dev, by pid and start time as the server does
 * (`aWatchOnTheStarter`), and exits when it is gone, which is the one way out that `kill -KILL` on
 * serve-dev leaves. A stand-in left behind would make the next serve-dev refuse the port.
 *
 * A REFUSAL IT CAN NAME IS CARRIED AS ITS OWN FIELD. With `--refusal=<code>` the 503 body carries
 * `refusal: "<code>"` beside `error`, so a reader that has to tell which refusal this is does it from
 * the field, never by matching the English of the sentence. Without the option the body is what it
 * always was.
 *
 * A NAMED REFUSAL DOES NOT SAY "ASK AGAIN". Every other reason is a pause, and asking again in a few
 * seconds is the way on. A refusal answers the same until its cause is put right, so there the body
 * ends by saying that instead (R-XCa_5dh7TO, mN8h7w_OqHAA).
 *
 *   node tools/serve-dev-stand-in.mjs --supervisor-pid=<pid> --reason=<words> [--refusal=<code>]
 */
import { createServer } from 'node:http'
import { STAND_IN_HEADER } from '../src/config/stand-in-header.mjs'
import { aWatchOnTheStarter } from '../src/config/session-process.mjs'
import { THE_STAND_IN_GRACE_MS } from '../src/config/settings.mjs'

const valueOf = (/** @type {string} */ name) => {
  const found = process.argv.find((one) => one.startsWith(`--${name}=`))
  return found === undefined ? null : found.slice(name.length + 3)
}

const supervisor = Number(valueOf('supervisor-pid'))
const reason = valueOf('reason')
const refusal = valueOf('refusal')
if (!Number.isInteger(supervisor) || supervisor <= 1 || reason === null || reason === '') {
  process.stderr.write('The stand-in needs --supervisor-pid=<a pid> and --reason=<words>. It answered nothing.\n')
  process.exit(2)
}

/** How long a caller is told to wait before it asks again, in seconds. */
const ASK_AGAIN_IN = 5

const theWayOn =
  refusal === null || refusal === ''
    ? 'Ask again in a few seconds.'
    : 'Asking again changes nothing until the cause of this refusal is put right.'

const body = JSON.stringify({
  error:
    `The dev supervisor (process ${String(supervisor)}) holds this port, and no Mole Office server is answering ` +
    `on it now: ${reason} Nothing was read or written. ${theWayOn}`,
  ...(refusal === null || refusal === '' ? {} : { refusal }),
})

const server = createServer((request, reply) => {
  request.resume()
  reply.writeHead(503, {
    'content-type': 'application/json; charset=utf-8',
    'retry-after': String(ASK_AGAIN_IN),
    [STAND_IN_HEADER]: String(supervisor),
    connection: 'close',
  })
  reply.end(body)
})

/**
 * LEAVING ANSWERS EVERY READ ALREADY TAKEN (check `SJFYLt5k4wwi`). `server.close()` stops taking
 * more and leaves the rest in the socket's queue for the next process, and each connection already
 * taken is answered and then closed. Until 7 October 2026 this also called `closeAllConnections()`
 * at once. On a loaded machine that closed connections whose requests it had not yet read: 4 reads
 * were reset and 3 closed unanswered in 16 runs of tests/the-office-answers-while-it-restarts.test.ts.
 *
 * A connection still open after THE_STAND_IN_GRACE_MS is ended then, so one
 * that never asks cannot keep this alive past its supervisor's wish.
 */
const leave = () => {
  server.close(() => process.exit(0))
  setTimeout(() => server.closeAllConnections(), THE_STAND_IN_GRACE_MS).unref()
}
process.on('SIGTERM', leave)
process.on('SIGINT', leave)

const theSupervisor = aWatchOnTheStarter(supervisor)
const watch = setInterval(() => {
  const answer = theSupervisor()
  if (answer.state === 'there') return
  clearInterval(watch)
  if (answer.state === 'unreadable') {
    // COULD NOT LOOK IS NOT GONE, as in the server's own watch. It says so once and stops watching;
    // a stop of serve-dev's group still reaches it.
    process.stderr.write(`The stand-in cannot tell whether process ${String(supervisor)} is running (${answer.why}), so it will not stop itself.\n`)
    return
  }
  leave()
}, 1000)

server.on('error', (err) => {
  process.stderr.write(`The stand-in could not listen on descriptor 3: ${err.message}\n`)
  process.exit(1)
})
/**
 * IT SAYS `listening` ONLY ONCE IT HAS TAKEN WHAT WAS WAITING (check `SJFYLt5k4wwi`). serve-dev stops
 * a stand-in only after that word. Node does not take every waiting connection the moment it
 * listens: a stand-in told to stop as soon as it listened took 2 of 40 connections waiting in the
 * queue (`ss` showed 40, then 38). When the next server never answered either, those reads waited
 * through it as well, and in the test some waited 20 s and gave up. So the word waits until no new
 * connection has come for `QUIET_FOR_MS`, and at most for THE_STAND_IN_GRACE_MS. Then all 40 were answered.
 *
 * QUIET IS CHECKED AGAIN AFTER NODE HAS LOOKED AT THE SOCKET. Node runs due timers before it takes
 * waiting connections. So a stand-in held up by a loaded machine found 315 ms of quiet with 13
 * connections still in the queue (`ss`, 7 October 2026). A backoff restart that stopped it then would
 * leave those reads to the next server. The check therefore ends in `setImmediate`, which runs only
 * after node has taken what was waiting.
 *
 * The wait is here and not in `leave`, because a stand-in is also stopped beside a server that has
 * just started listening, at the end of its migrations. A stand-in still taking connections then
 * would answer 503 for a server that is ready. For the same reason serve-dev does not wait for this
 * word there: the server takes the queue itself.
 */
const QUIET_FOR_MS = 50
let lastTaken = Date.now()
server.on('connection', () => {
  lastTaken = Date.now()
})
server.listen({ fd: 3 }, () => {
  const listenedAt = Date.now()
  const sayOnceQuiet = () => {
    const now = Date.now()
    if (now - lastTaken < QUIET_FOR_MS && now - listenedAt < THE_STAND_IN_GRACE_MS) {
      setTimeout(sayOnceQuiet, 10)
      return
    }
    const seen = lastTaken
    setImmediate(() => {
      if (lastTaken !== seen && Date.now() - listenedAt < THE_STAND_IN_GRACE_MS) {
        setTimeout(sayOnceQuiet, 10)
        return
      }
      process.stdout.write('listening\n')
    })
  }
  setTimeout(sayOnceQuiet, 10)
})
