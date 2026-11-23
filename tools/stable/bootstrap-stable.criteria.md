# The first handoff to stable

OLD: there is no first-handoff transaction. The ordinary upgrade requires an
independent stable repository and a different target commit. Its release
authorization does not authorize stopping a development supervisor.

NEW: a separate first-handoff command changes the serving checkout and preserves
the exact code commit. It creates a registered, locked worktree on branch stable
and a fresh dated candidateTag. Dependencies, web and plugin artifacts belong to
that worktree. Git object storage is intentionally shared with development.

WHY: the first checkout/supervisor transition must not bundle a code upgrade or
silently create a new database identity. An ordinary upgrade cannot describe it.

Preparation authority correction:

OLD: a single configuration assumed an unused candidate tag and an owner stop
decision already existed before preparation.

NEW: --prepare verifies/builds/checks/locks/tags and returns PREPARED without
stopping the original service. An original authored preparation note is filed
only after those observed steps; its original server creation time is the
authority boundary. A later handoff consumes exactly the retained private state
and that original preparation pin. Its owner warrant must follow PREPARED.
Preparation accepts a deferred stop authority; handoff never does. The server's
narrow read-only verifier calls the canonical warrant rule; BEFORE atomically
reserves the decision and preparation pins. No second attempt can reuse them
after a handed-off, restored or uncertain outcome. The same send ID may reconcile
its original delivery. Local preparedAt and a private file flag grant nothing.

WHY: an authorization made after preparation cannot be a prerequisite to creating
the candidate. A copied local state file cannot enforce one-use authority.

The exact local input is stopAuthority: null for preparation, then
{kind: 'owner-decision', decision: <original pin>} in either local mode. The
prepared reference is {path, sha256Base64, event: <original note pin>}. The public
note and authority use stateSha256Base64, the SHA-256 digest encoded in base64.
The actual canonical transport must round-trip that field without masking it.
Artifact hashes and private paths stay local. Rehearsal is a local label, never a
server authorization bypass: its fresh synthetic owner words and warranted
decision pass through the same verifier. A transport restricted to GET, strict
first-handoff notice POST and the fixed strict preparation-note POST adds no
general record-writing permission. Dry permits no POST.

Configuration boundary correction:

OLD: source HEAD matched an approved commit contained in main, without requiring
the source checkout's current branch to be main. Rehearsal recovery storage was
private, without an explicit private-data-directory check.

NEW: preparation starts from the clean development refs/heads/main tip, refusing
a different branch even at the same commit. Rehearsal's existing canonical data
directory must belong to the caller and have mode 0700. Future live directory
permissions are evaluated separately. Negative fixtures and specific
implementation mutations guard both conditions.

WHY: main ancestry is not proof of the serving branch, and private recovery
storage does not protect the separate fixture data directory.

Rehearsal listener and scratch ports also keep clear of busy and named ports, by
the two run-time rules of the owner-content correction at the end of this file,
independently of the ordinary listener list. Every explicitly named API/web/other-machine address setting must
agree with the fixture's own loopback ports; a root Office or tailnet setting is
not inherited into a fixture service. This closes the same no-live-address
boundary for all child environments.

Stop-boundary recovery correction:

OLD: recording the downtime clock before the first stop could make a failed
before-step hook look like a stopped original service. Recovery then refused its
still-held database and listeners and incorrectly reported NOT RESTORED.

NEW: when the first stop did not occur, or failed without changing the original
topology, verify the exact original runtime, process births, source, artifacts and
listeners before retaining an unchanged result. A timestamp or a PID proves
neither outage nor health. After an actual stop, recovery must restart and verify
the original topology. The actual-office fixture injects failures immediately
before and after the first stop and a failed image restoration; the results must
distinguish unchanged, restored and NOT RESTORED. Original artifacts that bootstrap
did not mutate are verified against retention, never silently overwritten.

WHY: an attempted stop is not evidence that the service stopped, and truthful
recovery must preserve an intact original service instead of guessing it absent.

Launcher compatibility correction:

