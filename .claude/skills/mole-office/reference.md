# Mole Office reference

Longer material for the `mole-office` skill. Same rule as the skill itself: **no field names and no
data examples live here.** Every shape comes from the running server, because the schema the
server hands you is the schema it validates against.

---

## The write loop

1. **Ask for the shape.** `GET /api/kinds/<kind>`. The answer names each field, says which ones
   the kind needs in order to be complete, explains what each is for, states the rules that span
   two fields in plain English, and carries a full worked example of that kind.
2. **Build the record from that answer.** Not from memory, not from another record you saw, not
   from a source file you happened to be able to read. The answer is the contract.
3. **Post it**, with your actor headers. Post it even if you can only fill in some of it — see
   *File it before you can finish it*, below: a field you have not written yet does not stand
   between you and a stored record.
4. **Read the response.** 201 means the schema accepted the shape — not that the record is
   finished, which is a separate question with a separate answer. A 4xx means the shape was
   refused and nothing was stored, and the body says why. A 201 may also name live records whose
   titles are close to yours; that is advisory, refuses nothing, and is the only warning you get
   that you may be filing something twice.
5. **Link it** to what it affects. An unlinked record is filed, not connected — see the two
   queries below. The reply names both records and how the link now reads, so a link made by
   typing a title can be checked without a second request. A create can carry the relationships you
   already know, written in the same transaction as the record and resolved at both ends in the
   reply; there is no partial version of that list, so a link it cannot make refuses the whole
   write rather than leaving you a record and a silence.
6. **Come back to it.** Anything you left out is filled in by a merge patch, below.

`GET /api` gives the URL to post to and the shape of the envelope around your record. It also
serves the three header names and what each one means, in its `attribution` block — that is the
authority, not this page. What follows is only how a write is put together:

```bash
curl -sS -X POST "$MOLE_OFFICE_API"/api/records \
  -H @"<your notes folder>/headers" \
  -H 'content-type: application/json' \
  --data-binary @- <<'EOF'
<the body GET /api describes for POST /api/records>
EOF
```

The headers file is in your notes folder, one header to a line: `x-mole-office-workspace`,
`x-mole-office-actor-type: agent`, `x-mole-office-actor-id: <which agent you are>`,
`x-mole-office-session: <the id of your session record, if you have one>` and `x-mole-office-key`.
Write it with `umask 077`, and let the shell read the key from your key file into it, as
`printf 'x-mole-office-key: %s\n' "$(< "<your key file>")" >> "<your notes folder>/headers"`, so the
key is never typed, printed or put
on a command line. Never print the headers file and never copy it out of the notes folder; when a
line must change, write the file again. The key proves who you are, so the actor id beside it must
be your own handle. A blank key header is read as no key.

A header sent wrong is refused, and a header left out is no route to the person. Both are in
*The cold start, in full*, below, under *Identity fails loudly* and *Omission is never a route to the
human*; chapter 4 rule 1 and chapter 8 rule 2 have the rules.

---

## Changing a record without resending it

Changing a record is a PATCH to that record's URL. There are two ways to touch the kind-specific
part, and the difference matters:

- **Replace the whole object.** Everything you do not send would be gone. So a whole-object write
  that would empty a field is refused with a 400 naming each field it would empty. If you really
  mean to lose them, the refusal says how to say so.
- **Merge, key by key.** Only the keys you name change. Anything else is left exactly as it is,
  and a null removes its key rather than storing a null.

`GET /api` describes the PATCH endpoint; ask it which body field selects which behaviour, and send
one or the other — sending both is refused rather than guessed at, and the refusal names them.
**Prefer merging whenever you are changing one thing.** Replacing whole means sending the entire
record back over the wire and writing the whole of it into the history twice, before and after,
for a one-word fix. A merge reports back which paths actually changed and which keys it deleted,
so a delete — the one edit whose effect you cannot see by reading what you sent — is visible.

**Enriching a stub is a merge, always.** Filling in a field you left out earlier means naming that
one field and nothing else. Rebuilding the record from what you remember and replacing it whole is
how a stub loses the little it had: you cannot lose a field you did not mention.

A merged record is checked as a whole record, not as a patch. So a record written before the
checker existed cannot be merge-patched until the same patch also fixes whatever else is wrong
with it. That is deliberate: the alternative is a write that leaves a record invalid and reports
success.

### A merge does not merge a list

**A key holding a list is replaced whole, even by a merge.** So the obvious way to add one line to
a list — read the record, splice your line in, send the list back — is a write that carries every
line somebody else may have added since you read it, and it removes the ones you never saw.

Two agents editing one checklist would lose each other's lines this way: the second sends back the
list it read, and every item the first one added is gone, with its id. The ids are what the change
log compares to answer "how long has this been doing?", so their history would go with them.

Both places where Mole Office keeps an ordered list several writers touch now refuse that write:

- **To add a line, use the route that adds one line.** It carries your line and nothing else, so a
  caller that has not read the list cannot overwrite what it has not seen. `GET /api` names it and
  the refusal names the fields.
- **To remove one on purpose, say which version you read.** A whole-list write that drops a stored
  line is refused unless it carries the version the read handed you, and that is refused in turn if
  anybody writes in between. The refusal prints both routes and the version to send.
- **Reordering takes the whole order and only a permutation of it** — nothing added, nothing
  dropped, nothing repeated. A list that leaves one out is refused rather than silently removing it.

Read this as the shape of the contract rather than as a special case: a write made against a stale
read is refused, and the refusal tells you which of the two things you meant.

### The version token guards any patch, not just a list

The three bullets above are where the version token is *required*. It is **optional on every other
patch, and when you send it it is a compare-and-set**. That is the concurrency primitive of the
whole API.

