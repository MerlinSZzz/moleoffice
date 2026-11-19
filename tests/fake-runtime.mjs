#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN AGENT TOOL THAT ANSWERS WITHOUT A MODEL, FOR THE TEST SUITE ONLY.
 *
 * The worker starts an agent tool, waits for it to end, reads what it said and files that as a
 * message. Every one of those steps needs something at the far end. This is that something: it
 * reads the prompt, prints one JSON object, and exits. No model is called and nothing is spent.
 *
 * IT IS NEVER PRESENTED AS A REAL RUN. `src/worker/runtimes/fake.ts` is the adapter that starts it,
 * it is used only when `MOLE_OFFICE_FAKE_RUNTIME` names this file, and the worker's health row says
 * in words that runs are being faked while that setting is set.
 *
 *     node tests/fake-runtime.mjs "<the prompt>" [--resume <conversation id>]
 *
 * WHAT IT PRINTS: one object, `{"reply": "…", "conversation": "…", "model": "fake-runtime"}`. Its own shape, not a
 * copy of any real tool's, so that no real tool's output reader can pass its tests against this. `model` names this
 * script, which is what served this run; it is never the name of a real model (HB1, round 36).
 *
 * ITS BEHAVIOURS ARE CHOSEN BY THE PROMPT, so a test asks for one by writing a message and needs no
 * second channel to this script:
 *
 *   the prompt holds "please hang"      it waits, so a test can stop a run in flight, until its office
 *                                       has not answered for a minute (below)
 *   "please name the conversation and hang"
 *                                       it prints `{"conversation": …}` alone, as Codex and OpenCode
 *                                       name theirs near the start, and then waits in the same way
 *   the prompt holds "please fail"      it exits 1 having printed nothing on standard output
 *   anything else                       it replies, naming the first record id it finds
 *
 * AND ONE THING IT DOES BEFORE REPLYING: if the message asks to be taken somewhere, it does what
 * the prompt told it to do about that. Criterion M23. It is written as an agent that follows its
 * instructions and not as an agent that knows about leads: when the prompt does not carry the
 * skill's section on taking somebody to a page, it files no lead and names a link in its words
 * instead, which is exactly what the real agents did on 4 September (problem `e98DakSPxDwT`). So a
 * test that watches a page move is watching the PROMPT work, not this script.
 */

/** The heading of the section the prompt carries when it has told this run how to lead. */
const HOW_TO_LEAD = '## When somebody asks you to take them to a page'

/** What this script says served the run: itself. src/worker/runtimes/fake.ts reads it as the run's served model. */
const THE_FAKES_MODEL = 'fake-runtime'

const args = process.argv.slice(2)
const prompt = args[0] ?? ''
const at = args.indexOf('--resume')
const resume = at === -1 ? null : (args[at + 1] ?? null)

/**
 * WHAT THIS RUN WAS ASKED TO DO, WHICH IS THE MESSAGE AND NOT EVERYTHING ELSE IN THE PROMPT.
 *
 * The two instructions below used to be looked for anywhere in the prompt. That stopped being safe
 * on 6 September 2026, when the prompt started carrying the state of the project: a run whose
 * message says "please fail" also had, above it, the open work of a project where an earlier test
 * had sent "please hang, and nothing will age this record" — so the first match won and the run
 * hung instead of failing. `tests/a-restart-never-loses-a-run.test.ts` failed about half the time
 * and neither the test nor this script said why.
 *
 * A real agent follows the message it was given, not a sentence it read in its own context, and
 * that is what this now does. Everything before the message heading is context; the fall-back is
 * the whole prompt, for a caller that hands one over without the heading.
 */
const MESSAGE_HEADING = 'THE MESSAGE, record '
const asked = theMessage() || prompt

if (asked.includes('please answer then exit nonzero')) {
  const found = recordNamedIn(prompt)
  const reply = found === null ? 'The fake runtime printed an answer before it failed.' : `Read it. The record to open is ${found}.`
  process.stdout.write(JSON.stringify({ reply, conversation: resume ?? 'fake-failed', model: THE_FAKES_MODEL }) + '\n')
  process.exitCode = 23
} else if (asked.includes('please name the conversation and hang')) {
  process.stdout.write(JSON.stringify({ conversation: resume ?? `fake-${Math.random().toString(36).slice(2, 10)}` }) + '\n')
  hangWhileTheOfficeAnswers()
} else if (asked.includes('please hang')) {
  // Nothing to do and never finished. The worker stops this by its process group.
  hangWhileTheOfficeAnswers()
} else if (asked.includes('please fail')) {
  process.stderr.write('The fake runtime was asked to fail, so it did, and it printed no answer.\n')
  process.exit(1)
} else {
  await answer()
}

/**
 * WAIT, BUT ONLY WHILE THE OFFICE THAT STARTED THIS ANSWERS (problem jgGgPp02B97q).
 *
 * The office starts each run in a process group of its own, so a hanging run outlives its office by design. When a test
 * ended, or was stopped by its time limit, before it stopped its run, nothing ever did: on 4 October 2026 the secretary found ten
 * of these, 3 to 38 hours old, each waiting on a test office that was gone. So a hanging run asks its office, named in
 * MOLE_OFFICE_API as the worker gives every run, every few seconds. Any reply counts as an answer, whatever its status.
 * When none has come for a minute, it says so on standard error and ends with exit code 1. A run whose environment names
 * no office has nobody to ask, so it ends a minute after it started.
 *
 * FAKE_RUNTIME_GIVES_UP_AFTER_SECONDS shortens the minute, for the test of this. It is not a Mole Office setting, and
 * the worker passes it on only because it passes on every variable that is not one.
 */
