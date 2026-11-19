// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE ONE READING BEHIND `GET /api/access`, SO TWO SURFACES CANNOT ANSWER THE SAME QUESTION TWICE.
 *
 * The route is the door; this is what it reads. It is a pure function of what it is given — the
 * registered routes and the address this request arrived on — so a test can ask it anything without
 * a server, and the server has nothing of its own to get wrong.
 *
 * EVERY FACT IN THE REPLY IS PASSED IN FROM THE READING THAT OWNS IT, AND NONE IS A LITERAL HERE.
 * The address other machines reach comes from `addressForOtherMachines` in `lib/runtime.ts`, the
 * machines and the refusals from `clientsFromOtherMachines` and `refusalsFromOtherMachines` in
 * `lib/usage-reads.ts`. Those are the same readings the Runtime page draws, which is the point:
 * until 6 September 2026 four of these fields were `[]` and `null` written in this function's own
 * body, and `remoteAccess` was worked out from `MOLE_OFFICE_REMOTE_PORT` alone. The Settings panel
 * then told the owner no other computer had ever opened their Mole Office while one was using it
 * (problem `XLES-b1vFBla`).
 */

import type { RefusedAct } from '@shared/authority.ts'
// THE MACHINES THIS OFFICE TRUSTS, criterion P73. A type only: the rows are handed in.
import type { TrustedMachine } from '@shared/trustedmachines.ts'
import type { ApiRoute } from '@shared/api-route.ts'
import type { Arrival } from './records.ts'
import { actsRefusedFromAnotherMachine, type RegisteredAct } from './authority.ts'

/**
 * The four values, because a boolean cannot carry all of them. `settings-and-governance.md` §11.3
 * names them and says why: *the process is in development mode* and *Mole Office could not check* are
 * both real answers and neither is `true` or `false`.
 */
export const REMOTE_ACCESS_STATES = ['off', 'listening', 'development', 'unknown'] as const
export type RemoteAccessState = (typeof REMOTE_ACCESS_STATES)[number]

/** Where a request arrived from, as well as Mole Office could establish it. */
export type CallerFrom = 'this machine' | 'another machine'

/**
 * One act a caller may not perform from where it is, with the bucket key saying why.
 *
 * `src/shared/authority.ts` owns the shape now, because the browser reads it and the browser may
 * not import from `src/server`. This alias stays so that every caller that already names
 * `RefusedHere` keeps reading, and so the two cannot become two shapes.
 */
export type RefusedHere = RefusedAct

export interface CallerAccess {
  from: CallerFrom
  /** The machine that called, when the private network told us. Null when nobody told us. */
  client: { name: string; nodeId: string; os: string } | null
  /** How we came to believe `client`, or null when we do not. */
  clientSource: 'told by the private network' | null
  /**
   * Acts this caller may not perform from where it is. Empty for a caller on this machine, which is
   * the honest answer: nothing about being here is refused.
   */
  refusedHere: RefusedHere[]
  /**
   * TRUE FROM WAVE 15, AND IT IS STILL PUBLISHED RATHER THAN ASSUMED.
   *
   * It was false while `refusedHere` was computed from the route declarations alone and the acts
   * reserved to the owner had no source. `GOVERNANCE_GUARDS` is that source and it is joined here,
   * so the field says true. It is not deleted: a caller that has to know whether a short list is
   * short cannot learn that from the list, and a field that only ever says true today is what a
   * reader checks when this half is next taken apart.
   */
  governanceHalfJoined: boolean
  /**
   * WHAT THIS CALLER'S ROLE MAY NOT DO, and the words a refusal will use. Criterion P3.
   *
   * READ FROM THE SAME DECLARATION THE REFUSAL READS, `design/permissions/roles.json`, so the
   * published answer and the enforced rule cannot become two lists. Empty for a person, for a caller
   * no registry holds, and for a role that is refused nothing.
   *
   * IT IS NOT `refusedHere`. That one answers *what may this caller not do FROM WHERE IT IS*, which
   * is true whoever asks. This answers *what may this caller not do BECAUSE OF WHO IT IS*. A caller
   * told the wrong one of the two would go and fix the wrong thing.
   */
  refusedByRole: { act: string; inWords: string }[]
  /** The role that narrowed it, or null because none did. Said, so an empty list is not ambiguous. */
  role: string | null
  /** One sentence about why the list above is what it is. A person reads this, not the two above. */
  roleSays: string
}

