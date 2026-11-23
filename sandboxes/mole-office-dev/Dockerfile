# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# THE MOLE OFFICE DEVELOPMENT SANDBOX IMAGE.
#
# One image for every sandbox made from this template. It holds the programs; it holds no code, no
# data and no secret. The code comes in as mounts (devcontainer.json says which), and the secrets
# come in per command as an env file (sandbox.json says which names).
#
# What is in it, and why each thing is the version it is:
#   - Ubuntu 24.04, the host's own release, so glibc is the host's 2.39 and the native modules in
#     the host's node_modules (better-sqlite3, rolldown, esbuild, TypeScript 7) load unchanged.
#   - Node 22, because chapter 9 says Node 22 and because node_modules is the host checkout's own,
#     mounted read-only: it was installed by the host's Node 22. NODE_VERSION is the host's exact
#     version; a test of this template fails when the host's Node major and this one part.
#   - Chromium for Playwright 1.62.1, installed here because the host has no browser cache to
#     mount (~/.cache/ms-playwright is gone). 1.62.1 wants chromium and headless-shell revision
#     1234 and ffmpeg 1011 (node_modules/playwright-core/browsers.json); the installer of the same
#     version picks exactly those.
#   - WebKit and Firefox for the same Playwright 1.62.1, in the same folder and from the same
#     installer: 1.62.1 wants WebKit revision 2336 and Firefox revision 1538
#     (node_modules/playwright-core/browsers.json).
#   - The four agent command lines, at the versions installed on the host on 21 September 2026.
#     They are installed here rather than borrowed from the host's ~/.nvm by a mount, so that no
#     part of the real home directory has to be visible inside (the reason is in the handback of
#     sandbox v1 piece P1).
#     CLAUDE CODE WAS RAISED TO 2.1.281, the host's version, on 24 September 2026 (a
#     measurement, message wyeoXtfY-6hT). In 2.1.278 `--model opus` resolved to claude-opus-5, so
#     sandboxed runs registered as Opus 5.5 ran on Opus 5, and `--model claude-opus-5-5` answered
#     "Claude Code 2.1.278 does not support this model; version 2.1.280 or newer is required".
#     CLAUDE CODE WAS RAISED TO 2.1.323, the host's version, on 20 November 2026. The API refuses
#     claude-fable-5-2 below 2.1.290, answering "Claude Code 2.1.281 does not support this model;
#     version 2.1.290 or newer is required".
#   - python3, minimal and with no pip: acceptance finding 3. tools/kit/send-message.py is a
#     Python script and needs an interpreter inside the sandbox to run at all.
#   - GTK 3, a D-Bus session bus and the virtual display, for the window.
#   - make, because `npm ci` runs node-gyp for better-sqlite3 although nothing is compiled (the layer before explains why).
#   - binutils, for `ar`, which writes the Linux installer's .deb (its layer, after make's, says why).
#   - tmux, for a terminal that outlives the command that opened it (its layer, after binutils', says why).
#   - No sudo, no docker group, no docker socket: the one user is uid 1000 and cannot become root.
#
# IMAGE SIZE. Piece P1's handback measured the image without python3 at 3.73 GB (docker images),
# with /ms-playwright at 656 MB and the four CLIs together at about 1.24 GB. Built from this file,
# with python3 added as its own layer on top of that same base (measured 22 September 2026, on a
# rebuild that reused every earlier layer's cache), `docker images` reports 3.78 GB: python3.12 and
# its standard-library package cost about 50 MB. Nothing here restates the old 3.73 GB figure as
# python3's own cost, and nothing here is a number nobody measured. The size with WebKit and Firefox
# is measured on the host when the image is built; this file gives no figure for it.
#
# Build it with the devcontainer CLI (`devcontainer build` or `devcontainer up`), which reads
# devcontainer.json beside this file; a plain `docker build sandboxes/mole-office-dev` works too.

FROM ubuntu:24.04 AS mole-office-dev

ARG NODE_VERSION=22.23.2
ARG PLAYWRIGHT_VERSION=1.62.1
ARG CODEX_VERSION=0.159.2
ARG OPENCODE_VERSION=1.18.31
ARG CLAUDE_CODE_VERSION=2.1.323
ARG DSH_VERSION=0.1.5-rc.2

LABEL mole-office.sandbox-template="mole-office-dev"

