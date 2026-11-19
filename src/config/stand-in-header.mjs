// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE NAME OF THE HEADER THAT SAYS A REPLY CAME FROM THE DEV SUPERVISOR'S STAND-IN, NOT A SERVER.
 *
 * `tools/serve-dev.mjs` holds the office's listening socket for its whole life (problem
 * `xGeC_iM6jxYl`). While it has no server running on that socket, after a failed start, a crash, in
 * its backoff, after the guard's refusal or while another server holds the service lock,
 * `tools/serve-dev-stand-in.mjs` answers every request with 503, the reason in words, and this
 * header. Its value is the supervisor's pid.
 *
 * A reply carrying it is not the office, and it is not "something else on the port" either. Every
 * reader that tells those apart reads this name from here: `whatIsOnThePort` in serve-dev, `whoIsAt`
 * in world-address.mjs, and the session hook. `.mjs`, beside `world-header.mjs`, so a tool that
 * runs without TypeScript can import it.
 *
 * Lower case, because a browser lower-cases every header name.
 */
export const STAND_IN_HEADER = 'x-mole-office-stand-in'
