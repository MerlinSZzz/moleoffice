The fix-round controller is dormant. This change installs no timer, starts no real repair run, and enables no setting. Enabling it belongs to the later backed-up stable switch agreed with the secretary.

An already running secretary process calls one bounded poll with:

```sh
node --import tsx tools/main-suite-fix-round.mjs /absolute/controller-config.json
```

The process must already carry its own issued run key and matching Office agent, session and workspace environment. The secretary must be active and be the sheriff's registered starter. No key is read from the configuration file or copied from another process. CLI replies and errors are redacted; raw brief digests remain inside the program.

The configuration names these facts explicitly:

| Field | Meaning |
| --- | --- |
| `repository`, `repositoryId` | Canonical development Git checkout on `main`, and its registered ordinary queue repository. |
| `workdir` | Independent canonical external directory for controller journals, lock and revert clone. Neither directory contains the other. The work directory and its prepared clone must be inside the controller sandbox. |
| `evidence` | Original receipt `{recordId, seq: 1, contentHash}`. |
| `commit`, `tree` | Exact full original main commit and tree. |
| `timeZone` | Installation IANA time zone for the original local end stamp. |
| `controllerSandbox` | Exact `{folder, container}` recorded on the continuing controller run. The Office must vouch for the folder through its container ledger row. |
| `authorBrief` | Existing independent canonical brief file `{path, sha256}` inside that sandbox. Its nonempty exact bytes are retained in the private author journal. |
| `identity` | This continuing run's `{agent, run, workspace}`. |
| `coordinator` | The secretary's exact registered agent ID, which receives the start, outcome and person-stop notices. No other field is read for it; a configuration without it is refused before any journal, lock or Office write. |
| `sheriff` | Registered sheriff handle, `previousRun` and canonical `sandbox` folder. |
| `briefTemplate` | Independent regular template file's `path` and SHA-256 hexadecimal digest. |
| `briefPath` | New absolute final brief path inside the sheriff's sandbox. Its rendered bytes include the authoritative problem ID. |
| `author` | Stable automatic child `handle`, name and actual nonempty `workArea`; no model runtime. |
| `authorIdentity` | Explicit Git author name and email for the revert commits. |
| `producer` | Existing original producer's external `workdir` and this run's registered `processResource`; optional existing producer bounds. |

`mainSuiteFixRoundTick(config, io)` is the library equivalent. The production transport uses the existing Office path, identity and header helpers with the current run key, manual redirects and a fifteen-second request limit. Test transports and cloud results must refer only to their throwaway Office and artifacts.

Every retry uses the same original receipt, continuing run and configuration. The journal is `workdir/receipt-<recordId>.json`; the author journal is `workdir/takeout-author.json`; a verification reserves one `verification-<repairCommit>.json`. Plans precede Office mutations. Lost responses reconcile original problem creation, accepted next-round correlation, actual filed run, normal submissions and stable notice IDs. A wanted ask with another brief is never replaced. An accepted ask is not a started run.

One continuing controller run handles exactly one original red receipt. The protected original problem reserves that lifetime even after completion, deletion or an uncertain message response; changing the work directory does not reset it. Each phase sends one ordinary group message with a stable ID and canonical recipient array. A notice to an agent that nothing holds is stored, routed and answered 409; the controller takes that answer as sent when it carries the stored message's ID and a routed list, and keeps the routed lines beside the notice's state in the journal, so a reader can see that the notice waits. Every other answer outside 200 to 299 is still a refusal. Start and fixed notices go to sheriff and the secretary; returned also includes every original causal line and names each entry. Retry checks the original message revision, including its actual controller session, about-run attribution and a previously saved message ID. Another run of the same secretary cannot supply this phase. The ordinary five-message cap remains unchanged.

An actual protected-namespace 403 stops protected writes and actions. Its private `authorityRefusal` journal records the claimed run, missing proof and revision actually read. Under the specific refusal agreement with the secretary, one stable diagnostic uses the actual agent key without session or run attribution, clearly says it is unattributed, and identifies the first private journal entry. A new work directory reconciles that same diagnostic. This narrowly scoped path is private to an actual authority refusal; normal phase notices retain the proved run and ordinary cap. It establishes no alternate generic transport or operational launch authority.

A person's recorded `accepted`, `worked_around` or `fixed` state stops further repair actions. The controller finds the revision that actually changed the state, records that ACT in `pending`, and sends the secretary one notice. Later prose does not change its provenance. Explicit `open` permits work to continue. A preflight stop records an action as not sent; an uncertain response remains unresolved and is never retried blindly. Releasing an already held suite seat remains necessary cleanup.

