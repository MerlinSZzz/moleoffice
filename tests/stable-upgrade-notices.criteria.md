# Original upgrade notices

Old: the stable transaction has original receipt verification and recovery, but no
server notice door or upgrade history contract.

New: one strict notice door writes existing Mole Office message records. History
reads their original creation revisions. A completed outcome needs the controller's
settled success payload and a server comparison of serving identities. A tag or a
later message edit establishes no completion.

Why: the secretary checks the notice, Mole Office announces it to the actual office
owner, and readers need to distinguish releases from unfinished or failed attempts.
Chat delivery after verification cannot roll back the service. The transaction and
its retry journal belong to the tool worker; this criterion covers the server.

1. POST /api/office/upgrades/notice accepts only the declared before/after requests.
   sendId is required and identifies the exact project, stage and payload. An exact
   retry returns the same original reference; a changed payload is refused before
   any write. One BEFORE has at most one authoritative AFTER.
2. BEFORE carries full from/to commits and tree, candidate and baseline tags, an
   original receipt reference and noticeApproval {id,seq,contentHash}. Approval
   names a note revision authored by one holder of the secretary card. Its body
   hashes equal to the notice text. Latest edits supply no approval facts.
3. All validation occurs before writing. Structured notices come only through the
   narrow server writer. Generic creates, patches, replacements and revision
   restores cannot add, change or remove their structured event fields.
4. The existing writeASystemLineToOne writer addresses the actual office owner,
   with Mole Office as sender and the authenticated agent request as provenance.
   Timestamps are observed server local wall-clock values. Private recovery paths,
   arbitrary failure details and credentials never enter the public event.
5. AFTER pins the original BEFORE id, sequence and hash in the same project. A
   completed payload pins the same green original receipt and full serving commit,
   repository, database and actual listening port. The server compares its startup
   and current checkout identity and built-page commit. This does not replace the
   controller's artifact verification or its two release-check health checks, nor
   claim an exact byte fingerprint of every loaded module.
6. Refused, failed-restored, not-restored and unfinished rows stay distinct. Only
   an authoritative original completed AFTER produces a completed history row.
   Failure reasons use a closed public vocabulary rather than private exception
   text. Failed AFTER delivery remains unfinished until the same request is filed.
7. GET /api/office/upgrades takes pages of 1 to 25 rows and an opaque older cursor.
   It queries original BEFORE events by project on the server, reads bounded
   matching originals, and returns no whole-corpus client read. History preserves
   the original tags, notice, date, commits, outcome and before/after references,
   and reports changed, deleted or missing current messages separately.
8. Original author, sender, project and authored provenance are checked. An ordinary
   message, a baseline revision, a forged latest field or a cross-project reference
   is never a release event. Original edits and deletes cannot move its date,
   notice or completion.

R3 original receipts, Git/artifact identities, private full-image recovery, dry
omission of ordinary health/runtime reads and NOT RESTORED behavior stay unchanged.
No migration, scheduler, producer activation, live switch or queue-green policy is
part of this contract. The merger regenerates the test audit table.

## The owner's Mole Office conversation

Old: contactsFor omits Mole Office from every contact list, including an owner who
has received an upgrade announcement. Sending a system message alone creates no
visible conversation in that list.

New: the office owner sees a read-only Mole Office contact once an original upgrade
notice exists for that owner. Other system lines, other recipients and ordinary
message privacy do not open this contact. The conversation's write permission is
unchanged; Mole Office reads no replies.

Why: the approved notice must be reachable in the owner's Mole Office conversation.
The change adds a visible place to read the announcements, without granting any
new sender or recipient permission.

## Resolving an accepted notice with a lost response

Old: a retry could obtain its original only by POSTing again. A tool that checks the
current target before POST could leave an accepted older notice unresolved after a
later upgrade.

New: GET /api/office/upgrades?sendId=<id> (optionally limit=1, never before) returns
{notice: original result or null}. Only the original agent writer may retrieve or
replay that original. A new run of that agent may act; the original ledger run
remains pinned as provenance. The same
authorization governs filing AFTER for BEFORE. Exact replay checks its payload and
returns the original even after serving identity changes. A new POST still checks
the required identities, including BEFORE's actual serving baseline.

Why: the controller must resolve delivery uncertainty before deciding whether it
needs a fresh health and identity check. This is a bounded original notice lookup,
with no arbitrary message read and no new write or diagnostic route.

Authorization correction: old proposed wording also allowed another current
secretary to retrieve, replay or finish the original initiator's announcement.
New wording allows only the same agent across valid owned runs. Why: the starter's
final clarification requires original agent ownership and withdraws the unrelated
secretary exception. Secretary role still governs the approval note author.

## Original event order and dates

Old proposed implementation: pages ordered original filing timestamps and random
record ids, and drew the filing timestamp as the observed date.

New: original create change append_order orders pages and cursors. History draws
the date observed by the server in the original event, including AFTER's date.
Filing time remains ledger provenance. Same-second events and clocks moving back
cannot reorder, repeat or omit an announced attempt between pages.

Why: local wall time is not a monotonic order, and observing a result and filing
its message can fall on opposite sides of a second or day boundary.

## AFTER carries the approved feature notice

Old proposed implementation: AFTER's body said only the generic observed outcome.

