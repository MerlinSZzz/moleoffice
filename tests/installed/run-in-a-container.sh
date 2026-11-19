#!/bin/bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# THE LINUX INSTALLERS ON A MACHINE WITH NO NODE AND NO CHECKOUT. Wave 13t, round 13.
#
# Run as root in a fresh ubuntu:24.04 container with no Node, with Xvfb, dbus and xauth, and the
# packages the .deb names in its Depends already installed; no network. The installers and the
# driver are read-only at /in; findings, logs and pictures go to /out. Exit 0 only if every step passed.
#
# WHAT EACH STEP PROVES:
#   0. No Node is on this machine: `command -v node` finds nothing, before and after the installs.
#   1. The .deb installs with dpkg, and its after-install script deals with Electron's sandbox:
#      the AppArmor profile when AppArmor runs, a setuid chrome-sandbox when user namespaces do not work.
#   2. The installed program, run by an ordinary user WITHOUT --no-sandbox, in English and then Chinese:
#      the window opens; the service starts on the per-user data folder (~/.config/mole-office) on the
#      installation's own Node; the self-check passes; closing the window hides it; Shut down
#      stops the service. (drive-the-window.mjs, run on the installation's own Node, checks each.)
#      The pictures of the check page and the office, light and dark, are taken here.
#   3. The .deb is removed, so nothing of it is left for the AppImage to use.
#   4. The AppImage, run by another ordinary user with no FUSE (unpacked, and run by its AppRun): first
#      without --no-sandbox, to show what Ubuntu 24.04's limit on user namespaces does to it here; then
#      with --no-sandbox, the same five findings.
#
# ROUND 14. A window run without Chromium's sandbox says so on its check page and opens the office
# only on the Open press. So step 2 also runs the .deb with --no-sandbox, in English and Chinese, for
# the pictures of that warning, and step 4b takes the same pictures from the AppImage in both languages.
#
# ROUND 15. The installers ship with Node's inspector arguments turned off (an Electron fuse), and the
# driver reaches the window through that inspector. So each step drives a COPY of the installed
# binary with only that fuse turned back on, made by electron-fuses.mjs on the installation's own
# Node, and says so; the shipped binary's fuses are read and printed first, and it is never changed.
# For the .deb the copy is /opt/mole-office/mole-office-driven, removed before dpkg -r. For the
# AppImage it is the user's own unpacked squashfs-root/mole-office, run through the AppImage's own
# AppRun, which adds --no-sandbox where user namespaces are refused just as the AppImage does.
# Step 4 also runs the AppImage itself as a person would, with no FUSE and no
# APPIMAGE_EXTRACT_AND_RUN, and prints what it says.
#
# `bash run.sh appimage-zh-only` runs only the AppImage in Chinese, with its pictures: it is run on
# an image without the .deb's Recommends, so with no Chinese font, to show what a tester sees there.
#
# ROUND 16. Step 2c starts the installed office's service without a window, as debuser, and runs
# an-agent-starts.mjs on the installation's own Node: an agent registers with the tools the office ships in
# for-agents/, holds its handle, gets the person's message and answers it. The driver also needs
# ask-until.mjs beside it, so /in holds drive-the-window.mjs, ask-until.mjs, an-agent-starts.mjs (all from
# tests/installed/) and electron-fuses.mjs (from scripts/).
#
# THE LINUX INSTALLERS CARRY NO NODE OF THEIR OWN. The office, the drivers and electron-fuses.mjs run on the
# app's own program, told to run as Node by ELECTRON_RUN_AS_NODE=1, which its RunAsNode fuse lets it read.
# Steps 1 and 4 check that the installation has no runtime/ folder, that the program runs as Node, and that
# the fuse is on.
#
# Electron will not run as root without --no-sandbox, which is why the program runs as ordinary users.

set -u
ONLY=${1:-}
IN=/in
OUT=/out
chmod a+rwx "$OUT"
# Every user's driver writes its pictures here, so the folder is made by root and open to each.
mkdir -p "$OUT/pictures" && chmod 1777 "$OUT/pictures"
exec > >(tee "$OUT/run.log") 2>&1
failed=0
say() { echo "== $*"; }
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; failed=1; }
# Stop every process of one user, read from /proc: the base image has no procps, so no pkill.
stop_user() {
  for proc in /proc/[0-9]*; do
    [ "$(stat -c %U "$proc" 2>/dev/null)" = "$1" ] && kill -9 "${proc#/proc/}" 2>/dev/null
  done
  return 0
}