export interface MachineAccess {
  remoteAccess: RemoteAccessState
  /** Where Mole Office answers, in a reader's words rather than in an address. */
  answersOn: 'this machine only' | 'one network'
  /**
   * The private network's name, when something told us one. Null means nobody told us.
   *
   * NOTHING TELLS US ONE TODAY, and this is not filled in by cutting a tailnet name out of the
   * host. A host name the private network gives a machine looks like it carries one, and reading it
   * that way would be a guess about somebody's network dressed as a reading. The fifth invariant says an
   * absence beats a guess, so the panel says "one network" and names the address instead.
   */
  networkName: string | null
  /** The address and port this request arrived on. A fact, not a setting. */
  hostAndPort: string | null
  /**
   * THE ADDRESS OTHER MACHINES OPEN MOLE OFFICE AT, or null because nothing is served to them.
   *
   * From `addressForOtherMachines` in `lib/runtime.ts` — the same reading the Runtime page draws, so
   * the two pages cannot name different addresses. It is the browser app's address, because that is
   * what a person types.
   */
  addressForOtherMachines: string | null
  /**
   * Machines that have called from somewhere else, with how much each one called.
   *
   * READ FROM THE CALL LOG, which is `clientsFromOtherMachines` in `lib/usage-reads.ts` and is the
   * same reading the Runtime page lists. Empty means none has called. A machine that called through
   * a door that wrote no forwarded header has no address, and `name` says that in words rather than
   * being dropped from the list, which would make the count quietly smaller than the traffic.
   */
  machines: { name: string; requests: number; lastSeen: string }[]
  /**
   * THE MACHINES THIS OFFICE TRUSTS, criterion P73, and the one place the answer lives.
   *
   * `machines` above is who has CALLED; this is who is TRUSTED. Two different facts, and the reason
   * they are two fields is that before P73 the second one had no answer anywhere: which callers this
   * office let in was decided by which socket a request arrived on, and the only address anybody
   * could name was an environment variable read in one place.
   *
   * IT IS PASSED IN, like `guards` and `role`, so this file stays a pure function of what it is
   * given. Null means the caller did not hand one over — a test drawing this reply without a
   * database — and is a different answer from an empty list, which means the office trusts nobody.
   */
  trusts: TrustedMachine[] | null
  /**
   * How long a seen machine is remembered. Null means nobody recorded this.
   *
   * IT IS NULL BECAUSE NOTHING DELETES A CALL ROW BY AGE. There is no retention in days to report:
   * the prune summarises a trace when it is asked to and no clock removes a machine from this list.
   * Zero would claim a measured retention of nothing, which is a different and false statement.
   */
  machinesKeptDays: number | null
  /**
   * What callers from another machine were refused, with counts, from the same call log.
   *
   * `[]` means nothing was refused. It is never null now that something looks; the field keeps its
   * nullable type because a reading that could not be taken must still have somewhere to say so.
   */
  refused: { reason: string; count: number; since: string }[] | null
  /**
   * Context scope, stated rather than stored, in the words `remote-access.md` §6.6 puts on the
   * Settings panel. A stored value that can only hold one thing is the same fact in two places.
   */
  everyProject: boolean
}

export interface AccessReply {
  caller: CallerAccess
  machine: MachineAccess
}

/**
 * True for the addresses that mean *this computer*, with an IPv4-in-IPv6 prefix taken off first.
 *
 * IT IS NOT A TEST OF WHERE A CALLER IS, AND IT USED TO BE USED AS ONE. See `AccessInput.arrival`.
 * Its remaining caller is the bind check on the second listener in `src/server/index.ts`, which is
 * asking a different question: what did this socket bind, not who reached it.
 */
export function isLoopback(address: string | null): boolean {
  if (address === null) return false
  const bare = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address
  return bare === '::1' || bare.startsWith('127.')
}

