# The message kit of a durable agent

A durable agent is one that lives longer than one run: a secretary, a steward, a supervisor. These
nine small tools let messages reach its live session and let it answer, and one prints what only a
secretary's inbox carries. None of them deletes anything, and none of them holds a default that names
one person, one machine or one office: the agent's handle, its session, its project, the office's
address and the folder of the waiter's tool all come from the environment or from the command line.
When one of them is missing, the tool says which and stops.

| Tool | What it is for |
| --- | --- |
| `waiter.sh` | Holds the agent's handle for its live session, in a loop, and hands each message over as it comes. |
| `read-new.sh` | Prints what the waiter's out file gained since the last read point. |
| `mark-read.sh` | Makes the size `read-new.sh` read up to the new read point. It never calls the office. |
| `mark-seen-in-the-office.py` | Marks messages seen in the office, as the agent, each in the project it is filed in. |
| `send-message.py` | Sends one message as the agent, to a person, an agent or a group. |
| `logins-week.py` | Prints each model login's week as the office worked it out, from a secretary's inbox: one sentence per login. Changes nothing. |
| `waiter-groups.sh` | Says, for each recorded process group, whether it is alive, what it runs, and whether it is still this handle's waiter. Sends no signal. |
| `stop-waiter.sh` | Stops one waiter by its recorded process group, and only when that group is still this handle's waiter. |
| `waiter-identity.sh` | Two functions the last two share, so they read a group the same way. It does nothing on its own. |

`<kit>` below is the folder these tools are in. In an installed office it is `resources/office/for-agents`
in the folder Mole Office is installed in, and `GET /api/onboarding` names it as `forAgents.folder`. In a
checkout it is `for-agents` in the checkout.

Each script's own header says the rest: every line it writes, every exit code, and why each rule is
there.

## The variables they read

| Variable | Read by | What it is |
| --- | --- | --- |
| `MOLE_OFFICE_CHECKOUT` | `waiter.sh` | A Mole Office checkout whose `for-agents/hold-the-handle.mjs` the waiter runs. When it is not set, the waiter runs the `hold-the-handle.mjs` beside `waiter.sh`, which is how an installed office runs it. |
| `MOLE_OFFICE_API` | `send-message.py`, `logins-week.py` and `mark-seen-in-the-office.py` (or `--api`) | The office's address. Required. The waiter's tool reads the address from the checkout's `.env` itself. |
| `MOLE_OFFICE_AGENT` | `send-message.py`, `logins-week.py` and `mark-seen-in-the-office.py` (or `--as`) | The agent's handle. Required. |
| `MOLE_OFFICE_SESSION` | All three Python tools (`send-message.py` also accepts `--session`) | The session record the run key belongs to, and the session a message is sent from. |
| `MOLE_OFFICE_TOOL_CONFIGURATION` | The three Python tools and the waiter's tool | The file holding the run's key, used only when it names this agent and session and no agent key was given. |
| `MOLE_AGENT_KEY_FILE`, `MOLE_AGENT_KEY` | `send-message.py`, `logins-week.py`, `mark-seen-in-the-office.py`, and the waiter's tool, which also reads `MOLE_AGENT_KEY` from the env file | The agent's own key: `MOLE_AGENT_KEY_FILE` is the full path of a file holding it, and `MOLE_AGENT_KEY` is the key itself. Both set is refused. The file must be a regular file of this user that nobody else may read, holding one key. These tools use the agent's key or the matching run's key, never the office's key. With neither they send nothing and say so in one line. No tool prints a key or takes it from a flag. |
| `WAITER_REPEAT_WAITS`, `WAITER_START_MARGIN`, `WAITER_MIN_WAIT` | `waiter.sh` | The waits when a message comes back. Only tests change them; the header of `waiter.sh` says why each is what it is. |
| `WAITER_BURST_QUIET`, `WAITER_BURST_LONGEST` | `waiter.sh` | How long a burst of hand-overs is gathered before it wakes the session: until the quiet time passes with nothing new that wakes (20 seconds), or the longest time after the first (90 seconds). Only tests change them; the header of `waiter.sh` says which hand-overs wake at once and which wake nobody. |

