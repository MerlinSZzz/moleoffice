#!/usr/bin/python3
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
"""A stand-in for `claude setup-token`, for tests only. It signs nobody in and opens no network connection.

It prints what version 2.1.281 printed in a real run on a pty: each word placed by a cursor move, the sign-in URL inside
an OSC 8 link, and the code prompt left open while it waits. Its sign-in URL is invented. It puts the terminal in raw
mode, as the CLI does, and reads its input as the CLI does: a read that is only Enter submits the code, and a read that
holds the code and Enter together is taken as a paste, so that Enter does not submit it. After a submit it prints the
CLI's own success lines, with a token worked out from the code, waits half a second and ends with 0.

It takes one mode word from the file `mode` beside it, and writes what it was given, never the code or the token, to
`report.json` beside it. A test copies it into a folder of its own, so the report is outside the scratch home it is run in.
It writes that report before it prints its first byte. A test that has seen the prompt can then read it, and a cancel
that removes the scratch home while the program is still printing cannot make the report fail.
"""
import hashlib
import json
import os
import pathlib
import resource
import signal
import sys
import termios
import time
import urllib.parse

here = pathlib.Path(__file__).resolve().parent
mode_file = here / 'mode'
mode = mode_file.read_text().strip() if mode_file.exists() else ''
signal.alarm(60)
if mode == 'ignore-term':
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
reads = []
said = {'submitted': False, 'pastedWithEnter': False}


def report():
    temporary = here / ('.report-' + str(os.getpid()))
    temporary.write_text(json.dumps({
        'argv': sys.argv[1:],
        # AS IT WAS GIVEN: Python adds LC_CTYPE to its own os.environ when the locale is C, and /proc keeps the original.
        'environ': dict(entry.split('=', 1) for entry in pathlib.Path('/proc/self/environ').read_text().split('\0') if entry),
        'core': list(resource.getrlimit(resource.RLIMIT_CORE)),
        'pid': os.getpid(),
        'pgid': os.getpgid(0),
        'sid': os.getsid(0),
        'tty': os.isatty(0) and os.isatty(1),
        'cwd': os.getcwd(),
        'reads': reads,
        **said,
    }))
    os.rename(temporary, here / 'report.json')


def out(text):
    os.write(1, text.encode())


def placed(line):
    """The line as Ink writes it: each word after the first moved to by CSI n G, from column 2."""
    written = ''
    column = 2
    for word in line.split(' '):
        written += '\x1b[' + str(column) + 'G' + word
        column += len(word) + 1
    return written + '\r\n'


attributes = termios.tcgetattr(0)
attributes[0] &= ~(termios.ICRNL | termios.IXON)
attributes[3] &= ~(termios.ICANON | termios.ECHO | termios.ISIG | termios.IEXTEN)
attributes[6][termios.VMIN] = 1
attributes[6][termios.VTIME] = 0
termios.tcsetattr(0, termios.TCSANOW, attributes)

# THE PROGRAM'S OWN FILES, which must land in the scratch home.
config = pathlib.Path(os.environ.get('CLAUDE_CONFIG_DIR', os.path.expanduser('~/.claude')))
config.mkdir(parents=True, exist_ok=True)
(config / '.claude.json').write_text('{"invented": true}\n')
pathlib.Path(os.path.expanduser('~/.claude.json')).write_text('{"invented": true}\n')

host = 'claude.example.com' if mode == 'another-origin' else 'claude.com'
callback = 'https://invented.example.com/oauth/code/callback' if mode == 'another-callback' else 'https://platform.claude.com/oauth/code/callback'
url = ('https://' + host + '/cai/oauth/authorize?code=true&client_id=00000000-0000-4000-8000-000000000000&response_type=code'
       '&redirect_uri=' + urllib.parse.quote(callback, safe='') + '&scope=user%3Ainference&code_challenge=invented-challenge'
       '&code_challenge_method=S256&state=invented-state')
head = (
    '\x1b7\x1b[r\x1b8\x1b[?25h\x1b[?25l\x1b[?2004h\x1b[?2031h\x1b[?1004h'
    + '\x1b[38;5;174m' + placed('Welcome to Claude Code v2.1.281')
    + '\r\n'
    + '\x1b[1m' + placed('This will guide you through long-lived (1-year) auth token setup for your Claude account. Claude subscription required.')
    + '\x1b[22m\r\n'
    + '\x1b[38;5;246m' + placed("Browser didn't open? Use the url below to sign in (c to copy)") + '\x1b[39m\r\n'
    + '\x1b]8;id=invented;' + url + '\x07\x1b[38;5;246m' + url + '\x1b[39m\x1b]8;;\x07\r\n\r\n'
    + '\x1b[38;5;246m' + placed("Hold Shift while selecting to use your terminal's native copy") + '\x1b[39m\r\n\r\n\r\n'
    + placed('Paste code here if prompted >')[:-2]
    + '\x1b[>0q\x1b[?u\x1b[c'
)
# CUT WHERE A READER COULD STUMBLE: inside a control sequence, inside the URL and inside the prompt.
cuts = [head.index('[38;5;174m') + 4, head.index('/oauth/authorize'), head.index('here') + 2, len(head)]
report()
start = 0
for cut in cuts:
    out(head[start:cut])
    start = cut
    time.sleep(0.03)

code = b''
while True:
    try:
        chunk = os.read(0, 4096)
    except OSError:
        break
    if not chunk:
        break
    reads.append({'length': len(chunk), 'enter': b'\r' in chunk})
    if chunk != b'\r':
        if b'\r' in chunk:
            said['pastedWithEnter'] = True
        typed = chunk.replace(b'\r', b'')
        code += typed
        out(typed.decode('utf-8', 'replace'))
        report()
        continue
    if not code:
        report()
        continue
    if mode == 'oauth-error':
        out('\r\n' + placed('OAuth error: Request failed with status code 400') + '\r\n' + placed('Press Enter to retry.'))
        code = b''
        report()
        continue
    said['submitted'] = True
    report()
    token = 'invented-token-' + hashlib.sha256(code).hexdigest()[:40]
    out('\r\n' + '\x1b[32m' + placed('✓ Long-lived authentication token created successfully!') + '\x1b[39m\r\n'
        + placed('Your OAuth token (valid for 1 year):') + '\r\n'
        + '\x1b[33m\x1b[2G' + token + '\x1b[39m\r\n\r\n'
        + placed("Store this token securely. You won't be able to see it again.") + '\r\n'
        + placed('Use this token by setting: export CLAUDE_CODE_OAUTH_TOKEN=<token>'))
    time.sleep(0.5)
    sys.exit(0)