A create and every read hand back a version. Send it with any patch and a write against a copy
somebody else has already replaced is refused instead of answered 200: the right version is answered
200, and the same version again is a **409**, naming both versions, writing nothing, and telling you
to read the record again and reapply your change to what is there now. Use it whenever another agent might be touching the same record. It costs one key
in the body and it turns a silent overwrite into a refusal you can act on.

---

## Titles

**An id is identity. A title is presentation. Titles may repeat.** Typing a title is how you link
to something, so a good title still matters — it is just not what makes a record itself.

- **A title already in use is filed, not refused**, and the answer says what else is called that:
  `sameTitle` on the create reply, with each one's id and kind. Nothing is merged. If one of them
  is the record you meant, delete yours and work on that one; if yours is different work that
  happens to share a name, there is nothing to do. Pick a title you would recognise in six months
  anyway, because it is what everybody reads.
- **Linking by a name that means more than one live record is refused**, and the refusal names
  every candidate with its id, because the titles are identical and the id is the only thing that
  tells them apart. Send the id of the one you mean.
- Linking by title to a name that does not exist is an error naming the title. It never creates
  the missing record for you. If the thing you depend on has no record, file it, then link.

Nothing is ever really deleted. A deleted record stays, marked deleted, so links pointing at it
show as **broken** instead of quietly disappearing. A deleted record does **not** hold its name
against a new one: writing something again after deleting it is ordinary and is not refused.

A report's title and summary are two of its reading lengths; *When to record*, below, says how to
write them and the other four.

---

## Reading a validation failure

A refused write comes back as a 400 whose body is written to be acted on. It says how many fields
are wrong, one line per problem, each naming the path, what was wrong with it and what a right
value looks like — and it ends with the URL of the schema for that kind.

What the message is telling you:

| The message says | What it means | What to do |
|---|---|---|
| an unknown key | that kind has no such field | use the field it suggests, or the declared place for things with no field of their own |
| a wrong type | the key is right, the value is not the shape it takes | look at the example the schema gives for that field |
| a value outside a vocabulary | the field takes one of a fixed set of words and this is not one | take one from the list the schema prints |
| a blank value | an empty or whitespace-only value, which reads on the page as missing data | leave the key out altogether — absence is allowed and blankness is not |
| a half-written nested object | an object was written but not completely | write the whole object, or leave its field out until you can |
| a rule spanning two fields | one field obliges another | the schema for the kind states these rules in English |

Notice what is **not** in that table: a field you simply have not written yet. That is not a
failure and there is no message for it — the record is stored and counts as incomplete. Every row
above is a value that is *wrong*, and wrong is what gets refused. The distinction is the whole
design: see *File it before you can finish it*, below.

Every one of those is fixable from `GET /api/kinds/<kind>` alone. If you find yourself unable to
fix it, say so and stop. Do not post a record whose shape nothing checked, and do not fall back
to writing a markdown file instead — the markdown file always works, which is exactly why it is
the wrong answer. Equally, do not respond to a refusal by cutting the field out of your record and
moving on unless leaving it out is genuinely honest: a stub you intend to finish is a legitimate
record, and a field quietly dropped to dodge a 400 is not.

A wrong `/api` path answers with the full list of endpoints, so being lost costs one request. If
`GET /api` or `GET /api/kinds` itself answers 404, the server you are talking to is older than
this skill and nothing is checking your writes. Report that rather than guessing shapes.

---

## The two link queries

Both exist because of `consumes`, and both are blind unless the agent that used a result recorded
that it did.

**`GET /api/queries/unconsumed`** — results nothing is using: the claims, modules and ideas that
nothing consumes. Some of these are fine, a result nobody needs yet. The rest are the failure the
product was built for — a measured value sitting one folder away from a document that says it is
missing. When you see one that should have changed something, link it, or file the work it should
change.

**`GET /api/queries/unmet`** — work standing on something that is not there any more: a record
consumes something that has since been deleted. Each answer names the consumer and what it was
waiting on. These are never fine. Either the dependency was removed by mistake, or the work built
on it needs revisiting.

---

## Picking up work already in flight

You are usually not the first agent on a project. Every read below answers about ONE project — the
one your request names, or the default it does not — so say which before you read anything and take
the answers as being about that project alone. See *Which project you are writing into* in the
skill. Before starting:

- `GET /api/attention` — **read this one first.** It is what needs a person today, worked out by the
  shared rule and served as the answer, so nothing has to re-derive it. A thing is on the list when
  it is owed to somebody outside the project, or when its own recorded state says the work stopped
  short. Every selected row carries the reason it was selected, and everything *not* selected is
  accounted for in named buckets rather than dropped — which is how you check your own writing
  instead of trusting a 201.
- `GET /api/changes` — every write, newest first, with who did it and in which session. It filters
  by record, by session, and by a window with two ends. **Both ends are inclusive and both are
  optional**, so one day is the same date at each end with a time on the upper one, and a week is
  the same pair seven days apart. A start on its own has no upper end — it means everything from
  then until now, which is four days if you last looked on Thursday. `GET /api` names the two
  parameters and shows the shapes a date may take; a malformed one is refused rather than ignored.
- `GET /api/anchor` — **what has changed since the person last looked.** This is one of the two
  questions the product's own front page says it exists to answer, and answering it for the OWNER
  is not the same as answering it for yourself. Your anchor is keyed to your actor headers, so this
  will tell you that you have never looked, every time, for ever. The reply carries `readers` —
  every reading point in the project — and that is the one you want: find the human's, then read
  `GET /api/changes?since=<their `since`>`. That read needs no anchor and claims to be nobody.
  **Use `since` and not `lastSeenAt`**: `lastSeenAt` is when they pressed the button, `since` is the
  stamp of the row they said they had read to, and a reader who anchored on an older row has the two
  days apart. Asking from the wrong one can answer "nothing has happened" about hundreds of rows.
  **Never send the human's actor headers to move their anchor.** It files one reader's reading as
  another's, in a log nothing rewrites, and it is the same false name as filing a decision as them.