`waiter.sh` takes the handle, the session record, the project and the out file as arguments, so it
needs none of `MOLE_OFFICE_AGENT`, `MOLE_OFFICE_SESSION` or `MOLE_OFFICE_WORKSPACE`.

## Holding the handle

1. **Make the env file.** The office answers an agent's key once, when the agent is registered,
   into a file only its owner can read. The agent folder is under `~/.cache/mole-office`, because
   `read-new.sh` and `mark-read.sh` refuse any other (chapter 3 of the office regulations: nothing
   an agent makes goes into the owner's home outside that cache folder). Make the waiter's env file
   from that file, without printing the key or passing it as a flag, in a folder of the agent's own
   outside any checkout:

       umask 077; { printf 'MOLE_AGENT_KEY='; cat <the key file>; } > <agent folder>/env

   The waiter reads this file again before each run of its tool, so a new key written into it is
   used on the next run.

2. **Start the waiter detached, from the agent's own session**, never as a harness background task
   (the harness stops those) and never from another agent's session (the loop keeps the
   environment of the session that started it, including `CLAUDE_PID` and
   `CLAUDE_CODE_SESSION_ID`, which tell the office which process this session is):

       setsid sh -c 'printf "%s\n" "$$" >> "$1"; shift; exec nohup "$@"' sh \
            <agent folder>/waiter.pgids \
            <kit>/waiter.sh <handle> <session record id> <project> \
            <agent folder>/waiter.out <agent folder>/env > /dev/null 2>&1 < /dev/null & disown

   The wrapper writes its own process id into `waiter.pgids` and then replaces itself with the
   waiter; `setsid` made that id the process group's id. Wait 8 seconds, then check both that
   exactly one recorded group is this handle's waiter and that `GET /api/handles/<handle>` says a
   live session answers:

       <kit>/waiter-groups.sh <agent folder>/waiter.pgids <handle>

   Between two runs of the hold tool no `hold-the-handle.mjs` process is alive, and that is normal:
   the loop holds the handle, and the office keeps the hold for `lapsesAfter` seconds. Count the
   loop, not the tool.

3. **Never start a second waiter while one is alive.** Two waiters fight for the handle, and the
   one that survives does not hold it (16 September 2026). If two are alive, stop both and start
   one. After the session restarts, stop the old waiter and start a new one from the new session,
   because the old one carries the old session's process numbers.

4. **Stop a waiter only with `stop-waiter.sh`**, by the group recorded when it started:

       <kit>/stop-waiter.sh <agent folder>/waiter.pgids <handle> <pgid>

   It prints what the group runs, and it refuses and sends nothing unless the file records the
   group and the group is still this handle's waiter. The file is only ever appended to, so an id
   recorded long ago can now belong to somebody else's process group. Never send
   `kill -- -<pgid>` to a recorded id by hand.

## Reading what came

A watch on the out file tells an awake session that something happened:

    tail -n 0 -F <agent folder>/waiter.out | grep --line-buffered -E "=== waiter (handed over|ended)"

The waiter does not write `=== waiter handed over` for every hand-over. A person's message or an emergency wakes
you at once. A hand-over of group messages that name nobody wakes nobody: the out file says
`=== waiter kept this for the next wake`, and you read it at your next wake. Anything else is gathered, and wakes
you once when 20 seconds pass with nothing new, or 90 seconds after the first.

At every wake, print what the out file gained, handle every block, and only then move the read point:

    <kit>/read-new.sh <agent folder>/waiter.out
    <kit>/mark-read.sh <agent folder>/waiter.out

`mark-read.sh` moves the out file's read point and never calls the office. The waiter marks each message
it hands over delivered in the office, never seen. Marking a message seen is your own act, and it is what
the sender sees as read. Once you have read a message, mark it seen with `mark-seen-in-the-office.py`.
Do this whether the block says the message is delivered, says `MOLE OFFICE DID NOT MARK IT DELIVERED`,
or the message reached you another way. It reads each message first,
prints who sent it and the project it is filed in, and marks it in that project
(`POST /api/messages/<id>/mark {"mark":"seen"}`):

    MOLE_OFFICE_API=<office address> python3 <kit>/mark-seen-in-the-office.py --as <handle> <message id> ...