DEB=$(ls "$IN"/*.deb | head -1)
APPIMAGE=$(ls "$IN"/*.AppImage | head -1)
DRIVER="$IN/drive-the-window.mjs"
FUSES="$IN/electron-fuses.mjs"
AGENT="$IN/an-agent-starts.mjs"
for need in "$DRIVER" "$IN/ask-until.mjs" "$AGENT" "$FUSES"; do
  [ -f "$need" ] || { echo "FAIL $need is not in $IN; copy it there beside the installers (see the top of this file)"; exit 1; }
done

say "0. No Node on this machine"
if command -v node >/dev/null 2>&1; then fail "a node is on PATH: $(command -v node)"; else pass "no node on PATH ($PATH)"; fi
if ls /usr/bin/node /usr/local/bin/node >/dev/null 2>&1; then fail "a node binary exists"; else pass "no /usr/bin/node or /usr/local/bin/node"; fi

say "A display and the users"
Xvfb :99 -screen 0 1440x900x24 -nolisten tcp >"$OUT/xvfb.log" 2>&1 &
XVFB=$!
export DISPLAY=:99
sleep 2
useradd -m debuser
useradd -m appimageuser
# The homes useradd made, read back rather than assumed.
DEB_HOME=$(getent passwd debuser | cut -d: -f6)
APP_HOME=$(getent passwd appimageuser | cut -d: -f6)
if [ -z "$DEB_HOME" ] || [ -z "$APP_HOME" ]; then echo "useradd made a user with no home folder"; exit 1; fi

echo "Fonts with Chinese in them on this machine: $(ls /usr/share/fonts/opentype/noto 2>/dev/null | grep -i cjk | tr '\n' ' ' || true)$(ls /usr/share/fonts/truetype 2>/dev/null | grep -iE 'wqy|droid|noto' | tr '\n' ' ' || true)"

if [ "$ONLY" = "appimage-zh-only" ]; then
  say "Only the AppImage in Chinese, with --no-sandbox, on this machine's fonts"
  WORK="$APP_HOME/work"
  runuser -u appimageuser -- mkdir -p "$WORK"
  runuser -u appimageuser -- bash -c "cd '$WORK' && '$APPIMAGE' --appimage-extract >/dev/null"
  AI_NODE=(env ELECTRON_RUN_AS_NODE=1 "$WORK/squashfs-root/mole-office")
  echo "The AppImage's fuses, as shipped:"; "${AI_NODE[@]}" "$FUSES" read "$WORK/squashfs-root/mole-office"
  runuser -u appimageuser -- "${AI_NODE[@]}" "$FUSES" inspectable "$WORK/squashfs-root/mole-office" "$WORK/driven" \
    && runuser -u appimageuser -- mv "$WORK/driven" "$WORK/squashfs-root/mole-office"
  runuser -u appimageuser -- env HOME="$APP_HOME" DISPLAY=:99 PATH=/usr/bin:/bin \
    dbus-run-session -- "${AI_NODE[@]}" "$DRIVER" --app "$WORK/squashfs-root/AppRun" --name appimage-nofont --lang zh --out "$OUT" --pictures -- --no-sandbox \
    || fail "the AppImage in Chinese, with --no-sandbox"
  stop_user appimageuser
  kill "$XVFB" 2>/dev/null || true
  say "Done: $([ "$failed" = 0 ] && echo 'every step passed' || echo 'a step failed')"
  exit "$failed"
fi

say "1. The .deb installs"
if dpkg -i "$DEB" >"$OUT/dpkg-install.log" 2>&1; then pass "dpkg -i $(basename "$DEB")"; else fail "dpkg -i failed; see dpkg-install.log"; fi
cat "$OUT/dpkg-install.log"
echo "chrome-sandbox: $(stat -c '%a %U:%G' '/opt/mole-office/chrome-sandbox' 2>&1)"
echo "AppArmor profile installed: $(ls /etc/apparmor.d/mole-office 2>&1)"
echo "user namespaces for an ordinary user: $(runuser -u debuser -- unshare --user true 2>&1 && echo work || echo do not work)"
DEB_NODE=(env ELECTRON_RUN_AS_NODE=1 /opt/mole-office/mole-office)
if [ -e /opt/mole-office/resources/office/runtime ]; then fail "the installation carries a Node of its own, in /opt/mole-office/resources/office/runtime"; else pass "the installation carries no Node of its own"; fi
if version=$(timeout 20 "${DEB_NODE[@]}" -p process.versions.node 2>&1); then pass "the app's own program runs as Node $version"; else fail "the app's own program did not run as Node: $version"; fi
echo "The installed binary's fuses, as shipped:"; "${DEB_NODE[@]}" "$FUSES" read /opt/mole-office/mole-office | tee "$OUT/deb-fuses.txt"
if grep -qx 'RunAsNode on' "$OUT/deb-fuses.txt"; then pass "the installed binary's RunAsNode fuse is on"; else fail "the installed binary's RunAsNode fuse is not on; deb-fuses.txt has its fuses"; fi
DRIVEN=/opt/mole-office/mole-office-driven
if "${DEB_NODE[@]}" "$FUSES" inspectable /opt/mole-office/mole-office "$DRIVEN"; then pass "a copy to drive, with only the inspector fuse on"; else fail "no copy to drive could be made"; fi

say "2. The installed program, without --no-sandbox"
for lang in en zh; do
  runuser -u debuser -- env HOME="$DEB_HOME" DISPLAY=:99 PATH=/usr/bin:/bin \
    dbus-run-session -- "${DEB_NODE[@]}" "$DRIVER" --app "$DRIVEN" --name deb --lang "$lang" --out "$OUT" --pictures \
    || fail "the .deb, in $lang"
done
say "2b. The installed program, with --no-sandbox: the warning"
for lang in en zh; do
  stop_user debuser
  rm -rf "$DEB_HOME/.config/mole-office"
  runuser -u debuser -- env HOME="$DEB_HOME" DISPLAY=:99 PATH=/usr/bin:/bin \
    dbus-run-session -- "${DEB_NODE[@]}" "$DRIVER" --app "$DRIVEN" --name deb-nosandbox --lang "$lang" --out "$OUT" --pictures -- --no-sandbox \
    || fail "the .deb with --no-sandbox, in $lang"
done
say "2c. An agent starts in the installed office: it registers, holds its handle, gets a message and answers it"
stop_user debuser
rm -rf "$DEB_HOME/.config/mole-office"
OFFICE=/opt/mole-office/resources/office
AS_DEB="env HOME=$DEB_HOME PATH=/usr/bin:/bin MOLE_OFFICE_PORT=18787 MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES=none"
if runuser -u debuser -- $AS_DEB "${DEB_NODE[@]}" "$OFFICE/mole-office.mjs" start; then
  if runuser -u debuser -- $AS_DEB "${DEB_NODE[@]}" "$AGENT" --api http://127.0.0.1:18787 --keys "$DEB_HOME/.config/mole-office/data/keys.json"; then
    pass "an agent started in the installed office"
  else
    fail "an agent could not start in the installed office; the step that failed is named above"
  fi
  runuser -u debuser -- $AS_DEB "${DEB_NODE[@]}" "$OFFICE/mole-office.mjs" stop || fail "the installed office's service did not stop"
else
  fail "the installed office's service did not start without a window"
fi
# Nothing of the .deb's user may still answer at the port when the AppImage starts.
stop_user debuser

say "3. The .deb is removed"
rm -f "$DRIVEN"
if dpkg -r mole-office >"$OUT/dpkg-remove.log" 2>&1; then pass "dpkg -r mole-office"; else fail "dpkg -r failed; see dpkg-remove.log"; fi
if [ -e "/opt/mole-office" ]; then fail "/opt/mole-office is still there"; else pass "/opt/mole-office is gone"; fi

say "4. The AppImage"
echo "libfuse.so.2 on this machine: $(ls /usr/lib/x86_64-linux-gnu/libfuse.so.2* 2>/dev/null | tr '\n' ' ' || true)"
say "4.0. The AppImage run as a person would, with no APPIMAGE_EXTRACT_AND_RUN (20 seconds at most)"
runuser -u appimageuser -- env HOME="$APP_HOME" DISPLAY=:99 PATH=/usr/bin:/bin \
  timeout 20 "$APPIMAGE" >"$OUT/appimage-as-is.log" 2>&1
echo "it ended with $? (124 means it was still running after 20 seconds); it said:"
head -20 "$OUT/appimage-as-is.log"
stop_user appimageuser
rm -rf "$APP_HOME/.config/mole-office"
# ROUND 16. The AppImage carries the static runtime, which loads no libfuse.so.2 but still mounts itself
# with FUSE (/dev/fuse and a fusermount program). Where there is none, APPIMAGE_EXTRACT_AND_RUN=1 unpacks
# it to a temporary folder and runs it from there. Still running after 20 seconds means its window came up.
echo "FUSE on this machine: /dev/fuse $([ -e /dev/fuse ] && echo is || echo is not) there; fusermount: $(command -v fusermount fusermount3 | tr '\n' ' ')"
say "4.0b. The AppImage with APPIMAGE_EXTRACT_AND_RUN=1, as a tester with no FUSE types it (20 seconds at most)"
runuser -u appimageuser -- env HOME="$APP_HOME" DISPLAY=:99 PATH=/usr/bin:/bin APPIMAGE_EXTRACT_AND_RUN=1 \
  timeout 20 "$APPIMAGE" >"$OUT/appimage-extract-and-run.log" 2>&1
ran=$?
if [ "$ran" = 124 ]; then pass "the AppImage ran with APPIMAGE_EXTRACT_AND_RUN=1 and was still running after 20 seconds"; else fail "the AppImage with APPIMAGE_EXTRACT_AND_RUN=1 ended with $ran; it said:"; head -20 "$OUT/appimage-extract-and-run.log"; fi
stop_user appimageuser
rm -rf "$APP_HOME/.config/mole-office"
WORK="$APP_HOME/work"
runuser -u appimageuser -- mkdir -p "$WORK"
runuser -u appimageuser -- bash -c "cd '$WORK' && '$APPIMAGE' --appimage-extract >/dev/null"
AI_NODE=(env ELECTRON_RUN_AS_NODE=1 "$WORK/squashfs-root/mole-office")
if [ -e "$WORK/squashfs-root/resources/office/runtime" ]; then fail "the AppImage carries a Node of its own, in resources/office/runtime"; else pass "the AppImage carries no Node of its own"; fi
if version=$(timeout 20 "${AI_NODE[@]}" -p process.versions.node 2>&1); then pass "the AppImage's own program runs as Node $version"; else fail "the AppImage's own program did not run as Node: $version"; fi
echo "The AppImage's fuses, as shipped:"; "${AI_NODE[@]}" "$FUSES" read "$WORK/squashfs-root/mole-office" | tee "$OUT/appimage-fuses.txt"
if grep -qx 'RunAsNode on' "$OUT/appimage-fuses.txt"; then pass "the AppImage's RunAsNode fuse is on"; else fail "the AppImage's RunAsNode fuse is not on; appimage-fuses.txt has its fuses"; fi
if runuser -u appimageuser -- "${AI_NODE[@]}" "$FUSES" inspectable "$WORK/squashfs-root/mole-office" "$WORK/driven" \
  && runuser -u appimageuser -- mv "$WORK/driven" "$WORK/squashfs-root/mole-office"; then
  pass "the unpacked AppImage's binary, to drive, with only the inspector fuse on"
else
  fail "the unpacked AppImage's binary could not be made drivable"
fi
say "4a. Without --no-sandbox (what Ubuntu 24.04's limit does here)"
runuser -u appimageuser -- env HOME="$APP_HOME" DISPLAY=:99 PATH=/usr/bin:/bin \
  dbus-run-session -- "${AI_NODE[@]}" "$DRIVER" --app "$WORK/squashfs-root/AppRun" --name appimage-sandboxed --lang en --out "$OUT" \
  && echo "the AppImage ran without --no-sandbox given; its NOTE line above says whether its launcher turned Chromium's sandbox off itself" \
  || echo "the AppImage did not run without --no-sandbox given; appimage-sandboxed-en-window.log says why (not counted as a failure: 4b is the supported way)"
stop_user appimageuser
rm -rf "$APP_HOME/.config/mole-office"
say "4b. With --no-sandbox, in English and Chinese, with pictures"
for lang in en zh; do
  stop_user appimageuser
  rm -rf "$APP_HOME/.config/mole-office"
  runuser -u appimageuser -- env HOME="$APP_HOME" DISPLAY=:99 PATH=/usr/bin:/bin \
    dbus-run-session -- "${AI_NODE[@]}" "$DRIVER" --app "$WORK/squashfs-root/AppRun" --name appimage --lang "$lang" --out "$OUT" --pictures -- --no-sandbox \
    || fail "the AppImage, with --no-sandbox, in $lang"
done

say "5. Still no Node on this machine"
if command -v node >/dev/null 2>&1; then fail "a node is on PATH: $(command -v node)"; else pass "no node on PATH"; fi

stop_user debuser
stop_user appimageuser
kill "$XVFB" 2>/dev/null || true
say "Done: $([ "$failed" = 0 ] && echo 'every step passed' || echo 'a step failed')"
exit "$failed"
