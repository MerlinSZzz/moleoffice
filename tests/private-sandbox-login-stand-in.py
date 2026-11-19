# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
"""Invented pool helper for tests only; never opens a host pool."""
import fcntl
import hashlib
import json
import os
import pathlib
import resource
import signal
import stat
import sys
import time
import ctypes

resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
owner = os.getppid()
ctypes.CDLL(None).prctl(1, signal.SIGTERM)
if owner == 1 or os.getppid() != owner: sys.exit(1)
signal.alarm(10)
root = pathlib.Path(os.environ['CLAUDE_LOGIN_POOL'])
assert 'invented-private-home-' in str(root)
fault = os.environ.get('INVENTED_POOL_FAULT', '')

def refuse(reason):
    print(json.dumps({'outcome': 'refused', 'reason': reason}))
    sys.exit(0)

def safe(path, mode, directory=False):
    info = path.lstat()
    if info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != mode or (not stat.S_ISDIR(info.st_mode) if directory else not stat.S_ISREG(info.st_mode)):
        refuse('PoolUnsafe')

def atomic(path, value):
    temporary = root / ('.invented-temp-' + str(os.getpid()) + '-' + path.name)
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        if fault == 'write': raise OSError()
        os.write(fd, value)
        if fault == 'flush': raise OSError()
        os.fsync(fd)
    except BaseException:
        os.close(fd)
        temporary.unlink()
        raise
    os.close(fd)
    if fault == 'before-rename':
        temporary.unlink()
        raise OSError()
    os.rename(temporary, path)
    directory = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
    os.fsync(directory)
    os.close(directory)

safe(root, 0o700, True)
lockfd = os.open(root / '.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
safe(root / '.lock', 0o600)
with os.fdopen(lockfd, 'r+') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX)
    if sys.argv[1] == 'invented-watch-99':
        active = root.parent / 'sandbox-secrets.env'
        safe(active, 0o600)
        active.write_text('# invented unrelated line\nCLAUDE_CODE_OAUTH_TOKEN=invented-watch-switch-at-99\n')
        print(json.dumps({'outcome': 'switched'}))
        sys.exit(0)
    safe(root / 'index.json', 0o600)
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result: refuse('PoolUnsafe')
            result[key] = value
        return result
    index = json.loads((root / 'index.json').read_text(), object_pairs_hook=unique)
    assert set(index) == {'version', 'logins'} and index['version'] == 1
    entries = index['logins']
    for letter, row in entries.items():
        assert len(letter) == 1 and 'A' <= letter <= 'Z'
        assert set(row) == {'sha12', 'added', 'by'}
        safe(root / (letter + '.token'), 0o600)
    token = sys.stdin.buffer.read(8193).rstrip(b'\n')
    if not token or len(token) > 8192 or b'\n' in token or b'\r' in token: refuse('PoolUnsaved')
    sha = hashlib.sha256(token).hexdigest()[:12]
    if any(row['sha12'] == sha for row in entries.values()): refuse('PoolDuplicate')
    letter = chr(ord(max(entries)) + 1) if entries else 'A'
    if letter > 'Z': refuse('PoolFull')
    target = root / (letter + '.token')
    if target.exists() or target.is_symlink(): refuse('PoolUnsafe')
    if fault == 'create': refuse('PoolUnsaved')
    # Both racing writers read before either publishes if the allocation lock is removed.
    time.sleep(0.08)
    try:
        atomic(target, token + b'\n')
        if fault == 'after-value': raise OSError()
        entries[letter] = {'sha12': sha, 'added': '2026-01-01 12:00', 'by': sys.argv[2]}
        atomic(root / 'index.json', (json.dumps(index, indent=2) + '\n').encode())
        if fault == 'after-index': raise OSError()
    except OSError:
        refuse('PoolUnknown' if target.exists() else 'PoolUnsaved')
    if fault == 'reply': sys.exit(1)
    print(json.dumps({'outcome': 'added', 'letter': letter, 'sha12': sha, 'confirmed': True}))
