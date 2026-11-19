// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * WHAT A VISITING AGENT SENDS ON EVERY REQUEST: ITS CREDENTIAL, AND THE FACTS OF ITS RUN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS
 * ---------------------------------------------------------------------------------------
 *
 * Each agent is issued its own credential, and the run records information that tells one agent's
 * conversation from another's: the conversation's storage path or the agent's start directory, with
 * the token. An agent on another machine holds a credential of its own; the credential
 * records the facts of the run it was issued to; and every later request carries the token AND the
 * same facts, so the office can compare them.
 *
 * Three request headers, and this file is the only place any of them is written or read.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THEY ARE NOT FOLDED INTO THE ACTOR HEADERS
 * ---------------------------------------------------------------------------------------
 *
 * `x-mole-office-actor-id` says who a write is ATTRIBUTED to, and sending it proves nothing. These
 * say what the caller CARRIES: a credential that is pending or ended stops the request, and a request
 * with no credential is an ordinary caller. That separation stands.
 *
 * P83 REVERSED HALF OF THE OLD REASON, AND THE OLD SENTENCE IS KEPT HERE SO IT IS NOT QUIETLY LOST:
 * it used to say folding these in "would change what every existing caller means" because the actor
 * headers "never refuse". That is no longer true. Since P83 the person's own doors refuse a header
 * that claims to be the person and carries no key, and the key — not the actor header — is what makes
 * a caller the person. So the actor headers are attribution and can leave a caller nobody; a
 * credential and a key are both things the caller carries and the office checks. They are still
 * separate headers because they are separate secrets with separate doors: a credential names a
 * visiting agent, a key proves the person or an agent the office issued it to, and folding two
 * secrets into one header would make a credential mean a key and a key mean a credential.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS JAVASCRIPT
 * ---------------------------------------------------------------------------------------
 *
 * The same reason src/config/visit-headers.mjs is: the browser app, a tool and a visiting agent's
 * own script all have to spell these names, and a second copy of a header name is the defect
 * CLAUDE.md names at the top of the file.
 */

/**
 * THE SECRET THE VISITOR HOLDS. Absent means this is an ordinary caller and nothing below applies.
 *
 * It is the token itself and never the credential's id: the id is drawn on a page and is not a
 * secret, and a header carrying an id would let anybody who read the Embassy act as anybody on it.
 */
export const CREDENTIAL_HEADER = 'x-mole-office-credential'

/**
 * WHERE THIS RUN'S TRANSCRIPT IS WRITTEN — the conversation's storage path.
 *
 * For Claude Code it is the directory the run's transcript goes in. For another runtime it is
 * whatever that runtime's equivalent is, NAMED by the caller rather than guessed at here: a runtime
 * this office has never heard of can still say where its own conversation lives.
 */
export const CONVERSATION_HEADER = 'x-mole-office-conversation'

/** THE DIRECTORY THE RUN BEGAN IN — the agent's start directory. */
export const START_DIRECTORY_HEADER = 'x-mole-office-start-directory'
