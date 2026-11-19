# Adding a sandbox login privately

These are acceptance criteria for the Settings addition. They do not assert that
the feature exists or that any check has passed. Implementation and its tests
follow in separate commits.

## Prerequisites

The pool contract has version 1 with a `logins` object keyed by letter. Each row
contains only `sha12` (the first twelve lowercase SHA-256 hex characters), `added`
(`YYYY-MM-DD HH:MM`) and `by`. Each `<LETTER>.token` contains only the value on
one line. The directory is mode 0700 and both value files and index are 0600.
Every writer uses `.lock` with exclusive `fcntl.flock` for its entire read,
check and write; readers use a shared lock. Allocation starts after the highest
letter, never fills earlier holes and refuses beyond Z.

The press invokes the trusted host pool tool's `add-stdin` operation with the
captured value on its private stdin. It never implements a second pool writer.
The test helper implements the same shape and lock in a made-up home. A verified
host tool, safe metadata confirmation and recovery remain prerequisites; the
published two-file rename procedure alone does not establish exactly-once
completion after a crash. An unresolved result stays unknown without retry.
No host pool is a test
fixture. Every test constructs a stand-in inside a newly made home. No test or
development command invokes a real sign-in or opens a real credential store.

A native adapter must establish its fixed executable and arguments, supported
output and input protocols, callback behavior, complete storage isolation and
dump prevention. It receives no existing login, model key or office key. The
private operation stays unavailable when any prerequisite is unsupported. A
stand-in adapter proves application behavior; it does not certify a native CLI.

## Acceptance

1. Settings offers Add Claude login and a dedicated sign-in panel. The panel has
   fixed progress, a transient owner-only sign-in action and Cancel. Protected
   short-code input appears only for a verified supported input protocol. There
   is no token field, generic terminal, shell command or copy-token fallback.
   Completion says which letter was added and that the current login is unchanged.

2. The holder advertises a versioned private-login capability. An older holder
   refuses before spawn; it is never restarted to make the feature available.
   Private jobs are separate from ordinary terminals from creation. Neither raw
   output nor private input reaches a screen, serializer, watcher, reconnect
   stream, last-line state, typing history, quick input, note, record, usage
   receipt, HTTP log, process log or browser storage, even as an earlier fragment.
   Exceptions produce fixed reasons without native diagnostics or input values.

3. Each start, status, sign-in action, code submission and cancellation checks the
   existing login authority and local or paired encrypted reach policy before
   side effects. Private sign-in material is restricted to the proved person and
   owning binding. Generic terminal authority grants no access. An attempt ID
   alone grants no access. Origin, device, session, generation, deadline and
   one-use input binding are checked on every operation. Preserve existing
   secretary delegation explicitly without granting secret output to agents.

4. Only one attempt exists per binding and only one private login runs at once.
   Its deadline is at most ten minutes, enforced independently of a connected
   browser. An idempotency nonce cannot cause a second authorization. Duplicate,
   stale, ended or consumed bindings are refused. Callback and supported manual
   input complete the same native authorization state at most once.

5. A pool addition uses one letter for one login, a protected value file and a
   metadata index row that never contains a value. Every writer uses the same
   exclusive cross-process lock through the host tool. Under that lock, addition
   re-reads the pool, refuses duplicate sha12 entries, chooses the first letter
   after the highest used one and checks safe paths,
   ownership and modes. Existing entries and unrelated bytes remain exact. An
   addition never selects a live login. The usage watch retains its separate
   99 percent switching operation without a lost update.

6. The writer uses exclusive protected temporary creation, flush, atomic publish
   and directory durability according to the agreed host contract. It cannot
   overwrite an existing value file. A metadata-only receipt and recovery close
   the value-file/index crash gap without a second token copy. Before commit,
   cancellation consumes no letter. After commit, cancellation reports the saved
   result. Uncertain durability or a crash at commit reports an unknown result
   until safe metadata reconciliation, without automatic authorization retry or
   deletion of a possibly committed login.

7. Cancellation, expiry, native denial, overflow, unsupported output, holder exit
   and lost private channels clear owned buffers and scratch. Cleanup signals
   only the process group recorded when this attempt started, with process
   identity checked against reuse. Ordinary terminals and workers remain alive.
   Restart never reattaches raw output or restarts authorization. The parser has
   bounded private storage and fails closed on unsupported or ambiguous output.

Every retained `PRIVATE_LOGIN_REFUSAL_CODES` declaration must be produced by a real private sign-in route case using the actual guards, doors and holder or pool state machine with invented adapters where needed. Under Chinese word language, each case must check the exact HTTP status, English error and values, and link to a matching group fixture. An unreachable declaration must be removed and named in the report; production routes must not manufacture it. The existing requirement to send every declared refusal and its whole-code equality assertion remain unchanged.

