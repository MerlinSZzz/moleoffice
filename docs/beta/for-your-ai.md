# Mole Office closed beta: a guide for the person's AI

**You are an AI assistant working in a terminal, and the person you work with asked you to read
this.** They probably said something like *"Read for-your-ai.md in my Downloads folder and set up
Mole Office with me."* This file tells you how to do that: what Mole Office is, how to install it,
how to lead the person through its first pages, how to connect yourself to it, and how to do one
small first piece of work in it together.

Read the whole file before you start. Then work through it with the person one step at a time.

## Rules for you, before anything else

1. **Talk to the person in the language they write to you in,** from the first word of every
   reply. Use plain words and short sentences. Say what you are about to do before you do it, and
   say what happened after. Page and button names below are given in English and in Chinese. Use
   the names in the language the person's office shows. If the person uses the office in another
   language, describe where a button is as well as its English name.
2. **Write records in the person's language too.** The titles and the text of every record you file
   are for the person to read, so write them in the language they write to you in. The office does
   not require English titles. Only the field names and fixed values, such as `kind`, `state` and
   `running`, stay as the office spells them.
3. **Never ask the person for a key.** Do not ask them to paste, type or read out a key, in this
   chat or on a command line. Never print a key. Never print your environment or any variable that
   may hold a key or a login, with env, printenv, set or echo. Never put a key on a command line, in
   a `.env` file or in a message. The registration tool writes your key to a file; read it from that
   file into a request header and nowhere else. Never print your key file, the `key.ask-secret` file
   beside it or your headers file, with `cat` or in any other way. Whatever you print goes into this
   chat. The registration tool and `curl` read these files themselves, and so does the helper that
   part 1 gives for Linux without curl. Never copy any of them out of your notes folder, not even
   to `/tmp`.
4. **Never open `keys.json` in the office's data folder.** It holds the person's own key.
5. **The person's presses are theirs.** Naming the office's owner, admitting an agent and deciding
   anything are presses the person makes in the Mole Office window. Never make one for them, and
   never send a request that does what one of those presses does. Ask the person to press, then
   wait.
6. **Never send a request in the person's name.** Every request you send says you are an agent.
7. **Never invent anything.** Do not make up the person's name, and do not take it from a folder
   name or a user name either. Once the person has typed it, `GET /api/onboarding` gives it under
   `owner`. Do not file example or made-up content as if it were real. If you do not know
   something, say that you do not know.
8. **Ask before you act.** Ask before you install anything, before anything that needs an
   administrator password, and before you change a file outside the folder you were started in.
9. **If a step fails, stop.** Tell the person what happened, in plain words. Do not quietly try a
   different method instead.

## What Mole Office is

You can tell the person this, in their language:

- Mole Office is a program on your own computer. It keeps a record of the work you do with AI
  agents.
- Your AI writes down what it did, what it found, what got in its way and what it needs you to
  decide. You read all of that in the Mole Office window.
- The records stay on your computer. A new conversation, or a different AI, can read them and carry
  on where the last one stopped.
- The AI proposes and you decide. Every decision is a press of yours in the window.
- After installation it answers only on this computer, at `http://127.0.0.1:8787`.

This is a closed beta. Some things are rough, and the person's feedback is wanted. Part 8 of this
file says how to send it.

## 1. Check the computer

The beta has installers for Linux and for Windows. It also has a disk image for Macs with Apple
silicon. Find out which system this is, then check:

- **Linux.** First run `command -v curl`. This guide sends its requests to the office with curl,
  and a fresh Ubuntu Desktop 24.04 does not have it. If the command prints nothing, curl is not
  there: go to *Linux without curl* at the end of this part, then come back. Then run `uname -m`
  and read `/etc/os-release`. The installer file names end with the processor they were built
  for, and that must match this computer. The installers were tested on Ubuntu 24.04 only. Other
  distributions may work; say so honestly if this is one of them.
- **Windows.** It must be 64-bit Windows. In PowerShell,
  `[Environment]::Is64BitOperatingSystem` answers `True`.
- **Mac.** Check this first. The Mac package is for Apple silicon (M1 and newer) only. Run
  `uname -m`: on Apple silicon it answers `arm64`. If it answers `x86_64`, run
  `sysctl -in hw.optional.arm64`. If that answers `1`, this is Apple silicon and the terminal runs
  under Rosetta, so the package fits this Mac. If it answers `0` or nothing, this is an Intel Mac.
  Then tell the person plainly that this beta has no package for an Intel Mac, and stop. Run
  `sw_vers -productVersion` too. The oldest macOS the package opens on is not known yet, so note
  the version for feedback.
- **Is Mole Office already here?** On Linux, look for `/opt/mole-office` and run
  `dpkg -s mole-office`. On Windows, the person may have chosen the folder at install (part 2), so
  ask Windows for it. In PowerShell,
  `Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' | Where-Object DisplayName -eq 'Mole Office' | Select-Object DisplayVersion, InstallLocation`
  prints the version installed and its folder. If it prints nothing, Mole Office is not installed
  for this account. On a Mac, look for `/Applications/Mole Office.app`. If it is already
  installed, do the port check below, then skip to part 3.
- **Is port 8787 free?** On Linux, `ss -ltnp | grep ':8787 '`. On Windows,
  `netstat -ano | findstr :8787`. On a Mac, `lsof -nP -iTCP:8787 -sTCP:LISTEN`. If another
  program holds it, tell the person which one. Do not stop it without asking.
- **If a Mole Office holds port 8787.** It may be one installed earlier, one running in another
  account on this computer, or one started from its source code. To tell, ask it:
  `curl -s http://127.0.0.1:8787/api/health`. A Mole Office answers with JSON that holds `world`
  and `path`. `world.repository` is the folder its program runs from. `path` is the file that
  holds its records. Tell the person what you found.
  - If Mole Office is already installed and `path` is inside this account's data folder (part 9
    names that folder for each system), this is the person's own office. If the person is not
    installing a newer package over it, leave it running and go to part 3. If they are, the person
    shuts it down first, as the next two points say.
  - In every other case, ask the person to shut it down before you install anything. They use its
    own menu: its icon in the notification area, or on a Mac in the menu bar, then **Shut down
    Mole Office** (中文: **关闭 Mole Office**). If its page asks a question first, the person
    answers it. If the icon is not there, they open that Mole Office and use the same menu. If it
    runs in another account on this computer, they shut it down in that account. If none of that
    works, ask the person how that office was started, and do not stop it yourself. The same holds
    when the person wants this beta installed over their own older one.
  - **Before a newer package is installed over an older one,** the person always shuts the older
    one down first. The reason is the program that keeps Mole Office's terminals running. A newer
    package does not use the one an older package started, and no terminal opens in the new office
    until that program has ended. From 0.1.0-beta.3 on, **Shut down Mole Office** ends that program
    too. On Linux and on a Mac it asks the program to end, and the program tells its terminals to
    end first. On Windows it ends the program at once, with every terminal in it. A package older
    than 0.1.0-beta.3 may leave that program running on every system. This package's **Shut down
    Mole Office** ends the older package's program too, in the same way, on Linux, on a Mac and on
    Windows. So after the install, once the new office has opened, ask the person to shut it down
    once in the same way and open it again. Tell them first that this also ends every terminal the
    older package left running. If a terminal still does not open in the new office after that,
    tell the person that it may not open until the computer is restarted.
  - Then check the port again, and go on only when it is free. While the older office holds the
    port, the new one cannot start there. When the records file, the folder and the port are the
    ones the new window expects, it compares that office's version with its own. If that office is
    older and says it is working, the window does not open it by itself. It says that the office is
    older, and offers **Restart the service** and **Open it anyway** (part 7). When they are not the
    ones it expects, it says that another Mole Office is answering, or that it cannot tell whether
    that one is its own, and does not open it.
  - If `path` was inside this account's data folder, the new office opens the same records. If it
    has to update them first, its page says **Mole Office needs to update its database** and offers
    **Back up and update**. That page is in English, also when the pages are in Chinese. That press
    is the person's. The window opens that page as it is, without pairing first. Once the update is
    done, the window pairs by itself and opens **Home**, with no **Pairing** page (part 3). This
    has been seen on a Mac. Part 2, *After an update*, says what the press does. If `path` was
    anywhere else, the new office starts with its own data folder, and the older records stay
    where they were. The new office does not open them.
  - **Not yet tried on a real machine:** this is traced to the program, but nobody has yet met an
    older office on port 8787 on a real computer, or shut one down in another account. If a step
    does not go as written, stop, tell the person, and send it as feedback (part 8).
- **Find the installer.** It is usually in the same folder as this file. This guide is for version
  0.1.0-beta.9. Linux has two, and each name ends with the processor it was built for. For a
  64-bit Intel or AMD processor, where `uname -m` answers `x86_64`, they are
  `mole-office-0.1.0-beta.9-amd64.deb` and `mole-office-0.1.0-beta.9-x86_64.AppImage`. Windows
  has one: `mole-office-0.1.0-beta.9-x64-setup.exe`. The Mac has one:
  `mole-office-0.1.0-beta.9-arm64.dmg`. If you cannot find it, ask the person where they saved it.
  - **The office map** is a choice, and part 2 says what it is. On Linux it is a file of its own,
    `mole-office-map-0.1.0-beta.9-amd64.deb`, which adds the map to the .deb. The AppImage has no
    map, and none can be added to it. On the Mac it is a second dmg,
    `mole-office-0.1.0-beta.9-arm64-with-the-map.dmg`, which is the same app with the map in it.
    On Windows it is a part of the one installer.

