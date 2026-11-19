# Agent lifecycle

Who is working, what they are doing, and what happens when nobody is.

## A session is a record

A session is one run of one worker. It is a record like any other, so it can be linked, corrected,
read back, and filed under the work it belongs to. A day's work can be read back together because
every request in it carried the same session id.

Where a run belongs is answered by the API, together with the rule it used and what it read. That
matters more than it sounds: the rule once ran only in the browser, so an agent that never opened
the browser source had its session filed under the wrong module.

## A run is a row a worker claims

The server starts no process. Work that needs one is queued as a row, and something outside picks it
up:

```bash
npm run agent               # the worker: claims queued runs and runs them with the Claude Code command
npm run agent -- --once     # take one run and stop
npm run agent -- --help     # every option, including --api for an Office somewhere else
```

**With no worker running, nothing is broken and nothing is pretended.** A dispatched run says
*nobody has picked this up yet*, which is the true answer, and it is picked up whenever a worker
starts.

## Who is working

`GET /api/working` answers who is on it now. When it has nothing to report it says which kind of
nothing:

> Nobody has recorded a durable agent in this project. The store was read and it holds none. That is
> not a measurement that no agent is working.

That distinction — *nothing is there* against *nobody has looked* — is the fifth operating rule
showing up in an endpoint. Read on 27 August 2026 against this project's own corpus.

Beside it: an agent's presence, the work state it declared, and the overlaps between what two
workers each say they are doing.

## Waking somebody, and the line this product does not cross

`GET /api/wake-candidates` answers who has been quiet long enough to be worth waking, and says in
its own reply that the threshold it used is unmeasured. Recording that somebody should be woken is
a row.

**Nothing starts a process.** The reply says so itself: *"THIS ANSWERED A QUESTION AND DID NOTHING
ELSE. No wake was recorded, no process was started."*

Whether Mole Office may ever start a worker on this machine without being asked each time is the
person's decision and it has not been made. The three answers on the table are: wake for anything,
wake only for a message the person sent, and never wake without a press. Until they choose, the facts
are recorded and the act is not taken.

## Resources a session left behind

A session records what it started — a port, a process, a container — and whether anybody shut it
down. `GET /api/resources/orphans` reads the machine and answers in three groups: still owned, gone
and not closed, and orphaned.

This exists because of five orphaned-process incidents in this project. One was a server holding a
database file that had already been deleted; it went on serving stale data into a diagnosis that was
written down and worked from, and it cost an afternoon.

## What is not built

- A worker continuing exactly where the previous one stopped, from a stopping point, without a
  person reassembling the context. The records for it exist; the continuation is not finished.
- A work domain — what a worker believes it is about to do, checked against what everybody else
  believes. The routes and the record kind exist. No work domain has been filed in this project yet,
  so nothing here claims it has been exercised.
- Anything that starts a process, for the reason above.
