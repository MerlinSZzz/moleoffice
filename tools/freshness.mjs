// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * IS THE SERVER YOU ARE ABOUT TO MEASURE RUNNING THE CODE IN THIS CHECKOUT?
 *
 *     node tools/freshness.mjs                       ask the API .env points at
 *     node tools/freshness.mjs --api http://…:29601  ask another one
 *     node tools/freshness.mjs --json
 *
 * Exit 0 fresh, 1 stale, 2 could not be asked.
 *
 * ---------------------------------------------------------------------------------------
 * WHY EVERY MEASURING TOOL CALLS THIS FIRST
 * ---------------------------------------------------------------------------------------
 *
 * Criterion G6 of design/ground/ACCEPTANCE.md. From section 2 of the same document, measured:
 *
 * - **Two whole gate runs were invalidated** by a browser serving a seven-hour-old transform of
 *   `src/shared`, and nothing said the code was old.
 * - **A live API served stale code through an entire gate**, reloading only by accident.
 * - **Freshness was never provable** from a process start time; every round proved it functionally,
 *   which means somebody clicked something and formed an opinion.
 *
 * A sweep of a stale world is worse than no sweep. It produces numbers, the numbers look like
 * measurements, and they are measurements of code nobody has any more. So `tools/zoom-sweep.mjs`,
 * `tools/dup-keys.mjs` and `tools/press-census.mjs` import `refuseAStaleWorld` below and stop before
 * they measure anything. `tools/review.mjs` asks through `askAboutFreshness` and `whyNotToMeasure`
 * and throws instead, so that it still stops the servers it started.
 *
 * ---------------------------------------------------------------------------------------
 * IT ASKS THE SERVER. IT DOES NOT WORK THE ANSWER OUT ITSELF.
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/runtime/freshness` compares what that process loaded against what is on disk now. Only
 * that process knows the first half. A tool that walked the checkout and guessed would be
 * measuring its own checkout against itself, which is always fresh and always useless.
 */

import { whereIsTheApi } from './where-is-the-api.mjs'

/**
 * Ask a running Mole Office whether it is serving the code in the checkout.
 *
 * Returns the whole reply. Throws with a plain sentence when nothing answered — a tool that cannot
 * ask has not learnt that the world is fresh.
 */
export async function askAboutFreshness(api) {
  let res
  try {
    res = await fetch(`${api}/api/runtime/freshness`)
  } catch (err) {
    throw new Error(
      `Nothing answered at ${api} (${err.message}), so whether it is serving current code is unknown. ` +
        'Unknown is not fresh.',
    )
  }
  if (res.status === 404) {
    throw new Error(
      `${api} has no /api/runtime/freshness, so it is a Mole Office from before criterion G6 and cannot say ` +
        'how old its code is. Restart it from this checkout.',
    )
  }
  if (!res.ok) throw new Error(`${api}/api/runtime/freshness answered ${res.status}. Unknown is not fresh.`)
  return res.json()
}

/** The refusal, in the words a person reads, or null when the world is fresh. */
export function whyNotToMeasure(reply) {
  const f = reply.freshness
  if (f.verdict === 'as new as the checkout') return null
  if (f.verdict === 'unknown') {
    return (
      'Whether that server is running the code in this checkout could not be worked out, and unknown is ' +
      'not fresh.\n' +
      reply.couldNotRead.map((gap) => `  ${gap.what}: ${gap.why}`).join('\n')
    )
  }
  return (
    `That server is serving older code than the checkout.\n  ${f.says}\n` +
    `  it started at ${reply.startedAt ?? 'a time it could not read'}\n` +
    `  restart it, or wait for the watcher to: it is ${reply.world.standing.kind} on ${reply.world.repository}`
  )
}

/**
 * Stop a measuring tool before it measures a stale world.
 *
 * `what` names the tool in the refusal, because the person reading it is usually running four of
 * them and needs to know which one stopped.
 */
export async function refuseAStaleWorld(api, what) {
  const reply = await askAboutFreshness(api).catch((err) => {
    console.error(`${what} did not measure anything.\n${err.message}`)
    process.exit(2)
  })
  const why = whyNotToMeasure(reply)
  if (why === null) return reply
  console.error(`${what} did not measure anything, because the world it would have measured is stale.\n${why}`)
  process.exit(1)
}

// -------------------------------------------------------------------------- run on its own

// `import.meta.main` is not in this Node, so the check is on argv: this file run directly is the
// tool, and imported by another tool it is the two functions above and nothing else.
if (process.argv[1] !== undefined && process.argv[1].endsWith('tools/freshness.mjs')) {
  const args = process.argv.slice(2)
  const at = args.indexOf('--api')
  const api = whereIsTheApi(at === -1 ? undefined : args[at + 1])
  const reply = await askAboutFreshness(api).catch((err) => {
    console.error(err.message)
    process.exit(2)
  })
  if (args.includes('--json')) {
    console.log(JSON.stringify(reply, null, 2))
  } else {
    console.log(`${api} — ${reply.freshness.verdict}`)
    console.log(`  ${reply.freshness.says}`)
    console.log(`  it is ${reply.world.standing.kind}: ${reply.world.repository}, ${reply.world.database}`)
    console.log(`  started at ${reply.startedAt ?? 'a time it could not read'}`)
    for (const gap of reply.couldNotRead) console.log(`  could not read ${gap.what}: ${gap.why}`)
  }
  process.exit(reply.freshness.verdict === 'as new as the checkout' ? 0 : 1)
}
