# Governance

Which acts belong to the person, what an agent gets instead, and how strong the guarantee actually
is.

## One kind is the person's

`decision` is the only record kind reserved to the person. Everything else an agent may write.

**Since 27 August 2026 an agent may write a decision it can cite authority for.** It was refused
outright before that. The rule now asks three questions, and the refusals are quoted from the
running server on 27 August 2026:

1. **What does it stand on?** A decision must name its authority — one of five. Four of them an
   agent may claim for a choice it made itself. The fifth, *a press by the person*, is for writing down
   a decision the person made, and it must carry the id of the record holding their words.

   > A decision needs to say what it stands on, and this one says nothing. `authority` is missing,
   > and it is the field that makes this a decision rather than an opinion.

2. **Who made it?** A decision must say who decided. An agent sends its own handle for a choice it
   made itself.

   > A decision has to say who made it, and this one does not. `decided_by` is missing. An
   > unattributed decision reads on every page as though nobody in particular made it, which is how
   > an agent's own choice becomes indistinguishable from the owner's.

3. **Is this a governance act by somebody Mole Office can place, on this machine?** Three further
   clauses refuse: a request that sent no identity headers at all, because an absent header is not
   evidence that a person made it; a request made in a name the product cannot place; and a request
   that arrived from another machine.

If an agent cannot cite an authority, the refusal names what to file instead: a fork — a question
put to the person, with the options and a recommendation.

The rule covers four acts, not one: create, change, delete and restore. Delete and restore were
unguarded until an audit measured the consequence — an agent deleted a decision the person had
written, was answered 200, and the change log recorded it. A test finds every write to the records
table in the source and fails on any whose enclosing function does not consult the human-only list,
which is what stops a further path shipping unguarded.

The whole-archive import is guarded by the same rule, for the sharpest reason: it once took no actor
at all, so one request from anything that could reach the port replaced every authored row in the
database, attributed to nobody.

## The queue of what waits on the person

`GET /api/needs-you` answers with the acts that are the person's to take, each with why it is theirs
— usually because an agent asked for it and was refused, and the refusal is quoted. `GET /api/forks`
answers with the open questions. `GET /api/whose-move` splits the open work by whose move it is.

Read on this project's corpus on 27 August 2026: 26 things waiting on the person.

## How strong this is: attribution, not authentication

**This is the weakest guarantee in the product and it is stated rather than left to be discovered.**

Who a caller is comes from a request header. Nothing checks whether it is true. A caller that says
`agent` is held to it; a caller that says nothing is recorded as the person. So a deliberate bypass
is possible, and it has to write a false header that the change log keeps for ever.

It is good enough only because the API listens on `127.0.0.1` and nothing else — hardcoded, not
settable from the environment — on a single-user machine. **The day a second person can reach the
port, this rule protects nothing.** Whether to add authentication is an open question with a
recorded reopen condition, in `explore.md`.

## The queue is harder to empty than it was, and it is not sealed

An adversarial pass on 27 August 2026 attacked the guards around the person's queue and got through
eight ways: a fork could be deleted, a settling link could be removed, a classification could be
changed to make a fork leave the queue, and nothing checked that a decision was about the fork it
closed. The account, with the queue count before and after each attempt, is in the round eleven
campaign records under `design/round-eleven/wave-b/`.

Several of those were closed the same day. Two were named rather than attempted, because they need a
design and not a guard: whether a decision is really about the fork it closes is a judgement, and
identity is the open question above.

**The honest statement is that the queue is much harder to empty than it was, and it is not yet a
queue an agent cannot empty.**
