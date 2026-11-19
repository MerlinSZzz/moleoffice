# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
"""A stand-in for the host's pool tool, for tests only. It speaks the tool's --json protocol and never opens a real pool.

    add-stdin <by> --operation <32 hex> --json      the value on stdin; one JSON line on stdout
    reconcile <operation> <sha12> --json             one JSON line on stdout

Its pool is $HOME/.config/mole-office/claude-logins, and it refuses to start unless HOME is a test's invented home. It
does NOT lower its own core limit, so a case can see that the adapter did. It writes what it was given, except the value,
to $HOME/reports/<pid>.json, and takes its fault words from $HOME/fault.
"""
import fcntl
import hashlib
import json
import os
import pathlib
import re
import resource
import signal
import stat
import sys
import time

home = pathlib.Path(os.environ.get('HOME', ''))
if not home.name.startswith('invented-private-home-'):
    sys.exit(3)
signal.alarm(30)
root = home / '.config' / 'mole-office' / 'claude-logins'
fault_file = home / 'fault'
faults = set(fault_file.read_text().split()) if fault_file.exists() else set()


def report(**more):
    folder = home / 'reports'
    folder.mkdir(mode=0o700, exist_ok=True)
    given = os.fstat(0).st_mode
    stdin_kind = 'socket' if stat.S_ISSOCK(given) else 'fifo' if stat.S_ISFIFO(given) else 'other'
    stderr_is_null = os.path.samestat(os.fstat(2), os.stat('/dev/null'))
    (folder / (str(os.getpid()) + '.json')).write_text(json.dumps({
        'argv': sys.argv[1:],
        # AS IT WAS GIVEN: Python adds LC_CTYPE to its own os.environ when the locale is C, and /proc keeps the original.
        'environ': dict(entry.split('=', 1) for entry in pathlib.Path('/proc/self/environ').read_text().split('\0') if entry),
        'core': list(resource.getrlimit(resource.RLIMIT_CORE)),
        'pid': os.getpid(),
        'pgid': os.getpgid(0),
        'sid': os.getsid(0),
        'cwd': os.getcwd(),
        'stdin': stdin_kind,
        'stderrIsNull': stderr_is_null,
        **more,
    }))


def answer(value):
    # THE ADD'S ANSWER ONLY: the reconcile that follows answers as the tool does.
    if 'noise' in faults and command == 'add-stdin':
        print('a word that is not the answer')
    print(json.dumps(value))
    if 'two-lines' in faults and command == 'add-stdin':
        print(json.dumps(value))
    sys.stdout.flush()
    sys.exit(0)


def refuse(reason):
    answer({'outcome': 'refused', 'reason': reason})


def safe(path, mode, directory=False):
    info = path.lstat()
    kind = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != mode or not kind:
        refuse('PoolUnsafe')


def publish(path, value):
    temporary = root / ('.invented-temp-' + str(os.getpid()) + '-' + path.name)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    os.write(fd, value)
    os.fsync(fd)
    os.close(fd)
    if 'killed-before-the-rename' in faults:
        os.kill(os.getpid(), signal.SIGKILL)
    os.rename(temporary, path)


def read_index():
    safe(root / 'index.json', 0o600)
    index = json.loads((root / 'index.json').read_text())
    if set(index) != {'version', 'logins'} or index['version'] != 1:
        refuse('PoolChanged')
    return index


command = sys.argv[1] if len(sys.argv) > 1 else ''
if 'stderr' in faults:
    sys.stderr.write('a diagnostic line the adapter must not keep\n')
safe(root, 0o700, True)
lock_fd = os.open(root / '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)

if command == 'reconcile' and len(sys.argv) == 5 and sys.argv[4] == '--json':
    operation, sha12 = sys.argv[2], sys.argv[3]
    report()
    fcntl.flock(lock_fd, fcntl.LOCK_SH)
    for letter, row in read_index()['logins'].items():
        if row.get('sha12') == sha12 and row.get('operation') == operation:
            answer({'outcome': 'added', 'letter': letter, 'sha12': sha12, 'operation': 'f' * 32 if 'reconcile-another-operation' in faults else operation})
    answer({'outcome': 'absent'})

if command != 'add-stdin' or len(sys.argv) != 6 or sys.argv[3] != '--operation' or sys.argv[5] != '--json':
    sys.exit(2)
by, operation = sys.argv[2], sys.argv[4]
if not re.fullmatch(r'[0-9a-f]{32}', operation) or not re.fullmatch(r'[a-zA-Z0-9 ._-]{1,100}', by):
    sys.exit(2)
token = sys.stdin.buffer.read(8194)
report(valueBytes=len(token))
if 'hang' in faults:
    time.sleep(60)
if not token.endswith(b'\n'):
    refuse('PoolUnsaved')
token = token[:-1]
if not token or len(token) > 8192 or re.search(rb'[\x00-\x20\x7f]', token):
    refuse('PoolUnsaved')
fcntl.flock(lock_fd, fcntl.LOCK_EX)
index = read_index()
entries = index['logins']
sha = hashlib.sha256(token).hexdigest()[:12]
if any(row['sha12'] == sha for row in entries.values()):
    refuse('PoolDuplicate')
letter = chr(ord(max(entries)) + 1) if entries else 'A'
if letter > 'Z':
    refuse('PoolFull')
publish(root / (letter + '.token'), token + b'\n')
entries[letter] = {'sha12': sha, 'added': '2026-01-01 12:00', 'by': by, 'operation': operation}
publish(root / 'index.json', (json.dumps(index, indent=2) + '\n').encode())
if 'killed-after-the-rename' in faults:
    os.kill(os.getpid(), signal.SIGKILL)
answer({'outcome': 'added', 'letter': letter, 'sha12': sha, 'operation': 'f' * 32 if 'another-operation' in faults else operation})
