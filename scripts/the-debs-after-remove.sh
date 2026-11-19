#!/bin/bash
# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# THE OFFICE'S .deb's postrm, as the template electron-builder makes it from (deb.afterRemove in
# scripts/package-linux.mjs). Below the guard is electron-builder@26.15.3's own after-remove.tpl, from its second line
# on, as it is: it removes the mole-office command and the AppArmor profile.
#
# THE GUARD. dpkg runs this with abort-install or abort-upgrade after this version's preinst refused, which it does
# when an office would not stop (scripts/the-debs-stop.sh). On an upgrade the older version is still installed then,
# and its command and AppArmor profile are its own, so nothing is removed.
#
# electron-builder writes a value in place of each dollar sign followed by a name in braces, and refuses a name it does
# not know. So this file holds none but the ones its own text holds.
case "$1" in
  abort-install | abort-upgrade) exit 0 ;;
esac

# Delete the link to the binary
# update-alternatives --remove <name> <path>: 'path' must be the registered alternative binary,
# not the generic symlink — see https://man7.org/linux/man-pages/man1/update-alternatives.1.html
if type update-alternatives >/dev/null 2>&1; then
    update-alternatives --remove '${executable}' '/opt/${sanitizedProductName}/${executable}'
else
    rm -f '/usr/bin/${executable}'
fi

APPARMOR_PROFILE_DEST='/etc/apparmor.d/${executable}'

# Remove and unload apparmor profile.
if [ -f "$APPARMOR_PROFILE_DEST" ]; then
  # Unload the profile from the running kernel before deleting the file so the
  # policy is not left enforced until the next reboot.  Mirror the chroot guard
  # used in the after-install script — live AppArmor operations are not
  # meaningful inside a chroot.
  # https://wiki.debian.org/AppArmor/HowToUse
  if apparmor_status --enabled > /dev/null 2>&1; then
    if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } && hash apparmor_parser 2>/dev/null; then
      apparmor_parser --remove "$APPARMOR_PROFILE_DEST" || true
    fi
  fi
  rm -f "$APPARMOR_PROFILE_DEST"
fi