OLD: an original green target could predate --prepared and silently ignore that
flag, rebuilding during handoff or recovery.

NEW: before preparation mutation, resolve the shipped controller checkout from
the bootstrap module's own path. Require its clean tracked ordinary launcher and
compare its Git blob exactly with targetCommit:tools/serve-dev.mjs. Refuse a
different target launcher until reviewed. Caller cwd and GIT variables cannot
select another controller. Tests cover the mismatch and a dirty controller,
each with a specific implementation mutation and exact restore.

WHY: a green code receipt does not establish compatibility with a later launcher
contract. Exact reviewed code identity is the approved narrow compatibility rule.

Prepared-source correction:

OLD: handoff verified stable HEAD/branch/tag/registration/lock and retained
artifacts without explicitly verifying its tracked/index/untracked source state.

NEW: require clean stable source after preparation, at handoff preflight and at
the immediate pre-stop recheck, through the existing guarded read-only Git
configuration. Refuse an unstaged tracked edit, staged edit or untracked source
before any BEFORE announcement or stop. Each negative fixture retains its source;
one specific implementation mutation must make the new full-name test red.

WHY: unchanged HEAD and artifact hashes do not prove unchanged executable source.

Failure matrix correction:

OLD: forward steps were intended to be fault-injectable, while lock release and
the final journal descriptor close had no observed before/after boundary.

NEW: the isolated matrix records and injects failures before and after every
preparation/handoff step, explicitly including release-lock and
final-descriptor-close. It separately fails each recovery mutation. Those small
stand-ins do not prove real Office behavior. Four separate actual-Office named
files prove same-commit handoff, before-stop unchanged, after-stop recovery, and
failed private image restoration. Each actual name has its own retained source,
JSON, journal, image-content comparison and exact mutation/restore proof.

WHY: a failed final journal operation must not hide a serving candidate or lose
the retained recovery boundary. Separate actual files bound repeated private
installs without weakening the real topology assertions.

Measured dry boundary correction:

OLD: the actual success case checked only an empty recovery directory and an
absent destination after dry. That could miss changes to source, index, home,
cache, keys, topology or authored rows, and ordinary runtime/health requests.

NEW: the same actual case compares source/index, private HOME/TMPDIR (including
cache), recovery and key bytes plus recorded inode/mode/time metadata. It compares
original process births/argv and exact listener observations. It compares every
SQLite schema entry and row, except the authenticated caller's last-use stamp and
existing API usage tables. A harness preload traces canonical request method/path
and child-command program/argv, without headers, bodies or environments. The CLI
must return before ordinary runtime/health, mutation or service start/stop.
Harness config/trace/stdout/log files are explicitly outside measured roots.
Snapshot reads can change atime, so atime is not claimed unchanged. These roots
and traces do not constitute a whole-machine syscall proof.

Dry output must disclose bounded inspection commands (git, ss), the same bounded
isolated Git environment, existing authenticated bookkeeping, omitted ordinary
runtime/health, and no file/lock/record/fetch/service start or stop. Preserve the
existing bootstrap read-only guard, which refuses clean/process filters, partial
clone fetching and submodules before status. It is stricter than the separately
reviewed prepared launcher's trusted-configuration allowance; the two guards
must not be described as semantically identical.

WHY: a plan-only return needs measured negative evidence, and a Node/tsx cache
write is an observed side effect, not an exception to hide in the test harness.

Unborn gate failure correction:

OLD: a failed gate spawn could return no PID before the child error listener was
attached. A missing throwaway cwd was observed to produce an unhandled child
error after the transaction's own refusal.

NEW: observe the child error/exit immediately after spawn, before inspecting its
PID or start metadata. An unborn gate returns one controlled failure and starts
no recorded group. The dedicated bounded subprocess test waits through the next
event turn, so an asynchronous unhandled error cannot masquerade as a refusal.
The isolated observation and this test are not whole-Office rehearsal evidence.

WHY: a rejected transaction promise does not consume a later ChildProcess error
event. Recovery must receive the controlled failure rather than lose the entire
controller to that event.