export interface AccessInput {
  routes: readonly ApiRoute[]
  /**
   * THE CALLER'S ROLE AND WHAT IT IS REFUSED, or null because no role narrows it.
   *
   * Handed in for the same reason `guards` is: this file stays a pure function of what it is given.
   * Reading a registry here would open a database at module load and drag the whole record path into
   * a file the reply builder imports. The route reads it and passes it down.
   */
  role?: { role: string; refused: ReadonlyMap<string, string> } | null
  /**
   * THE MACHINES THIS OFFICE TRUSTS, criterion P73. Handed in for the reason `role` is: this file
   * stays a pure function of what it is given, and reading a table here would open a database at
   * module load. Left out means the caller has none, which is answered as null and not as empty.
   */
  trusts?: readonly TrustedMachine[] | null
  /**
   * The guard registry, as `GOVERNANCE_GUARDS` holds it. Passed in rather than imported, so this
   * file stays a pure function of what it is given and a test can ask it anything without opening
   * a database — importing lib/records.ts here would open one at module load.
   */
  guards: readonly RegisteredAct[]
  /**
   * WHICH DOOR THIS REQUEST CAME THROUGH, from `arrivalOf` and never from an address.
   *
   * ---------------------------------------------------------------------------------------
   * THIS FIELD WAS AN ADDRESS AND THE ADDRESS WAS WRONG. MEASURED, NOT REVIEWED.
   * ---------------------------------------------------------------------------------------
   *
   * Wave 14 derived *this machine* against *another machine* from the socket's local address, which
   * was right while there was one listener. Both listeners bind `127.0.0.1` — that is the whole
   * arrangement — so the moment the second one came up, `GET /api/access` asked through it answered
   * `from: "this machine"` and `refusedHere: []`. A remote browser would have been told it could do
   * everything, by a function that looked correct, and would have drawn every control it then got a
   * 403 for. That is §9.3's rule broken and the third option UX-CONTRACT.md forbids.
   *
   * `remote-access.md` says this in its own summary about the telemetry thread's identical
   * derivation: *"Under Tailscale Serve the socket address is 127.0.0.1 for every remote call, so
   * that derivation would file every request from Win11 as local — silently, by a function that
   * looks right."* It was true of this reading too, and it was found by asking a running server
   * rather than by reading it.
   *
   * UNDEFINED IS AN IN-PROCESS CALLER AND IT REPORTS AS THIS MACHINE — which is a different decision
   * from the one authority makes about the same value, and the difference is not a slip. For
   * authority, undefined means *the rule does not apply*, because a request no listener saw must not
   * be handed a listener's permissions. For a REPORT of where the caller is, a migration or a script
   * running in this process is on this host by definition, and there is nothing else true to say.
   */
  arrival: Arrival | undefined
  /** The local address this request arrived on, from the socket. Null when there is no socket. */
  address: string | null
  /**
   * The second listener's port, when one exists. Wave 15 sets this; today nothing does, and the
   * default is the state every installation is in.
   */
  remotePort?: number | null
  /**
   * THE ADDRESS OTHER MACHINES REACH THIS ONE AT, from `addressForOtherMachines` in `lib/runtime.ts`.
   *
   * ---------------------------------------------------------------------------------------
   * THIS FIELD IS THE WHOLE OF PROBLEM `XLES-b1vFBla`, AND IT WAS MEASURED RATHER THAN REVIEWED
   * ---------------------------------------------------------------------------------------
   *
   * There are two ways another machine reaches Mole Office and decision `jlDbLRporSX7` of
   * 4 September keeps both. `MOLE_OFFICE_REMOTE_PORT` opens a second loopback listener for a network
   * daemon to pass requests through. `MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES` binds the tailnet name
   * directly, and that is the one the owner has set. This reading used to know only about the first,
   * so on 5 September 2026 at 21:07 `GET /api/access` answered `off`, `this machine only` and no
   * machines, while `GET /api/runtime` in the same minute named their tailnet host and two machines
   * with 2,414 requests between them. The panel a person would look at said the feature was off
   * while another computer was using it.
   *
   * IT IS PASSED IN RATHER THAN READ HERE, so this stays a pure function and so that the address on
   * this panel and the address on the Runtime page come out of one function.
   *
   * Null means nobody set an address, which is the state every installation but the owner's is in.
   */
  forOtherMachines?: { host: string; api: string; web: string } | null
  /**
   * The machines that have called from somewhere else, from `clientsFromOtherMachines`.
   *
   * Required, not optional with a default of empty: an empty list is the claim *no other machine has
   * ever called*, and a caller that forgot to look must not make that claim by omission.
   */
  machines: readonly { address: string | null; requests: number; lastAt: string }[]
  /** What those callers were refused, from `refusalsFromOtherMachines`. Required for the same reason. */
  refusals: readonly { reason: string; count: number; since: string }[]
  /**
   * Whether this process serves the browser app itself.
   *
   * THE FOURTH STATE, AND IT IS A REAL ONE RATHER THAN AN EDGE. `npm run dev` serves the app from
   * Vite, a second process that is deliberately not exposed and forwards `/api/` with no arrival
   * tag and no route declarations in front of it. So a machine configured for remote access and
   * running in development mode cannot actually be opened from another machine: the API answers and
   * there is no app behind it. §11.3 names that as its own state and says collapsing any two of the
   * four is the fifth engineering invariant broken in pixels.
   *
   * Defaults to false, which reads as development — the state `npm run dev` is in, and the state
   * every test harness is in. A default of true would claim a production process on the strength of
   * nobody saying.
   */
  production?: boolean
  /**
   * Whether this request may act as the person from their other computer: an encrypted door and their key itself
   * (`theRequestMayActAsThePersonFromThere` in lib/reach.ts, the reading the hook makes). The person's own settings are not
   * refused to them from there, so they leave `refusedHere` for the person alone. Defaults to false:
   * nobody is the person on nobody's word.
   */
  thePersonMayAskFromThere?: boolean
}

