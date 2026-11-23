#!/usr/bin/env python3
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
"""Send one Mole Office message as a durable agent.

    python3 send-message.py <workspace> <to> "<title>" <body file>
                            [--as <handle>] [--session <id>] [--slot "YYYY-MM-DD HH:MM"]
                            [--purpose <word>] [--api <url>]
                            [--quote <record id> ["<words>"]] ...
                            [--lead <record id> [<project>]]
                            [--send-id <id>]

<workspace> is the project you are writing from. Every message is kept in the office's message centre and
belongs to no project; the project you name here is kept on the message as the mark
of where it was written, data.writtenIn. A reply joins its conversation wherever it is written, so there is
no project to answer in.

<to> is one of:   person:<id>      a person, by the id the office keeps for them
                  group:<group id> a group; the message is said in that group
                  <handle>         a durable agent, by its handle

The handle and the session come from --as / --session, or from MOLE_OFFICE_AGENT and
MOLE_OFFICE_SESSION in the environment. The office's address comes from --api, or from
MOLE_OFFICE_API in the environment. Neither the handle nor the address has a default: a default
would be one office's own name and port, and a message sent to the wrong office, or as the wrong
agent, is worse than none. When one is missing the script says which, sends nothing and exits 2.
A key is read from MOLE_AGENT_KEY_FILE or MOLE_AGENT_KEY, or from this run's office tool configuration, and
sent on x-mole-office-key; it is never printed and never taken from a flag. Without a key nothing is sent. With both set, or a key file that breaks
a rule of the_agent_key below, the script says why, sends nothing and exits 2. --slot marks a secretary's
scheduled broadcast with the slot the office's reminder named. It prints
the HTTP status and the new record's id, and then the send id (see below). When the office stored the
message but reminds that a part of it seems to hold a key, the reminder's
sentence is printed on the line after that: what was seen, its first four characters and its length,
never the piece.

--quote makes the message quote a record, and it may be given any number of times; the quotes are
sent in the order given, as the message's `quotes`, and a page draws each
one above the message's words. With only a record id it quotes the whole
record. With words after the id it quotes those words in that record: they are sent exactly as
written, as a place of kind `quote`, and the office does not look for where in the record they are.
--lead puts one button on the message that opens a record: data.lead is
{target: {kind: 'record', recordId, workspaceId}, place: {at: 'surface'}}. The project is the one named
after the record id, or else <workspace>. A secretary's report line is sent this way: one line in the
chat, with --slot naming the slot and --lead naming the report.

Every send carries a send id, new for each run of this script unless --send-id names one. The
office keeps one message per send id for each writer: a send with an id this
agent already used writes nothing and answers 200 with the first message. A new message prints its
status and id, then the send id on the next line: "send id <id>: to send this again, run the same command
with --send-id <id>; ...". A send the office already holds prints one line, the status, the first
message's id and the office's sentence saying so, and exits 0. When no answer came back, the script
prints the id it sent; run it again with --send-id and that id, and the message is written once whether
or not the first send arrived.

A send to a registered agent that nothing holds, with no session holding its handle and no run going for it, is
stored all the same: the office also gives it to the participant it routes it to, and answers 409. The script then
prints 409 and the stored message's id, then the office's sentence saying where the message went, word for word, then
a sentence of its own: the message is stored and waits for its addressee, it was not delivered now, and it must not be
sent again, because a new send stores a second copy. The send id line and any key reminder follow, as after a new
message, and it exits 0, because a caller that reads exit 1 sends again. Every other error answer, a 409 that stored
nothing among them, prints the HTTP status and the first 600 characters of the office's answer, and exits 1.

Put the --quote and --lead options after the four arguments above, as here:

    python3 send-message.py my-project person:<their id> "Two points" body.txt \
        --quote <a record id> "the words quoted from it" --quote <another record id>
"""
import argparse
import errno
import json
import os
import re
import secrets
import stat
import sys
import urllib.error
import urllib.request


def taken_out(argv: list, option: str) -> tuple:
    """Every `<option> <id> [<word>]` and `<option>=<id> [<word>]` taken out of argv, in the order given, with what is
    left. The word after the id is taken unless it begins with "--". An option with no id is taken as []."""
    left, taken, at = [], [], 0
    while at < len(argv):
        word = argv[at]
        if word != option and not word.startswith(option + "="):
            left.append(word)
            at += 1
            continue
        given = [word[len(option) + 1:]] if word != option else argv[at + 1:at + 2]
        at += 1 if word != option else 1 + len(given)
        if given != [] and at < len(argv) and not argv[at].startswith("--"):
            given.append(argv[at])
            at += 1
        taken.append(given)
    return left, taken