Post-publication delivery correction:

OLD: the actual success case observed fully delivered AFTER; helper-level tests
did not prove the actual controller's publication/accepted-write boundary.

NEW: the same actual success name and single fixture let the real server commit
AFTER, then drop that response and any immediate reconciliation observation.
Require published plus pending delivery, exact serving births, one labelled
accepted synthetic note, the actual --retry-notice CLI, the same original event
and send ID, and that accepted note still present. The harness stores only the
request method/path, notice stage/send ID and status, without headers or bodies.

WHY: a failed publication notice cannot turn verified service into rollback or
restart. This proves delivery-only retry preserved the observed accepted write;
it does not promise lossless manual restoration from an older private image.

Recorded startup settings and worker presence correction:

OLD: only caller-supplied service overrides were compared, and omitted rehearsal
addresses could fall through to the main settings file. A newly observed worker
declaration was accepted without matching the original worker presence.

NEW: refuse an omitted allowlisted override present in the recorded original
supervisor startup environment. Read only the named nonsecret values already
allowed; never infer or copy credentials. Rehearsal requires explicit safe
API/WEB/WEB_PORT/ADDRESS overrides. Publication and recovery both require
runtime.worker.started to equal the configured original presence before
observing/verifying the new topology. Add dedicated omission criteria and
strengthen both isolated matrices with missing/unexpected worker declarations.

WHY: unchanged paths and commit do not preserve omitted process settings, and a
healthy API alone does not prove the required worker topology was restored.

1. Configuration is strict, explicit and private. Canonical source, destination,
   recovery and service-home paths have no aliases. The destination is absent;
   branch stable and candidateTag are unused. Source HEAD and tree exactly match
   targetCommit and targetTree; main contains that commit. Source is clean, has no
   unfinished Git operation, unsafe filters, submodule or alternate object store.
   An independent fixture's Git objects have no external hard links. The future
   stable worktree's shared common directory is deliberate and registered.
2. Database is an explicit existing absolute ordinary file, with an existing
   ordinary keys.json beside it. Initial validation checks metadata only. It does
   not open SQLite, read the keys, or create either file. Data stays in place;
   rehearsal data is outside both checkouts. Recovery material is separate, owned
   by the caller, under an existing mode 0700 directory. Exact private images are
   mode 0600. No settings or key-file contents are copied into a worktree.
3. Configuration names supervisor, server and runtime-declared worker separately.
   Every identity pins pid, parent, group, Linux start ticks, group-leader start
   ticks, cwd and exact argv. The supervisor need not lead its group. Unknown or
   reused identities refuse forward work and forbid guessed signals. Immediately
   before each signal, recheck the recorded process and group identities. This
   is a repeated identity safeguard, not an atomic kernel guarantee.
4. Read process variables only through a closed allowlist of named nonsecret
   settings. Never construct, return, log or journal a whole environment. New
   commands receive explicitly constructed environments. The worktree finds the
   development .env through findEnvFile; no new settings file is created. Verify
   the same API and redirect listener address/port sets after publication and
   recovery. Rehearsal uses loopback only, away from the ordinary live ports.
5. Original evidence is the existing artifact/method/commit/tree verifier's
   complete green original creation receipt. Fixture receipts explicitly say
   synthetic. No latest editable receipt, local attestation or invented run can
   replace that verification. First-handoff approval is distinct from ordinary
   release policy. A live stop requires the owner's original recorded decision;
   a secretary's notice cannot authorize it. Live execution remains refused in
   this round: downtime bounds and later activation prerequisites are unresolved.
6. Dry performs configuration, local recorded process/group/port, original
   evidence and authorization reads. It returns before ordinary runtime/health.
   It creates no file, journal, lock, record or service process and does not fetch or tag.
   It does not open SQLite. Its output discloses authenticated key-last-use/API
   bookkeeping and the unperformed ordinary checks. An unresolved live approval
   is visible and never described as ready.