**Check the download.** The file `SHA256SUMS` sits beside the installers. It holds one line for each
package: a SHA-256 hash, then the file name. A SHA-256 hash is a long number made from the file, and
the number changes if the file changes. Check the file the person is about to install against its
line. On Linux, in a terminal in the folder, run `sha256sum -c --ignore-missing SHA256SUMS`;
`--ignore-missing` checks the files that are in the folder and passes over the lines of files that
are not, and every line it prints for this file ends with `OK` when the file matches. On the Mac, run
`shasum -a 256 "<the full path of the file>"`; its line prints the file's hash, and that hash must be
the same 64 letters and digits as the line for that file in `SHA256SUMS`. On Windows, in PowerShell
in the folder, run
`Get-FileHash -Algorithm SHA256 "<the full path of the file>"`; its `Hash` line must be the same 64
letters and digits as the line for that file in `SHA256SUMS`. PowerShell prints them in capitals. On
every system, if `SHA256SUMS` has no line for the file at all, stop and tell the person. If the hash
does not match its line, stop and tell the person: do not install that file, and help them send its
words as feedback (part 8).

**Linux without curl.** If `command -v curl` printed nothing, ask the person whether they have an
administrator password for this computer, the one `sudo` asks for.

- **They have one.** They will install the .deb in part 2. Tell them that curl is a small program
  that this guide uses to send its requests to the office, and ask whether they want it installed.
  If they do, ask them to run `sudo apt install curl` in their own terminal. They type their
  password there once, themselves, not into this chat. Then run `command -v curl` again, and go on
  only when it prints a path.
- **They have none.** They will use the AppImage in part 2, and you use the helper below in place
  of curl.

**The helper.** It is only for a computer that has no curl and no administrator password. It
needs only `python3`, which Ubuntu Desktop 24.04 installs. Choose your handle and your notes
folder now, as part 4 says, and ask the person before you make the folder. Then write the
helper into it once:

```
N="<notes folder>"
umask 077
cat > "$N/request.py" <<'EOF'
import sys, urllib.request, urllib.error, urllib.parse
args, headers, method, body, url = sys.argv[1:], {}, None, None, None
while args:
    word = args.pop(0)
    if word == '-H' and args:
        h = args.pop(0)
        for line in open(h[1:]).read().splitlines() if h.startswith('@') else [h]:
            if line.strip():
                name, value = line.split(':', 1)
                headers[name.strip()] = value.strip()
    elif word == '-X' and args:
        method = args.pop(0)
    elif word == '--data-binary' and args[:1] == ['@-']:
        args.pop(0)
        body = sys.stdin.buffer.read()
    elif word.startswith('http') and url is None:
        try:
            part = urllib.parse.urlsplit(word)
            where = (part.scheme, part.hostname, part.username, part.password)
        except ValueError:
            where = None
        if where != ('http', '127.0.0.1', None, None):
            sys.exit('request.py: this helper sends only to http://127.0.0.1 with no name or password in the address, so it does not take ' + word)
        url = word
    else:
        sys.exit('request.py: this helper does not take ' + word)
if url is None:
    sys.exit('request.py: no address')
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *ignored):
        return None
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect)
try:
    with opener.open(urllib.request.Request(url, body, headers, method=method)) as reply:
        sys.stdout.buffer.write(reply.read())
except urllib.error.HTTPError as reply:
    sys.stdout.buffer.write(reply.read())
    sys.exit('\nrequest.py: HTTP %d' % reply.code)
except urllib.error.URLError as failure:
    sys.exit('request.py: no answer: %s' % failure.reason)
EOF
```

From then on, wherever this guide writes `curl -s`, write `python3 "<notes folder>/request.py"`
and keep the rest of the line. The helper takes curl's `-H 'name: value'`, `-H @<file>`, `-X`
and `--data-binary @-`, and an address on `http://127.0.0.1`, and refuses anything else. It
reads the headers file itself, prints only the office's reply, goes through no proxy and follows
no redirect. When the office answers with an error, the helper prints the reply, then a line with
the status, such as `request.py: HTTP 409`, and ends with a failure. The office's skill (part 4)
also shows curl lines, some with `-sS` or `-d`. Write those with the helper too: leave out `-sS`,
and send a `-d` body on standard input with `--data-binary @-`.

## 2. Install

**The office map is a choice at install.** Each system below has a step that asks the person
whether they want it. Tell them what it is, in their language:

- The office map is a page that draws the office's people, agents and work as a map.
- It only reads the office. It changes nothing.
- It is off until the person switches it on: in **Settings**, under **Tools**, in **Plugins**
  (中文: **设置**, **工具**, **插件**), with the switch beside **Office Map** (中文: **办公地图**).
  Once it is on, **Office Map** is in the menu.
- They can add it later, or remove it alone. Each system below says how.

Every step about the office map in this part and in part 9 is **not yet tried on a real machine.**
Each is traced to the program that makes the installers, but nobody has yet installed, updated or
removed the map on a real computer. If one does not go as written, stop, tell the person, and send
it as feedback (part 8).

### Linux, the .deb (recommended on Ubuntu and Debian)

The .deb installs Mole Office into `/opt/mole-office` and adds **Mole Office** to the app menu.
It needs the person's administrator password once.

1. Ask the person whether they want to install it now.
2. Ask the person whether they want the office map (above). It is the file
   `mole-office-map-<version>-amd64.deb`, and it must be the same version as the .deb. **Not yet
   tried on a real machine.**
3. Install with the system's own password window:
   `pkexec apt-get install -y "<the full path of the .deb>"`. The person types their password into
   the system's window, not into this chat. With the map, name both files in the same command:
   `pkexec apt-get install -y "<the full path of the .deb>" "<the full path of the map's .deb>"`.
4. If that window does not appear, ask the person to run this in their own terminal, where they
   type their password themselves: `sudo apt install "<the full path of the .deb>"`, with the
   map's .deb after it if they want the map. Or they can open the .deb file from their file
   manager, if their system offers to install it.
5. Check: `/opt/mole-office/mole-office` exists. With the map,
   `/opt/mole-office/resources/office/plugins/office-map/plugin.json` exists too.

**The map later, on Linux.** Install the map's .deb of the same version as the office:
`pkexec apt-get install -y "<the full path of the map's .deb>"`. A map's .deb of another version
is refused, because it needs the office at exactly its own version. **Not yet tried on a real
machine.**

**An update on Linux, with the map.** Name both new .debs in one command:
`pkexec apt-get install -y "<the full path of the new .deb>" "<the full path of the new map's .deb>"`.
The map needs the office at exactly its own version. So installing the office's new .deb alone
removes the map, and with `-y` that happens without a question. **Not yet tried on a real
machine.**

**What an update on Linux stops.** Before the .deb changes any file, it stops every Mole Office
running from `/opt/mole-office`, for every user of the computer. It first asks each office to shut
down with its own command, as **Shut down Mole Office** does. Then it ends whatever still runs from
that folder, such as a Mole Office window. Every terminal Mole Office held ends too, so tell the
person before the update that their agents' terminals will close. The command's output names each
user whose Mole Office was stopped, in lines that begin `Mole Office:`. Tell the person what those
lines say. It does not start Mole Office again: when the command has finished, the person opens
**Mole Office** from the app menu. The window may then open on the page *After an update* below
describes. If the person shut Mole Office down first (part 1), nothing is running, and the output
says nothing about a stop. **Not yet tried on a real machine.**

**If an office does not stop, nothing is installed.** The command then fails. Its output says, in
lines that begin `Mole Office:`, which user's office did not stop and which process it is. Read
those lines to the person. That user shuts that office down with **Shut down Mole Office**, as
part 1 says. Then run the same command again. Do not stop that office yourself. **Not yet tried
on a real machine.**

### Linux, the AppImage (when there is no administrator password, or on another distribution)

The AppImage is one file that runs without being installed. It has no office map, and none can be
added to it. A person who wants the map needs the .deb.

1. Make it runnable: `chmod +x "<the full path of the .AppImage>"`.
2. Run it, or ask the person to double-click it.
3. If it ends straight away with a message about FUSE, either install FUSE with the person's
   password (`sudo apt install fuse3`, typed by the person in their own terminal), or unpack it into
   a folder of the person's own, never the shared /tmp:
   `mkdir -m 700 -p ~/.cache/mole-office-appimage && TMPDIR=~/.cache/mole-office-appimage APPIMAGE_EXTRACT_AND_RUN=1 "<the full path of the .AppImage>"`.
   Use the same TMPDIR every time you start it this way. That unpacks it to a folder in
   `~/.cache/mole-office-appimage` named `appimage_extracted_` and a string of letters and digits,
   and runs it from there. The folder holds about 620 MB and stays after the office ends. The next
   start uses it again. A new version of the AppImage unpacks to a new folder, and the old one stays
   until the person deletes it. If `/dev/fuse` does not exist, as in some containers, installing
   `fuse3` does not help, and the second way is the one that works.