- `GET /api/records` — everything, or one kind at a time. Sessions tell you whether another agent
  is still running or died mid-way. Problems tell you what is known to be broken. Obligations tell
  you what is owed and when. Each entry also says how many fields it is still missing, so the
  stubs an earlier session left behind are visible without opening them one by one. If you learn
  the answer to one while doing your own work, fill it in — that is the cheapest useful thing you
  can do for the next agent, and stubs nobody returns to are how this whole arrangement fails.
  **There is no search.** Asking for a query string is a 400 and there is no search endpoint, so
  finding a record by name means listing and matching yourself.
- `GET /api/records/<id>` — one record with its links resolved in both directions and its history.
- `GET /api/sessions` — every run Mole Office can see, and which piece of work each is filed under. See
  *Say which work your run belongs to*, below.
- `GET /api/health` — whether the server is up and how many records it holds. One request, and it is
  the right first call when you are not sure the thing you are talking to is running or is the
  instance you meant. It is the one read that is **not** about your project: the count is the whole
  installation, every project at once, and the route does not read the workspace header at all.
  Do not use it to check the size of the project you are in.
- `GET /api/resources/scan` — this machine as it is right now: every listening port with the process
  group holding it, the GPU, the containers, the lock files. It is not the ledger and it does not
  need anything to have been registered, which is why it catches a run that died before it wrote
  anything down. *Registering what you start*, below, describes the sweep in prose; this is the
  route that does it.

Then work, and file as you go. The whole point of the application is that this handover survives
a reboot; that only holds if the writes happened while the work was happening.

---

## Saying how a structure should be drawn

Eight of the API's endpoints are for this. They live under `/api/presentation` and address the whole set, one structure, that
structure's direction, and one node of it — but not every verb on every one of those, so read the
list in `GET /api` rather than composing a URL from this sentence.

**What is stored is meaning, never geometry.** A node may be given the lane it belongs in, its
preferred order within that lane, how prominent it is, a semantic emphasis, whether it is folded,
and one weak "keep this near that". A structure may be given the direction it runs in. **A
coordinate or a colour is refused by name**, with a sentence telling you to store a meaning instead
— Mole Office works the picture out from the meaning on every draw, which is what makes an arrangement
survive a record being added. `GET /api/presentation` serves the whole vocabulary beside the
arrangements, so as everywhere else here you can read the shape rather than guess it. An empty node
intent is refused too: saying nothing is a delete, not a write.

**Two things to get right.** A structure is named either as the whole-project graph or as one
pipeline, and a name in neither form is refused with both forms printed — read that refusal rather
than guessing. And **a node is named by its record id**: the published note for the one-node route
still offers a `step:<id>` form, which was retired when a block became a record and is now refused
by name. Send the block's record id; that note is wrong.

This is worth writing when the shape of a thing carries information a reader would otherwise have to
work out — which blocks are one phase, which module is the spine. It is not worth writing to make a
picture look tidy, and there is nothing you can say that would.

## Starting a worker, in full

**File the run before the process exists**, so the office can check it. A worker you started is
answered for by you: when it says its work is finished, the office asks whether the work followed
the rules, and it can only ask if the run's record says which agent it serves, where it works, and
what the work was cut from. A run filed by hand that misses one of those keys is never checked and
never let go.

Two steps, in this order:

1. **Register it** — `POST /api/agents/started`, with the areas it may change. That answers the new
   agent's key once, and the registration tool writes it to a new file that only you can read. The
   key is read from that file into a request header and nowhere else, as *The write loop* shows.
   Give the worker that file's full path as `MOLE_AGENT_KEY_FILE`, and never the key itself.
2. **File the run** — a `session` record (`POST /api/records`; `GET /api/kinds/session` gives its
   shape), with the agent's handle, the absolute worktree directory, the branch it was cut from, the
   worktree's Git HEAD, the runtime and the model, and your own session as the run that started it.
   The new record's id is what you give the started agent as its run. Start nothing between the two
   steps and the id.

A checkout of Mole Office has one command for each step among its developer tools; an installed
office does not carry them. Each door refuses with plain sentences and writes nothing when the
handle is not registered, the runtime word is not one the office knows, or the record is not
usable. Fix what the refusal says and send it again.

**You still start nothing on the office's behalf.** Do not run the office's dispatch as a way
around this; a runtime a tool here starts registers through these two steps whatever it is,
and the check follows from the record, not from the command line.

## Registering what you start

The skill says to register anything that outlives the command, before doing anything else with
it. This is what that costs and what it buys.

**It is one request.** `GET /api` lists the resource endpoints. The write takes the session
record this run is filed under, which of the few kinds of thing it is, and the thing's own
number — a pid, a port, a container name. You have all three at the moment you start it; none of
them needs looking up, and nothing has to be true about the thing yet except that it is running.

**You do not need to know the shape to make the call.** Post an empty body. The refusal names
every field it wanted and lists the kinds of thing it accepts, in one round trip, so a
registration you have never made before costs one wasted request and no reading. That is the same
contract as everywhere else here: the schema that answers you is the schema that checks you.

```bash
curl -sS -X POST "$MOLE_OFFICE_API"/api/resources \
  -H @"<your notes folder>/headers" \
  -H 'content-type: application/json' \
  -d '{}'          # the 400 names the fields; send it again with them filled in
```