7. Real execution rereads the actual ordinary runtime and verifies its topology,
   database, source, artifacts and exact listeners before mutation. Persist and
   fsync each attempted mutation and its recovery paths before the action. Prepare
   the locked worktree, npm ci, Electron's binary, typecheck, stamped web and all
   plugin pages before downtime. After npm ci the bootstrap fetches Electron's
   binary with the electron package's own install.js and checks it as the upgrade
   checks it: the binary path.txt names must be in dist. Preparation stops if
   path.txt or that binary is missing, and the original office serves on.
   Keep exact original source/artifact identities and verified copies.
   No build or install is added to downtime or recovery.
8. Both write-excluded checks remain: first the prepared target on a private
   database copy and scratch port, then the same target on the original database
   and ordinary API port. Verify each real identity/health and refused ordinary
   writes. Stop and verify each recorded check before the next service starts.
   Already-current schema is required; mismatch refuses without migration.
9. BEFORE is the approved first-handoff event through the existing notice door,
   pinned and verified before downtime. Recheck evidence, authority, source,
   processes and listeners immediately before stopping the original supervisor.
   Verify all known writers ended, no unknown writer remains, and ordinary ports
   are free. Take the standard verified sanitized backup and a separate verified
   private full SQLite rollback image. The sanitized backup is never the rollback
   image. Record the exact snapshot/write-loss boundary.
10. Publication and recovery use node tools/serve-dev.mjs --built --prepared.
    Preserve its crash restart, held socket, redirect and ledger behavior. The
    controller journals its supervisor start attempt before spawn, gates the
    supervisor until its own identity is durable, and must describe the existing
    internally spawned child boundary truthfully. Child identities may never be
    called pre-gated without an approved implementation providing such a gate.
    Discover children only through the recorded supervisor's descendant parent
    chain; verify start ticks, cwd and argv before recording them and before any
    bootstrap stop. An identical non-descendant decoy is never signalled. Unknown
    identity prevents guessed cleanup and stays visible as uncertainty or NOT
    RESTORED. No new child-launch protocol is promised.
11. Verify code/tree/build, database, artifacts, supervisor/server/worker identities
    and listeners before calling publication verified. Record actual monotonic
    stop-to-serving time. A caught failure stops only verified recorded candidate
    groups, restores every touched database/artifact component, and restarts the
    original development supervisor. Recovery adds --prepared to its previous
    --built argv; journal and report that difference. Verify original topology,
    database, source, artifacts and listeners before saying restored; record
    actual stop-to-recovered time. Failed or uncertain recovery says NOT RESTORED
    with retained private paths and any unknown identities.
12. Verified publication plus AFTER delivery failure retains the serving service
    and accepted writes. Retry resends only the retained immutable delivery; it
    cannot restart or recover a transaction. Abrupt controller death retains
    private data and requires supervised recovery. Retain worktrees and proof
    material; never silently unlock/remove them.
13. Rehearsal invokes the actual CLI and actual Office/serve-dev in independent
    fixture source repositories with fresh fixture keys and external data. Small
    stand-ins may isolate individual failure cases but are not whole-office
    proof. Cover success, attempted/partial mutations, failed recovery, dry,
    evidence/authority, missing database/keys, identity/environment/ports, lock
    protection, and main advancement without stable restart. Keep original
    source, paths, logs and JSON for every named control, specific implementation
    mutation red, and exact restore. No real cloud receipt or local whole suite
    is produced. Sized made-up backup/image measurements are separately owned.

Single settings source correction:

OLD: findEnvFile results were retained but missing main settings or a stable-local
candidate could be accepted. Inherited original supervisor overrides and a
changed worker declaration could also pass as a new topology.

NEW: require one existing ordinary caller-owned development/.env by lstat only,
without opening, copying or creating it. After preparation and immediately before
stop, both findEnvFile resolutions must name that exact file device and inode.
Any stable-local candidate refuses, including same-target and dangling links.
Rehearsals explicitly name all four safe local address overrides. Every existing
allowlisted supervisor startup override must be recorded; omitted overrides
refuse. Publication and recovery must preserve the original worker presence.