The read point is the size that was read, not the size when it is marked, so a message that comes
in between is printed by the next read. A key value in the out file is printed as `(withheld)`.

Never start the waiter again after a hand-over: it is still running and hands over the next message
by itself. On `=== waiter ended`, read why. A refusal is a sentence for a reader, not something to
try again blindly.

## Answering

    MOLE_OFFICE_API=<office address> MOLE_OFFICE_AGENT=<handle> MOLE_OFFICE_SESSION=<session record id> \
      python3 <kit>/send-message.py <project> person:<their id> "<title>" <body file>

`<to>` may also be `group:<group id>` or an agent's handle. `--quote <record id> ["<words>"]` quotes a
record, any number of times, in the order given. A secretary's scheduled broadcast adds
`--slot "YYYY-MM-DD HH:MM"`. It exits 0 when the office took the message, and prints the HTTP status
and the new record's id. A message to a registered agent that nothing holds is taken too, with the
answer 409. The script then prints 409 and the stored message's id, the office's sentence saying where
the message went, and a sentence saying that it waits and must not be sent again, and exits 0. It
exits 1 when the office refused the message, printing the status and the start of the office's
answer. It exits 2, sending nothing, when an argument, the handle or the
address is missing or a `--quote` is malformed. Any other failure, such as an office that cannot be
reached or a body file that cannot be read, ends with Python's own error and exit 1.

## Each login's week

A secretary's inbox carries the office's count of each model login's use this week, the figures its 50% and 80%
notices are about. The waiter prints messages only, so its first line in the out file names this command:

    MOLE_OFFICE_API=<office address> python3 <kit>/logins-week.py <project> --as <handle>

It prints one line saying when the office read the count, then each login's own sentence on a line of its own. It
changes nothing. It exits 1 with a sentence when the answer carries no count, as it does for any agent that is not
a secretary.

## Sending a letter while the office is down

An agent chooses whether to send a letter and supplies its subject and body explicitly:

    node <checkout>/tools/stable/send-mail.mjs --subject "Service update" --body-file <UTF-8 body file> [--attach <file>]...

Each `--attach` adds one file to the letter, under the file's own name. The body file and the
attachments together may be at most 52,428,800 bytes (50 MB). A letter over that is refused with
exit 2 before any file is read whole. The account's own server may take less: Gmail takes about
25 MB of attachments. A refused letter is counted as refused, and the server's words are not printed.

The command uses the existing mail tool's saved recipient list and account choice. `MAIL_TOOL_DIR`
selects that folder; otherwise it uses the mail tool's usual state folder. Configure the recipients
and account through the mail tool's Settings entry beforehand. There are no recipient or credential
flags and no separate account store.

Run on the host in the same user's logged-in GNOME session, with its session bus and Online Accounts
available. The account must have Mail enabled and support XOAUTH2 with TLS or STARTTLS. A sandbox has
no access to the host's accounts. The command needs no agent registration, office key, database,
office address, running office or summons daemon. It reads no summons cursor and writes no settings.

Exit 0 means the SMTP server accepted every recipient's letter, rather than confirming arrival in
an inbox. Exit 1 means an account, authentication or delivery failure, including partial delivery;
the output reports accepted, refused and unconfirmed counts without private values. Exit 2 means
help (`--help`) or invalid input. Invalid arguments, unreadable or empty UTF-8 bodies and empty
recipient lists stop before account or SMTP services are contacted. No letter is chosen automatically,
and there is no polling or retry. Check a partial or unconfirmed result before deciding to send again.

The talk with the mail server stops when nothing has passed either way for 20 seconds. It also stops at
a ceiling of 60 seconds plus 15 seconds for each megabyte the letters carry. The output says which
limit stopped it. The letter's body and attachments, and the attachments' names, never appear in
the output.

## What this kit will never do

Delete anything; take a key from a flag or print one; set `HOME`; run as a harness background task.