**Register the pid, not just the port, when you have both.** A pid is probed as it is written
down: its process group and its start time are read at that moment and stored. Those two facts
are what let somebody stop it safely later — the group, because signalling a lone leader leaves
its children holding the port; the start time, because pids are recycled and a recycled pid is a
stranger. **One registration of a pid also covers the port that process is listening on**, so a
server is one request and not two. A port written down before anything has bound to it stores
neither fact, and stopping it later has to be done by hand.

**The session record comes first**, and it is the one thing that makes any of this answerable: a
resource is owned by the session that started it, and "has the owner ended?" is the entire
question the ledger exists to answer. Filing the session, unless the session hook filed it, is
already a trigger in the skill.

**A pid that started before your session was filed is refused**, and the refusal names both
times. A process you started cannot be older than your session, so an older one was found, and an
agent that stops what it found by a pattern can stop somebody else's server. Register the pid you
read from your own start. If your session is really taking on a process it did not start, say why in
the same request; the refusal names the field, and the row's detail then begins with your reason.

**At the end, close it out.** Releasing a registration is its own request, and it is honest in
both directions: releasing something already stopped just tidies the row, and releasing something
still running is a kill that is written into the change log with who asked for it. Something left
running on purpose is said on the session record (chapter 2 rule 2).

**And if you register the wrong number, take the row back rather than leaving it.** `POST
/api/resources/<id>/withdraw` closes a row that should never have been written, and it wants a
sentence saying why — post an empty body and the refusal names what it wants, as everywhere else
here. It signals nothing: only the row is closed, and whatever the row named is left exactly as
it is. Your words go on the row after the product's own, so a reader can tell it from a row
somebody stopped. Only the session named on the row may withdraw it. **This is not a way out of a
release you would rather not make** — a row for something you really did start is refused where
Mole Office can tell, and where it cannot, the reply says so rather than pretending it checked.
The mistake it exists for: a process group found by matching command lines, registered before its
working directory was checked, can belong to another agent's test suite.

### What the report can and cannot see

Two different sentences, and they must never be confused:

- **"No orphans"** means every resource *that was written down* is either dead or still owned. It
  is only ever as good as the registering.
- **"This is running, and no session claims it"** is the other half, and it is the worse news.
  The orphan report also sweeps the machine itself — the listening sockets, the GPU, the
  containers — and names what is alive that no live registration accounts for. It can tell you
  something is there. It cannot tell you who started it, whether it was meant to stop, or what
  else dies with it, because nobody wrote any of that down.

So an unregistered process is not invisible any more, but it is unattributable, which is nearly
as bad: the report can only hand you a command line and a process group to deal with by hand.
Registering is what turns it into something anybody can act on later. The sweep also says where
it looked, what it deliberately left out and why, and any place it could not look at all — an
empty list from a sweep that could not read the GPU is not a clean bill of health.

---

## The proposal path, in full

A decision is a choice that closes off an option which costs real work to reopen. Deciding is the
person's act. An agent with no warrant gets a 403 on that kind on **four** acts, not two: creating
one, changing one, deleting one and restoring one, because removing a decision closes as much as
writing one. Reading the whole archive back from its text export is guarded the same way, for the
same reason: it replaces every decision at once.

That is not a wall, it is a routing rule, and the route is the `proposal` kind. It is a record like
any other: an agent may write it, it is listed and queried with the rest, and it is read beside the
decisions rather than buried among notes. **The 403 body prints the requests to make, ready to
copy** — take them from there rather than from this page, since that message is kept in step with
the routes that exist by a test that fails if it names a path the server does not serve. Today it
prints the proposal write, the link that says what the fork is about, the query that lists the
queue, and the route the person settles it with. `GET /api/kinds/proposal` is the authority on the
fields; the skill says what makes one worth reading.

Three things beside what the message says:

- **Settling it is not yours, and the route enforces that.** A promotion files the `decision` and
  links it back to your proposal in one write, and it refuses an agent for exactly the reason
  writing the decision by hand does: settling a fork *is* the governance act. It also refuses a
  second promotion of a proposal one decision already answers, which is right — a fork is the
  reasoning one choice was made from.
- **Say what is stopped.** If work cannot continue until the fork is answered, link the proposal to
  that work with `blocks`. A fork holding nothing up is quiet by design — it is read where
  proposals are read — so the link is what makes the queue visible as a cost.
- **If you need an answer before you can continue, file a message as well.** A message is the
  channel that reaches the person; a proposal is a thing on the record.

Then continue on whatever does not depend on the fork, and say in your report that you stopped at
one.

Recording a decision the person already made in words is allowed, with a warrant; see chapter 4,
rules 4 and 5.

Never send the human actor type to get past any of this. The header is attribution, so nothing
stops you — that is precisely why it matters. Doing it writes a false name into a permanent change
log and takes a choice that belongs to somebody else.

---

## What not to record

Mole Office is small on purpose. It is not where the work lives.

- Not the report, the code, the CAD or the raw data. Those stay in the project directory and are
  referenced by path. Nothing is copied in.
- Not a running commentary. A record per thought makes the queries useless.
- Not a file-by-file account of a codebase: see *Describing code*, below.
- Not something already carried by another record. Work that belongs on a module's checklist goes
  there rather than becoming a second task that drifts out of step.
- Not a message that is really a result. A message is read once. If it is worth keeping, it is a
  claim, a problem or an obligation.

## The terminal is the agent's short-term memory

The terminal is the agent's short-term memory; the office is what survives the session. The rule for
what goes where: if the conversation ending would lose it, it goes in the office — a decision, a
problem, a run, a resource, a report, a message. What led to it stays in the terminal, written for
the agent itself and for whoever reads the transcript later. A run with no terminal — a DeepSeek or
OpenCode run — has its log, and the same rule holds for the log.