WHY: the first handoff preserves settings and topology as well as the code and
database identity. A second settings candidate or silent dropped startup override
would change the service while claiming the same handoff.

Actual image restoration correction:

OLD: the actual failed-image case proved that the private image equals the
database at the snapshot, and that a failed restoration says NOT RESTORED. No
actual case proved that a successful restoration puts that image back over a
database that changed after the snapshot, before development restarts.

NEW: a fifth actual-Office named file files one labelled synthetic note before
preparation. After the private snapshot and the real checkpoint, while every
writer is stopped, the fixture changes only that note's title, observes that the
database now differs from the image, and fails after checkpoint-real-database.
After restore-private-exact-database and before the development restart, every
SQLite schema entry and row must equal the private image. The recovered
development topology must serve the note's original title, keep the key file's
metadata, journal the --prepared argv difference and record the actual
stop-to-recovered time. Only digests and table names leave the fixture. One
specific implementation mutation copies the changed database instead of the
private image; the same name must then fail with NOT RESTORED.

WHY: an equal image at the snapshot does not prove that recovery puts it back. A
restoration that kept the changed file would keep writes the result says were
discarded.

Suite mark correction:

OLD: the actual-Office fixture built every environment from nothing and left out
the suite's mark, A_MOLE_OFFICE_TEST_STARTED_THIS. The real server refuses to
start under the test runner without that mark, so the first actual run at 08:22
stopped at the fixture's own development start and no actual case reached the
transaction.

NEW: the fixture keeps the mark in every environment it builds and fails at once
if the runner did not give it one. The transaction's own service starts, ordinary
and release-check, must pass the mark on when its caller carries it, and only
then. A caller without the mark, such as the owner's terminal, starts services
without it.

WHY: without the mark no actual rehearsal can run at all. Passing it on only when
the caller carries it is what tools/cloud-suite.mjs and
tools/periodic-main-suite.mjs already do, so a test-started stable server knows a
test started it and a live handoff is unchanged.

NOT RESTORED release correction:

OLD: a NOT RESTORED result listed the started groups it left running in
remainingGroups, but the controller kept their child handles and IPC channels
referenced. The controller process could not exit while such a group lived. In
the 08:33 actual after-stop run the result was written at 08:35:33 and the
process exited only when the fixture stopped the group at the 900-second limit.

NEW: before returning NOT RESTORED, the controller releases the child handle
and channel of every group it leaves running, as it already does for a serving
group. remainingGroups names exactly those groups. The isolated recovery file
checks this in every NOT RESTORED case and requires that at least one of them
leaves a group running.

WHY: a person who runs the handoff and gets NOT RESTORED must get the command
back to start supervised recovery. A controller that never returns hides the
result it already reached.

Dry branch-read correction:

OLD: the actual success case allowed a dry run's Git commands only from a list
of reading commands that left out symbolic-ref. Validation reads the branch of
the development checkout with git symbolic-ref --quiet HEAD, so the first
actual success run at 09:33 failed the command check on that read. Every file,
process, listener and row comparison before it was equal.

NEW: the list also allows symbolic-ref in its reading form only: exactly one
name and no -d or --delete. A second name or a delete writes HEAD and is still
refused. Nothing else in the dry comparison changes.

WHY: the branch check is required (a development checkout on another branch at
the same commit is refused), and it only reads. The success case cannot run
past dry while the list refuses it.

Gate corrections after the first whole run:

OLD: the joined first handoff code had never been through the kind and door
gates, the text gates or the whole tree together. Their first run on 1843e2fae
at 09:52 failed four existing gates. tests/state-vocabulary.test.ts: the
outcome words handed-off, failed-restored and not-restored came back
unclassified. tests/an-id-names-one-thing.test.ts: StableNoticeOriginal and
StableNoticeApproval publish an id that the test could not account for.
tests/one-configuration-source.test.ts: tools/stable/stable-bootstrap-transaction.mjs
wrote the two port numbers the owner's office holds into its code. tests/a-settled-proposal-has-one-name.test.ts:
src/server/lib/stable-bootstrap-authority.ts typed derived_from by hand.