# WHERE THE BROWSERS ARE, for the installer below and for every Playwright that runs in here.
# DISABLE_AUTOUPDATER: claude would try to update itself into /usr/local, which uid 1000 cannot
# write; the version is this file's decision, not the program's.
ENV DEBIAN_FRONTEND=noninteractive \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    DISABLE_AUTOUPDATER=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ca-certificates curl xz-utils git ripgrep jq procps iproute2 less \
 && rm -rf /var/lib/apt/lists/*

# NODE, THE OFFICIAL BUILD, CHECKED AGAINST ITS PUBLISHED CHECKSUM.
RUN set -eu; \
    cd /tmp; \
    tarball="node-v${NODE_VERSION}-linux-x64.tar.xz"; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/${tarball}"; \
    curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"; \
    grep " ${tarball}\$" SHASUMS256.txt | sha256sum -c -; \
    tar -xJf "${tarball}" -C /usr/local --strip-components=1 --no-same-owner; \
    rm -f "${tarball}" SHASUMS256.txt; \
    test "$(node --version)" = "v${NODE_VERSION}"

# CHROMIUM AND WHAT IT NEEDS FROM THE SYSTEM (fonts included, CJK among them).
RUN npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps chromium \
 && chmod -R a+rX /ms-playwright \
 && rm -rf /root/.npm /var/lib/apt/lists/*

# THREE OF THE FOUR AGENT COMMAND LINES, installed by npm at their pinned versions. Each one is asked
# its version at the end, so a build that installed something else fails here rather than in a run.
RUN npm install -g \
      "@openai/codex@${CODEX_VERSION}" \
      "opencode-ai@${OPENCODE_VERSION}" \
      "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && npm cache clean --force \
 && rm -rf /root/.npm /root/.cache /root/.config /root/.local \
 && codex --version | grep -F "${CODEX_VERSION}" \
 && opencode --version | grep -F "${OPENCODE_VERSION}" \
 && claude --version | grep -F "${CLAUDE_CODE_VERSION}"

# DSH, FROM THE HOST'S OWN LOCKFILE (dsh/package-lock.json, copied from ~/.cache/mole-office/dsh/npm).
# Pinning only the dsh package to DSH_VERSION was not enough: its sub-packages are ranges, and on
# 22 September 2026 a fresh build resolved them to 0.1.5-rc.3, a tree with no dsh-sandbox-local that
# dsh 0.1.5-rc.2 cannot boot without (found on the first run of the GPU sandbox). `npm ci`
# installs exactly the host's tree, the one every sandbox and the host have run, and the build fails
# if the lockfile and package.json disagree.
COPY dsh/package.json dsh/package-lock.json /opt/dsh/
RUN cd /opt/dsh \
 && npm ci --omit=dev --no-audit --no-fund \
 && npm cache clean --force \
 && rm -rf /root/.npm /root/.cache \
 && ln -s /opt/dsh/node_modules/.bin/dsh /usr/local/bin/dsh \
 && dsh --version | grep -F "${DSH_VERSION}" \
 && test -d /opt/dsh/node_modules/@deepseek-ai/dsh-sandbox-local

# PYTHON3, MINIMAL, NO PIP: acceptance finding 3. tools/kit/send-message.py needs only the
# standard library (argparse, json, urllib), which the plain `python3` package carries; `python3-pip`
# and `python3-venv` are not installed, because nothing in this image installs a Python package.
# This is its own layer, after the other package installs, so adding it does not cost a rebuild of Node,
# Chromium or the four CLIs above — each is its own layer already, and only a changed layer reruns.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 \
 && rm -rf /var/lib/apt/lists/* \
 && python3 --version

# TZDATA, NAMED. The launcher starts every sandbox in the host's time zone (TZ=<the launcher's zone>, acceptance finding
# 62), and that needs the zone files in the image. Until 24 September 2026 they came only as a dependency of python3, so a
# change there would have taken them away, and every sandbox would have fallen back to UTC in silence (the inspector's
# second note on finding 62, carried by finding 64's entry). Its own layer, after python3's, so adding it reruns only
# this one; the package is already there, so the install changes nothing else.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && test -f /usr/share/zoneinfo/tzdata.zi

# THE WINDOW: GTK 3, A D-BUS SESSION BUS AND A VIRTUAL DISPLAY, for wave 13t's window tests (piece H0; message
# vpgPZ_p_2WgU). Each package was measured on 1 October 2026, in throwaway containers of this image with Electron
# 44.5.1 installed only inside them, every Electron run as uid 1000:
#   - libgtk-3-0t64 is Ubuntu 24.04's GTK 3 after the 64-bit time change. Without it Electron did not start
#     (libgtk-3.so.0 missing; every other library it links was there). With it, a window drew Latin and CJK text under
#     xvfb-run, was captured, and made a tray.
#   - dbus-daemon gives dbus-run-session, a session bus. Under it, Electron's D-Bus errors came down to the missing
#     system bus, which a container does not have.
#   - dbus-x11 meets the session bus GTK asks for through dconf. Left to apt, that is dbus-user-session, which brings
#     systemd in: 51 new packages, against 37 with dbus-x11 named (apt said 64.6 MB). The build checks that systemctl
#     stayed out.
#   - xvfb and xauth, the virtual display and its authority, were already here, but only as Playwright's dependencies.
#     They are named, as tzdata is above.
# No AppIndicator library: Electron's binary names none, its tray talks to org.kde.StatusNotifierWatcher over D-Bus, and
# with libayatana-appindicator3-1 installed it loaded nothing new. Electron itself is not in the image: it comes with
# the main checkout's node_modules, mounted read-only, when H0 lands. It runs here with --no-sandbox, because
# Chromium's SUID helper cannot work from a read-only node_modules that root does not own.
# EACH PROGRAM IS ASKED FOR ON ITS OWN: this image's sh is dash, whose `command -v a b` fails only when a is missing
# (measured the same day), so one `command -v` for three names would pass without the last two.
# Its own layer after TZDATA: adding it reruns only this layer and THE ONE USER, not Node, Chromium or the four command
# lines.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgtk-3-0t64 dbus-daemon dbus-x11 xvfb xauth \
 && rm -rf /var/lib/apt/lists/* \
 && ldconfig -p | grep -q 'libgtk-3\.so\.0' \
 && command -v dbus-run-session > /dev/null \
 && command -v xvfb-run > /dev/null \
 && command -v xauth > /dev/null \
 && ! command -v systemctl

# MAKE, FOR NPM'S OWN NODE-GYP STEP: wave 13j's fresh-clone check of the clean version (round 24, message 4zuePXlMy-g4)
# runs `npm ci` in a clone. npm installs from package-lock.json with each package described by its lock entry, and a lock
# entry does not carry `gypfile`, so npm runs `node-gyp rebuild` for a package that has a binding.gyp even when its own
# package.json says `"gypfile": false` (npm 10.9.8, @npmcli/arborist/lib/arborist/rebuild.js). better-sqlite3 13.0.3 is one.
# Its binding.gyp builds nothing when the package carries a ready-built binary for the platform, as it does for linux-x64,
# but node-gyp still needs python3 (installed above) to configure and make to run the empty build. It was measured on
# 2 October 2026 in throwaway containers of this image, with main's committed tree: without make, `npm ci` stopped with
# "not found: make"; with make alone it exited 0 and better-sqlite3 loaded its own linux-x64 binary, the same as with a
# whole compiler toolchain. No compiler is needed, so none is installed. npm_config_nodedir points node-gyp at this
# image's own Node headers, which the official tarball unpacked into /usr/local, so the step downloads none. Its own layer,
# after the others, so adding it reruns only this one.
RUN apt-get update \
 && apt-get install -y --no-install-recommends make \
 && rm -rf /var/lib/apt/lists/* \
 && make --version | head -n 1 \
 && test -f /usr/local/include/node/common.gypi
ENV npm_config_nodedir=/usr/local

# BINUTILS, FOR THE LINUX INSTALLER'S .DEB: scripts/package-linux.mjs builds it with electron-builder, which calls fpm,
# which writes the .deb with `ar`, and `ar` is binutils'. Wave 13t asked for it in its round 14 (message U2ZTeIqdPXYb,
# 4 October 2026): apt in a sandbox has no package lists, so it cannot be installed there, and round 13 built its .deb
# with a stand-in `ar` written outside the repository. The script refuses to run without `ar` ("Install binutils").
# binutils is the archiver, the assembler and the linker; no compiler comes with it, so the make layer's "no compiler"
# still holds. Its own layer, after the others, so adding it reruns only this one.
RUN apt-get update \
 && apt-get install -y --no-install-recommends binutils \
 && rm -rf /var/lib/apt/lists/* \
 && ar --version | head -n 1 \
 && ! command -v gcc

# TMUX, FOR A TERMINAL THAT OUTLIVES THE COMMAND THAT OPENED IT: wave 13u's round 10 asked for it (message
# 7WfPmUJvy_D5, 6 October 2026), for the press that brings an agent's session back in a terminal, which attaches to a
# tmux session in the sandbox. Ubuntu 24.04 gives 3.4, the version on the owner's computer. A run installed the same
# package into w13u's running container at 01:04 that day, for its round 11, and checked it there as the sandbox user;
# this layer is that install made part of the image, so a sandbox made again keeps it. Its own layer, after the others,
# so adding it reruns only this one.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tmux \
 && rm -rf /var/lib/apt/lists/* \
 && tmux -V | grep -F 'tmux 3.4'

# NOTO, FOR BOLD IN PICTURES: the app's font stack names Noto before its other CJK fallbacks.
# Install real regular and bold faces for Latin and Chinese; the app disables synthetic bold.
# Its own layer after Chromium and the other installs, so their large layers stay cached. Keep WenQuanYi.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      fonts-noto-core fonts-noto-cjk \
 && rm -rf /var/lib/apt/lists/*

# WEBKIT AND FIREFOX, WITH WHAT THEY NEED FROM THE SYSTEM, for tests that run a page in either of them.
# They go in the same folder as Chromium, installed by the same Playwright version, so their revisions
# are the ones that version names (node_modules/playwright-core/browsers.json).
# Its own layer after the Noto fonts, so adding it reruns only this layer and THE ONE USER, and every
# earlier layer stays cached.
RUN npx -y "playwright@${PLAYWRIGHT_VERSION}" install --with-deps webkit firefox \
 && chmod -R a+rX /ms-playwright \
 && rm -rf /root/.npm /var/lib/apt/lists/*

# THE ONE USER: uid and gid 1000, the host user's numbers, so files it writes in the instance folder
# belong to the owner and a signal from the host reaches its processes. Ubuntu's own `ubuntu` user
# holds 1000 in the base image and is removed first. Its home in /etc/passwd is /nonexistent on
# purpose: HOME is set by devcontainer.json to the instance's own folder, and a program that ignores
# HOME should fail rather than find somewhere to write.
RUN userdel --remove ubuntu \
 && groupadd --gid 1000 sandbox \
 && useradd --uid 1000 --gid 1000 --no-create-home --home-dir /nonexistent --shell /bin/bash sandbox \
 && ! command -v sudo

USER 1000:1000

# THE COMMAND THAT KEEPS THE CONTAINER RUNNING: sandboxes/mole-office-dev/keep-alive, a perl script (perl-base is part of
# every Ubuntu image). devcontainer.json asks for no docker init and keeps this command ("overrideCommand": false), so
# the devcontainer CLI's shell runs it by exec and it becomes the container's first process, pid 1 inside it. Work
# inside the container cannot end it with a signal, and it writes every signal it gets to the container's log. Its
# header says why: on 15 October 2026 a line sandbox ended with exit 0, most likely from a signal sent inside it. COPY
# makes the file root's, so uid 1000 cannot change it; it keeps the file's mode from the checkout, which is executable.
COPY keep-alive /usr/local/lib/mole-office/keep-alive
CMD ["/usr/local/lib/mole-office/keep-alive"]

# A TEMPLATE THAT BUILDS ON THIS IMAGE names the stage below as its build target, with two build arguments: its own name,
# for the label, and the apt packages it adds. One Dockerfile rather than a second, which would drift from this one
# (invariant 9; message u-m7uwp20rnM). With either argument empty the stage refuses to build, rather than make an image
# that says it is a template it is not.
FROM mole-office-dev AS with-extra-packages
ARG TEMPLATE_NAME
ARG EXTRA_APT_PACKAGES
LABEL mole-office.sandbox-template="${TEMPLATE_NAME}"
USER root
RUN test -n "${TEMPLATE_NAME}" \
 && test -n "${EXTRA_APT_PACKAGES}" \
 && apt-get update \
 && apt-get install -y --no-install-recommends ${EXTRA_APT_PACKAGES} \
 && rm -rf /var/lib/apt/lists/*
USER 1000:1000

# THIS TEMPLATE'S OWN IMAGE: the last stage, which is what a build that names no target makes (devcontainer.json beside
# this file names none, and neither does a plain `docker build`). It is the stage mole-office-dev as it stands, with no
# step added, so the stage above changes nothing of it: the first condition of that change, that with the new arguments unused
# the dev image comes out exactly as it did before them. BuildKit builds only the stages the target needs, so a dev
# build does not run the stage above at all.
FROM mole-office-dev