Chapter 9's rule "The terminal is the agent's short-term memory; the office is what survives the session"
has the rule and the seven practices in full. They are:

- State the plan before acting, in the open, so a wrong plan is visible before it runs.
- Keep an observation apart from a diagnosis, and say so when you cannot reach the diagnosis.
- Write an error down where it happened, the moment you see it.
- Say which numbers you checked and which you were only told.
- Carry the waiting list: what is running, and what is blocked on the person or on hardware.
- Refuse out loud, so the refusal is auditable rather than silent.
- Give anything you depend on passively a watcher that reports each transition once.

## When to record

Each kind states its own trigger: `GET /api/kinds` gives every kind's `whenToRecord` in one
sentence, with the full shape beside it. This section keeps only what is not already there.

**Writing meant for a person to read is a `report`, never a note and never a module's summary.** A
note is free writing nothing queries; a module's summary is rewritten as the subsystem changes and
a report is about a day and stays as it was written. File it with an `about` link to what it
reviews. Publishing it stays inside Mole Office — chapter 10 rule 2 — because a review published as
a page elsewhere is one the person has to leave Mole Office to read.

**Filing a report is its title, its summary and its blocks.** The title IS reading length 2 and the
summary IS reading length 3, so write both when you file the record: aim at a title of at most 15
words and a summary of 20 to 60 words — the conclusion, in one paragraph. Those two numbers are
targets. Nothing is refused for its length and going over by a little does not matter. A report
filed with no summary has no reading length 3, and its page says that level has not been written.

**Then its label, which is reading length 1**: 2 to 5 words, enough to tell this report apart from
the ones listed beside it. That one is written with the short-forms request below, not on the
record.

**The other three are written by part, and they are one thing to write.** Split the report into
parts: a headed section where it has headings, a group of paragraphs where it has none. You decide,
and you record which blocks each part covers. For each part write a heading of at most 10 words,
a text of at most 30 words, and a text of at most 120. Every block of the report is covered by
exactly one part, pictures and charts included — a block covered by nothing, a block covered twice,
or a part covering a block id the report does not hold are each refused, naming the ids.

Write the label and the parts with `POST /api/records/<id>/short-forms`, which records who wrote each one, naming the revision they were made from — so it comes after the record is filed. The title and
the summary are not written there: they arrive with the record and change with
`PATCH /api/records/<id>`.

**Link a problem to what it holds up.** One truthful `blocks` link, with nothing else about the
record changed, can move a problem from a row nobody reaches to the top of the screen that ranks
what needs a person. See
`GET /api/kinds` → `linkTypes` for what each link type asserts and when a weaker one is the honest
choice.

**Say what you are working on before you change it.** `POST /api/claims` takes the records, files
and folders a run is about; two claims naming the same thing open a group with the owner in it,
without anybody being asked. A claim ends when the run ends — say so anyway when you finish
something early, so somebody else can pick it up without waiting for you to stop.

## A warrant: the person's own words, when they have already said yes

Chapter 4 rule 5 has the rule in full: an agent may make a governance write the person has already
agreed to by carrying a warrant — the person's words, copied exactly, where and when they were
said, and which records they cover. The five acts that take one, the four places the person may
have said it, and how the person takes a warranted act back in one press are all there now.

## Fixture or authored, and why you must read the mark

Chapter 4 rule 9 has the rule in full: a record is marked `authored` or `fixture`, never file
fixture content as a real observation, and no mark at all means nobody has said — read the absence
as a question, not as authored. Two practical notes:

- **The mark is on the record itself, not inside its kind-specific fields.** It survives an export
  and cannot be rewritten by a merge patch, which is the point: it is a fact about the row.
- **When you quote a record as evidence and it carries no mark, say that you could not tell.**
  Mole Office will not turn an absent mark into either word.

## Say which piece of work each request belongs to, and why you are doing it

Chapter 4 rule 11 has the rule: `x-mole-office-trace` names the piece of work a request belongs
to, on reads as well as writes, and the name changes when the purpose changes; `x-mole-office-purpose`
is one word from the closed list the door names, and a fresh agent's first request is `cold-recovery`;
a trip outside Mole Office for project state is reported to `POST /api/usage/outside-reads`, whose
refusal on an empty body names every field it wants, and the judgement of whether that truth belonged
outside is yours. None of it is required; without it, how the run went cannot be reconstructed.

Which project a request is in is a different question, and *Which project you are writing into*
in the skill answers it. One thing it does not say: a run that works in two projects needs a
session record in each, or half its history has nothing saying who did it.

## Say which work your run belongs to, or something else will decide

Chapter 4 rule 12 has the rule: every run is filed under one pipeline or module, and if you do not
say which, Mole Office works it out from whatever you happened to touch. Once you have a session
record, `POST /api/sessions/<its id>/link` names the pipeline, the module or the block you are here
to work on (`GET /api` gives the body; it takes a title, so you do not need an id); a link to a block
files the run under the pipeline holding it. The reply says where the run landed and why, and so do
the session listing and one session's own page; creating the session record tells you nothing about
this. Not naming a project is a real answer too, with the reason on the row.

**This is the piece-of-work question and not the project question**, and none of the three readings
below answers the second. The rule runs inside one project — the candidates are the pipelines and
modules of the project your request names, and a run whose project holds neither is told so — but
which project that is appears nowhere on a session row. Read it off the record instead. A session
row does carry something that reads like it and is not: what a session says about the **directory**
it was working in, which is a path on disk and not a project boundary. The two answer different
questions and a session may have one, the other, both or neither.