The retained private HTTP refusal set must be `privateLoginUnavailable`, `privateLoginBusy`, `privateLoginUnsupported`, `privateLoginExpired`, `privateLoginBinding`, `privateLoginInputUsed`, `privateLoginPoolUnknown`, `privateLoginPerson` and `privateLoginShape`. Remove the unreachable HTTP declarations `privateLoginCancelled`, `privateLoginPoolUnsafe`, `privateLoginPoolChanged`, `privateLoginPoolUnsaved`, `privateLoginPoolFull` and `privateLoginPoolDuplicate`: their actual holder producers return safe progress reasons in HTTP 200 states, and later interactive requests refuse with Binding. Preserve those progress reasons and their words.

## Stand-in proofs

Write behavioral tests before implementation. Use invented distinct markers,
fake native processes and a fixed clock. Trap all generic output and input sinks
and filesystem writes. Exercise every chunk split, UTF-8 boundary, ANSI sequence,
carriage-return redraw, echoed input, long line, native exception and reconnect.
Assert that private fragments reach only private capture and the intended writer.

Construct pool entries A through D in a made-up home and an independent active
sentinel. Adding chooses E; also cover holes, exhaustion, duplicates, unsafe
modes, ownership, symlinks, concurrent writers and a watch switch racing addition.
Inject failures before create, during write and flush, around publication and
before metadata replies. Check exact unrelated bytes, no overwrite, no half-file,
commit reconciliation and cancellation racing completion.

Test every authority and binding refusal with zero subprocess starts, pool writes
and upstream requests. Cover older holder capabilities, duplicate presses, popup
failure, callback completion, supported protected input, unsupported native input,
timeout, owner disconnect, holder/server restart and process-group reuse.

After a green control, prove each security assertion with a relevant one-line
mutation and green restore: leak raw output to a generic sink, leak raw exceptions,
put private input in typing history, change the active login, bypass the writer
lock or accept a stale binding. A process that never started is not a red proof.

Photograph the changed Settings panel with made-up data at 1440, 990, 660 and
390 pixels in light and dark themes. Exercise cancellation and completion and
check that no private code or token appears in screenshots or browser storage.

## Files and named neighbours

The planned implementation boundaries are:

- `src/shared/private-sandbox-login.ts`: safe attempt protocol.
- `src/config/private-sandbox-login.mjs`: versioned holder capability and bounds.
- `src/holder/private-sandbox-login.mjs` and `src/holder/index.mjs`: private jobs
  before ordinary terminal sinks, with no generic attachment path.
- `src/server/lib/sandbox-login-addition/attempts.ts` and
  `src/server/lib/sandbox-login-addition/pool.mjs`: bindings and the private
  trusted host-tool adapter, kept separate from the existing set-by-name active
  login store. The adapter contains no alternate pool writer.
- `src/server/api/sandbox-logins.ts` and `src/server/lib/terminals.ts`: guarded
  private doors and capability checks.
- `src/web/components/AddSandboxLogin.tsx`,
  `src/web/components/SandboxLoginsHalf.tsx` and
  `src/web/api-parts/settings.ts`: the dedicated Settings surface.
- `src/shared/words/en-wave-13q.ts` and the matching Chinese word source: visible
  labels and fixed refusal words, plus the required refusal declarations.
- `tests/private-sandbox-login-pool.test.ts`,
  `tests/private-sandbox-login-holder.test.ts`,
  `tests/private-sandbox-login-doors.test.ts` and
  `tests/private-sandbox-login-browser.test.ts`: stand-in behavior proofs.
- `tests/how-long-a-test-may-take.ts`: any process-starting helper registration.

Register final names before implementation if reading the agreed contracts
changes these boundaries. Never broaden another owner's existing code silently.

Named neighbours are `tests/the-terminal-holder-holds-terminals.test.ts`,
`tests/the-sandboxes-logins-are-set-on-the-settings-page.test.ts`,
`tests/the-terminals-page-answers-at-once-when-no-holder-runs.test.ts`,
`tests/the-terminal-holder-restarts-from-settings.test.ts` and
`tests/every-bundle-carries-the-terminal-holder.test.ts`.

Run only the changed tests and named neighbours, one foreground process at a
time, with control/mutation/restore proofs. After the final code commit, the
supervisor runs the thirteen required gates, applicable door and kind checks,
typecheck, build and owner-content screen once. The whole suite and related list
belong to the merge queue. Evidence lives outside the worktree. This criterion
commit claims none of those results.