def the_environments_address_is_for_another_copy(env):
    """THE OFFICE ADDRESS IN A SANDBOX SHELL IS FOR THAT SANDBOX'S OWN CHECKOUTS. The same question,
    in the same words, as theEnvironmentsAddressIsForAnotherCopy in src/config/settings.mjs: this kit is run by python3
    as well as node. The copy is the checkout this file is in, read through any link (tools/kit and design/agents/kit
    lead here). None when it may take the environment's address, or the sentence it refuses with."""
    root = (env.get("MOLE_OFFICE_API_ROOT") or "").strip()
    address = (env.get("MOLE_OFFICE_API") or "").strip()
    if not root or not address:
        return None
    folder = os.path.realpath(root)
    copy = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    inside = copy == folder or copy.startswith(folder.rstrip("/") + "/")
    if inside and os.path.exists(os.path.join(copy, ".git")):
        return None
    where = f"{copy}, which is inside it but is no git checkout (an unpacked or installed copy)" if inside else f"{copy}, outside it"
    return (f"MOLE_OFFICE_API in this shell was given for the git checkouts in {folder}, and this copy of the office's tools is "
            f"{where}, so it does not take that address. Say which office you mean with --api: --api {address.rstrip('/')} "
            "for the office this shell names, or the address of an office of your own. Nothing was sent.")


# THE AGENT KEY'S SHAPE, AND HOW A REFUSAL NAMES IT: THE_AGENT_KEY in for-agents/agent-key.mjs. fullmatch, because "$" in
# a Python pattern also matches before a last line end, and the JavaScript pattern's does not.
THE_AGENT_KEY_SHAPE = re.compile("(?:[0-9a-f]{64}|[A-Za-z0-9_-]{43})\n?")
THE_AGENT_KEY_SAYS = "key of 64 hexadecimal characters, or of the 43 characters of a visitor's token"
A_SECRET_FILE_IS_AT_MOST = 66


def the_agent_key(env, nothing, uid=os.getuid() if hasattr(os, "getuid") else None, system=sys.platform):
    """THE KEY THIS AGENT HOLDS, or None because it holds none. The same rules, in the same words, as
    aSecretFromTheEnvironment in for-agents/agent-key.mjs with THE_AGENT_KEY, because python3 cannot import that reader:
    the key is read from the file MOLE_AGENT_KEY_FILE names, or from MOLE_AGENT_KEY. Both set is refused. The file is
    opened once, without following a link and without waiting, and judged and read from that one descriptor: a regular
    file of this user that nobody else may read or change, holding one key. Anything wrong is a ValueError whose
    sentence ends in `nothing`, and no sentence quotes the file's content. On Windows (`system` is sys.platform) the
    mode is not checked, because Windows keeps none, and a key file read there is taken with a line on stderr that says
    so; agent-key.mjs says why. One test runs both readers over the same cases (tests/the-two-key-readers-agree.test.ts)."""
    path = env.get("MOLE_AGENT_KEY_FILE")
    given = env.get("MOLE_AGENT_KEY")
    in_the_value = isinstance(given, str) and given != ""
    if path is None or path == "":
        return given if in_the_value else None
    if in_the_value:
        raise ValueError("Both MOLE_AGENT_KEY and MOLE_AGENT_KEY_FILE are set, so there are two keys and nothing chooses "
                         f"one. Unset one of them. {nothing}")
    if not os.path.isabs(path):
        example = ("such as C:\\Users\\you\\key" if system == "win32"
                   else f"starting with /, such as {'/Users' if system == 'darwin' else '/home'}/you/key")
        raise ValueError(f"MOLE_AGENT_KEY_FILE must be a full path, {example}, and it is "
                         f"{json.dumps(path, ensure_ascii=False)}. {nothing}")
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NONBLOCK", 0) | getattr(os, "O_NOFOLLOW", 0))
    except OSError as why:
        code = errno.errorcode.get(why.errno) if why.errno is not None else None
        reason = ("it is a link, and a key file must be the file itself" if code in ("ELOOP", "EMLINK")
                  else f"it could not be opened ({code or 'no reason given'})")
        raise ValueError(f"The key file {path} was not read: {reason}. {nothing}") from None
    try:
        opened = os.fstat(fd)
        if not stat.S_ISREG(opened.st_mode):
            raise ValueError(f"The key file {path} is not a regular file. {nothing}")
        if uid is not None and opened.st_uid != uid:
            raise ValueError(f"The key file {path} belongs to another user. {nothing}")
        if system != "win32" and opened.st_mode & 0o077 != 0:
            raise ValueError(f"Other users may read or change the key file {path}: its mode is "
                             f"{format(opened.st_mode & 0o777, 'o')}. Run chmod 600 on it. {nothing}")
        read = os.read(fd, A_SECRET_FILE_IS_AT_MOST + 1)
        words = read.decode("utf-8", "replace")
        if (opened.st_size > A_SECRET_FILE_IS_AT_MOST or len(read) > A_SECRET_FILE_IS_AT_MOST
                or THE_AGENT_KEY_SHAPE.fullmatch(words) is None):
            raise ValueError(f"The key file {path} does not hold exactly one {THE_AGENT_KEY_SAYS}. {nothing}")
        if system == "win32":
            print(f"The key file {path} was read on Windows without checking who else may read it. Windows keeps no mode "
                  "for a file, and this tool does not read the file's access list.", file=sys.stderr)
        return words[:-1] if words.endswith("\n") else words
    finally:
        os.close(fd)