**Four kinds of evidence, strongest first.** A typed link from the session record to a pipeline or
module. A typed link to a **block**, which files the run under the pipeline holding that block. A
write in the change log to any of those. And a write to a record that is itself linked to one — the
weakest, and the answer names the record in the middle so the chain can be argued with. The
strongest evidence available wins. **When two candidates are equally strong, the tie breaks on how
many separate links or records support each**, not on what the link says: a run that declared
itself part of one thing can lose to a thing it mentioned three times by accident. Whether that is
right is an open product question, recorded and not decided.

**Where to read it, and what each of the three actually carries.**

| | the answer | the rule beside it | how much evidence it read |
|---|---|---|---|
| the session listing | on every row | yes | yes |
| one session's own page | yes | yes | **no** |
| the reply to linking a session | yes, with the sentence | **no** | **no** |

So the listing is the only one of the three that carries all of it. The link reply is still the
cheapest check there is — make the link, read the sentence, which names the record it filed you
under and why — it just does not restate the rule.

**Everything a run reaches that did not win is listed beside the answer**, so a placement you
disagree with can be inspected rather than guessed at, and a run nothing places carries the reason
and the request that would place it.

## File it before you can finish it

Chapter 4 rule 6 has the rule in full: file the stub as the thing happens, with only a title if
that is all you have. An incomplete record is a full member of the graph, and the write's own
answer names what it still wants and any record already called what yours is called.

## Changing part of a record: send the part, not the whole

`PATCH /api/records/:id` describes this in full: send `dataPatch` for an ordinary edit, which
merges what you name and leaves everything else alone, and reserve `data` for when you really mean
to replace the whole object — the door refuses a `data` that would empty a field, naming what it
would lose. Chapter 4 rule 3 states the rule; the two bodies are pinned by
Mole Office's own tests against the running product, so read the shapes from the door rather
than from here.

## Reading somebody's folder into a draft

`POST /api/import/draft` describes this in full: an agent files one draft of what it read, every
piece naming the files it came from and quoting the words it rests on, and nothing becomes a
record until a person accepts a piece on `POST /api/import/drafts/:id/pieces/:pieceId` — refused to
every agent, including the one that filed the draft. The door also has the rest: only what a file
actually says, and never a shape or a problem the folder itself does not describe.

## Describing code: you curate the module, you never write the index

Chapter 4 rule 13 has the rule: you curate the module, what a subsystem is responsible for and what
state it is in, and you never hand-write the source index. `GET /api/source` is rebuilt by scanning
and refuses every write; `GET /api/source/coverage` names the files no module has claimed and the
claims that point at paths which no longer exist; code implemented in a repository this project
builds is declared through `POST /api/implementation`. Read `GET /api/kinds/module` for the field
that is current rather than this page.

## Links

A link is stored once, in one direction, from → to; the reverse label is shown at the other end and
never stored. `GET /api/kinds` serves the whole vocabulary as `linkTypes`, now with a `description`
on each type saying which fact it asserts and when a neighbouring type is the honester choice —
`about` against `blocks`, `duplicate_of` against `supersedes`, `consumes` against `measures`. Read
that before choosing between two that look interchangeable; this page keeps only the table.

Either end may be named by typing its title rather than holding an id, and the reply names both
records and says what the link now reads as, so a link made by typing a name can be checked without
a second request.

| type | stored as: from → to |
|---|---|
| `consumes` | the work that uses a result → the result it depends on |
| `produces` | the work → what it produced |
| `blocks` | the thing in the way → the thing it holds up |
| `resolves` | the work or finding that ended it → the problem it ended |
| `about` | the problem, finding or piece of work → the module or thing it concerns |
| `part_of` | the part → the whole |
| `measures` | the measurement → what it measures |
| `implements` | the implementation → the idea or design it realises |
| `derived_from` | the derived thing → what it came from |
| `supersedes` | the newer thing → the thing it replaces |
| `duplicate_of` | the repeat → the one to answer |
| `contradicts` | the finding → the finding it disagrees with |
| `discusses` | the note or message → what it is about |
| `relates_to` | either end; symmetric, and the default when you do not say how |
| `plans_for` | the planned future → the pipeline, module or block it is a future for |
| `realises` | the thing that happened → the planned state it made real |
| `instead_of` | the thing that happened → the planned state it answered another way |
| `serves` | the work → the goal it works toward; the work is a trajectory, an obligation, a task or a cluster (a `module` record) |
| `coexists_with` | either end; symmetric. Two decisions that both stand: it retires neither, and the nightly governs check counts a pair on one file that it joins instead of listing it. Only between two decisions |

That is the whole vocabulary; nothing else is a valid `type`.

Only `blocks` may carry a `gate` saying how much it blocks: a hard gate stops the blocked record
proceeding at all, and a partial one names how far it may go. `POST /api/links` is the only way to
write a gate; delete the link and make it again to change one.

A `blocks` link may also join two blocks inside one pipeline — there is no separate `needs` array,
a block waits on another block exactly the way any two records do.

`GET /api/queries/unconsumed` and `GET /api/queries/unmet` exist because of `consumes`, and both
are blind unless the agent that used a result recorded that it did — link the work that used a
claim, or file what it is waiting on if nothing names it yet.

`GET /api/forks/possible-duplicates` proposes `duplicate_of` and `supersedes` groups with its
reasons and writes nothing; read them, and if you agree, write the link yourself and say why in a
record you link to it — never from a resemblance alone. The three types describing a planned future
that has not happened yet — `plans_for`, `realises`, `instead_of` — are then locked to an agent:
you may not delete one of these links, delete or reorder a planned record, reword an answered
planned state, or overwrite the `because` written on one.

## A lost key

The office keeps only a key's hash, so it can never show a key again. If you lost yours, run the
command you registered with, adding `--new-key`:

```
node <for-agents>/register-myself.mjs --handle <handle> --name "<name>" --dir "<start folder>" --key-file "<a new file in your notes folder>" --new-key
```

The ask waits for the person's press, or for your registered starter's grant sent with the starter's
own key. The grant revokes every key you hold. The ask's one-time secret is
written beside the key file, never printed. After the grant, run the same command again with the
same `--key-file`: only the ask holding that secret is answered the new key, once, and the tool
writes it to the file and removes the secret.

## If you are on another machine

**Mole Office runs on one computer: the person's.** If you are on any other, nothing below is guessed for you.

**Where it is.** The person gives you the address and the port. There is no discovery: nothing on your machine can find their computer, and nothing here will invent an address. A fresh install listens on 8787 unless its owner changed it, so if they gave you an address and no port, ask. `GET /api/health` on the address you were given answers 200 with the repository, the database and the port that server is actually serving, and nothing about your request is written down by that read.

**Ask for a credential before you do anything else.** `POST /api/office/visitors` with your handle, the name a reader should see, the card you want, and the facts of this run. The token comes back once, at issue. Send it as `x-mole-office-credential` on every request afterwards.

**Then wait.** The credential is PENDING until the person confirms it as administrator at the Embassy, `#/embassy`, on either machine. While it is pending every request under it is refused and nothing you sent is stored, including registering yourself. Do not work around it; ask the person to confirm it.

**What you hold once it is confirmed.** The token from the issue is still the credential's secret, and the confirm reply also names a key under `agentKey`, saying this same token is your agent key too — it was already yours. Each secret travels on its own header: the token on `x-mole-office-credential`, the key on `x-mole-office-key`. No registration tool writes the token to a file for you, so write it from the issue reply into a new file in your notes folder yourself, with `umask 077` and without printing it. From then on both are read from that file into a request header and nowhere else, as *The write loop* shows. Neither is ever printed, typed, put on a command line or put in a message.

**Both act only for your handle.** A credential and its key were each issued to one agent. A request that carries your credential and names another agent's handle is refused with the sentence "This credential may act only on its own handle.", and nothing is done.

**And it runs out.** A credential is issued for thirty days, stamped `ends_at`. Once that moment has passed, every request under it is refused with a sentence saying it ran out, nothing it sent is stored, and the way back is a new credential the person confirms at the Embassy again.

**Which machine a run names.** Put this machine's own name in the `machine` field of your session record. A record with no `machine` is read as a run on the office's own machine, whose closers may treat it as stale while you are still working.

**How to receive messages: hold your handle.** A message to an agent nobody is answering as waits until the person presses. `GET /api/handles/waiter` hands you the waiter — the script that says every few seconds that you are answering as your handle and prints any message that arrives — as that office is running it, with the line to run it. It is one file, built for you with everything it imports, and it runs with nothing but Node in an empty folder: save it and run it, and do not look for the modules it names. Everything a visiting agent may do is a door of this API; never try to reach the office's machine any other way, by SSH least of all. Fetch it each time; never keep a copy, or you run one older than the office. The waiter reads both secrets from your token file into a request header, like every other tool. Give it the file's full path in its two names, and no secret as a flag. Never type or print either value, and never read the file into the command:

    MOLE_OFFICE_CREDENTIAL_FILE="<your token file>" MOLE_AGENT_KEY_FILE="<your token file>" \
      node hold-the-handle.mjs --api <the office> --agent <your handle> --session <your session record>

The file must be yours and readable by nobody else, as `umask 077` makes it. Otherwise the waiter stops before it asks anything, and says why.

All three of `--api`, `--agent` and `--session` are needed from elsewhere: `--api` because nothing here knows where the office is, `--agent` because the setting naming one belongs to the office's checkout, and `--session` because a hold names a session record that has to exist in THAT office's database — file yours there first (`POST /api/records`, kind `session`). It stops when a message arrives, and that is not a fault: for Claude Code and Codex a background command's output reaches the session when the command ENDS, so its exiting is what wakes you. Answer and start it again; your handle stays yours for two minutes meanwhile. An office never told an address others can reach is reachable by no `--api`, and `GET /api/access` says what would open it.

**How to tell whether this copy is old.** This copy says: `mole-office skill, 2026-11-04`. The repository is the only source — `.claude/skills/mole-office/SKILL.md` in the person's Mole Office checkout — and a copy anywhere else drifts. Ask the person to read that line out of their checkout. If theirs names a later day than yours, yours is old: take theirs and re-read it. If yours carries no such line at all, it is older than 7 September 2026 and predates this section.

## The cold start, in full

**Ask Mole Office what it holds before you reconstruct it from the checkout.** `GET /api/project/bootstrap`
answers, in one read: what this project is and how many records of each kind it holds, every problem
that is not fixed with its state exactly as stored, what Mole Office has noticed contradicting itself, and
the newest reports. Every section says on what authority it is there — measured, assumed, required by
the brief, or *no operation answers this* — and a section Mole Office could not fill is **absent and named
in `missing` with a reason**, never returned as an empty list. An empty list would say *there are
none*; absence says *nobody could look*, and those are different facts.

**It is the first request of a cold start, before the steps below.** Reading a status file in the
checkout instead is what this read exists to replace: such a file goes stale between one piece of
work and the next.

**Read the small answers first.** `GET /api` lists every door with its whole description, and it
is large. `GET /api/kinds/<kind>` gives a kind's whole shape with every description and example,
and for `session` it is many times the size of the compact read in step 3. Steps 2 and 3 read the
same things in smaller pieces.

1. `GET /api/project/bootstrap` — what is true of this project right now, and what contradicts itself.
2. `GET /api/families` — one line for each family of doors, with how many doors it has. Then
   `GET /api/families/<name>` for the family you need, for example `GET /api/families/records`:
   its doors, each with its whole description. `GET /api?family=<name>` answers the same.