New: AFTER's body states the outcome, then includes the exact secretary notice
from the pinned original BEFORE. The server derives that body; the request has no
second notice field. History still uses the single original approved notice.

Why: the announcement after the upgrade must say what changed, as the secretary
wrote it, as well as whether the upgrade completed or failed.

## The history page declares its window

Old proposed reply: entries and an older cursor, with no shared row-limit disclosure.

New: the page also carries subtraction and leftOutGroups, checked with the shared
checkSubtraction. Candidates are the verified original BEFORE events in this
bounded query window, including at most one older-page probe. Carried equals the
returned entries; leftOut names that probe. These counts describe the window,
never the project's whole history. A matched original whose authority cannot be
verified is an explicit read failure, not a hidden completed release.

Why: the existing disclosure rule applies to every new row ceiling. A cursor says
where the next page is; the shared disclosure says what this page left out.

## History refusals retain their page meaning

Old proposed GET: invalid options, cursors or unverifiable originals returned only
an uncoded technical error, which the history page draws.

New: those history read refusals carry upgradeHistoryReadRefused and empty values,
with the declared English page sentence. The original technical reason remains
available. Invalid options fail before reading events. Agent-only POST and sendId
lookup keep their own technical refusals. The page preserves coded fault metadata
for initial and older-page errors; page words and drawing belong to the starter.

Why: the existing E1 rule requires a code and words for every new refusal a page
draws. A row in the uncoded inventory cannot replace that meaning.

The existing all-code fixture gains a real GET /api/office/upgrades?limit=26 probe.
Old: that fixture covered every earlier code but had no upgrade-history request.
New: it checks the new code, empty values, unchanged English reason, HTTP 400 and
unchanged record count. Its expectation still covers every declared code.
Why: the declaration needs an actual door probe; removing the new code from the
fixture's required set would hide the missing check.

## Notice version 4: an emergency release

Old: the door took an upgrade BEFORE (version 1) only with an authored original
green receipt for the announced commit and tree. Versions 2 and 3 are the first
handoff and the data-folder move.

New: version 4 is an emergency release. Its request carries `kind: "emergency"`.
Its announcement has the version 1 fields without `evidence`, plus
`emergency: {throw: {change, appendOrder}, message: {id, seq: 1, contentHash}}`.
The door takes a version 4 BEFORE without a receipt only when all of these hold:
- the pinned note is an approved secretary note whose release authorization has
  mode emergency and names the same message and the same release;
- the emergency switch is at 1 now, not run out, with an end time at most 120
  minutes after its recorded throw, and that throw is the pinned one;
- the throw came after the newest completed release, and no earlier BEFORE
  named it;
- the pinned message is the original, by an agent holding the secretary card,
  addressed to the owner alone, naming the full 40-character target commit,
  written after the newest completed release's AFTER, and pinned by no earlier
  BEFORE;
- no earlier emergency release that went in still owes its follow-up receipt or
  its report.
Each refusal names its reason, in the words the release tool uses for the same
fact. The words come from src/shared/stable-emergency.ts.

The door still refuses a version 1 BEFORE without a receipt.

A version 4 AFTER pins a version 4 BEFORE. A version 1 AFTER cannot pin a
version 4 BEFORE, and the other way round. A completed version 4 AFTER checks
only the serving identity: no receipt is read.

The BEFORE body is one line, then the approved notice: "Emergency release: no
complete test receipt was read for this version. Message <id> told the owner."
The AFTER body is the outcome, that line, the notice and the authorization line.

Why: an emergency fix goes in first and is tested
afterwards. The door is the second place that checks it, so a
release tool that skipped its own check still cannot publish an emergency
release without the switch and the message.

## The follow-up and the report are worked out on read

Old: no history row owed anything after its AFTER.

New: the history reads versions 1, 2 and 4. A version 4 row carries
`emergency: {throw, message, followUp, report}`. Neither followUp nor report is
stored. Each is worked out when the history is read, in one function the merge
queue's mark can call later:
- followUp is `not-owed`, `missing`, `filed` (the receipt's pin, its commit and
  whether it is green) or `unknown` (with why).
- The follow-up receipt is the first whole-suite receipt in the project filed
  after the BEFORE whose commit has the released commit as an ancestor and is on
  refs/heads/main. Git's exit 1 means no. Any other failure means unknown.
- report is `not-owed`, `missing`, `filed` (its id) or `unknown`. The report is
  a report record, not deleted, linked about the BEFORE.
- A release that went in owes both. One refused before the switch, or failed and
  cleanly restored, owes neither and says `not-owed`.

Why: a stored "owed" flag would have to be changed by whatever files the
receipt, and it would drift. Worked out on read, the answer is always the
records' answer, or says that it could not be read.

## Version history shows an emergency release

Old: every completed row read as an ordinary release with its receipt.

New: an emergency row says "Emergency release" and "No complete test receipt
was read for this release." Two lines follow: the follow-up test receipt and
the report. Each says missing, filed, or could not be checked. A filed receipt
also says whether the tests passed or failed. A release that did not go in says
that it owes neither. A filed receipt's line has the link "Open follow-up
receipt", and a filed report's line has the link "Open report". Each opens that
record's page. A line that says missing or could not be checked has no link. The
ids are in the links' addresses and in the Developer details, never in the
words.

Why: the owner must be able to see which stable versions went in untested, and
whether each has been tested since, and to open the receipt and the report from
the row without copying an id.