A_KIT_TOOL_HOLDS_NO_KEY = ("This tool holds no key, so it sent nothing. Set MOLE_AGENT_KEY_FILE to the full path of "
                           "the file holding your agent key (register-myself.mjs --key-file writes one), or run this "
                           "tool in your run's own terminal, which holds your run's key.")


def the_no_key_line(why, env):
    """The same refusal as agent-key.mjs, with the configuration path replaced by its variable name."""
    path = env.get("MOLE_OFFICE_TOOL_CONFIGURATION")
    if path:
        why = why.replace(path, "named by MOLE_OFFICE_TOOL_CONFIGURATION")
    return f"{A_KIT_TOOL_HOLDS_NO_KEY} The run's key was not used: {why}."


def the_runs_key(env, agent, session, uid=os.getuid() if hasattr(os, "getuid") else None, system=sys.platform):
    """Mirror theRunsKeyFromItsOfficeToolFile, including its checks and reasons, on every system."""
    path = env.get("MOLE_OFFICE_TOOL_CONFIGURATION")
    if not isinstance(path, str) or path == "":
        return None, "MOLE_OFFICE_TOOL_CONFIGURATION names no office tool configuration"
    named = f"the office tool configuration {path}"
    try:
        file = os.lstat(path)
    except OSError:
        return None, f"{named} is not there"
    if not stat.S_ISREG(file.st_mode):
        return None, f"{named} is not a plain file"
    if uid is not None and file.st_uid != uid:
        return None, f"{named} belongs to another user"
    if file.st_mode & 0o077:
        return None, f"{named} may be read or written by others than its owner (mode {file.st_mode & 0o777:o})"
    try:
        with open(path, encoding="utf-8", errors="replace") as source:
            configuration = json.load(source, parse_constant=lambda _value: (_ for _ in ()).throw(ValueError()))
    except (OSError, ValueError, UnicodeError):
        return None, f"{named} does not read as JSON"
    def prop(obj, name):
        return obj.get(name) if isinstance(obj, dict) else None
    office = prop(prop(prop(configuration, "mcpServers"), "mole_office"), "env")
    if not isinstance(office, (dict, list)):
        reason = "it holds no office tool"
    else:
        # JavaScript's String(undefined), used by the node reader when the property is absent.
        def word(name):
            if not isinstance(office, dict) or name not in office:
                return "undefined"
            value = office[name]
            if value is None:
                return "null"
            if isinstance(value, bool):
                return str(value).lower()
            if isinstance(value, dict):
                return "[object Object]"
            if isinstance(value, list):
                return ",".join(str(x) for x in value)
            return str(value)
        if not isinstance(agent, str) or agent == "" or prop(office, "MOLE_OFFICE_AGENT") != agent:
            reason = f"it names the agent {word('MOLE_OFFICE_AGENT')}, not this one ({agent or 'none'})"
        elif not isinstance(session, str) or session == "" or prop(office, "MOLE_OFFICE_SESSION") != session:
            reason = f"it names the run {word('MOLE_OFFICE_SESSION')}, not this one ({session or 'none'})"
        else:
            key = prop(office, "MOLE_AGENT_KEY")
            if isinstance(key, str) and key != "":
                return key, None
            reason = "it holds no key"
    return None, f"{named} is not this run's own: {reason}"