NEW: STATE_MEANING classifies handed-off as finished, and failed-restored and
not-restored as stopped_short. The id test lists the two pins as references,
with the reason kinds.ts already gives for skipping them; it does not call
them checked elsewhere. src/config/settings.mjs declares the two ports the
owner's office holds, once, and the rehearsal refusals read that list; the
refused ports are the same two. (The owner-content correction at the end of
this file replaces this.) The promoted-decision query reads
RESOLVES_PROPOSAL from src/shared/types.ts. No refusal, outcome or stored word
changes meaning.

WHY: each gate is an existing rule of the product, and each one was right. A
round that lands with a red gate leaves the next round to find it.

A fifth gate correction:

OLD: the same whole run found a fifth red when its part reached
tests/one-module-answers-the-office-key.test.ts. tools/stable/stable-bootstrap-transaction.mjs
and tools/stable/stable-bootstrap-execution.mjs each worked out the key file's path
for themselves, as the database's directory joined with the file's name.

NEW: both ask keysPathFrom in src/config/settings.mjs, with the configured
database as MOLE_OFFICE_DB. The two refusals that named the file by its name
now name it by the path that function answers, so a missing key file is
still refused with its path. The file checked, and every refusal, stay the
same.

WHY: the key file's path is declared once. A second spelling reads the wrong
file the moment the database moves, and nothing fails.

Live block correction:

OLD: a live configuration returned liveBlocked, and a live handoff was
refused with it, but no test said either. The sentence also named the
owner's downtime bounds as unresolved. They were decided on 17 October 2026
at 09:18 (at most 5 minutes until the new version
serves, and at most 5 minutes until a rollback is complete).

NEW: the configuration test requires liveBlocked to be null for a rehearsal
and present for a live configuration, naming the original scoped owner stop
decision and not naming downtime. The isolated recovery test requires a
handoff carrying liveBlocked to be refused with that sentence after
preparation, before the first stop, with development still serving.

WHY: the live block is what keeps activation blocked, and nothing proved it.
A refusal must not give a reason that is no longer true.

Live storage correction:

OLD: live preparation was allowed, and every live handoff returned the same
liveBlocked sentence about unresolved stop authority and activation prerequisites.

NEW: after the other configuration checks, live preparation refuses before any
worktree, branch, tag, copy, record or process is made. The reason says that the
bootstrap prepares the stable checkout as a linked worktree of development,
while the ordinary upgrade refuses shared Git storage, leaving a live stable
office unable to upgrade until one layout is settled. At live handoff, call
requireStorageTheUpgradeAccepts from independent-storage.mjs with the bootstrap's
Git reader. A refusal sets liveBlocked to a handoff refusal quoting the shared
rule's own message; acceptance leaves it null. Rehearsal leaves it null without
this check. Execution verifies stop authority before refusing liveBlocked and
before the first stop, so invalid authority keeps its own refusal.

WHY: activation must depend on the layout the ordinary upgrade accepts. A fixed
sentence cannot describe that measured incompatibility or preserve its cause.

Fixture removal correction:

OLD: each actual-Office fixture stayed in the temporary folder after every run.
One fixture holds two npm installs, the built pages, the original artifacts and
the database images, about 15 GB as measured. Its after-hook only wrote
CLEANUP-LITERAL-PATHS.json, naming the folders. The five actual-Office files
were in the ordinary whole suite, so the merge queue would build them, up to
eight at a time. The isolated files also left every folder they made: 82 from
one run of the per-step matrix and 23 from one run of the configuration file.
The check of an earlier run refused this (a precedent
from an earlier check).