4. On some systems, Ubuntu 24.04 among them, the window first shows a warning about its sandbox,
   with a button **Open Mole Office** (中文: **打开 Mole Office**). That is expected. Ask the
   person to read the warning and press the button.

### Windows

The installer needs no administrator rights. On a first install it shows a page that asks for
the folder to install into, then a page that asks where its data goes. The folder it offers is
`%LOCALAPPDATA%\Programs\mole-office`. An update shows neither page. That is by design: it installs
into the folder already in use.

1. Ask the person to double-click the installer.
2. The installer is not signed yet, so Windows may warn about it. The words come from Windows, not
   from Mole Office, and may differ by version and language. In English the warning is usually
   "Windows protected your PC": the person presses "More info", then "Run anyway". Their browser
   may also warn when the file is downloaded.
3. On a first install, the folder page opens. Its words and buttons come from the program the
   installer is made with, not from Mole Office, so this guide does not quote them. Tell the person
   that the folder offered is fine. Another folder must be empty or not yet exist, and it must be
   outside the office's data folder, `%APPDATA%\mole-office`. The installer refuses two kinds of
   folder, and says why in English only:
   - The office's data folder, and every folder inside it, because an update or an uninstall
     removes the whole install folder, and the office's records would go with it. The installer
     says: "Mole Office cannot install into <the folder>, because Mole Office keeps its data in
     <the data folder>, and an update or an uninstall removes the whole install folder. Choose a
     folder outside <the data folder>." It names the data folder in full, with `%APPDATA%`
     written out.
   - A folder that already holds other files. The installer says: "Mole Office cannot install into
     <the folder> because it already holds other files. Choose an empty folder or a new one."

   The person closes the message, and the folder page stays open for another choice.
4. On a first install, the next page asks for the data folder. It says: "Mole Office keeps its data
   in one folder: the database, its backups, and the files people attach. Choose that folder. You
   can move it later, in Settings, under What the office keeps." Below that it says: "The folder
   offered is the usual one." Tell the person that the folder offered is fine, unless they want to
   keep their data somewhere else. The installer refuses a folder it cannot use, says why, and
   keeps the page open for another choice.
5. A later page lists the parts to install, with one box: **Office map**. Ask the person whether
   they want the office map (above). If they do, they tick the box. On a first install it is not
   ticked. The page's words are in English only. Above the box it says: "The office map draws the
   office's people, agents and work as a map, and changes nothing. It is off until it is switched
   on: open Settings, then Tools, then Plugins." Beside the box it says: "Tick it to install the
   office map. Unticked, a map installed before is removed." **Not yet tried on a real machine.**
6. The installer unpacks, adds **Mole Office** to the Start menu and the Desktop, and opens the
   window itself when it has finished.
7. If Mole Office was already running, the installer asks it to stop first. If it cannot stop, the
   installer says so and asks the person to shut it down from its icon in the notification area,
   then run the installer again.

**An update on Windows.** The person runs the newer installer in the same way. It skips both pages
and installs into the folder already in use. The **Office map** box comes ticked when
the map is installed, and unticked when it is not. Leaving it ticked keeps the map. **Not yet
tried on a real machine.** **To move Mole Office to another folder,** uninstall it first (part 9),
then install it again and choose the folder. Uninstalling keeps all of the office's data, so the
new install opens the same records.

**The map later, on Windows.** The person runs the same installer again and ticks **Office map**.
To remove the map alone, they run it again and untick the box. **Not yet tried on a real
machine.**

### Mac

The .dmg is a disk image. It holds **Mole Office** and a link to the **Applications** folder.
Apple has notarised both the disk image and the app.

There are two dmgs. `mole-office-<version>-arm64.dmg` holds the app without the office map, and
`mole-office-<version>-arm64-with-the-map.dmg` holds the same app with the map in it. Ask the
person whether they want the office map (above), and use the dmg with the map if they do. The
steps are the same for both. **Not yet tried on a real machine.**

1. Ask the person to double-click the .dmg. A window opens with **Mole Office** and
   **Applications** in it.
2. Ask them to drag **Mole Office** onto **Applications**. If macOS asks for an administrator's
   password to do it, the person types it into macOS's own window, not into this chat.
3. Check: `/Applications/Mole Office.app` exists. Then the person can eject the disk image in
   Finder.
4. Ask the person to open **Mole Office** from **Applications**, not from the disk image. Because
   Apple has notarised it, the first open needs no right-click and no change in System Settings.
   macOS may still ask once whether to open an app downloaded from the internet. The words come
   from macOS, not from Mole Office, and may differ by version and language. If it asks, the person
   reads the question and opens it.
5. If macOS refuses to open it, stop. Do not get round the refusal in System Settings or on the
   command line. Write down macOS's own words and help the person send them as feedback (part 8).

**The map later, on the Mac.** In the menu-bar menu, the person presses **Shut down Mole
Office**. Then they install the dmg with the map, of the same version, over the app: they drag
**Mole Office** onto **Applications** and let macOS replace the app that is there. To remove the
map alone, they do the same with the dmg without the map. **An update on the Mac** is the same:
the dmg with the map again, if they want to keep the map. **Not yet tried on a real machine.**

### After an update: Back up and update

This step comes after any install of a newer version over an older one, on every system. A newer
version may first have to bring the person's records up to date. It never does that by itself.
The window opens instead on a page titled **Mole Office needs to update its database**, with a
button, **Back up and update**. The page is in English only, also when the pages are in Chinese.
Under **What has changed** it says "Nothing yet": nothing is written until the person presses.

1. Tell the person to read the page and press **Back up and update**. The press is theirs. Never
   send it yourself.
2. The press makes a backup first, and checks it. The backup is a file named
   `mole-office-<date>-<time>-before-the-update.db`, in the `backups` folder beside the records:
   `~/.config/mole-office/data/backups` on Linux, `%APPDATA%\mole-office\data\backups` on Windows,
   and `~/Library/Application Support/mole-office/data/backups` on a Mac. The page names that
   folder too. Mole Office never deletes this backup.
3. Then it brings the records up to date and checks them against the backup.
4. The page then says **The database is up to date** and **Mole Office is opening…**, and shows
   where the backup is. It opens the office as soon as the office answers, and the window shows
   **Home**.
5. If the page says **The update did not finish**, stop, and do not press again. Read the page's
   words to the person, and help them send those words as feedback (part 8). The page says whether
   the records file is as it was, and whether a backup was made and where.

## 3. Start the office and lead the person through its first pages

**Starting.** Ask the person to open **Mole Office** from the app menu (Linux) or from the Start
menu or the Desktop (Windows). On a Mac, they open it from **Applications**. On Windows the
installer has already opened it. The window checks whether the office is answering and starts it
if not. It shows **Starting Mole Office.** (中文: **正在启动 Mole Office。**) while it does.
On Windows, the window may say instead that it is waiting for the operating system, and ask again
by itself. If it then says **Mole Office did not open**, see part 7.

Check that the office answers:

```
curl -s -H 'x-mole-office-actor-type: agent' -H 'x-mole-office-actor-id: <your handle>' http://127.0.0.1:8787/api/health
```

Choose your handle now (see part 4) so you can send it from the first request.

**Start a conversation only once the office answers.** Once the session hook's lines are in place
(part 6), the hook files a record for a conversation when the conversation starts, and only if the
office answers at that moment. A conversation that started before the office answered begins with
a line saying `Mole Office did not answer`, and nothing files its record later. The office then
cannot see its heartbeat (part 4). So tell the person: whenever the office was not running, for
example after the computer was switched on, open **Mole Office** first, and start Claude Code only
once its window shows the office's pages rather than **Starting Mole Office.** If your
conversation begins with `Mole Office did not answer`, run the check above. Once it answers, ask
the person to end the conversation and start it again, as *Attach your heartbeat* in part 4,
step 2, says.

In a new office, `records` in that reply is not 0. The office files records of its own at its first
start: its rules, the words of its role cards, and the runs of its own programs, such as **The API
server**. None of them is the person's, and none is example data.

**The Welcome page.** The first page is titled **Welcome to Mole Office** (中文: **欢迎使用
Mole Office**). Lead the person through it, from the top:

1. **Language** (中文: **语言**), above the title. The person chooses the language the pages use.
   It can be changed later in **Settings** (中文: **设置**).
2. **Your name** (中文: **你的名字**), below the title. The field starts filled with a placeholder,
   not a name. The person types their own name over it. Do not suggest a name, and never fill it in
   for them.
3. The person presses **Open my office** (中文: **打开我的办公室**).

**Pairing.** After **Open my office**, the window opens **Home** (中文: **主页**). Pairing lets a
window act as the person. Each time the window opens the office's pages, it first pairs itself with
the office if it is not yet paired. So the person never sees a pairing page in the window, and
presses nothing for it. If the office refuses, the window does not open the office. It says **The
office answered, but it did not pair this window, so the window has not opened it.** Then it gives
the office's reason after **The reason given:**. In Chinese the window says
**办公室有回应，但它没有和这个窗口配对，所以窗口没有打开它。** and **给出的原因：**. The reason
is in English, also when the pages are in Chinese. The only button is **Check again** (中文:
**再检查一次**), which pairs again. If the window gets no answer from the office, it says instead
**The window could not reach the office to pair with it, so it has not opened the office.**
(中文: **窗口没能连上办公室来和它配对，所以窗口没有打开办公室。**), and gives its own error. In
either case, read the reason to the person and ask them to press **Check again**. If the same words
come back, send them as feedback (part 8).