function hangWhileTheOfficeAnswers() {
  const api = process.env.MOLE_OFFICE_API ?? null
  const limit = 1000 * Number(process.env.FAKE_RUNTIME_GIVES_UP_AFTER_SECONDS ?? 60)
  let answered = Date.now()
  const askTheOffice = async () => {
    if (api !== null) {
      try {
        await fetch(`${api}/api`, { method: 'HEAD', signal: AbortSignal.timeout(2_000) })
        answered = Date.now()
      } catch {
        // No reply, which is the one thing this asks. The silence is counted below.
      }
    }
    if (Date.now() - answered < limit) return
    process.stderr.write(
      `The fake runtime stopped waiting, because ${api === null ? 'no office was named in MOLE_OFFICE_API' : `the office at ${api} has not answered`} ` +
        `for ${limit / 1000} seconds.\n`,
    )
    process.exit(1)
  }
  setInterval(askTheOffice, Math.min(5_000, limit / 4))
}

/**
 * WHAT THIS RUN DOES WITH A MESSAGE: lead if it was asked to and was told how, then reply.
 *
 * Everything it needs is in the prompt, which is all a real run gets either: where the API is, who
 * to say it is, which project, who wrote to it, and what they said.
 */
async function answer() {
  const asked = theMessage()
  const takeMeTo = asked.match(/take me (?:there|to)\s*([A-Za-z0-9_-]{12})?/i)
  if (takeMeTo !== null && prompt.includes(HOW_TO_LEAD)) {
    await fileALead(takeMeTo[1] ?? recordNamedIn(asked))
  }

  // THE RECORD THE PROMPT NAMES. src/worker/prompt.ts writes a line saying "record <id>", and a
  // record id in this project is twelve characters of letters, digits, hyphen and underscore.
  // Naming it back is what makes the reply carry a link a reader can follow with one press.
  //
  // It reads that line rather than the first twelve-character word in the prompt, which was the
  // first thing this did: the prompt's own header lines carry "x-mole-office-workspace", and the
  // reply then named "-mole-office" as a record.
  const found = recordNamedIn(prompt)
  const reply =
    found === null
      ? 'Nothing in that message named a record, so this reply names none either.'
      : `Read it. The record to open is ${found}.`
  process.stdout.write(
    JSON.stringify({
      reply,
      conversation: resume ?? `fake-${Math.random().toString(36).slice(2, 10)}`,
      model: THE_FAKES_MODEL,
    }) + '\n',
  )
}

/** What the message said, which is the block the prompt indents under "THE MESSAGE". */
function theMessage() {
  const from = prompt.indexOf('THE MESSAGE, record ')
  if (from === -1) return ''
  const rest = prompt.slice(from)
  const ends = rest.indexOf('WHAT HAPPENS TO WHAT YOU SAY')
  return ends === -1 ? rest : rest.slice(0, ends)
}

/**
 * The first record id in a piece of text, or null because there is none.
 *
 * The id ends where a character that cannot be in an id comes, and not at a word boundary. An id may
 * end in a hyphen, and the prompt follows it with a colon: neither is a word character, so a word
 * boundary there never matches. One id in about 64 ends in a hyphen, and the reply then named no
 * record (problem JycvYDdi3WjX, seen with txwAjvR0O6x- on 4 September 2026).
 */
function recordNamedIn(text) {
  const found = text.match(/\brecord ([A-Za-z0-9_-]{12})(?![A-Za-z0-9_-])/)
  return found === null ? null : found[1]
}

/** One value out of the prompt's own header block, or null because it is not there. */
function fromThePrompt(pattern) {
  const found = prompt.match(pattern)
  return found === null ? null : found[1]
}

/**
 * FILE A MESSAGE CARRYING A LEAD, exactly as the prompt's section says to.
 *
 * A failure is printed on the problem channel and the run still replies. A run that died here would
 * look to the worker like a tool that printed nothing, and the reason would be lost.
 */
async function fileALead(recordId) {
  // TO THE END OF THE SENTENCE, NOT TO THE FIRST DOT. `http://127.0.0.1:29900` is full of dots, so
  // a non-greedy read up to a dot gave `http://127` and every request went nowhere.
  const api = fromThePrompt(/Mole Office is at (\S+)\. Read /)
  const workspace = fromThePrompt(/x-mole-office-workspace: (\S+)/)
  const me = fromThePrompt(/x-mole-office-actor-id: (\S+)/)
  // THE SENDER'S ID IS IN THE BRACKETS, after "id" (problem ynGL0myEnAbi): the line says an agent by its
  // handle and a person by name first, and the id is what an answer is addressed to.
  const sender = prompt.match(/WHO SENT IT: (person|agent) [^\n(]*\([^\n)]*?\bid ([^,)\s]+)/)
  if (recordId === null || api === null || workspace === null || me === null || sender === null) {
    process.stderr.write('The fake runtime was asked to lead and the prompt did not say enough to do it.\n')
    return
  }
  const reply = await fetch(`${api}/api/records`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-mole-office-workspace': workspace,
      'x-mole-office-actor-type': 'agent',
      'x-mole-office-actor-id': me,
    },
    body: JSON.stringify({
      kind: 'message',
      title: 'Here it is.',
      data: {
        body: `Taking you to ${recordId}.`,
        to: [{ kind: sender[1], id: sender[2] }],
        lead: { target: { kind: 'record', recordId, workspaceId: workspace } },
      },
    }),
  })
  if (!reply.ok) {
    process.stderr.write(`The fake runtime could not file a lead: ${reply.status} ${await reply.text()}\n`)
  }
}