NEW: the five actual-Office files run only with STABLE_BOOTSTRAP_ACTUAL_OFFICE=1.
Without it each skips its one case and prints one sentence that names the
variable and says why. Any other value is refused. Every fixture folder, actual
or isolated, is made through tests/a-test-folder.ts and written down by its
literal path. The file's own after-hook removes those paths, whether the case
passed, failed or threw, and whether the hook's own checks passed. Nothing is
removed by a pattern. Command logs are written inside the fixture folder, not
beside it. A named run may set STABLE_BOOTSTRAP_TEST_PROOF to a folder. Then
each actual fixture's logs, configurations, written timings and hashes,
transaction journals and source bundle are copied there before the fixture is
removed. The private credentials are never copied. Criterion 13's kept source,
logs and JSON are kept this way, for named runs only.

WHY: a test that leaves gigabytes behind on every run fills the shared disk.
When this fix ran each file once, each fixture held 3.1 to 3.2 GB as it was
removed. So the printed sentence says several gigabytes and gives no figure.
The sandbox launcher stops at 80 GB free, and a recorded rule allows
one fixture's copies at a time. The proof a round needs is kept by asking for it.

Owner-content correction after the merge queue's refusal:

OLD: src/config/settings.mjs held the two ports the owner's own office uses on
the machine this product is built on, in a function the rehearsal read. A
rehearsal refused those two numbers as listener ports and as its scratch check
port. The configuration test expected both numbers to be refused, and the
actual-office fixture skipped them when it chose its ports. On 17 October 2026
at 19:38 the merge queue refused the entry: "The guard
"owner-content" refused it. The entry adds owner content to what ships, and
the merge queue refuses it (the owner-content rule)."

NEW: no file that ships names a port of the owner's office. The product
defaults, 8787 for the API and 5173 for the browser app, stay. A rehearsal
refuses a listener port or its scratch check port by two rules. Both read facts
when the rehearsal runs, and neither reads anything from the repository:

(a) Something on this machine already listens on the port. ss reads this,
    read-only, when the configuration is checked. A listener port may be held
    only by a process the configuration records in its topology. The scratch
    check port may be held by nothing.
(b) The caller named the port in MOLE_OFFICE_REHEARSAL_KEEP_CLEAR_PORTS. It is
    a comma-separated list, read from the environment of the rehearsal command
    and never from a .env file. src/config/settings.mjs declares it once, with
    no default port. An entry that is not a port number is refused.

The refusal names each refused port and the rule that refused it. The
actual-office fixture chooses its ports through the same two rules. The tests
use made-up ports only: a server the test starts on a free port for (a), and a
named port for (b). Neither the rehearsal nor its tests read the live .env or
connect to the live office to learn a port.

WHY: the secretary ruled that this is not an exception, in the secretary's brief for the
run in question. The rule was not the secretary's to decide: it keeps
the owner's own content out of what
ships. The ports the owner's office holds on one machine are that machine's
facts, not the product's. The owner's office listens on its ports while a
rehearsal runs, so rule (a) keeps a throwaway office off them on any machine
without naming them.

One name for the stable checkout's folder:

OLD: the handoff took stableCheckout from its configuration and compared it
with nothing. Main declares the stable checkout's folder once, as
theStableCheckoutFolder(home) in src/config/sandbox-folder.mjs, and the
sandbox launcher refuses to mount that folder or to make a sandbox from it
(e7a230909). A configuration that named another folder would leave the
launcher's refusal guarding a folder the stable office does not use. Round 9's
report named this gap ("What is not covered").

NEW: in both phases and both modes, a configuration is refused unless
stableCheckout is theStableCheckoutFolder(serviceHome). The stable office
starts with HOME set to serviceHome, so that is the folder its own launcher
refuses. The refusal names the folder it requires and the folder the
configuration named. It comes after the path rules above, so a configuration
those rules refuse keeps their reason. The configuration test and the
actual-office fixture put the stable checkout in that folder under their own
made-up home. The configuration test refuses another folder through the
function and through the command, and refuses the same folder under a home
the stable office does not start with. Nothing is created.

WHY: one fact is worked out in one place (invariant 9). While the handoff and
the launcher each named the folder, a change to one could leave the other
wrong with nothing failing. Round 10's brief asks for this check, item 3.
