# First handoff notices

OLD: the original notice door accepts only an unequal-commit upgrade. Its completed
history row implies a previous stable release and cannot describe a first handoff.

NEW: the same door additionally accepts a strict version-2 first-handoff event on
existing messages. The source and target have the same full commit, different
repositories, and the same database and service port. An original green receipt
pins the commit and tree. Two secretary-approved note revisions pin the exact
before and successful after text. Receipt/event pins name creation revision 1;
approval note pins may name any positive revision, with authored creation checked.

WHY: changing which checkout serves the same code is a first handoff. Calling it
an upgrade or claiming a previous stable baseline would invent a release.

1. Ordinary version-1 request/event schemas, messages, outcomes, original receipt
   checks, runtime identity, release authorization and spacing keep their meaning.
2. First-handoff requests carry kind first-handoff and before/after stages. The
   announcement carries candidateTag, from, to, tree, evidence and notices. There
   is no previous baselineTag. Unknown input and invalid public prose are refused.
3. BEFORE matches the complete actual source identity. The original authored green
   receipt establishes its commit, tree and source repository. Each exact approved
   note body comes from a holder of the active secretary card, with original
   creation provenance. An editable current note supplies no approval content.
4. A successful AFTER is handed-off, never completed. It pins the original BEFORE,
   original writer and receipt, and matches the complete actual target identity.
   Refusal, restored failure, unrestored failure and unfinished attempts never
   claim a completed handoff or carry the successful after text.
5. Existing generic-record guards reserve the structured event. Original creation
   revisions establish one event per send id and one AFTER per BEFORE. Exact
   retries and bounded lookup reconcile the original response even after edits or
   deletion. A changed payload, original pin or writer is refused before writes.
6. History derives one first-handoff row from original messages in the existing
   creation order and bounded 25-row cursor. It carries kind first-handoff, a null
   previous baseline, exact repository endpoints and truthful notice states. Old
   rows retain their exact shape. The page says first handoff and never calls it
   an upgrade. Detail shows the repository endpoints and no previous stable
   release. Existing layout spacing remains unchanged.
7. Delivery journals preserve immutable send ids and payloads. An unconfirmed
   delivery after publication leaves the transaction result published and marks
   notices pending. Retry reconciles the original message before a new POST and
   never invokes a transaction, process stop/start or restoration.
8. Ordinary release policy accepts the mixed history but skips first-handoff rows.
   A first-handoff event is not an ordinary completed release or a new spacing
   clock. A stable baseline attestation remains separate secretary authority, not
   physical restoration telemetry. Owner stop authority is separately verified by
   the bootstrap transaction; notice approval never grants that authority.

Each new full test name needs a passing control, a specific implementation edit
that turns it red, and an exact restore that passes. Named runs retain source,
JSON and full logs in the run's sandbox out directory. Compilation and all test
or browser phases wait for the supervisor's named grant.