The deadline always comes from the original receipt's end plus sixty minutes. Unknown causes, unavailable original bytes and ambiguous time never produce a guessed revert. A repair already testing or landing at expiry is reconciled to its actual finish. Other pre-test entries are withdrawn atomically through the ordinary waiting-only door. Take-out preparation uses only actual named causal commits in a new independent clone, with hooks disabled. It leaves development main in place and awaits the child's ordinary seal and released check before submission.

Only an actually landed repair plus a later original exact-main green receipt is fixed. Its one-shot verification uses the same original producer, cloud door, global seat and receipt writer; periodic cadence remains unchanged. Red or unavailable verification requires the checked normal take-out. A pending or bounced take-out is not returned. The controller records returned only after actual landing and causal-line notices. The owner-facing system conversation line remains unbuilt.

A take-out sends one closed `fixRound.reason`: `hour expired`, `repair not green` or `verification unavailable`. Its complete request and selected reason are retained before submission. The queue alone validates the reason against the authoritative original deadline or actual landed repair and verification, then computes the title using every causal entry and the original red receipt. A complete non-green verification retains its exact red, build-failed or incomplete outcome and pin; each has distinct title wording and the `verification-not-green` pending phase. No title text is sent and ordinary computed titles retain their existing words. A retry compares the original accepted fields with the retained packet, leaving later stored titles alone. An accepted take-out without matching retained intent requires supervised reconciliation.

The existing original green record keeps its green outcome even if its end precedes this repair. The shared chronology predicate refuses that receipt for repair verification before recording completion and retains its exact pin and reason in the unavailable explanation. A historical already-complete early-green state keeps its original pin and outcome and becomes explicitly supervised pending.

Returned recipients use the same pure selection as ordinary entry-end notices: live author, recorded starter and submitter. This retains supervisor authors as well as worker authors. The runner reads current canonical IDs individually and verifies the returned ID exactly. Missing facts, noncanonical legacy handles or ambiguous identities leave causal notices pending; the controller does not list an unbounded registry or guess a line. The existing server wrapper retains its stored-reference reader and ordinary notice wording.

An interruption leaves pending work pending. A partial revert clone, conflicting revert, ambiguous lost response or stale `controller.lock` remains for supervised reconciliation. Inspect the exact journal and recorded process through the existing resource ledger before any lock recovery; a PID alone cannot exclude reuse. Do not delete journals, move main, select another controller run, or rerun an uncertain cloud attempt to make a refusal disappear. An unresolved author check remains an ordinary pending check.

Authenticated operational launch, real cloud artifact return under group stop and activation are not proved by these synthetic transaction tests. Generic problem progress is read by the separately owned shared display reader; the controller does not write a second stored success state.

The automatic child is filed directly through `POST /api/records`, with top-level `askedBy` naming this live controller, `brief` naming the retained file and `cutFrom` naming the prepared base. The existing hand-start rule measures that cut inside the transaction; it must be reachable from a branch or tag in `controllerSandbox.folder/repo`. The existing revert clone is used as it stands. No preflight is needed. The child still receives its ordinary one-time run-key stamp, report, Git seal and independent check. The controller discards the child key without using or journaling it. Its program transport compares hashes internally; model-facing replies stay redacted.

Both journals pin the explicit sandbox and brief configuration. The author also retains the complete brief bytes before filing and checks them on every retry. A lost filing response is reconciled only from an exact original creation by this controller and the Office-kept hand-start entry, including its brief hash, cut, child run and mint stamp. Missing inputs, changed bytes, changed correlation, an unvouched sandbox or an unreachable cut remain visible refusals.

The supported configuration requires an already-running controller with its own issued run key in an Office-vouched sandbox. It places the development repository at `<sandbox>/repo`, the controller work directory at `<sandbox>/out/<receipt>`, and the author brief at `<sandbox>/briefs/<receipt>-author.md`. The secretary must already be the sheriff's registered starter. One continuing process must retain that same live run for the one original red receipt; independent timer sessions cannot replace it. The real throwaway Office/Git transactions prove the child hand filing from such a controller; their container-ledger and independent-inspector setup is explicitly synthetic. They do not prove the controller's own authenticated launch or lifetime. The current sandbox launcher is not established as a no-model controller path. Activation remains blocked until that authenticated launch and lifetime exist; their design belongs to the later round. No production launch, container start or service installation is authorized here.