def the_key_a_kit_tool_sends(env, agent, session, names, nothing):
    """Take the agent's key first, then the matching run's key, or explain why neither was used."""
    key = the_agent_key(env, nothing)
    if key is not None:
        return key, None
    missing = [name for name, value in ((names["agent"], agent), (names["session"], session))
               if not isinstance(value, str) or value == ""]
    if missing:
        return None, f"{' and '.join(missing)} {'is' if len(missing) == 1 else 'are'} not set, so the run's office tool file was not read"
    return the_runs_key(env, agent, session)


# THE SCRIPT'S OWN SENTENCE AFTER A 409 THAT STORED THE MESSAGE, printed after the office's sentence saying where the
# message went. tests/the-send-tool-says-a-409-message-is-stored.test.ts reads it from this file.
STORED_ON_A_409_SAYS = ("The message is stored and waits for its addressee: it was not delivered now, and it must not be "
                        "sent again, because a new send stores a second copy.")


def the_message_a_409_stored(status: int, said: str):
    """THE ANSWER OF A 409 THAT STORED THE MESSAGE, read as JSON, or None for every other error answer. A send to a
    registered agent nothing holds is stored, routed and answered 409, and that answer carries the stored message with
    its id and the list of where it was routed. An answer without both is a refusal, as a 409 that stored nothing is."""
    if status != 409:
        return None
    try:
        answer = json.loads(said)
    except json.JSONDecodeError:
        return None
    record = answer.get("record") if isinstance(answer, dict) else None
    if isinstance(record, dict) and isinstance(record.get("id"), str) and isinstance(answer.get("routed"), list):
        return answer
    return None


