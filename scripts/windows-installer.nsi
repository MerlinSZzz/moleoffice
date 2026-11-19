# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
; THE WINDOWS INSTALLER'S SCRIPT. scripts/package-windows.mjs gives it to electron-builder as nsis.script,
; with the lines of THE FACTS ABOVE THIS SCRIPT written in front of it (scripts/the-windows-build.mjs,
; theInstallerScript, writes them from the places that decide them).
;
; WHY MOLE OFFICE HAS ITS OWN SCRIPT. electron-builder's own script makes its uninstaller by running a
; first installer, which writes it. On Linux it runs that installer under wine, and the wine it pins
; (toolset 1.0.1, wine 11.0) carries no Windows libraries for a 32-bit program, so it cannot run one.
; electron-builder runs nothing when it is given a script of its own, and NSIS's WriteUninstaller
; writes the uninstaller while the installer runs. electron-builder still makes the app's folder, its
; fuses, the archive this script unpacks, the icon, and the defines this script uses: APP_64,
; PRODUCT_FILENAME, VERSION, COMPANY_NAME, UNINSTALL_APP_KEY, ESTIMATED_SIZE, MUI_ICON and MUI_UNICON.
;
; WHAT IT DOES. It installs for the person running it, into the folder the person chooses, by default
; %LOCALAPPDATA%\Programs\<PRODUCT_FILENAME>, and an update into the folder already installed. It never
; asks for an administrator: RequestExecutionLevel user is the manifest's asInvoker. It makes a Start-menu
; and a Desktop shortcut, and the entry Settings lists under Installed apps. The uninstaller removes those,
; the folder, and each value of the person's Run key that starts this folder's window, whatever the value
; is called. Electron names that value itself when the tray's start-at-sign-in item is ticked. The entry
; in Installed apps goes last, and only once the folder has gone, so what is left can still be uninstalled
; from there.
;
; WHAT IT KEEPS. The office keeps its settings in the per-user folder, %APPDATA%\mole-office, and its
; data in the data folder, by default the per-user folder's data folder. Both are outside the installed
; folder, and neither the installer nor the uninstaller removes them. The folder page and a silent install
; refuse the per-user folder, and any folder inside it, as the install folder, and the same for the data
; folder and any folder that holds it, because an update and the uninstaller remove the install folder whole.
;
; WHERE THE DATA GOES (design/window/the-data-folder-move.criteria.md, DF23 to DF25). A first install on
; this account asks for the data folder on a page of its own, after the folder page; a silent one takes it
; as /DATA=<place>. A place other than the default is written by the office's own command, `data-folder
; choose`, once the files are copied. An update or a reinstall keeps the data where it is, asks the
; installed office where that is with `data-folder where`, and refuses /DATA=.
;
; BEFORE IT CHANGES THE FOLDER, whatever runs from it is stopped. The office is asked first, with the
; installed Node and command, as the window's own Shut down does. Only when it says it stopped, that
; nothing was running, that its lock names a process that has ended, or that no server runs and it
; left the terminal holder, is the rest stopped by its path: the window, the terminal holder if the
; stop did not end it, and what they started from the folder. If the office will not stop, nothing is
; changed and the installer says why. Which step refused, its exit code and what it printed are
; written to THE_STOP_REFUSED in TEMP, because under /S the installer shows no window to read them in.
;
; THE OFFICE MAP (scripts/the-office-map-part.mjs) is a part of its own on the components page, after the data
; page. It is unticked on a first install, and ticked when the folder already holds the map, so an update keeps the
; map only where it was installed before. Ticked, its files go into THE_MAP in the folder. Unticked, none of its
; files is written, and a map installed before is gone, because an update removes the folder whole before it
; unpacks. The uninstaller removes it with the folder. A silent install shows no page, so it keeps the map only
; when the folder already holds it.

!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"
!include "Sections.nsh"

!define THE_WINDOW_EXE "${PRODUCT_FILENAME}.exe"
!define THE_UNINSTALLER "Uninstall ${PRODUCT_FILENAME}.exe"
!define THE_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"
!define THE_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define THE_APPROVED_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
!define THE_POWERSHELL "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
!define THE_REMOVAL_TRIES 10
!define THE_STOP_REFUSED "$TEMP\${PRODUCT_FILENAME}-stop-refused.txt"
; How long `data-folder where` and `data-folder choose` may take. Each starts Node, reads one file and writes
; at most one; neither starts the office.
!define THE_ASKING_WAIT_MS 30000

; The processes whose program is in the folder, by the path of the program itself (ExecutablePath) and
; never by words in a command line, so an editor or a shell that only names the folder is never stopped.
; The installer names the folder in INSTALL_FOLDER_TO_CHECK, so that no folder name has to be quoted
; inside PowerShell's own words.
!define THE_RUNNING `$$d = $$env:INSTALL_FOLDER_TO_CHECK.TrimEnd('\') + '\'; function running { @(Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$d, [StringComparison]::OrdinalIgnoreCase) }) }`

Name "${THE_NAME}"
Icon "${MUI_ICON}"
UninstallIcon "${MUI_UNICON}"
RequestExecutionLevel user
InstallDir "$LOCALAPPDATA\Programs\${PRODUCT_FILENAME}"
; An earlier install's folder is the default, so a newer installer updates the folder already installed.
InstallDirRegKey HKCU "${THE_UNINSTALL_KEY}" "InstallLocation"
ShowInstDetails nevershow
ShowUninstDetails nevershow
AutoCloseWindow true
Page directory theFolderPagePre "" theFolderPageLeave
Page custom theDataPage theDataPageLeave
Page components theMapIsThere
Page instfiles
UninstPage instfiles

; The per-user folder, where the office keeps its .env and the window keeps its own files.
Var thePerUserFolder
; The data folder: on a first install the one chosen on the data page or with /DATA=, and on any other the
; one the installed office says, or the default when it cannot say.
Var theDataFolder
; Empty, or the sentence that says the data folder above is the default because the installed office could
; not say where its data is.
Var theDataFolderIsAssumed
; "yes" when /DATA= was given.
Var theDataPlaceGiven
; "yes" on a first install on this account, "no" otherwise.
Var theFirstInstall
; The data page's box with the place in it.
Var theDataBox
; The folder for which theMapIsThere last decided whether the office map's part is ticked.
Var theMapDecidedFor

; The components page's words: what the office map is and where it is switched on, above the list, and what
; unticking it does, beside the list.
ComponentText "The office map draws the office's people, agents and work as a map, and changes nothing. It is off until it is switched on: open Settings, then Tools, then Plugins." "" "Tick it to install the office map. Unticked, a map installed before is removed."

; What the installer knows before any page: the per-user folder, the default data folder, and the place a
; silent install was given with /DATA=, which the data page also starts from.
Function .onInit
  StrCpy $thePerUserFolder "$APPDATA\${THE_DATA_FOLDER}"
  StrCpy $theDataFolder "$thePerUserFolder\${THE_DEFAULT_DATA_FOLDER}"
  StrCpy $theDataPlaceGiven "no"
  ${GetParameters} $R0
  ClearErrors
  ${GetOptions} $R0 "/DATA=" $R1
  ${IfNot} ${Errors}
    StrCpy $theDataFolder $R1
    StrCpy $theDataPlaceGiven "yes"
  ${EndIf}
  ; A silent install shows no components page, so whether the office map's part is ticked is decided here too.
  Call theMapIsThere
FunctionEnd

; Whether this is the first install on this account: no product in $INSTDIR, and nothing in the per-user
; folder. The window keeps its own files there from its first start, so after any install that ran it is
; not empty. Only a first install asks where the data goes; an update or a reinstall keeps it where it is.
Function theFirstInstallHere
  StrCpy $theFirstInstall "no"
  ${DirState} "$thePerUserFolder" $R9
  ${If} $R9 != 1
  ${AndIfNot} ${FileExists} "$INSTDIR\${THE_UNINSTALLER}"
    StrCpy $theFirstInstall "yes"
  ${EndIf}
FunctionEnd

; Takes the backslashes off the end of the folder in $R9, so "D:\Data\" and "D:\Data" are one folder.
Function theBackslashesOff
  ${Do}
    StrCpy $R8 $R9 1 -1
    ${If} $R8 != "\"
      ${ExitDo}
    ${EndIf}
    StrCpy $R9 $R9 -1
  ${Loop}
FunctionEnd

; Whether the value in $R9 begins with a drive letter, a colon and a backslash: $R8 is "yes" or "no".
; Windows says whether the first two characters are a drive letter and a colon, answering 0 to 25 for a
; letter A to Z and -1 otherwise; the third character must be a backslash. It reads $R9 and changes $R8 only.
Function theDriveComesFirst
  System::Call 'shlwapi::PathGetDriveNumber(t R9) i .R8'
  ${If} $R8 < 0
    StrCpy $R8 "no"
    Return
  ${EndIf}
  StrCpy $R8 $R9 2 1
  ${If} $R8 == ":\"
    StrCpy $R8 "yes"
  ${Else}
    StrCpy $R8 "no"
  ${EndIf}
FunctionEnd

; Whether the value in $R9 is a UNC path, as a move asks it (DF4): $R8 is "yes" or "no". It is one when it
; begins with two backslashes. \\?\ and \\.\ can begin a drive path too, so after one of them only UNC\ makes
; it one. LogicLib compares text without regard to case. It reads $R9 and changes $R7 and $R8 only.
Function theNetworkPathComesFirst
  StrCpy $R8 "no"
  StrCpy $R7 $R9 2
  ${If} $R7 != "\\"
    Return
  ${EndIf}
  StrCpy $R7 $R9 2 2
  ${If} $R7 == "?\"
  ${OrIf} $R7 == ".\"
    StrCpy $R7 $R9 4 4
    ${If} $R7 != "UNC\"
      Return
    ${EndIf}
  ${EndIf}
  StrCpy $R8 "yes"
FunctionEnd

; Whether the folder in $R2 is the folder in $R1 or inside it: $R0 is "yes" or "no". A folder is inside
; another when its path with a backslash after it begins with the other's path and a backslash. The
; backslash keeps out a folder whose name only begins with the other's name. The comparison is of text,
; and NSIS's == ignores case as Windows does. A folder written with 8.3 short names, with forward slashes,
; or with two dots that lead into the other is not recognised as inside it.
Function theFolderIsInside
  StrLen $R3 "$R1\"
  StrCpy $R4 "$R2\" $R3
  StrCpy $R0 "no"
  ${If} $R4 == "$R1\"
    StrCpy $R0 "yes"
  ${EndIf}
FunctionEnd

; Whether the data folder $theDataFolder is the folder in $R5 or is inside it: $R0 is "yes" or "no". A
; value theDriveComesFirst does not answer "yes" for names no folder. The folder is compared as the
; variable writes it and, when Windows knows it, by its long name too, both with their backslashes off,
; because a variable such as TEMP can name it in 8.3 short names and a long name can keep a trailing
; backslash. It changes $R0 to $R4 and $R6 to $R9; it reads $R5 and changes nothing else.
Function theDataPlaceIsInTheFolder
  StrCpy $R0 "no"
  StrCpy $R9 $R5
  Call theDriveComesFirst
  ${If} $R8 != "yes"
    Return
  ${EndIf}
  Call theBackslashesOff
  StrCpy $R1 $R9
  StrCpy $R2 $theDataFolder
  Call theFolderIsInside
  ${If} $R0 == "yes"
    Return
  ${EndIf}
  System::Call 'kernel32::GetLongPathName(t R5, t .R6, i ${NSIS_MAX_STRLEN}) i .R7'
  ${If} $R7 > 0
    StrCpy $R9 $R6
    Call theBackslashesOff
    StrCpy $R1 $R9
    StrCpy $R2 $theDataFolder
    Call theFolderIsInside
  ${EndIf}
FunctionEnd

; The folder page is skipped when this product is already in $INSTDIR: an update stays in its folder,
; and a person moves an install by uninstalling it first.
Function theFolderPagePre
  ${If} ${FileExists} "$INSTDIR\${THE_UNINSTALLER}"
    Abort
  ${EndIf}
FunctionEnd

; The data folder an install that is not the first keeps. The installed office is asked with `data-folder
; where`, which prints the folder alone on its first line, and only when $INSTDIR holds this product, so no
; other program is started. The answer is taken only when the command ended with 0 and its first line
; begins with a drive letter, a colon and a backslash, which theDriveComesFirst says. A version older than
; that question, or a reinstall into a folder with no product in it, cannot answer, and the default folder
; is taken, with a sentence that says it was assumed.
Function theDataFolderInUse
  Call theFirstInstallHere
  ${If} $theFirstInstall == "yes"
    Return
  ${EndIf}
  StrCpy $theDataFolder "$thePerUserFolder\${THE_DEFAULT_DATA_FOLDER}"
  StrCpy $theDataFolderIsAssumed "No installed ${THE_NAME} in $INSTDIR could say where its data is, so the installer took the default data folder."
  ${If} ${FileExists} "$INSTDIR\${THE_UNINSTALLER}"
  ${AndIf} ${FileExists} "$INSTDIR\${THE_NODE}"
  ${AndIf} ${FileExists} "$INSTDIR\${THE_COMMAND}"
    SetOutPath "$INSTDIR\${THE_OFFICE}"
    nsExec::ExecToStack /TIMEOUT=${THE_ASKING_WAIT_MS} `"$INSTDIR\${THE_NODE}" "$INSTDIR\${THE_COMMAND}" data-folder where`
    Pop $1
    Pop $2
    SetOutPath "$TEMP"
    ; The first line, up to the first end of a line.
    StrCpy $R0 0
    ${Do}
      StrCpy $R1 $2 1 $R0
      ${If} $R1 == ""
      ${OrIf} $R1 == "$\r"
      ${OrIf} $R1 == "$\n"
        ${ExitDo}
      ${EndIf}
      IntOp $R0 $R0 + 1
    ${Loop}
    StrCpy $R9 $2 $R0
    Call theBackslashesOff
    Call theDriveComesFirst
    ${If} $1 == 0
    ${AndIf} $R8 == "yes"
      StrCpy $theDataFolder $R9
      StrCpy $theDataFolderIsAssumed ""
    ${Else}
      StrCpy $theDataFolderIsAssumed "The installed ${THE_NAME} could not say where its data is (it answered $1), so the installer took the default data folder."
    ${EndIf}
  ${EndIf}
  DetailPrint "The data folder is $theDataFolder. $theDataFolderIsAssumed"
FunctionEnd

; Whether $INSTDIR may take this install: $0 is empty when it may, and otherwise the sentence that says
; why not. The per-user folder, %APPDATA%\${THE_DATA_FOLDER}, and any folder inside it are refused first,
; and then any folder inside the data folder or holding it, because an update and the uninstaller remove
; $INSTDIR whole and what is kept there would go with it. A folder chosen for a first install holds
; nothing yet. An update's folder holds this product's uninstaller. Anything else is refused, because
; removing $INSTDIR whole would take its files.
Function theFolderIsRefused
  StrCpy $0 ""
  StrCpy $R1 $thePerUserFolder
  StrCpy $R2 $INSTDIR
  Call theFolderIsInside
  ${If} $R0 == "yes"
    StrCpy $0 "${THE_NAME} cannot install into $INSTDIR, because ${THE_NAME} keeps its data in $thePerUserFolder, and an update or an uninstall removes the whole install folder. Choose a folder outside $thePerUserFolder."
    Return
  ${EndIf}
  Call theDataFolderInUse
  StrCpy $R1 $INSTDIR
  StrCpy $R2 $theDataFolder
  Call theFolderIsInside
  ${If} $R0 == "yes"
    StrCpy $0 "${THE_NAME} cannot install into $INSTDIR, because ${THE_NAME} keeps its data in $theDataFolder, inside it, and an update or an uninstall removes the whole install folder. Choose a folder that does not hold $theDataFolder. $theDataFolderIsAssumed"
    Return
  ${EndIf}
  StrCpy $R1 $theDataFolder
  StrCpy $R2 $INSTDIR
  Call theFolderIsInside
  ${If} $R0 == "yes"
    StrCpy $0 "${THE_NAME} cannot install into $INSTDIR, because ${THE_NAME} keeps its data in $theDataFolder, and a move of the data would copy the program with it. Choose a folder outside $theDataFolder. $theDataFolderIsAssumed"
    Return
  ${EndIf}
  ${DirState} "$INSTDIR" $R9
  ${If} $R9 == 1
    ${IfNot} ${FileExists} "$INSTDIR\${THE_UNINSTALLER}"
      StrCpy $0 "${THE_NAME} cannot install into $INSTDIR because it already holds other files. Choose an empty folder or a new one."
    ${EndIf}
  ${EndIf}
FunctionEnd

; Leaving the folder page with a folder that is refused keeps the page open, so the person can choose another.
Function theFolderPageLeave
  Call theFolderIsRefused
  ${If} $0 != ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "$0"
    Abort
  ${EndIf}
FunctionEnd

; One refusal of the stop. $1 is the step's exit code and $2 what it printed, as nsExec::ExecToStack
; leaves them. The sentence goes into $0, and the sentence, $1 and $2 into THE_STOP_REFUSED.
!macro theStopRefused sentence
  StrCpy $0 "${sentence}"
  FileOpen $3 "${THE_STOP_REFUSED}" w
  FileWrite $3 "${sentence}$\r$\nIt answered: $1$\r$\nIt printed:$\r$\n$2$\r$\n"
  FileClose $3
  Return
!macroend

; Stops whatever runs from $INSTDIR. On return $0 is "stopped" or the sentence that says why not. The
; file of an earlier refusal is deleted first, so a file there afterwards was written by this stop.
!macro theStop un
Function ${un}theStop
  Delete "${THE_STOP_REFUSED}"
  System::Call 'kernel32::SetEnvironmentVariable(t "INSTALL_FOLDER_TO_CHECK", t "$INSTDIR") i .r1'
  nsExec::ExecToStack `"${THE_POWERSHELL}" -NoProfile -NonInteractive -Command "${THE_RUNNING}; if (@(running).Count -gt 0) { exit 10 } else { exit 0 }"`
  Pop $1
  Pop $2
  ${If} $1 == 0
    StrCpy $0 "stopped"
    Return
  ${ElseIf} $1 != 10
    !insertmacro theStopRefused "Windows PowerShell could not say what runs from $INSTDIR (it answered $1)."
  ${EndIf}

  ${If} ${FileExists} "$INSTDIR\${THE_NODE}"
    SetOutPath "$INSTDIR\${THE_OFFICE}"
    nsExec::ExecToStack /TIMEOUT=${THE_STOP_WAIT_MS} `"$INSTDIR\${THE_NODE}" "$INSTDIR\${THE_COMMAND}" stop`
    Pop $1
    Pop $2
    SetOutPath "$TEMP"
    DetailPrint "The office was asked to stop, and answered $1."
    ; It stopped; nothing was running; its lock names a process that has ended; or no server runs and
    ; the terminal holder was left, which the step below ends by its path.
    ${If} $1 != ${THE_STOPPED}
    ${AndIf} $1 != ${THE_NOT_RUNNING}
    ${AndIf} $1 != ${THE_STALE}
    ${AndIf} $1 != ${THE_HOLDER_NOT_STOPPED}
      !insertmacro theStopRefused "${THE_NAME} is running and did not stop when asked (it answered $1). Shut it down from its tray icon, then run this again."
    ${EndIf}
  ${EndIf}

  nsExec::ExecToStack `"${THE_POWERSHELL}" -NoProfile -NonInteractive -Command "${THE_RUNNING}; $$p = running; $$p | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }; $$p | ForEach-Object { Wait-Process -Id $$_.ProcessId -Timeout 20 -ErrorAction SilentlyContinue }; if (@(running).Count -gt 0) { exit 1 } else { exit 0 }"`
  Pop $1
  Pop $2
  ${If} $1 == 0
    StrCpy $0 "stopped"
  ${Else}
    !insertmacro theStopRefused "Something still runs from $INSTDIR after it was stopped (Windows PowerShell answered $1). Close ${THE_NAME}, then run this again."
  ${EndIf}
FunctionEnd
!macroend
!insertmacro theStop ""
!insertmacro theStop "un."

; Stops the installer or the uninstaller with a sentence, and exit code 2, as NSIS's own Abort does.
!macro theRefusal sentence
  MessageBox MB_OK|MB_ICONSTOP "${sentence}" /SD IDOK
  SetErrorLevel 2
  Quit
!macroend

; Whether $theDataFolder may be a first install's data folder: $0 is empty when it may, and otherwise the
; sentence that says why not. The backslashes after it are taken off first. The default is taken as it is,
; because no line is written for it. Any other place must be:
;  - not a UNC path, which theNetworkPathComesFirst answers first, because it is a network place (DF4);
;  - a full path that begins with a drive letter, which theDriveComesFirst answers;
;  - on a drive Windows's GetDriveType does not call a network drive (4), as a move asks it (DF4). The
;    office's database keeps a write-ahead log, which does not work on a network share;
;  - on a drive whose type GetDriveType tells: removable (2), fixed (3), a CD drive (5) or a RAM disk (6).
;    Any other answer may be a network drive, so it is refused with a sentence that says so;
;  - not at or inside this user's temporary folder, found and compared as a move finds it (DF4): Disk
;    Cleanup and Storage Sense delete files there;
;  - neither the per-user folder nor a folder that holds it, because the settings stay there;
;  - absent, empty, or a folder that already holds ${THE_DATABASE}, which the office then takes up.
; A place outside this user's profile folder, on a removable drive or in a OneDrive folder is not refused.
; The install folder's rules are theFolderIsRefused's. The office's own `data-folder choose`, which writes
; the place once the files are copied, refuses again what it cannot take.
Function theDataPlaceIsRefused
  StrCpy $0 ""
  StrCpy $R9 $theDataFolder
  Call theBackslashesOff
  StrCpy $theDataFolder $R9
  ${If} $theDataFolder == "$thePerUserFolder\${THE_DEFAULT_DATA_FOLDER}"
    Return
  ${EndIf}
  Call theNetworkPathComesFirst
  ${If} $R8 == "yes"
    StrCpy $0 "${THE_NAME} cannot keep its data in $theDataFolder, because it is a network path. The office's database keeps a write-ahead log, which does not work on a network share, so the install was refused and nothing was changed. Choose a folder on a drive of this computer."
    Return
  ${EndIf}
  Call theDriveComesFirst
  StrLen $R2 $theDataFolder
  ${If} $R8 != "yes"
  ${OrIf} $R2 < 4
    StrCpy $0 "${THE_NAME} cannot keep its data in $\"$theDataFolder$\", because that is not the full path of a folder. Write one that begins with a drive letter."
    Return
  ${EndIf}
  StrCpy $R7 $theDataFolder 3
  System::Call 'kernel32::GetDriveType(t R7) i .R8'
  ${If} $R8 = 4
    StrCpy $0 "${THE_NAME} cannot keep its data in $theDataFolder, because Windows reports $R7 as a network drive. The office's database keeps a write-ahead log, which does not work on a network share, so the install was refused and nothing was changed. Choose a folder on a drive of this computer."
    Return
  ${EndIf}
  ${If} $R8 <> 2
  ${AndIf} $R8 <> 3
  ${AndIf} $R8 <> 5
  ${AndIf} $R8 <> 6
    StrCpy $0 "${THE_NAME} cannot keep its data in $theDataFolder, because Windows cannot tell what kind of drive $R7 is. It may be a network drive, where the office's database cannot keep its write-ahead log, so the install was refused and nothing was changed. Choose a folder on a drive of this computer."
    Return
  ${EndIf}
  ReadEnvStr $R5 "TEMP"
  Call theDataPlaceIsInTheFolder
  ${If} $R0 == "yes"
    StrCpy $0 "${THE_NAME} cannot keep its data in $theDataFolder, because it is in your temporary folder, $R5, and Windows deletes files there. Choose a folder that is not in it."
    Return
  ${EndIf}
  ReadEnvStr $R5 "TMP"
  Call theDataPlaceIsInTheFolder
  ${If} $R0 == "yes"
    StrCpy $0 "${THE_NAME} cannot keep its data in $theDataFolder, because it is in your temporary folder, $R5, and Windows deletes files there. Choose a folder that is not in it."
    Return
  ${EndIf}
  StrCpy $R1 $theDataFolder
  StrCpy $R2 $thePerUserFolder
  Call theFolderIsInside
  ${If} $R0 == "yes"
    StrCpy $0 "${THE_NAME} cannot keep its data in $theDataFolder, because ${THE_NAME} keeps its settings in $thePerUserFolder, and that folder is or holds it. Choose a folder inside $thePerUserFolder, or one somewhere else."
    Return
  ${EndIf}
  ${DirState} "$theDataFolder" $R9
  ${If} $R9 == 1
    ${IfNot} ${FileExists} "$theDataFolder\${THE_DATABASE}"
      StrCpy $0 "${THE_NAME} cannot keep its data in $theDataFolder, because it already holds other files and no ${THE_DATABASE}. Choose an empty folder or a new one."
    ${EndIf}
  ${EndIf}
FunctionEnd

; THE DATA PAGE, on a first install only. It starts from the default, or from /DATA=, and its leave keeps it
; open on a place that is refused, as the folder page does.
Function theDataPage
  Call theFirstInstallHere
  ${If} $theFirstInstall != "yes"
    Abort
  ${EndIf}
  nsDialogs::Create 1018
  Pop $R0
  ${If} $R0 == error
    !insertmacro theRefusal "The installer could not show the page that asks where ${THE_NAME} keeps its data. Nothing was changed."
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 48u "${THE_NAME} keeps its data in one folder: the database, its backups, and the files people attach. Choose that folder. You can move it later, in Settings, under What the office keeps.$\r$\n$\r$\nThe folder offered is the usual one."
  Pop $R0
  ${NSD_CreateDirRequest} 0 54u 75% 12u "$theDataFolder"
  Pop $theDataBox
  ${NSD_CreateBrowseButton} 77% 53u 23% 14u "Browse..."
  Pop $R0
  ${NSD_OnClick} $R0 theDataPageBrowse
  nsDialogs::Show
FunctionEnd

Function theDataPageBrowse
  ${NSD_GetText} $theDataBox $R0
  nsDialogs::SelectFolderDialog "Choose the folder ${THE_NAME} keeps its data in" "$R0"
  Pop $R0
  ${If} $R0 != error
    ${NSD_SetText} $theDataBox "$R0"
  ${EndIf}
FunctionEnd

; Leaving the data page with a place that is refused keeps the page open, so the person can choose another.
Function theDataPageLeave
  ${NSD_GetText} $theDataBox $theDataFolder
  Call theDataPlaceIsRefused
  ${If} $0 == ""
    Call theFolderIsRefused
  ${EndIf}
  ${If} $0 != ""
    MessageBox MB_OK|MB_ICONEXCLAMATION "$0"
    Abort
  ${EndIf}
FunctionEnd

Section "-install"
  SetShellVarContext current

  ; A first install takes its data folder from the data page, or from /DATA= when it is silent. Any other
  ; install keeps the data where it is, so /DATA= is refused rather than left unused.
  Call theFirstInstallHere
  ${If} $theFirstInstall == "yes"
    Call theDataPlaceIsRefused
    ${If} $0 != ""
      !insertmacro theRefusal "$0 Nothing was changed."
    ${EndIf}
  ${ElseIf} $theDataPlaceGiven == "yes"
    !insertmacro theRefusal "${THE_NAME} takes /DATA= only on a first install, and this account already has ${THE_NAME}'s settings in $thePerUserFolder. Nothing was changed. To move the data, open Settings, then What the office keeps."
  ${EndIf}

  ; A silent install shows no folder page, so the folder is checked here too, by the same rule.
  Call theFolderIsRefused
  ${If} $0 != ""
    !insertmacro theRefusal "$0"
  ${EndIf}

  Call theStop
  ${If} $0 != "stopped"
    !insertmacro theRefusal "$0 Nothing was changed."
  ${EndIf}

  ; An installed Mole Office is replaced as a whole, so no file of an older one is left beside the new.
  ${If} ${FileExists} "$INSTDIR\${THE_UNINSTALLER}"
    SetOutPath "$TEMP"
    RMDir /r "$INSTDIR"
  ${EndIf}

  InitPluginsDir
  SetOutPath "$INSTDIR"
  ; The archive is compressed already, so the installer stores it as it is.
  SetCompress off
  File "/oname=$PLUGINSDIR\app-64.7z" "${APP_64}"
  SetCompress auto
  Nsis7z::Extract "$PLUGINSDIR\app-64.7z"
  Delete "$PLUGINSDIR\app-64.7z"
  ; Nsis7z says nothing about a failure, so the files the window and the office start from are looked for.
  ${IfNot} ${FileExists} "$INSTDIR\${THE_WINDOW_EXE}"
  ${OrIfNot} ${FileExists} "$INSTDIR\resources\app.asar"
  ${OrIfNot} ${FileExists} "$INSTDIR\${THE_NODE}"
  ${OrIfNot} ${FileExists} "$INSTDIR\${THE_COMMAND}"
    ; What was unpacked is removed, so the folder the next run meets is empty again.
    SetOutPath "$TEMP"
    RMDir /r "$INSTDIR"
    !insertmacro theRefusal "${THE_NAME} was not fully unpacked into $INSTDIR, and what was unpacked has been removed. Run this installer again."
  ${EndIf}

  ; A first install's data folder other than the default is written into the per-user .env by the office's
  ; own command. If the command refuses, what was unpacked is removed, because a first install's folder was
  ; empty before, and the installer says why in the command's own words.
  ${If} $theFirstInstall == "yes"
  ${AndIf} $theDataFolder != "$thePerUserFolder\${THE_DEFAULT_DATA_FOLDER}"
    SetOutPath "$INSTDIR\${THE_OFFICE}"
    nsExec::ExecToStack /TIMEOUT=${THE_ASKING_WAIT_MS} `"$INSTDIR\${THE_NODE}" "$INSTDIR\${THE_COMMAND}" data-folder choose "$theDataFolder"`
    Pop $1
    Pop $2
    SetOutPath "$TEMP"
    ${If} $1 != 0
      RMDir /r "$INSTDIR"
      !insertmacro theRefusal "${THE_NAME} could not keep its data in $theDataFolder (it answered $1). It said: $2 What was unpacked has been removed. Run this installer again, and choose another folder."
    ${EndIf}
    DetailPrint "${THE_NAME} keeps its data in $theDataFolder."
  ${EndIf}

  WriteUninstaller "$INSTDIR\${THE_UNINSTALLER}"
  WriteRegStr HKCU "${THE_UNINSTALL_KEY}" "DisplayName" "${THE_NAME}"
  WriteRegStr HKCU "${THE_UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${THE_UNINSTALL_KEY}" "Publisher" "${COMPANY_NAME}"
  WriteRegStr HKCU "${THE_UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${THE_WINDOW_EXE},0"
  WriteRegStr HKCU "${THE_UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${THE_UNINSTALL_KEY}" "UninstallString" `"$INSTDIR\${THE_UNINSTALLER}"`
  WriteRegStr HKCU "${THE_UNINSTALL_KEY}" "QuietUninstallString" `"$INSTDIR\${THE_UNINSTALLER}" /S`
  WriteRegDWORD HKCU "${THE_UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${THE_UNINSTALL_KEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${THE_UNINSTALL_KEY}" "EstimatedSize" ${ESTIMATED_SIZE}

  CreateShortCut "$SMPROGRAMS\${THE_NAME}.lnk" "$INSTDIR\${THE_WINDOW_EXE}"
  CreateShortCut "$DESKTOP\${THE_NAME}.lnk" "$INSTDIR\${THE_WINDOW_EXE}"
SectionEnd

; THE OFFICE MAP'S PART, after the office's own section, which has emptied the folder on an update. Its files are the
; map's manifest and built folder, as scripts/package-windows.mjs staged them in THE_MAP_FILES.
Section /o "Office map" theMapPart
  SetOutPath "$INSTDIR\${THE_MAP}"
  File /r "${THE_MAP_FILES}/*"
SectionEnd

; Whether the office map's part is ticked: ticked when the folder already holds the map, and unticked when it does
; not. It decides once for each folder, so a person who goes back a page and comes back keeps what they ticked.
Function theMapIsThere
  ${If} $theMapDecidedFor == $INSTDIR
    Return
  ${EndIf}
  StrCpy $theMapDecidedFor $INSTDIR
  ${If} ${FileExists} "$INSTDIR\${THE_MAP}\*.*"
    !insertmacro SelectSection ${theMapPart}
  ${Else}
    !insertmacro UnselectSection ${theMapPart}
  ${EndIf}
FunctionEnd

; The window opens last, once every part is installed.
Section "-the window"
  ; Started by hand, it opens the window when it has finished. Started with /S, it does not.
  ${IfNot} ${Silent}
    SetOutPath "$INSTDIR"
    Exec `"$INSTDIR\${THE_WINDOW_EXE}"`
  ${EndIf}
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Call un.theStop
  ${If} $0 != "stopped"
    !insertmacro theRefusal "$0 Nothing was removed."
  ${EndIf}

  ; Each Run value that starts this folder's window, as Electron writes it ("<exe>", perhaps with
  ; arguments after it) or bare, and its twin in StartupApproved\Run, which Settings' Startup apps writes.
  StrCpy $R0 0
  StrLen $R4 `"$INSTDIR\${THE_WINDOW_EXE}"`
  theRunValues:
    ClearErrors
    EnumRegValue $R1 HKCU "${THE_RUN_KEY}" $R0
    IfErrors theRunValuesDone
    StrCmp $R1 "" theRunValuesDone
    ReadRegStr $R2 HKCU "${THE_RUN_KEY}" $R1
    StrCpy $R3 $R2 $R4
    StrCmp $R3 `"$INSTDIR\${THE_WINDOW_EXE}"` theRunValueIsOurs
    StrCmp $R2 "$INSTDIR\${THE_WINDOW_EXE}" theRunValueIsOurs
    IntOp $R0 $R0 + 1
    Goto theRunValues
  theRunValueIsOurs:
    DeleteRegValue HKCU "${THE_RUN_KEY}" $R1
    DeleteRegValue HKCU "${THE_APPROVED_RUN_KEY}" $R1
    Goto theRunValues
  theRunValuesDone:

  Delete "$SMPROGRAMS\${THE_NAME}.lnk"
  Delete "$DESKTOP\${THE_NAME}.lnk"

  ; The folder goes before its entry in Installed apps, and the entry stays while any of the folder
  ; does. A program that has just been stopped can keep a file of the folder for a moment after it has
  ; ended, so the folder is tried again once a second, THE_REMOVAL_TRIES times in all.
  SetOutPath "$TEMP"
  StrCpy $R0 1
  theRemoval:
    RMDir /r "$INSTDIR"
    ${If} ${FileExists} "$INSTDIR\*.*"
    ${AndIf} $R0 < ${THE_REMOVAL_TRIES}
      IntOp $R0 $R0 + 1
      Sleep 1000
      Goto theRemoval
    ${EndIf}
  ${If} ${FileExists} "$INSTDIR\*.*"
    ; The entry starts the uninstaller in the folder, which went with the rest, so it is put back.
    ${IfNot} ${FileExists} "$INSTDIR\${THE_UNINSTALLER}"
      CopyFiles /SILENT "$EXEPATH" "$INSTDIR\${THE_UNINSTALLER}"
    ${EndIf}
    !insertmacro theRefusal "Some of $INSTDIR could not be removed, so ${THE_NAME} stays in Installed apps."
  ${EndIf}
  DeleteRegKey HKCU "${THE_UNINSTALL_KEY}"
SectionEnd