/**
 * WHY A CALLER ON THIS MACHINE IS REFUSED NOTHING, AND WHY THAT IS NOT A GUARD THAT REFUSES NOBODY.
 *
 * `refusedHere` answers *what may this caller not do from where it is*. From this machine the
 * answer really is *nothing*, because every `reach: 'local'` route exists to be called from here.
 * The list is non-empty for a caller from another machine, and the test asserts both directions —
 * a list that were empty for everybody would be a list nobody could read anything from.
 */
/**
 * WHAT THE CALLER'S ROLE TAKES OFF THIS REQUEST, as the three fields the reply carries.
 *
 * The caller's role is read by the caller — this function is handed the answer rather than reading
 * a registry, because `lib/access.ts` is imported by the browser-facing reply builder and opening a
 * database here would drag the whole record path into it.
 */
function theRoleHalf(role: { role: string; refused: ReadonlyMap<string, string> } | null): {
  refusedByRole: { act: string; inWords: string }[]
  role: string | null
  roleSays: string
} {
  if (role === null) {
    return {
      refusedByRole: [],
      role: null,
      roleSays:
        'No role narrows this caller. A person holds no role, and a caller no registry holds is not narrowed ' +
        'either — the rule for one of those is to name it and never stop it.',
    }
  }
  const refusedByRole = [...role.refused].map(([act, inWords]) => ({ act, inWords })).sort((a, b) => a.act.localeCompare(b.act))
  return {
    refusedByRole,
    role: role.role,
    roleSays:
      refusedByRole.length === 0
        ? `This caller is a ${role.role}, and its card refuses it nothing.`
        : `This caller is a ${role.role}. Its card refuses it ${String(refusedByRole.length)} acts, and a refusal ` +
          'here says the same sentence the card does. The card is in src/config/roles.json.',
  }
}

export function readAccess(input: AccessInput): AccessReply {
  const from: CallerFrom = input.arrival === 'another machine' ? 'another machine' : 'this machine'
  const refused = actsRefusedFromAnotherMachine({ routes: input.routes, guards: input.guards, thePersonMayAskFromThere: input.thePersonMayAskFromThere === true })
  const remotePort = input.remotePort ?? null
  const forOtherMachines = input.forOtherMachines ?? null
  /**
   * THREE OF THE FOUR STATES, OUT OF BOTH WAYS IN RATHER THAN ONE.
   *
   * `off` when neither way in is set up. `listening` when a bound address serves other machines, or
   * when a second listener is up and this process serves the app itself. `development` for the one
   * case where the setting is on and another machine still cannot open Mole Office: a second listener
   * with the app coming from Vite, which is not exposed. `unknown` is the fourth and this reading
   * never returns it — it means Mole Office could not ask the private network, and this function asks
   * nobody.
   *
   * WHY A BOUND ADDRESS IS `listening` IN DEVELOPMENT TOO, and it is a measured difference rather
   * than an oversight. Vite opens a door on that same name (`vite.config.ts`,
   * `serveTheAddressForOtherMachines`), so the browser app really is served there while
   * `npm run dev` is running. That is how the owner's other machine made 2,414 requests to a server
   * in development. The second-listener path has no such door, which is why it stays `development`.
   */
  const state: RemoteAccessState =
    forOtherMachines !== null
      ? 'listening'
      : remotePort === null
        ? 'off'
        : input.production === true
          ? 'listening'
          : 'development'

  return {
    caller: {
      from,
      client: null,
      clientSource: null,
      refusedHere: from === 'this machine' ? [] : refused,
      governanceHalfJoined: true,
      ...theRoleHalf(input.role ?? null),
    },
    machine: {
      remoteAccess: state,
      // WHAT IS ACTUALLY REACHABLE, not what is configured. A development process with a port set
      // answers `this machine only` because that is the truth about it: nothing else can open
      // Mole Office there, whatever the setting says.
      answersOn: state === 'listening' ? 'one network' : 'this machine only',
      // Nobody tells us a network's name. See the field.
      networkName: null,
      hostAndPort: input.address === null ? null : `${input.address}`,
      addressForOtherMachines: forOtherMachines === null ? null : forOtherMachines.web,
      machines: input.machines.map((one) => ({
        // AN ADDRESS NOBODY COULD READ IS STILL A MACHINE. The call arrived; what is missing is the
        // name of where from, and the row says which of the two it is.
        name: one.address ?? 'a computer that did not say where it was',
        requests: one.requests,
        lastSeen: one.lastAt,
      })),
      // Null because nothing removes a machine from that list by age. See the field.
      machinesKeptDays: null,
      // AND WHO IT TRUSTS, criterion P73, which is a different fact from who has called. Undefined
      // in means null out: a caller that handed no list is one that has no database open, and
      // saying the office trusts nobody would be a claim it never made.
      trusts: input.trusts === null || input.trusts === undefined ? null : [...input.trusts],
      refused: [...input.refusals],
      everyProject: true,
    },
  }
}