def the_send_id_and_the_key_reminder(send_id: str, answer: dict) -> None:
    """THE LINES A STORED MESSAGE PRINTS AFTER ITS STATUS AND ID, the same after a 201 and after a 409 that stored it:
    the send id, then the office's reminder when a part of the message seems to hold a key."""
    print(f"send id {send_id}: to send this again, run the same command with --send-id {send_id}; "
          f"the office keeps one message per send id.")
    reminder = answer.get("keyReminder")
    if isinstance(reminder, dict) and isinstance(reminder.get("says"), str):
        print(reminder["says"])


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("workspace")
    ap.add_argument("to")
    ap.add_argument("title")
    ap.add_argument("body_file")
    ap.add_argument("--as", dest="handle", default=os.environ.get("MOLE_OFFICE_AGENT"))
    ap.add_argument("--session", default=os.environ.get("MOLE_OFFICE_SESSION"))
    ap.add_argument("--slot", default=None)
    ap.add_argument("--purpose", default=None)
    ap.add_argument("--api", default=None)
    ap.add_argument("--quote", action="append", nargs="+", default=[], metavar="ARG")
    ap.add_argument("--lead", nargs="+", default=None, metavar="ARG")
    ap.add_argument("--send-id", dest="send_id", default=None)
    # --LEAD AND EACH --QUOTE ARE READ HERE, BEFORE argparse: a record id may begin with "-" (ids are letters,
    # digits, - and _), and argparse would read such an id as an option (--lead since 0f3b6ec50; --quote since
    # 4 October 2026, when an agent's --quote with an id such as -cWDLXacG9zh stopped the send). The word after the option is the record
    # id, whatever it begins with; the word after that is the lead's project or the quote's words, unless it is
    # another option. The id may also be joined to the option, --quote=<id> or --lead=<id>.
    argv, leads = taken_out(sys.argv[1:], "--lead")
    argv, quotes_given = taken_out(argv, "--quote")
    if any(given == [] for given in leads) or len(leads) > 1:
        print("--lead is a record id, and optionally its project, once: --lead <record id> [<project>]", file=sys.stderr)
        return 2
    if any(given == [] for given in quotes_given):
        print('each --quote is a record id, and optionally its words in one argument: --quote <id> "<words>"',
              file=sys.stderr)
        return 2
    a = ap.parse_args(argv)
    # AN OPTION argparse READ ITSELF IS ONE NOT WRITTEN IN FULL, such as --quo <id> or --le <id>, which argparse takes
    # for --quote and --lead. It would be put aside below, and the message sent without it as if all were well, so it
    # is refused, and nothing is sent.
    if a.quote or a.lead is not None:
        print("write --quote and --lead in full: an abbreviation of them is not read. Nothing was sent.", file=sys.stderr)
        return 2
    a.lead = leads[0] if leads else None
    a.quote = quotes_given
    if not a.handle:
        print("no handle: pass --as <handle> or set MOLE_OFFICE_AGENT", file=sys.stderr)
        return 2
    if a.api is None:
        # --API ALWAYS WINS; WITHOUT IT, THE ENVIRONMENT'S ADDRESS ONLY IF IT WAS GIVEN FOR THIS COPY.
        refused = the_environments_address_is_for_another_copy(os.environ)
        if refused is not None:
            print(refused, file=sys.stderr)
            return 2
        a.api = os.environ.get("MOLE_OFFICE_API")
    if not a.api:
        print("no office address: pass --api <url> or set MOLE_OFFICE_API. Nothing was sent.", file=sys.stderr)
        return 2
    quotes = []
    for given in a.quote:
        if len(given) > 2 or given[0] == "" or (len(given) == 2 and given[1] == ""):
            print('each --quote is a record id, and optionally its words in one argument: --quote <id> "<words>"',
                  file=sys.stderr)
            return 2
        quote = {"target": {"kind": "record", "recordId": given[0], "workspaceId": a.workspace}}
        if len(given) == 2:
            quote["place"] = {"at": "quote", "words": given[1]}
        quotes.append(quote)
    lead = None
    if a.lead is not None:
        if len(a.lead) > 2 or any(given == "" for given in a.lead):
            print("--lead is a record id, and optionally its project: --lead <record id> [<project>]", file=sys.stderr)
            return 2
        lead = {"target": {"kind": "record", "recordId": a.lead[0],
                           "workspaceId": a.lead[1] if len(a.lead) == 2 else a.workspace},
                "place": {"at": "surface"}}
    try:
        key, why = the_key_a_kit_tool_sends(os.environ, a.handle, a.session,
                                             {"agent": "--as or MOLE_OFFICE_AGENT", "session": "--session or MOLE_OFFICE_SESSION"},
                                             "Nothing was sent.")
    except ValueError as refused:
        print(refused, file=sys.stderr)
        return 2
    if key is None:
        print(the_no_key_line(why, os.environ), file=sys.stderr)
        return 2
    with open(a.body_file, encoding="utf-8") as f:
        body = f.read().strip()
    send_id = a.send_id if a.send_id else secrets.token_hex(12)
    data = {"body": body, "source": a.handle, "sendId": send_id}
    if a.to.startswith("group:"):
        data["toGroup"] = a.to[len("group:"):]
    elif a.to.startswith("person:"):
        data["to"] = [{"kind": "person", "id": a.to[len("person:"):]}]
    else:
        data["to"] = [{"kind": "agent", "id": a.to}]
    if quotes:
        data["quotes"] = quotes
    if a.slot:
        data["extra"] = {"broadcastSlot": a.slot}
    if lead is not None:
        data["lead"] = lead
    headers = {
        "content-type": "application/json",
        "x-mole-office-workspace": a.workspace,
        "x-mole-office-actor-type": "agent",
        "x-mole-office-actor-id": a.handle,
    }
    if a.session:
        headers["x-mole-office-session"] = a.session
    if a.purpose:
        headers["x-mole-office-purpose"] = a.purpose
    headers["x-mole-office-key"] = key
    payload = {"kind": "message", "title": a.title, "data": data}
    req = urllib.request.Request(
        a.api.rstrip("/") + "/api/records", method="POST",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.load(r)
            rec = d.get("record", d)
            already = d.get("alreadySent")
            if isinstance(already, dict):
                because = already.get("because")
                if not isinstance(because, str):
                    because = "The office answered that this message was already sent, and wrote nothing new."
                print(r.status, already.get("id") or rec.get("id"), because)
                return 0
            print(r.status, rec.get("id"))
            the_send_id_and_the_key_reminder(send_id, d)
            return 0
    except urllib.error.HTTPError as e:
        said = e.read().decode("utf-8", "replace")
        stored = the_message_a_409_stored(e.code, said)
        if stored is None:
            print(e.code, said[:600])
            return 1
        # A 409 THAT STORED THE MESSAGE IS NO REFUSAL. Exit 1 would make the caller send again, and a new send stores a
        # second copy, so it exits 0 and says that the message waits.
        print(e.code, stored["record"]["id"])
        error = stored.get("error")
        if isinstance(error, str):
            print(error)
        print(STORED_ON_A_409_SAYS)
        the_send_id_and_the_key_reminder(send_id, stored)
        return 0
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"no answer came back ({e}), so nobody knows whether the message was written. Run this again with "
              f"--send-id {send_id}: it is written once either way.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
