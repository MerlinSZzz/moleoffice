#!/usr/bin/env python3
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
"""Mark messages seen in the office, as the agent, each in the project it is filed in.

    python3 mark-seen-in-the-office.py <message id> [<message id> ...] [--as <handle>] [--api <url>]

THIS CALLS THE OFFICE. mark-read.sh is another thing: it moves the waiter out file's read point and never calls the
office. This one writes the agent's own mark on each message, POST /api/messages/<id>/mark {"mark":"seen"}, which
is what the sender sees as read. The waiter marks each message it hands over delivered and never seen, so this is
for every message the agent has read: one whose block says it is delivered, one whose block says MOLE OFFICE DID NOT
MARK IT DELIVERED, and one that reached the agent some other way.

FOR EACH ID, IN THE ORDER GIVEN, it first reads the message (GET /api/messages/<id>) and prints one line: who sent it,
or that nobody recorded who did, the project it is filed in, and the project it was written in when the message says.
A person's message is filed in message-centre whatever project it was written in, so the project is read from the
message and never taken from the caller. The read names no project, because a message belongs to no project and the
office reads it from any. Then it marks the message seen, with the project the message is
filed in on x-mole-office-workspace, and prints the office's own sentence on what it did. The office marks a message
wherever it is filed (criterion M76), so the project names where the message is and decides nothing. A message it
could not read, or whose answer names no project, is not marked, and the next id is still done.

The handle comes from --as or MOLE_OFFICE_AGENT, and the office's address from --api or MOLE_OFFICE_API, as for
send-message.py. Neither has a default. The address in the environment is taken only when it was given for this
copy, by the rule in send-message.py, which this reads from there. A key, when the agent holds one, is read from
the file MOLE_AGENT_KEY_FILE names, or from MOLE_AGENT_KEY, by the rules of the_agent_key in send-message.py, and sent
on x-mole-office-key; it is never printed and never taken from a flag. Every word that is not
--as, --api or the value after one is a message id, so an id may begin with "-". Write --as and --api with a space
before the value.

It exits 0 when every message was marked seen, or was already. It exits 1 when any read or mark was refused or got no
answer, or an answer was not in the shape this reads; each such line says which and why. It exits 2, asking nothing,
when no id is given, a word is no record id, or the handle or the address is missing, or the address in the
environment is for another copy, or the key cannot be read.
"""
import importlib.util
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

# A RECORD ID IS LETTERS, DIGITS, - AND _.
AN_ID = re.compile(r"^[A-Za-z0-9_-]+$")


def the_message_script():
    """send-message.py beside this file, read through any link, for its rule on the environment's address. The rule
    is worked out there and in src/config/settings.mjs and nowhere else. No bytecode file is written beside it."""
    sys.dont_write_bytecode = True
    path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "send-message.py")
    spec = importlib.util.spec_from_file_location("the_kits_send_message", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def ask(api: str, path: str, headers: dict, body=None):
    """One request to the office, and its answer read as JSON. A refusal or no answer is raised to the caller."""
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(api.rstrip("/") + path, method="GET" if body is None else "POST", data=data,
                                 headers=headers if body is None else {**headers, "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def the_sender(message: dict) -> str:
    """Who sent it, as the office recorded it, or that nobody did."""
    by = message.get("sentBy")
    if by is None:
        return "nobody recorded who sent it"
    if isinstance(by, dict) and isinstance(by.get("kind"), str) and isinstance(by.get("id"), str):
        return f"sent by {by['kind']} {by['id']}"
    return "the office's answer names its sender in a shape this does not read"


def where_it_was_written(message: dict) -> str:
    """The project the message was written in, when it says, as words to follow the project it is filed in."""
    written = message.get("writtenIn")
    if isinstance(written, dict) and isinstance(written.get("project"), str) and written["project"] != "":
        return f", written in project {written['project']}"
    return ""


def the_office_words(e: urllib.error.HTTPError) -> str:
    return e.read().decode("utf-8", "replace")[:600]


def mark_one(one: str, api: str, who: dict) -> bool:
    """Read one message, say what it is, and mark it seen in the project it is filed in. True when it is marked."""
    path = "/api/messages/" + urllib.parse.quote(one, safe="")
    try:
        read = ask(api, path, who)
    except urllib.error.HTTPError as e:
        print(f"{one}: the office did not let this read it, so it was not marked: {e.code} {the_office_words(e)}")
        return False
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"{one}: no answer came back to the read ({e}), so it was not marked.")
        return False
    message = read.get("message") if isinstance(read, dict) else None
    project = message.get("workspaceId") if isinstance(message, dict) else None
    if not isinstance(project, str) or project == "":
        print(f"{one}: the office's answer names no project the message is filed in, so it was not marked.")
        return False
    print(f"{one}: {the_sender(message)}, filed in project {project}{where_it_was_written(message)}.")
    try:
        marked = ask(api, path + "/mark", {**who, "x-mole-office-workspace": project}, {"mark": "seen"})
    except urllib.error.HTTPError as e:
        print(f"{one}: the office refused the mark: {e.code} {the_office_words(e)}")
        return False
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"{one}: no answer came back to the mark ({e}), so nobody knows whether it was marked. Run this again "
              "for it: a second mark writes nothing new.")
        return False
    because = marked.get("because") if isinstance(marked, dict) else None
    if not isinstance(because, str):
        print(f"{one}: the office answered the mark with no sentence, so this cannot say what it did.")
        return False
    print(f"{one}: {because}")
    return True


def main() -> int:
    handle, api, ids = os.environ.get("MOLE_OFFICE_AGENT"), None, []
    argv, at = sys.argv[1:], 0
    while at < len(argv):
        word = argv[at]
        if word in ("-h", "--help"):
            print(__doc__)
            return 0
        if word in ("--as", "--api"):
            if at + 1 >= len(argv):
                print(f"{word} needs a value after it. Nothing was asked.", file=sys.stderr)
                return 2
            if word == "--as":
                handle = argv[at + 1]
            else:
                api = argv[at + 1]
            at += 2
            continue
        if not AN_ID.match(word):
            print(f'"{word}" is not a record id: an id is letters, digits, - and _. Write --as and --api with a space '
                  "before the value. Nothing was asked.", file=sys.stderr)
            return 2
        ids.append(word)
        at += 1
    if not ids:
        print("no message id: give the ids of the messages to mark seen. Nothing was asked.", file=sys.stderr)
        return 2
    if not handle:
        print("no handle: pass --as <handle> or set MOLE_OFFICE_AGENT. Nothing was asked.", file=sys.stderr)
        return 2
    if api is None:
        refused = the_message_script().the_environments_address_is_for_another_copy(os.environ)
        if refused is not None:
            print(refused, file=sys.stderr)
            return 2
        api = os.environ.get("MOLE_OFFICE_API")
    if not api:
        print("no office address: pass --api <url> or set MOLE_OFFICE_API. Nothing was asked.", file=sys.stderr)
        return 2
    who = {"x-mole-office-actor-type": "agent", "x-mole-office-actor-id": handle}
    try:
        key = the_message_script().the_agent_key(os.environ, "Nothing was asked.")
    except ValueError as refused:
        print(refused, file=sys.stderr)
        return 2
    if key is not None:
        who["x-mole-office-key"] = key
    marked = [mark_one(one, api, who) for one in ids]
    return 0 if all(marked) else 1


if __name__ == "__main__":
    sys.exit(main())