A web browser that is not yet paired still shows a page titled **Pairing** (中文: **配对**). It
offers **Pair this browser** (中文: **配对这个浏览器**). There is nothing to type. On Linux,
pressing it lets that browser act as the person from then on. Then **Go to Mole Office**
(中文: **进入 Mole Office**) opens **Home**.

On a Mac, the person presses **Open my office** in the Mole Office window, and it opens **Home**
at once, as on other systems. The window already acts as the person, so their other presses, such
as **Admit it** in part 4, work from it too. On a Mac and on Windows, a web browser on the same
computer cannot pair and cannot make the person's presses: there Mole Office counts only its own
window as the person, and refuses every other program. Such a browser is shown **Pair this
browser**, and the press is refused.

**The walk-through.** In a new office, a short walk-through opens on top of **Home** at once. The
rest of the page is greyed, and a press on the grey does nothing. Its words are in English, also
when the pages are in Chinese, because they are not yet written in Chinese. Finish it with the
person before part 4: while it shows, they cannot press anything else on the page.

1. A box beside the round chat button at the bottom right says **This is the chat**: "Your agents
   write to you here, and you answer them here. No buttons need pressing." The person may press
   the chat button to look, and press it again to close the chat. Tell the person that this is
   where you, and the agents they connect later, will write to them, and where they answer. Then
   they press **Next**.
2. The box moves to the checklist button at the top right, which glows. The box says **This is
   your checklist**: "Open it, then press the name of the report in it. The report shows where the
   Embassy is and how you let an agent in." Tell the person to press the checklist button. A panel
   opens, titled **My checklists** (中文: **我的清单**). It holds one list, **Getting started**,
   with one item: "Read this report: Getting started: where the Embassy is, and how you let an
   agent in. It shows where the Embassy is and how you let an agent in." The report's name in that
   item is a link. Tell the person to press it. If the checklist had been switched off on this
   computer, the box also says that it is on now, and that the **Checklists** page (中文: **清单**)
   can switch it off again.
3. The report opens, and the walk-through ends. Its title is **Getting started: where the Embassy
   is, and how you let an agent in**. The office filed it when the person gave their name. In an
   office in Chinese it is in English too, because it is not yet written in Chinese, and nothing in
   it says so: it starts at **Welcome**. It has four parts: **Welcome**, with the person's name;
   **Where the Embassy is**, with a picture of the menu; **How you let an agent in**, with a
   picture of an agent asking at the Embassy and its **Admit it** and **Refuse it** buttons; and
   **This report stays on your checklist**. Each picture is of a made-up office, and its caption
   says so. Tell the person that the report shows what part 4 needs: where an agent asks to come
   in, and how they let it in.

**Leaving the walk-through, and finding it again.** The walk-through has no button that closes or
skips it. It ends only when the person presses the report's name in the checklist. Until then it
shows again after a reload, and each time the window opens. If the office could not write down
that the report was opened, a note says so and offers **Close**, and the steps show again next
time. Once it has ended, it does not show again, and nothing starts it again. The report stays. It
is in the checklist at the top right of every page, until the person asks an agent to take it off.
It is on **Home** under **Reports** (中文: **报告**), and on the **Reports** page in the menu.

An office whose person gave their name before 0.1.0-beta.3 has no walk-through and no
getting-started report.

**Home.** Once the walk-through has ended, show the person around in a few words. The left column
is the menu. The pages they will use first:

| English | 中文 | What it shows |
|---|---|---|
| Home | 主页 | What needs the person, and the agents at work |
| Decisions | 提议与决定 | The questions agents have put to the person |
| Reports | 报告 | What agents have written for the person to read |
| Agents at work | 在岗智能体 | The agents and their runs |
| All records | 全部记录 | Every record in the project |
| Embassy | 大使馆 | Agents asking to come in, and visitors |
| Settings | 设置 | Language and other choices, one category at a time |

On **Home**, the section **Needs you** (中文: **需要你**) lists what is waiting for the person's
press, and the section **Agents at work** (中文: **在岗智能体**) lists the agents working now.
**Office Map** (中文: **办公地图**), which draws the office as a map, is a plugin, and it is
installed only if the person chose it in part 2. If they did, **Settings**, under **Tools**, in
**Plugins** (中文: **设置**, **工具**, **插件**) lists it, switched off. Once the person switches it
on there, it is in the menu. If they did not, that page says there is no plugin to switch, and
part 2 says how to add the map later.

## 4. Connect yourself to the office

You connect once. After that every conversation uses the same handle and key.

**Choose a handle and a name.** A handle is your short address: lowercase letters, digits and
dashes, 2 to 40 characters, starting and ending with a letter or a digit. `mole-office` is taken by
the office itself. Do not choose `claude-code`: session hooks installed by earlier versions write
under that name, and the office lets it write without registering. Choose something the person
will recognise, for example `claude-laptop`, and tell the person what you chose. Your name is what
the person reads, for example "Claude Code on this laptop".

**Find the office's agent tools and its skill.** Ask:

```
curl -s -H 'x-mole-office-actor-type: agent' -H 'x-mole-office-actor-id: <your handle>' http://127.0.0.1:8787/api/onboarding
```

The reply's `forAgents` names a folder and a Node program. The folder holds the registration tool,
`register-myself.mjs`. Use the Node it names; the person does not need Node installed. The office's
skill is in the folder beside `for-agents`, at `.claude/skills/mole-office/SKILL.md`, with
`reference.md` next to it. **Read SKILL.md now.** It is the office's own instructions for agents,
and it says more than this file does. Where the two differ, SKILL.md and the running office win.

On Linux, `forAgents.environment` also says `ELECTRON_RUN_AS_NODE=1`. The Node named there is the
app's own program, and that program opens the app instead of running a tool unless the variable is
set. So on Linux put `ELECTRON_RUN_AS_NODE=1` before `"<node>"` in each command below. On Windows
and the Mac, `environment` is empty.

When installed from the .deb, the office's folder is `/opt/mole-office/resources/office`. On
Windows it is `resources\office` in the folder the person installed into, by default
`%LOCALAPPDATA%\Programs\mole-office\resources\office`. On a Mac it is
`/Applications/Mole Office.app/Contents/Resources/office`. When run from the AppImage it
is inside a folder of the AppImage's own. With FUSE, that folder is new at every start. With
`APPIMAGE_EXTRACT_AND_RUN=1`, it stays the same until the AppImage is replaced by another version.
Either way, always read it from `/api/onboarding` rather than writing it down. On a Mac, if
`/api/onboarding` names a folder that is not inside `/Applications/Mole Office.app`, Mole Office is
not running from Applications, for example because it was opened from the disk image. Ask the
person to shut it down from its menu, check that it is in Applications, and open it from there.

**Choose a notes folder** for your key. It should be a folder only the person's account can read,
outside every project and every git repository: for example `~/.mole-office-agent/<your handle>` on
Linux, or `%USERPROFILE%\.mole-office-agent\<your handle>` on Windows. On a Mac it is
`~/.mole-office-agent/<your handle>`, as on Linux. Tell the person which folder you chose, and ask
before you make it. Do not create the key file yourself; the tool refuses a file that already
exists. On Linux without curl, you made this folder in part 1 for the helper. Use that one.

**Register.** Run the tool with the Node from `/api/onboarding`:

```
"<node>" "<for-agents folder>/register-myself.mjs" --api http://127.0.0.1:8787 --handle <your handle> --name "<your name>" --dir "<the folder you started in>" --start-folder "<the folder you started in>" --key-file "<notes folder>/key"
```

