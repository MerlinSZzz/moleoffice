#!/usr/bin/env python3
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
"""Print each model login's week, as the office worked it out, from a secretary's inbox.

    python3 logins-week.py <workspace> [--as <handle>] [--api <url>]

The office counts each model login's use this week (src/server/lib/logins-week.ts), and tells the secretaries at 50%
and 80% of a login's mark. The count itself is in a secretary's inbox only, as `loginsWeek` in GET /api/agent/inbox,
and the waiter and read-new.sh print messages only. This prints it when it is asked for: one line saying when the
office read it, then each login's own sentence (its `says`) on a line of its own, then how many runs in the last seven
days declared no tool, when any did. It works nothing out itself; every figure and every sentence is the office's.

<workspace> is the project the agent is in: the office looks the handle up among that project's agents. The handle
comes from --as or MOLE_OFFICE_AGENT, and the office's address from --api or MOLE_OFFICE_API, as for send-message.py.
Neither has a default. The address in the environment is taken only when it was given for this copy, by the rule in
send-message.py, which this reads from there. The key comes from MOLE_AGENT_KEY_FILE, MOLE_AGENT_KEY,
or this run's office tool configuration; without one this asks nothing. It is sent on
x-mole-office-key; it is never printed and never taken from a flag.

It asks for one message (?limit=1), so the answer is small, and prints none. It changes nothing in the office: reading
an inbox is not receiving it.

It exits 0 when it printed the week. It exits 1 when the office refused (it prints the status and the start of the
office's answer), when no answer came back, when the answer carries no loginsWeek (an office puts it only in a
secretary's inbox), or when loginsWeek is not in the shape this reads. It exits 2, asking nothing, when the handle or
the address is missing, the address in the environment is for another copy, or the key cannot be read.
"""
import argparse
import importlib.util
import json
import os
import sys
import urllib.error
import urllib.request


def the_message_script():
    """send-message.py beside this file, read through any link, for its rule on the environment's address. The rule
    is worked out there and in src/config/settings.mjs and nowhere else. No bytecode file is written beside it."""
    sys.dont_write_bytecode = True
    path = os.path.join(os.path.dirname(os.path.realpath(__file__)), "send-message.py")
    spec = importlib.util.spec_from_file_location("the_kits_send_message", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def the_week_is_readable(week) -> bool:
    """Whether loginsWeek has what this prints: at, zone, a list of logins each with its says, and a count."""
    if not isinstance(week, dict) or not isinstance(week.get("at"), str) or not isinstance(week.get("zone"), str):
        return False
    logins = week.get("logins")
    if not isinstance(logins, list) or not all(isinstance(one, dict) and isinstance(one.get("says"), str) for one in logins):
        return False
    return isinstance(week.get("runsThatDeclaredNoTool"), int)


def main() -> int:
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("workspace")
    ap.add_argument("--as", dest="handle", default=os.environ.get("MOLE_OFFICE_AGENT"))
    ap.add_argument("--api", default=None)
    a = ap.parse_args()
    if not a.handle:
        print("no handle: pass --as <handle> or set MOLE_OFFICE_AGENT. Nothing was asked.", file=sys.stderr)
        return 2
    if a.api is None:
        refused = the_message_script().the_environments_address_is_for_another_copy(os.environ)
        if refused is not None:
            print(refused, file=sys.stderr)
            return 2
        a.api = os.environ.get("MOLE_OFFICE_API")
    if not a.api:
        print("no office address: pass --api <url> or set MOLE_OFFICE_API. Nothing was asked.", file=sys.stderr)
        return 2
    headers = {
        "x-mole-office-workspace": a.workspace,
        "x-mole-office-actor-type": "agent",
        "x-mole-office-actor-id": a.handle,
    }
    try:
        script = the_message_script()
        key, why = script.the_key_a_kit_tool_sends(os.environ, a.handle, os.environ.get("MOLE_OFFICE_SESSION"),
                                                    {"agent": "--as or MOLE_OFFICE_AGENT", "session": "MOLE_OFFICE_SESSION"},
                                                    "Nothing was asked.")
    except ValueError as refused:
        print(refused, file=sys.stderr)
        return 2
    if key is None:
        print(script.the_no_key_line(why, os.environ), file=sys.stderr)
        return 2
    headers["x-mole-office-key"] = key
    req = urllib.request.Request(a.api.rstrip("/") + "/api/agent/inbox?limit=1", method="GET", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            answer = json.load(r)
    except urllib.error.HTTPError as e:
        print(e.code, e.read().decode("utf-8", "replace")[:600])
        return 1
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"no answer came back from {a.api} ({e}). Nothing was read.", file=sys.stderr)
        return 1
    week = answer.get("loginsWeek") if isinstance(answer, dict) else None
    if week is None:
        print(f"The office's answer for {a.handle} carries no loginsWeek, so this prints nothing. An office puts "
              "loginsWeek only in a secretary's inbox.", file=sys.stderr)
        return 1
    if not the_week_is_readable(week):
        print("The office's loginsWeek is not in the shape this reads: at, zone, a list of logins each with its says, "
              "and runsThatDeclaredNoTool. Nothing was printed from it.", file=sys.stderr)
        return 1
    print(f"Each login's week, as the office read it at {week['at']}, {week['zone']} time "
          "(loginsWeek in GET /api/agent/inbox):")
    for one in week["logins"]:
        print(one["says"])
    if week["runsThatDeclaredNoTool"] > 0:
        print(f"Runs in the last seven days that declared no tool, which no login counts: {week['runsThatDeclaredNoTool']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