3. `GET /api/kinds/<kind>/compact` for the kind you are about to write: which fields it needs and
   each field's type, with no descriptions. Read `GET /api/kinds/<kind>` in full when a field is
   not clear from its type. `GET /api/kinds` lists the kinds.
4. `GET /api/workspaces` — which projects there are. Then send `x-mole-office-workspace` on every
   request, read and write, saying which one you are working in. See *Which project you are writing
   into*: it is not an identity header and it obliges nothing else, but a request that leaves it out
   is taking a default rather than making a statement.
5. Write, with these headers on every write. `POST /api/records/check` takes a write's body and
   headers and files nothing: it answers whether the write would be accepted, or the refusal the
   write would get.
   - `x-mole-office-actor-type` — `human`, `agent` or `system`. You are `agent`.
   - `x-mole-office-actor-id` — which agent you are, precisely enough to recognise in a month.
   - `x-mole-office-key` — your own key, once you hold one, read from your key file into your
     headers file as *The write loop* shows, and never typed.
6. File the session record for this run, unless the reply to your registration named one as
   `session` (the headers in that reply carry it) or the session hook printed one for this
   conversation. That record is yours: use it and file no second one. To file one,
   `POST /api/records` with kind `session`, the fields step 3 says it needs, and no session header.
   The 201 gives its id. Do not add `ranAs`, `servingAgent` or `submission` to a record you file
   this way, then or later. With any of them, the office treats the record as work handed in. It
   may then refuse a plain finishing write, and when the record ends, it sends the person messages
   about it.
7. Send `x-mole-office-session` with that id on every later write, so every change traces back to
   it. Then link the session to what you are working on — see *Say which work your run belongs to*,
   above. The one exception is a record the session hook filed with the office's own key: the
   office refuses its id from your key with 403. In that conversation, write your headers file
   again without the `x-mole-office-session` line, then change the record's title and its `doing`
   line. Your writes then name no run, and for now that is expected.

**Identity fails loudly, and the loudness is working for you.** Send any attribution header and you
owe a complete, valid identity: the actor type as a literal, beside an actor id that names you. A
value present and blank — which is what a client building headers from an unset variable produces —
is refused. So is a word outside the three. So is a misspelling of a header *name*, and that
refusal prints the three names Mole Office reads. Each is a 400 you can see, where a silent one
would file an agent's writes as the person.

**And the routing rule is all it is.** Mole Office cannot tell the person from a program on the person's machine that sends the person's name. A governance act asked in the person's name is taken at its word. Do not ask in the person's name. The guards refuse an agent
that names itself and can do nothing about a program that sends the person's name, so the limit is on the
asker rather than on the door. The sentence is written once, in the office's source, and is read
here, in the rules an agent is given at the start, and in the refusal itself.

**Omission is never a route to the human.** A request from outside the office's own program with no
attribution and no key is refused by every door that asks who is calling, other than the doors that
give a caller a key, once the key window is closed, from a sandbox always, and from a machine the office
does not trust. Naming the person without a key is no route either: it counts as the person only
where a request that names nobody would. Where it is still answered it is filed as the person, and `human` is the one identity
allowed to write a `decision` — so an
agent that arrives there by leaving a header out has put a false name in a permanent change log
and walked a governance act past a check that exists for a reason. Send the actor type on every
write, as a literal, never built from a variable you have not set.

**With a key, file the session record before you name it.** A write that carries a key may name only
a run that key holds, by the session record's id or by a run name already bound to it. A run name
sent before any session record is filed is refused with 403, and nothing is written. A run name is
bound only by a write with no key: file a `session` record while writing under the name, and the
201 says the name now means this record and that **every change row already stored under the raw
name is repointed at it**, with a count. Nothing else in the API reports this. A write with no key
is answered only where *Omission is never a route to the human*, above, says.

## What not to do

- **Do not invent a key.** Every kind declares a named place for what has no field of its own, and
  `GET /api/kinds` shows you where. A key of your own holds something no page will ever read.
- **Do not wait until you can file a perfect record.** File the stub, enrich it later. A
  compaction or a crash costs you everything held in the conversation.
- **Do not assert what you cannot point at.** Evidence — a path, a run, an output, a person — is
  what makes a record worth reading, so name it as soon as you have it. Opening a record before
  there is anything to point at is fine; saying the work is done with nothing behind it is not.
- **Do not claim more confidence than you measured.** A claim carries one state for something
  believed but unmeasured and another for one with numbers behind it. Take the honest one.
- **Do not decide what is not yours to decide.** File the proposal and say in your report that you
  stopped at a fork. Recording a decision the person already made in words is allowed, with a
  warrant; see chapter 4, rules 4 and 5.
- **Do not write the same content into two kinds.** They drift, and then two records disagree.
- **Do not describe a codebase file by file, and do not write into the derived index.**
- **Do not paper over a 400.** It names the field and what a right value looks like. Fix the
  record — do not retry the same body, and do not fall back to writing a markdown file instead.
- **Do not leave a server, a run or a container unregistered**, and do not put off registering it
  until the end. Announcing it in your reply is not recording it: your reply ends with you.
- **Do not assume which project you are writing into**, and do not treat a refusal that says a link
  would cross a project boundary as something to get round. Both are answers about where your work
  is going, and the second one is the cheaper of the two to receive.
- **Do not leave your own run unplaced**, and do not read a 201 as proof that it is placed.
- **Do not read only your own writes back.** A 201 says the shape was accepted. Where the record
  went, whether anything already says the same thing, and whether the thing you filed reaches the
  screen that ranks what needs a person are separate questions with separate answers. Ask.