`--start-folder` lets the office's session hook tell, in a later conversation started in that
folder, that it is you (part 6). It must be a full path, and it may not be `/`, a whole drive such
as `C:\`, or the home folder itself. On Windows, give a path that begins with a drive letter, such
as `C:\Users\<you>\work`. On Linux and the Mac, give one that begins with `/`, such as
`/home/<you>/work` or `/Users/<you>/work`. If you were started in the home folder, leave
`--start-folder` out. On Windows, also leave it out if you were started in a network folder, one
whose path begins with `\\`: the tool and the office both refuse such a path.

The first time, it answers `202 Accepted`. That means you are waiting for the person. It writes a
one-time secret beside the key file, as `key.ask-secret`, and prints no key. Never open, print or
copy that file. The tool reads it when you run the same command again, and deletes it once the key
is written.

**Ask the person to admit you.** On **Home**, under **Needs you** (中文: **需要你**), there is now
a row titled "<your handle> registers itself", marked **Admit it** (中文: **允许入场**). The
office writes that title in English, whatever language the pages use. The person presses the row.
The page that opens has the button **Admit it** (中文: **允许入场**). The same request is also on
the **Embassy** page (中文: **大使馆**). The person presses **Admit it**. Wait until they tell you
they have.

**Run the same command again.** Now it answers `200 OK` and says the key is written to your key
file. It prints the headers to send on every request: `x-mole-office-workspace`,
`x-mole-office-actor-type`, `x-mole-office-actor-id` and `x-mole-office-session`. If it says you
are still waiting, the person has not pressed yet.

**Note your session record.** Registering also filed a session record for this conversation. The
tool's reply names it on the line that starts `session:`. You will send that id as
`x-mole-office-session`.

**Make a headers file** in your notes folder, so the key never appears on a command line. In bash
(on a Mac, also in zsh; on Windows, Git Bash):

```
N="<notes folder>"
umask 077
{
  printf 'x-mole-office-workspace: %s\n' '<the workspace the tool printed>'
  printf 'x-mole-office-actor-type: agent\n'
  printf 'x-mole-office-actor-id: %s\n' '<your handle>'
  printf 'x-mole-office-session: %s\n' '<your session record id>'
  printf 'x-mole-office-key: %s\n' "$(< "$N/key")"
} > "$N/headers"
```

On Windows without Git Bash, write the same file in PowerShell instead. It writes the same lines,
reads the key from the key file, and prints nothing:

```
$N = "<notes folder>"
@(
  "x-mole-office-workspace: <the workspace the tool printed>"
  "x-mole-office-actor-type: agent"
  "x-mole-office-actor-id: <your handle>"
  "x-mole-office-session: <your session record id>"
  "x-mole-office-key: " + (Get-Content "$N\key" -TotalCount 1)
) | Set-Content -Encoding ascii "$N\headers"
```

**Check that the office knows your key.** Do this now, and each time you write the headers file
again. Ask `GET /api/restore` with the headers file. It answers about the agent whose key the
request carries, and it never shows the key. In bash:

```
curl -s -H @"$N/headers" http://127.0.0.1:8787/api/restore
```

On Linux without curl, start the line with `python3 "$N/request.py"` in place of `curl -s`. In
PowerShell, a refusal appears as an error, and the office's reply is in its message. Read the
headers file into a table of headers, `$h`, then ask:

```
$h = @{}; Get-Content "$N\headers" | ForEach-Object { $k, $v = $_ -split ': ', 2; $h[$k] = $v }
(Invoke-RestMethod -Uri http://127.0.0.1:8787/api/restore -Headers $h).agent.handle
```

When the key works, the reply begins `{"agent":{"kind":"agent",` and its `handle` is your handle.
In PowerShell, the second line prints only your handle. Any other reply is a refusal that says
why. `no record of giving the key` means the key line is wrong: the office does not know that key.
`Nobody holds this key` means the office gave that key and has since taken it back. `the request
named none` means the file has no key line. Then write the headers file again from the key file,
as above, and ask again. If it still fails, stop. Tell the person what the reply said, and send it
as feedback (part 8). Do not go on with a key that fails this check. The office refuses every
request whose key it does not know, and does nothing. But while it still accepts a name sent with
no key, as a new office does, a write from a headers file with no key line is accepted as yours.
Then the replies to your other requests do not show that the key line is missing.

Then send every request with it. Send a JSON body on standard input, so that no body file is
written anywhere:

```
curl -s -H @"$N/headers" http://127.0.0.1:8787/api/project/bootstrap
curl -s -H @"$N/headers" -H 'content-type: application/json' --data-binary @- http://127.0.0.1:8787/api/records <<'EOF'
{ "kind": "task", "title": "…", "data": { "state": "todo" } }
EOF
```

On Linux without curl, these two lines start with `python3 "$N/request.py"` in place of
`curl -s`, as part 1 says.

**Never copy the headers file.** It holds your key. When a line in it must change, write the file
again in the notes folder, with `umask 077`, as above. On Windows without Git Bash, run the
PowerShell lines again.

In PowerShell, send every request with the table `$h`, read from the headers file as in the check
above. Read it again each time you write the file again:

```
Invoke-RestMethod -Uri http://127.0.0.1:8787/api/project/bootstrap -Headers $h
```

If you need a file after all, for a body or a reply you want to keep, put it in your notes folder,
never in `/tmp`. Never put the key in one.

**Choose a project.** Ask the person, in their language: **Would you like to start a new project,
or bring an existing project into Mole Office?** Wait for their answer.

- **A new project.** Ask what they want to call it. Send `POST /api/workspaces` with
  `{"id":"<short id>","title":"<the name>"}`. The id starts with a lowercase letter or digit and
  uses only lowercase letters, digits, hyphens and underscores, up to 40 characters. Tell the person
  the name of the project you made.
- **An existing project.** Ask where its folder lives and what the person calls it. This beta does
  not import a folder's contents into Mole Office. You can create an empty Mole Office project and
  register the existing folder as its repository: the files stay where they are, and nothing is
  copied or moved. Ask the person whether they want that, and wait for their yes. If they do, create
  the project as above, rewrite the headers file with its id and without `x-mole-office-session` as
  below, then send `POST /api/implementation/repositories` with
  `{"name":"<the name>","root":"<the folder's full path>"}`. This registers the folder but does
  not scan it. If they do not want it, use the project your requests already name, as under
  **Neither for now**.

  Another project may already have a work area at your start folder. If the existing folder is
  that start folder, or contains it, the two projects can both match a later conversation there.
  When their deepest matches are tied, the hook cannot choose and falls
  back to its default. Use the environment setting in the next step for that conversation and for
  later ones unless a folder match is shown to choose the intended project, as part 6 explains.
- **Neither for now.** Use the project your requests already name. `GET /api/workspaces` gives
  `current.id` and the list of projects with their titles. Tell the person its title and go on.

Remember the chosen project's id and title. For a project you created, rewrite the headers file as
above with its id in `x-mole-office-workspace`, and leave out `x-mole-office-session`: the record
that registration filed for this conversation is still in the original project. Requests in the
new project cannot name that run. Your registration and handle remain the same; do not register
again. Ask the person to choose the new project in the window too, with **Switch** (中文: **换项目**)
in the left column. If it is not in the list, ask them to reload the window first.

The first conversation's registration record remains in its original project. Since the first task
will be done in the next conversation, leave that record running when this conversation ends; the
ending instructions in part 6 explain why.

**Attach your heartbeat.** Do this now, before part 5. Your heartbeat is the office's tool
`hold-the-handle.mjs`, in the same `for-agents` folder. While it runs, it holds your handle for one
conversation and tells the office every 20 seconds that you are there. A message to you then comes
to that conversation: the tool prints the message and ends, and its end is what wakes you. Without
a heartbeat, the office cannot reach you, and a message to you waits in the chat.

The office counts a heartbeat only for a conversation that the session hook filed and has stamped.
The hook stamps a conversation's record at the end of each turn. It cannot do that for this
conversation, which started before the office answered and before the hook's lines were in place.
So the heartbeat goes in a new conversation, in this order:

1. **The hook's lines.** Ask the person to put them in place now: the press **Put the entry in
   place**, or on a Mac the three hook lines by hand. Part 6 says how, under *So that every
   conversation knows about Mole Office*. If the person does not want them, tell them that, without
   a heartbeat, the chat will say it cannot reach you. Still start the new conversation in step 2,
   file its record yourself as in part 6, and go on to part 5 without steps 4 to 6.
2. **A new conversation.** Check that the office answers (part 3). Then ask the person to end this
   conversation and start a new Claude Code conversation in the folder you started in. In the
   terminal, `/exit` ends this one. Do not use `--continue`: it resumes this conversation and its
   existing record. Give the new conversation this guide and the chosen project's id and title, and
   ask it to continue at step 3 here, using the same handle and notes folder.
   To put its new record in that project, ask the person to start it with the project id in its
   environment. In bash, zsh or Git Bash, from that folder:

   ```
   MOLE_OFFICE_WORKSPACE="<chosen project id>" claude
   ```

   In Windows PowerShell, from that folder, use this instead; it restores the terminal's previous
   setting after Claude Code ends:

   ```
   $oldProject = $env:MOLE_OFFICE_WORKSPACE
   try { $env:MOLE_OFFICE_WORKSPACE = "<chosen project id>"; claude }
   finally { $env:MOLE_OFFICE_WORKSPACE = $oldProject }
   ```

   The hook reads that environment setting before a `.env` file, a folder match or its own default.
   It applies to the new Claude Code process and its children; it does not edit the person's files
   or move the registration. Use the same way for the chosen project even for **Neither for now**.

   **The compaction window.** Before the person starts the new conversation, ask whether you may
   set Claude Code's compaction window to 500,000 tokens, and say what that does. Claude Code then
   compacts a long conversation, which means it replaces what was said so far with a shorter
   summary, once the conversation holds about 500,000 tokens. Without the setting, it compacts only
   near the end of its whole window, so in a long conversation every step reads half a million
   tokens or more again. Change nothing unless the person agrees. There are two ways. One is the
   line `"autoCompactWindow": 500000` in the Claude Code settings of the folder you work in, the
   file `.claude/settings.local.json` there, and it holds for every conversation started in that
   folder. If the file is already there, add the line and keep every other line as it is. The
   other way is the setting `CLAUDE_CODE_AUTO_COMPACT_WINDOW=500000` in the environment of the
   start command, beside the project id. In bash, zsh or Git Bash:

   ```
   CLAUDE_CODE_AUTO_COMPACT_WINDOW=500000 MOLE_OFFICE_WORKSPACE="<chosen project id>" claude
   ```

   In Windows PowerShell, set it as `MOLE_OFFICE_WORKSPACE` is set above. When both ways are used,
   Claude Code takes the number from the environment. This is how Claude Code 2.1.281 reads them.
   Mole Office does not say whether an older Claude Code reads either.
3. **Its record.** If you skipped the hook lines in step 1, or left out `--start-folder` as
   described below, file a record yourself in the chosen project as part 6 says under *Each new
   conversation*, with the chosen project's id in the headers. Then go on to part 5. Otherwise the
   hook's lines arrive at the start of the new conversation. Note its id from the line
   `This session is filed as record <id>`. Write the headers file again with the chosen project's id
   and with that record's id in `x-mole-office-session`, as part 6 says under *Each new
   conversation*. Read the record with `GET /api/records/<its id>` and check its `workspaceId` is
   the chosen project. If it is not, or the read is refused, stop and tell the person. Then change
   the record's title and "doing" as part 5 says. If the conversation
   begins with `Mole Office did not answer` instead, the office was not answering when it started.
   Check that it answers, and ask the person to start the conversation again.
4. **One turn first.** End your turn, and ask the person to send you one more line, for example
   "go on". The hook stamps the record at the end of your turn, and the office cannot tie a
   heartbeat to this conversation before that.
5. **Start it**, in your next turn, as a background command (in Claude Code, a Bash command run in
   the background). Use the Node from `/api/onboarding`, and the record the hook filed:

   ```
   MOLE_AGENT_KEY_FILE="<notes folder>/key" "<node>" "<for-agents folder>/hold-the-handle.mjs" --api http://127.0.0.1:8787 --agent <your handle> --session <the record the hook filed>
   ```

   `MOLE_AGENT_KEY_FILE` names your key file, so the tool sends your own key and the key never
   appears on a command line. The tool takes its project from the session record, even though the
   agent's registration remains in the original project. The handle identifies the same agent
   across projects. The hook's lines print this command without `MOLE_AGENT_KEY_FILE`
   and `--api`. Use the one above.

   Among its first lines, one begins `Holding the handle "<your handle>" for this session`, and one
   says whether the office recorded this conversation's process. `This session's own process is on
   record <id>` is what you want. A line beginning `Mole Office did not` or `No claude process was
   found` means the office cannot tie your heartbeat to this conversation. Then stop the tool, read
   that line to the person, and send it as feedback (part 8). If the tool ends at once instead, its
   last lines say why. Read them to the person.
6. **Check that the office sees it:**

   ```
   curl -s -H @"<notes folder>/headers" http://127.0.0.1:8787/api/handles/<your handle>
   ```

   Ask with the chosen project in the headers. The handle is the same across the installation, but
   this answer about who is answering is for the project in the request. In the reply,
   `answering.how` is `a live session` and `answering.session` is the record the hook filed. If it
   says `nobody`, the office does not see your heartbeat. Tell the person, and do not start a second
   one.

If a step does not go as it says here, stop, tell the person, and send it as feedback.

If you left `--start-folder` out because you were started in the home folder, or in a network
folder on Windows, the hook does not file a conversation as yours, and part 6 has you file its
record yourself. The office cannot see a heartbeat on a record you filed. So skip steps 4 to 6, and
tell the person that the chat will say it cannot reach you.

**What the person sees when it works.** In **Chat** (中文: **聊天**), when the person opens their
conversation with you, your name has a green dot and the word **Answering** (中文: **正在回复**), and after it **Handle holding** (中文:
**会话已连接**). A message they send you has one tick ✓ while it waits, and two ticks ✓✓ once your
heartbeat has handed it to you. Without a heartbeat the office sees, the chat shows **Cannot reach
<your name>** (中文: **无法联系<your name>**) and asks **Start a new agent?** (中文:
**启动一个新智能体？**).

**When a message comes.** The tool prints it and ends, and that wakes you. Answer it, then start
the tool again with the same command as in step 5. The tool's last lines print a shorter command,
without your key file. Use yours. Until you start it again, your handle stays held for this
conversation for two minutes, so nothing is lost. Never run two at once: two fight for the handle.

## 5. One small first task, together

The point is that the person sees, in the window, what an agent's work looks like in Mole Office:
a record, the run, and a report about the work.
When the hook filed the run, your writes name it as their run too, once its id is in your headers
file (part 4, step 3).

1. **Ask the person what they would like to try.** If they have nothing in mind, offer to write down
   what you have just done together: installing Mole Office and connecting yourself. That really
   happened, so it is a true record.
2. **Read the shapes first.** Some answers are large, so start with the small ones.
   `GET /api/families` lists the groups of endpoints, one line each, and `GET /api/families/records`
   opens the group that files records. `GET /api/kinds/<kind>/compact` gives one kind's fields and
   their types. `GET /api/kinds/<kind>` gives the same with a worked example, and is much longer.
   Read `task` and `report` before you write them. Build each write from those answers, not from
   memory. `POST /api/records/check` takes the same body as `POST /api/records`, runs the same
   checks, and stores nothing.
3. **Say what this run is doing.** Change your session record's title and its one-line "doing" to
   say it, with `PATCH /api/records/<your session record id>` and the body
   `{"title": "…", "dataPatch": {"doing": "…"}}`. Use `dataPatch`, which changes only the fields
   you name. A body with `data` replaces all of the record's fields, and the office refuses it
   when that would empty one. Write dates as `2026-11-01` or `2026-11-01 20:43`, with no time
   zone: `2026-11-01T20:43:13Z` is refused.
4. **File the record.** For example a `task` saying what you did, with `POST /api/records`. If
   the work is finished, its `state` is `done`; a task's states are `todo`, `doing`, `done`,
   `failed` and `blocked`.
5. **File a report** with `POST /api/records`: a short, plain account for the person of what you
   did and what they can see. Link it to the task and to your session record in the same request.
   To do that, put a `links` list in the body, beside `kind`, `title` and `data`:

   ```
   "links": [
     { "type": "about", "toId": "<the task's id>" },
     { "type": "about", "toId": "<your session record's id>" }
   ]
   ```

   The task's id is `record.id` in the reply to step 4. Each link starts at the new report and is
   `about` the record that `toId` names. A key named `about` at the top of the body is refused.
6. **Show the person.** Tell them the titles you used, and where to look:
   - **Reports** (中文: **报告**) in the menu, then the report's title.
   - **All records** (中文: **全部记录**) for the task.
   - **Agents at work** (中文: **在岗智能体**) in the menu for your run, and the section of the
     same name on **Home**.

   Ask them whether they can see each one. If they cannot, that is feedback worth sending.

## 6. Everyday use

**Opening and closing.** Open **Mole Office** from the app menu, the Start menu or the Desktop.
On a Mac, open it from **Applications**. Opening it again while it runs shows the same window. On
a Mac, so does a click on its icon in the Dock. Closing the window does not stop the office: it
keeps running, with an icon in the notification area (on Windows at the right of the taskbar). On a
Mac that icon is in the menu bar, at the top right of the screen. That icon's menu has **Open Mole
Office**, **Restart the service** and **Shut down Mole Office** (中文: **打开 Mole Office**,
**重启服务**, **关闭 Mole Office**). On Windows and on a Mac it also has **Open at login** (中文:
**登录时打开**). On a Mac, quitting Mole Office, with ⌘Q or from the Dock, closes the window and its
icon in the menu bar, but the office keeps running. To stop the office, open Mole Office again and
use **Shut down Mole Office**.

**After signing in.** On Windows, ticking **Open at login** in that menu starts the office at
every sign-in. Signing out of Windows stops it. If the office does not start at sign-in, that is
feedback worth sending.

On a Mac, ticking **Open at login** in that menu opens Mole Office at every login, and Mole Office
starts the office when it opens. System Settings lists it under **General**, **Login Items**, where
the person can turn it off too. On a Mac, **Start at login** in **Settings** has no button. It
only says "On a Mac, turn this on or off with "Open at login" in the Mole Office menu in the menu
bar." (中文: "在 Mac 上，请在菜单栏的 Mole Office 菜单里勾选或取消“登录时打开”。"). If the office
does not start after the next login, that is feedback worth sending.

On Linux, ask the person to open **Settings** (中文: **设置**), then **Start at login** under
**You** (中文: **登录时启动**, under **你**), and to press **Start the office at login** (中文:
**登录时启动办公室**). The office then starts each time they log in, not when the computer is
switched on, and logging out stops it. The exception is when the panel says "It also starts when
the computer is switched on, and keeps running after you log out."
(中文: "它也会在电脑开机时启动，并在你注销后继续运行。"). Then that is what happens. Where the
computer does not let the office start at login, the panel says so and has no button. Either way,
opening **Mole Office** from the app menu starts the office if it is not running.

Once the office starts at login on Linux, `systemctl --user restart mole-office.service` ends
every terminal in the office; **Restart the service** in the icon's menu restarts it and keeps them.

**At the end of a conversation.** When the person says they are done for now, what happens to
this conversation's session record depends on who filed it.

- A record you filed yourself (below): mark it finished. First write the headers file again, as in
  part 4, with the session's project in `x-mole-office-workspace` and without the
  `x-mole-office-session` line. Then send `PATCH /api/records/<its id>` with
  the body `{"dataPatch": {"state": "finished"}}`. Otherwise it says `running` long after you have
  stopped. This write ends the record. After that, the office refuses any write whose
  `x-mole-office-session` line names it. That is why you take the line out first.
- A record the session hook filed (below): the hook marks it finished when the conversation ends.
- The record that registering filed, in your first conversation: you can end it too, but not with
  the write above. Registering filed it as a run that hands in work, so the office refuses that
  write with 409 and asks what the run hands in. When the record ends, the office sends the person
  two messages. One says the run is sealed. The other says your work is finished, but nothing has
  checked it, because no inspector is appointed. Tell the person this first, and ask whether they
  want the record ended. If they do not, or if you filed nothing in part 5, leave the record as it
  is. It goes on saying `running`. If the person wants it ended, name the task and the report you
  filed in part 5.
  Write the headers file again with the session's project in `x-mole-office-workspace` and without
  the `x-mole-office-session` line, then send
  `PATCH /api/records/<its id>` with this body:

  ```
  {"dataPatch": {"state": "finished", "submission": {"kind": "records", "records": ["<the task's id>", "<the report's id>"]}}}
  ```

**Each new conversation.** Use the same handle and the same key file. Do not register again. If
you do not know your handle or your notes folder, run `ls ~/.mole-office-agent` (on Windows,
`dir %USERPROFILE%\.mole-office-agent`): each folder there is named after a handle. List folders
only. Never open, print or search the files inside them. If there is no such folder, ask the
person. Each conversation has a session record of its own, and there are two ways it gets one.

**Choose its project before starting it.** For a new project with no registered folder, start each
later conversation with its project id in `MOLE_OFFICE_WORKSPACE`, using the command for the
person's terminal in part 4, step 2. A plain `claude` does not remember the project chosen in the
previous conversation. The environment setting applies to that process and its children; it does
not change a file. Before suggesting or making a persistent change to a file outside the start
folder, such as a shell profile, ask the person first (rule 8).

For an existing project whose folder is registered, a plain `claude` started in that folder or a
folder inside it can use the folder match instead, so the environment setting is unnecessary when
that match selects the chosen project. Before relying on it, ask `GET /api/onboarding` with the
start folder as the `directory` query parameter and without a workspace header. Check that
`project.kind` is `matched` and `project.id` is the chosen project. The hook first reads
`MOLE_OFFICE_WORKSPACE`, then the `.env` it finds from the start folder, then the folder match,
then its own default.
A project named in the environment or `.env` overrides the folder match. A tie between projects at
the deepest matching folder is `ambiguous`, so the hook falls back to its default. In either case,
if the chosen project would not be selected, use the environment setting in part 4, step 2.
Keep using the registered start folder when you want the hook to recognise your handle. Once the
conversation starts, write the headers file with the chosen project id and check the hook's record
is in that project as in part 4, step 3. When filing the record yourself, use that project id in the
headers before filing it.

If the person has pressed **Put the entry in place** (below), or on a Mac you put its hook lines in
place by hand (below), and the conversation started in the folder you registered with
`--start-folder`, the session hook files it. Its lines arrive at the start of the conversation, and
the first begins `MOLE OFFICE —`. One of them says `This session is filed as record <id>`, and
another says `You are answering as the agent "<your handle>" here`. That record
is yours, so do not file a second one. Write the headers file again, as in part 4, with that id in
the `x-mole-office-session` line. The hook filed the record with the office's own key, under your
handle, so the office takes that id from your key. Then change the record's title and "doing" as in
part 5, step 3. Your writes in this conversation then name that run. Then
attach your heartbeat to that record, as part 4 says under *Attach your heartbeat*, steps 4 to 6.
If the conversation begins with `Mole Office did not answer` instead, it started before the office
answered (part 3), and the person starts it again once the office answers.

Otherwise, file it yourself:

1. Read `GET /api/kinds/session/compact`. The one field it requires is `state`; write `running`.
2. Write the headers file again, as in part 4, without the `x-mole-office-session` line. With your
   key, the office refuses a run name that no record holds yet, so do not make one up.
3. Send `POST /api/records` with `{"kind": "session", "title": "<your name> — <what this
   conversation is for>", "data": {"state": "running", "doing": "…"}}`. The reply holds the new
   record under `record`, so its id is `record.id`. Do not add `ranAs`, `servingAgent` or
   `submission` to this record, then or later. With any of them, the office treats the record as
   work handed in. It may then refuse the plain finishing write above, and when the record ends, it
   sends the person messages about it.
4. Write the headers file again, with the new record's id in the `x-mole-office-session` line.

**So that every conversation knows about Mole Office**, ask the person whether you may make the
skill available everywhere. For Claude Code there is a press that does this. It is shown in
developer mode, so the person opens **Settings** (中文: **设置**) and, under **You** (中文: **你**),
in **Normal or Developer** (中文: **普通或开发者**), sets **Detail** (中文: **详细程度**) to
**Developer** (中文: **开发者**). Then, under the heading **Developer** (中文: **开发者**), they open
**Agents and runs** (中文: **智能体和运行**), and in **The entry for every session** (中文:
**每个会话的入口**) they press **Put the entry in place** (中文: **放置入口**). Afterwards they may
set **Detail** back to **Normal** (中文: **普通**).

**On a Mac, in this beta, the press refuses and writes nothing.** Its answer says that Mole Office
could not ask the Mac whether it installed this folder. So on a Mac, do not send the person to it.
Put the skill link and the three hook lines in place by hand instead, with the person's
permission, as below.

The press links the office's skill as `~/.claude/skills/mole-office`, and adds three lines to
`~/.claude/settings.json` that run the office's session hook at the start of each conversation,
after each turn and at its end. It keeps every other line in that file, and backs the file up
first. The hook files a session record for each new conversation. With the .deb or the Windows
installer, the link leads to the installed skill folder, and the hook runs with the office's own
Node. With the AppImage, the office keeps a copy of its skill in
`~/.config/mole-office/skills/mole-office` (in `$XDG_CONFIG_HOME/mole-office/skills/mole-office`
when that is set), writes it again at every start, and the link leads to that copy. From the
AppImage, the button writes the three hook lines too. While the AppImage is not running, the hook
files nothing, and says so at the start of the conversation.

With nothing set, the session hook and the registration tool, `register-myself.mjs`, ask the office
from the same installation, and print no warning about a default address. If the person set
`MOLE_OFFICE_API` or `MOLE_OFFICE_PORT`, that address still wins.

If the person would rather link the skill without the press, you may do it with their permission.
For Claude Code, personal skills live in `~/.claude/skills/`. On Linux, with the .deb:
`ln -s /opt/mole-office/resources/office/.claude/skills/mole-office ~/.claude/skills/mole-office`.
With the AppImage, start it once, then link the copy it keeps:
`ln -s ~/.config/mole-office/skills/mole-office ~/.claude/skills/mole-office`.
On Windows, a directory junction needs no administrator rights:
`mklink /J "%USERPROFILE%\.claude\skills\mole-office" "%LOCALAPPDATA%\Programs\mole-office\resources\office\.claude\skills\mole-office"`
(in `cmd`). If the person chose another folder at install, put the office's folder in place of
`%LOCALAPPDATA%\Programs\mole-office\resources\office`: it is part 1's `InstallLocation` followed
by `\resources\office`, and it is also the folder that holds `forAgents.folder` from
`/api/onboarding` (part 4).
On a Mac:
`mkdir -p ~/.claude/skills && ln -s "/Applications/Mole Office.app/Contents/Resources/office/.claude/skills/mole-office" ~/.claude/skills/mole-office`.
A link made this way adds no hook lines. For another program, add one line to its own
instructions file saying that Mole Office runs at `http://127.0.0.1:8787` and where SKILL.md is.

**On a Mac, the three hook lines by hand.** Ask the person first: this changes
`~/.claude/settings.json`, which every Claude Code conversation on this computer reads. Copy that
file first to a backup beside it, under a name nothing has yet, such as
`settings.json.mole-office-backup`. Then add one entry to each of three lists under `"hooks"`:
`"SessionStart"`, `"Stop"` and `"SessionEnd"`. Make a list, or `"hooks"` itself, if it is not
there. Keep every other line exactly as it is. This is the entry for `"SessionStart"`. The one for
`"Stop"` ends in `stop` instead of `start`, and the one for `"SessionEnd"` ends in `end`:

```
{ "matcher": "", "hooks": [ { "type": "command", "command": "\"/Applications/Mole Office.app/Contents/Resources/office/runtime/bin/node\" \"/Applications/Mole Office.app/Contents/Resources/office/for-agents/session-hook.mjs\" start", "timeout": 10 } ] }
```

The two paths are the Node and the `for-agents` folder that `/api/onboarding` names, and these are
the lines the press writes for an installed office on Windows. On Linux the press's lines name the
app's own program as the Node, and start with `ELECTRON_RUN_AS_NODE=1`. Then check that the file
is still JSON, with the same Node. This prints nothing when it is:
`"/Applications/Mole Office.app/Contents/Resources/office/runtime/bin/node" -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'))" ~/.claude/settings.json`.
A conversation started after this one runs the lines. If such a
conversation starts with no line beginning `MOLE OFFICE —`, file its session record yourself, as
above, and send that as feedback.

**What the person does in the window.** They read what you file. They answer what waits under
**Needs you** on **Home**. They decide the questions you put to them on **Decisions** (中文:
**提议与决定**). You never decide for them: when a choice is theirs, the skill says how to file it
as a proposal.

## 7. When something goes wrong

- **On Windows, the window says it is waiting for the operating system.** Right after installing,
  Windows can be slow to say which program sent the window's first requests. Mole Office then
  refuses them, and the window asks again by itself, up to three more times, two seconds after
  each refusal. Meanwhile the page says: "Waiting for the operating system. It has not yet said
  which program on this computer sent this window's first requests, so the window asks again by
  itself." The person does nothing then. The asking takes less than a minute in all. If the fourth
  ask is refused too, the page says: "Mole Office did not open, and nothing was done. The window
  asked 4 times, and each time the operating system did not say within 10 seconds which program on
  this computer sent the window's requests. To try again, choose Reload in the View menu at the top
  of this window." Then ask the person to press **View**, then **Reload** in the window's menu.
  These two lines are in English, also when the pages are in Chinese, because they are not yet
  written in Chinese. This has been seen on Windows right after installing. If it comes back after
  Reload, send it as feedback (part 8).
  Before it opens the office's pages, the window pairs itself with the office (part 3), and Windows
  can be slow to say which program sent that request too. The window then pairs once more, at once,
  not up to three more times. Meanwhile it says **Opening it.** (中文: **正在打开它。**). If Windows
  is slow again, the window says the office did not pair it, and the reason given says "The
  operating system did not say within 10 seconds which program on this computer sent it". Ask the
  person to press **Check again** (中文: **再检查一次**), which pairs again.
- **The window says the office could not start.** Ask the person to press **Check again** (中文:
  **再检查一次**). The window waits up to 90 seconds for the office to answer. If it still says
  **Starting Mole Office.** after two minutes, there is no button on it: use **Restart the
  service** in the icon's menu. Then read the office's log
  and tell the person what it says, in plain words. The log is
  `~/.config/mole-office/data/mole-office.db.service.log` on Linux and
  `%APPDATA%\mole-office\data\mole-office.db.service.log` on Windows. On a Mac it is
  `~/Library/Application Support/mole-office/data/mole-office.db.service.log`. That path has a
  space in it, so in a command write it as
  `"$HOME/Library/Application Support/mole-office/data/mole-office.db.service.log"`.
- **The window watches its office.** It checks every two seconds whether its office still
  runs. It does not come to the front for what follows: the person sees it when they
  next open the window. The three cases below are what it can say.
- **The window says the office stopped without being asked to.** It says **Mole Office's server
  stopped without being asked to.**
  (中文: **Mole Office 的服务器在没有人要求的情况下停止了。**)
  It then starts the office again by itself, up to 3 times within 10 minutes, after waiting 5, 20
  and 60 seconds. While it waits it says, for example, **This window starts it again in 5 seconds,
  try 1 of 3.**
  (中文: **这个窗口将在 5 秒后重新启动它，第 1 次，共 3 次。**)
  The person does nothing then. Once the office answers again, the window opens it. After the
  third try it says **This window has tried 3 times in 10 minutes to start it again, so it does
  not try again by itself. Press Check again to start it.**
  (中文: **这个窗口在 10 分钟内已经尝试重新启动它 3 次，所以不会再自己尝试。按“再检查一次”来启动它。**)
  Then ask the person to press **Check again** (中文: **再检查一次**). Either way, an office that
  stops by itself is a fault: read its log, as in the item above, and help the person send what
  it says as feedback (part 8).
- **The window says it cannot tell whether somebody stopped the office.** It says **Mole Office's
  server has stopped, and this window cannot tell whether somebody stopped it, so it does not
  start it again by itself. Press Check again to start it.**
  (中文: **Mole Office 的服务器已经停止，这个窗口无法判断是否有人停止了它，所以不会自己重新启动它。按“再检查一次”来启动它。**)
  This happens when the office ended without leaving word of how, for example when the system
  ended it. Ask the person whether they stopped it. If they did not, or want it back, ask them to
  press **Check again** (中文: **再检查一次**), which starts it.
- **The window says the service that answers is older than the window.** This happens when an
  older office kept running while a newer version was installed (part 1). The window names both
  versions: **The service that answers runs Mole Office <older version>, older than this window's
  <its version>. It kept running when Mole Office was updated. Restart the service to run <its
  version>.**
  (中文: **正在回应的服务运行的是 Mole Office <旧版本>，比这个窗口的 <它的版本> 旧。更新 Mole Office 时它一直在运行。重启服务即可运行 <它的版本>。**)
  An office from 0.1.0-beta.6 or earlier does not say its version, so the window says instead:
  **The service that answers runs a Mole Office older than this window's <its version>: it is from
  before services said their version. It kept running when Mole Office was updated. Restart the
  service to run <its version>.**
  (中文: **正在回应的服务运行的 Mole Office 比这个窗口的 <它的版本> 旧：它来自服务还不报告版本的时候。更新 Mole Office 时它一直在运行。重启服务即可运行 <它的版本>。**)
  Ask the person to press **Restart the service** (中文: **重启服务**). The window then stops the
  older office and starts the newer one. If the records need it, the newer office then asks for
  **Back up and update** (part 2). **Open it anyway** (中文: **仍然打开**) opens the older office
  as it is, and the person then works in the older version.
- **A first open from another computer is slow.** Another computer can open the office only when
  the office has been set to answer the person's other computers on their own private network
  (`MOLE_OFFICE_ADDRESS_FOR_OTHER_MACHINES`). After installation it is not. The first time a
  browser on another computer opens the office, the page's files can take a while to arrive. While
  they arrive, the page says **Mole Office is loading.** and changes by itself when the app is
  ready. After a minute in which the browser has named no failure, it says **Mole Office has not
  started after a minute.** The files may still be arriving then, and the page still changes by
  itself if they do. Only when the browser names a failure does the page say **Mole Office did not
  start.** and "The page loaded but the app's JavaScript did not run." These words are in English,
  also when the pages are in Chinese. Ask the person to wait up to a minute before they reload. If
  the page then says it has not started or did not start, ask them to reload once.
- **Something else holds port 8787.** The office cannot use it. Tell the person which program holds
  it. Do not stop that program without asking.
- **The AppImage ends straight away.** See the FUSE step under the AppImage above.
- **The hook says the office's service lock cannot be read.** It then asks
  `http://127.0.0.1:8787`. Send that line as feedback.
- **The registration tool refuses.** It prints the status line and, under it, the office's reason.
  Read the reason to the person. Do not try again under another handle to get round it.
- **You lost your key.** See *A lost key* in the skill's `reference.md`. Asking for a new key
  needs the person's press again.
- **A request is refused because of a header.** Read the refusal: it says which header, and why.
  Check your headers file, and write it again in the notes folder if a line is wrong.
- **The chat says it cannot reach you.** Check your heartbeat, as in part 4 under *Attach your
  heartbeat*, step 6. If this conversation began with `Mole Office did not answer`, it started
  before the office answered: ask the person to start it again, then attach the heartbeat.

## 8. Sending feedback

The beta exists to find what is wrong. Help the person send what they found:

- **Written feedback** goes through the form on the beta website: [feedback form link]
- **Screenshots** go by email: [feedback email]

Help them say what they did, what they expected and what happened instead, and which system they
are on. Read the text with them before they send it. They decide what goes in. Never include a key,
and never include the contents of their data folder.

## 9. Removing Mole Office

Ask the person first.

- **The .deb:** `pkexec apt-get remove -y mole-office`, or `sudo apt remove mole-office` in their
  own terminal. This removes the office map with it, because the map needs the office. To remove
  the map alone, use `mole-office-map` in place of `mole-office` in the same command. Before
  either removes a file, it stops every Mole Office running from `/opt/mole-office`, as an update
  does (part 2). If an office does not stop, it removes nothing, and says so in the same way. The
  records stay where they were. **Not yet tried on a real machine.**
- **The AppImage:** shut it down from the icon's menu, then delete the file. If it was started
  with `APPIMAGE_EXTRACT_AND_RUN=1`, also delete `~/.cache/mole-office-appimage`.
- **Windows:** Settings, then Apps, then **Mole Office**, then Uninstall. It stops the office first.
  It removes the program's folder, wherever the person installed it, and keeps all of the office's
  data. The office map is in that folder, so it goes too.
- **Mac:** in the menu-bar menu, untick **Open at login** if it is ticked, then press **Shut down
  Mole Office**. Then move **Mole Office** from **Applications** to the Trash. The office map is
  inside the app, so it goes too.

If the person pressed **Put the entry in place**, removing the program leaves the skill link and
the three hook lines behind. With the .deb or on Windows, each line then fails at the start of every
conversation, after every turn and at every end. So, with the person's permission, delete the link
`~/.claude/skills/mole-office` and the three lines in `~/.claude/settings.json` that run Mole
Office's session hook. Leave every other line in that file as it is. On a Mac, the link and the
three lines you put in place by hand (part 6) are left behind too, and each line fails in the same
way. Delete them in the same way.

Removing the program keeps the person's records. They stay in `~/.config/mole-office` on Linux and
in `%APPDATA%\mole-office` on Windows until the person deletes that folder. On a Mac they stay in
`~/Library/Application Support/mole-office` in the same way.
