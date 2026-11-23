// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * THE READER OF WINDOWS PROCESSES, OVER `Get-CimInstance Win32_Process`, RUN THROUGH POWERSHELL.
 *
 * ---------------------------------------------------------------------------------------------
 * WHAT IT IS
 * ---------------------------------------------------------------------------------------------
 *
 * One process is read by one PowerShell script, run once for each question. The script asks
 * Windows for the process with that number and prints a list holding one row, or an empty list
 * when no process has the number. The answer is JSON, so the reading is a check of the JSON and
 * then a plain field of the row.
 *
 * The reader has the same shape as the Mac one in ../process-reader.mjs. `processAt` answers three
 * ways: no such process, a process whose start time could not be read, and a process that was
 * read. Every other question answers a field or null. A failure to look throws, because a null
 * would call a live process gone and a made-up value would be worse.
 *
 * Windows has no process groups and no state letter. So `pgid` is 0 and `state` is the empty
 * string, and neither is invented from something else.
 *
 * `processWithItsCommandLine` answers what `processAt`, `commandLineOf` and `nameOf` answer, from the
 * one row of one script. The Windows probe reads a process that way, so one reading starts one
 * PowerShell and not two or three.
 *
 * THIS PROCESS ITSELF IS READ ONCE. Its number, its parent, its start, its name, its program and its
 * command line do not change while it runs. Windows does not give a process a new parent when its
 * parent ends. A question about it is asked from inside it, so it is running. So the first row about
 * `process.pid` that has a start answers every later question about it. A failed look, and a row
 * with no start, are not kept.
 *
 * EVERY OTHER CALL RUNS POWERSHELL, and the caller waits for it. It ran on a Windows 11 machine in
 * wave 13t, round W9. There a server read its own process five times at each start, with nine
 * PowerShells of about 1.2 seconds each. It is read on Linux, with stand-ins for PowerShell, in
 * tests/the-windows-side-of-the-system-layer.test.ts.
 *
 * A ROW ABOUT ANOTHER PROCESS ANSWERS THE REST OF ITS RUN OF THE THREAD. A question asked the way that
 * holds the thread keeps the row it read, and a microtask queued at the first such row forgets them
 * all. So the later questions about that process in the same run run no script. The look at whether a
 * conversation's recorded process runs (`theRecordedProcess` in ../session-process.mjs) asks four. On a
 * Windows 11 machine on 7 November 2026, those looks held the server's thread for 31 of the 84 seconds
 * that readings of processes held it (wave 13t, round W45). No row is used after a group is ended
 * (`aGroupIsBeingEnded`, which ./windows-groups.mjs says first), so a process that was ended is not
 * answered as running. An answer that no process has the number is not kept, nor is a failed look.
 * This process's own row is kept as said above, and not this way. It is read on Linux in cases 23, 25
 * and 26 of tests/the-windows-side-of-the-system-layer.test.ts.
 *
 * ONE READING OF EVERY PROCESS, FOR AN ACT THAT ASKS MANY QUESTIONS. `readEveryProcessFirst(act)` runs
 * one script that prints a row for every process, by the way that waits for PowerShell. Then it runs
 * the act, and every question the act asks about one process is answered from that reading, with no
 * script of its own. A reading that failed is thrown at each question, so it is never read as "no
 * process has that number". The reading answers only while the act runs, so an act that returns a
 * promise is refused. On a Windows 11 machine on 7 November 2026, the session hook ran 13 scripts of
 * about a second each, one after another, before its first request. Its walk up its parent chain is
 * the only reading of a process there (wave 13t, round W45). It is read on Linux in
 * tests/the-hooks-walk-on-windows-reads-the-processes-once.test.ts.
 *
 * WHO HOLDS ONE CONNECTION TO THIS SERVER. `readWhoHoldsAConnection` reads, in one script, the
 * connections Windows lists from one port to another, the process that owns each and that process's
 * parent, this server's own process, and the connections again. Each process is read with its
 * program, its start and the SID of the user it runs as. The Windows probe decides from those facts
 * whether the installed app's own window sent a request (lib/windows-probe.ts). It is read only by
 * the way that waits for PowerShell, so it never holds the server's thread. This script has not
 * been run on Windows. It is read on Linux, with stand-ins for PowerShell, in
 * tests/the-windows-window-is-the-person.test.ts.
 * The script runs in the PowerShell that stays (./windows-commands.mjs), so a reading after the first
 * starts no PowerShell. The script also says how long each of its four readings took, and the reading
 * answers that with the time the PowerShell that stays gave it. The Windows probe writes both to the log.
 *
 * THE SCRIPT CALLS WINDOWS ITSELF, and no CIM. In the installed Windows app, one reading through
 * Get-NetTCPConnection and Get-CimInstance took about 3 seconds, and three at once took 3.0, 5.7 and
 * 8.5 seconds, one behind another (wave 13t). So the script compiles a few of Windows' own calls
 * with Add-Type (`THE_CALLS_IN_CSHARP`), at the first script that needs them in a PowerShell, and each
 * later script there uses them as they are. A compile that fails stops the script with the reason, and
 * there is no other way of reading. Nothing is kept from one script to the next but those calls and
 * this server's own process.
 *
 * THIS SERVER IS READ ONCE IN EACH POWERSHELL THAT STAYS. Its program, its start and its user do not
 * change while it runs. The first script in a PowerShell reads it, and later scripts there are answered
 * with that row, once every field of it was given. A row with a field Windows did not give is not kept,
 * nor a script that failed, so the next script reads it again. A PowerShell started after the old one
 * was stopped has a new number, and its first script reads it again. A script made while the script
 * that reads it runs is answered with what that script read, and fails in words when that one failed.
 *
 * READINGS THAT WAIT ARE READ TOGETHER. While a script runs, the readings that arrive wait for the next
 * script, and that script reads all of them: the connections once, and each process once. Each reading
 * is answered with its own connection and the facts about its owners, and the probe judges each alone.
 * Each is given the script's four steps, and the time it waited itself. A script that fails fails every
 * reading in it, each in words naming its own connection.
 */

import { theRealWindowsCommands } from './windows-commands.mjs'

/**
 * @typedef {import('../process-reader.mjs').ProcessAt} ProcessAt
 * @typedef {import('../process-reader.mjs').ProcessReader} ProcessReader
 * @typedef {import('../process-reader.mjs').WhatACommandDid} WhatACommandDid
 * @typedef {import('./windows-commands.mjs').WindowsCommands} WindowsCommands
 */

/**
 * One process as `processAt` reads it, with the command line and the name from the same row.
 * @typedef {{ here: false }
 *   | { here: true, unreadable: string }
 *   | { here: true, unreadable?: undefined, pid: number, ppid: number, pgid: number, state: string,
 *       startedAt: Date, commandLine: string | null, name: string | null }} ProcessWithItsCommandLine
 */

/**
 * One process as the script's row gives it.
 * @typedef {{
 *   ProcessId: number,
 *   ParentProcessId: number,
 *   CreationDate: number | null,
 *   Name: string | null,
 *   ExecutablePath: string | null,
 *   CommandLine: string | null,
 * }} WindowsProcess
 */

/**
 * One connection Windows lists, as the far end's own row of it, in the fields the connection script prints.
 * @typedef {{
 *   LocalAddress: string,
 *   LocalPort: number,
 *   RemoteAddress: string,
 *   RemotePort: number,
 *   OwningProcess: number,
 * }} AConnectionRow
 */

/**
 * One process as the connection script prints it. `Sid` is the user it runs as. A process Windows will
 * not open has the number and the parent its list of processes gives, and null for the rest; so does a
 * field Windows refuses.
 * @typedef {{
 *   ProcessId: number,
 *   ParentProcessId: number,
 *   CreationDate: number | null,
 *   ExecutablePath: string | null,
 *   Sid: string | null,
 * }} AnOwningProcess
 */

/**
 * What a reading of one connection answers, from what its script printed: the rows, each owner with its
 * parent, this server, and the rows read again after the processes. A process that has ended is null.
 * In a script that read several connections, the steps are that script's.
 * @typedef {{
 *   Before: AConnectionRow[],
 *   Holders: { ProcessId: number, Holder: AnOwningProcess | null, Parent: AnOwningProcess | null }[],
 *   Server: AnOwningProcess | null,
 *   After: AConnectionRow[],
 *   Took?: TheTimeOfEachStep,
 * }} WhoHoldsAConnection
 */

/**
 * How long each step of the connection script took, in milliseconds, as PowerShell measured it: the
 * rows, their owners with their parents, this server, and the rows again.
 * @typedef {{ Before: number, Holders: number, Server: number, After: number }} TheTimeOfEachStep
 */

/**
 * What a reading of who holds a connection answers: what the script printed about it, and the time
 * the PowerShell that stays gave the script, with the wait that was the reading's own. The time is
 * null when the script ran in a PowerShell started for it.
 * @typedef {WhoHoldsAConnection & { took: import('./windows-commands.mjs').TheTimeAScriptTook | null }} WhoHoldsAConnectionAndTheTime
 */

/**
 * One connection a script is asked about: the far end's port and this server's.
 * @typedef {{ peerPort: number, ourPort: number }} AConnectionAsked
 */

/**
 * What a script printed about one connection it was asked about: its rows, each owner with its parent, and its rows
 * again.
 * @typedef {Pick<WhoHoldsAConnection, 'Before' | 'Holders' | 'After'>} TheRowsOfOneConnection
 */

/**
 * The readings that go in the next script of the PowerShell that stays: when the first of them asked, and each reading
 * with what answers it.
 * @typedef {{
 *   askedAt: number,
 *   readings: (AConnectionAsked & {
 *     arrivedAt: number,
 *     answer: (read: WhoHoldsAConnectionAndTheTime) => void,
 *     fail: (why: Error) => void,
 *   })[],
 * }} AGathering
 */

/**
 * What a script read about the connections it was asked about: this server's row when it read it, how long its steps
 * took when it said, and each connection with its rows or the failure that answers it. `server` is undefined when the
 * script failed as a whole, and null when it did not read this server.
 * @template {AConnectionAsked} T
 * @typedef {{
 *   server: AnOwningProcess | null | undefined,
 *   steps: TheTimeOfEachStep | undefined,
 *   each: { asked: T, got: TheRowsOfOneConnection | Error }[],
 * }} WhatAScriptRead
 */

/**
 * One reading waiting for its script: its connection, when it arrived, and what answers it.
 * @typedef {AGathering['readings'][number]} AReading
 */

/**
 * This server's own process as a script of the PowerShell that stays reads it: the number of that PowerShell, the
 * server's number, and the row the script printed. The row is undefined until that script has answered.
 * @typedef {{ program: number, pid: number, row: AnOwningProcess | null | undefined }} TheServersReading
 */

/**
 * How many times a group has been ended from this process. A row kept for one run of the thread answers only while
 * this has not changed since it was read.
 */
let theGroupsEnded = 0

/**
 * Said by the group stop just before it ends a group (./windows-groups.mjs), so no row read before it answers a
 * question after it.
 */
export function aGroupIsBeingEnded() {
  theGroupsEnded += 1
}

/** The name of the installed Windows app's own program, which its window runs as. */
export const THE_WINDOWS_APPS_PROGRAM = 'mole-office.exe'

/**
 * The script that reads one process. `-InputObject` with `@(...)` keeps a list of one as a list,
 * and an empty list prints as `[]`, so the answer always has the same shape.
 * @param {number} pid
 * @returns {string}
 */
function theOneProcessScript(pid) {
  return theProcessesScript(` -Filter "ProcessId = ${pid}"`)
}

/** The script that reads every process, each row with the same fields as a row about one process. */
const THE_EVERY_PROCESS_SCRIPT = theProcessesScript('')

/**
 * The script that prints a row for each process the filter lets through.
 * @param {string} filter the `-Filter` argument with its space before it, or nothing for every process
 * @returns {string}
 */
function theProcessesScript(filter) {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$rows = @(Get-CimInstance -ClassName Win32_Process${filter} | ForEach-Object {`,
    '  [pscustomobject]@{',
    '    ProcessId = [int64]$_.ProcessId',
    '    ParentProcessId = [int64]$_.ParentProcessId',
    '    CreationDate = if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { $null }',
    '    Name = $_.Name',
    '    ExecutablePath = $_.ExecutablePath',
    '    CommandLine = $_.CommandLine',
    '  }',
    '})',
    'ConvertTo-Json -InputObject $rows -Compress -Depth 2',
  ].join('\n')
}

/** The script that lists every process and the command line Windows was willing to give. */
const THE_EVERY_COMMAND_LINE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '$rows = @(Get-CimInstance -ClassName Win32_Process | ForEach-Object {',
  '  [pscustomobject]@{',
  '    ProcessId = [int64]$_.ProcessId',
  '    CommandLine = $_.CommandLine',
  '  }',
  '})',
  'ConvertTo-Json -InputObject $rows -Compress -Depth 2',
].join('\n')

/**
 * WINDOWS' OWN CALLS, IN C#, as the connection script compiles them with Add-Type. Each name is one Windows call, so
 * nothing here goes through CIM:
 *   - `TheConnections.Read` lists the connections Windows keeps, IPv4 and IPv6, each with the process that owns it,
 *     through GetExtendedTcpTable, and keeps those that are established;
 *   - `TheProcesses` reads each process once: its parent from one CreateToolhelp32Snapshot, then, through OpenProcess
 *     with the right to query limited information, its program (QueryFullProcessImageName), its start
 *     (GetProcessTimes) and the SID of its user (OpenProcessToken and GetTokenInformation).
 * A process the snapshot does not list has ended, and so has one Windows says no longer runs, or will not open
 * because its number is no longer given. A process Windows refuses to open keeps the number and the parent the
 * snapshot gives, with null for the rest; so does a field Windows refuses. GetExitCodeProcess says whether a
 * process still runs. A process that ended with the code that means "still running" (259) is read as running.
 * It is written for the C# 5 compiler that Windows PowerShell 5.1 uses.
 */
const THE_CALLS_IN_CSHARP = `using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;

namespace MoleOffice
{
    public class TcpRow
    {
        public string LocalAddress { get; set; }
        public long LocalPort { get; set; }
        public string RemoteAddress { get; set; }
        public long RemotePort { get; set; }
        public long OwningProcess { get; set; }
    }

    public class ProcessFacts
    {
        public long ProcessId { get; set; }
        public long ParentProcessId { get; set; }
        public long? CreationDate { get; set; }
        public string ExecutablePath { get; set; }
        public string Sid { get; set; }
    }

    public class TheConnections
    {
        const int AF_INET = 2;
        const int AF_INET6 = 23;
        const int TCP_TABLE_OWNER_PID_CONNECTIONS = 4;
        const int MIB_TCP_STATE_ESTAB = 5;
        const uint ERROR_INSUFFICIENT_BUFFER = 122;

        [DllImport("iphlpapi.dll")]
        static extern uint GetExtendedTcpTable(IntPtr table, ref int size, bool sorted, int family, int tableClass, uint reserved);

        readonly List<TcpRow> rows = new List<TcpRow>();

        public static TheConnections Read()
        {
            TheConnections read = new TheConnections();
            read.ReadTheTable(AF_INET, 24);
            read.ReadTheTable(AF_INET6, 56);
            return read;
        }

        public TcpRow[] From(long localPort, long remotePort)
        {
            return rows.FindAll(row => row.LocalPort == localPort && row.RemotePort == remotePort).ToArray();
        }

        void ReadTheTable(int family, int rowSize)
        {
            int size = 0;
            IntPtr table = IntPtr.Zero;
            try
            {
                for (int tries = 1; ; tries++)
                {
                    uint said = GetExtendedTcpTable(table, ref size, false, family, TCP_TABLE_OWNER_PID_CONNECTIONS, 0);
                    if (said == 0) break;
                    if (said != ERROR_INSUFFICIENT_BUFFER || tries == 5)
                    {
                        throw new Exception("GetExtendedTcpTable did not list the connections: " + new Win32Exception((int)said).Message);
                    }
                    if (table != IntPtr.Zero) Marshal.FreeHGlobal(table);
                    table = Marshal.AllocHGlobal(size);
                }
                int count = Marshal.ReadInt32(table);
                for (int i = 0; i < count; i++)
                {
                    IntPtr row = IntPtr.Add(table, 4 + i * rowSize);
                    if (family == AF_INET)
                    {
                        if (Marshal.ReadInt32(row, 0) != MIB_TCP_STATE_ESTAB) continue;
                        TcpRow four = new TcpRow();
                        four.LocalAddress = new IPAddress((long)(uint)Marshal.ReadInt32(row, 4)).ToString();
                        four.LocalPort = PortOf(Marshal.ReadInt32(row, 8));
                        four.RemoteAddress = new IPAddress((long)(uint)Marshal.ReadInt32(row, 12)).ToString();
                        four.RemotePort = PortOf(Marshal.ReadInt32(row, 16));
                        four.OwningProcess = (uint)Marshal.ReadInt32(row, 20);
                        rows.Add(four);
                    }
                    else
                    {
                        if (Marshal.ReadInt32(row, 48) != MIB_TCP_STATE_ESTAB) continue;
                        TcpRow six = new TcpRow();
                        six.LocalAddress = AddressAt(row, 0);
                        six.LocalPort = PortOf(Marshal.ReadInt32(row, 20));
                        six.RemoteAddress = AddressAt(row, 24);
                        six.RemotePort = PortOf(Marshal.ReadInt32(row, 44));
                        six.OwningProcess = (uint)Marshal.ReadInt32(row, 52);
                        rows.Add(six);
                    }
                }
            }
            finally
            {
                if (table != IntPtr.Zero) Marshal.FreeHGlobal(table);
            }
        }

        static long PortOf(int inNetworkOrder)
        {
            return ((inNetworkOrder & 0xFF) << 8) | ((inNetworkOrder >> 8) & 0xFF);
        }

        static string AddressAt(IntPtr row, int offset)
        {
            byte[] address = new byte[16];
            Marshal.Copy(IntPtr.Add(row, offset), address, 0, 16);
            return new IPAddress(address).ToString();
        }
    }

    public class TheProcesses
    {
        const uint TH32CS_SNAPPROCESS = 0x2;
        const uint PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;
        const uint TOKEN_QUERY = 0x8;
        const int TOKEN_USER = 1;
        const int ERROR_NO_MORE_FILES = 18;
        const int ERROR_INVALID_PARAMETER = 87;
        const uint STILL_ACTIVE = 259;
        const long THE_UNIX_EPOCH_IN_FILETIME = 116444736000000000L;

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        struct PROCESSENTRY32W
        {
            public uint dwSize;
            public uint cntUsage;
            public uint th32ProcessID;
            public IntPtr th32DefaultHeapID;
            public uint th32ModuleID;
            public uint cntThreads;
            public uint th32ParentProcessID;
            public int pcPriClassBase;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string szExeFile;
        }

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "Process32FirstW")]
        static extern bool Process32First(IntPtr snapshot, ref PROCESSENTRY32W entry);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "Process32NextW")]
        static extern bool Process32Next(IntPtr snapshot, ref PROCESSENTRY32W entry);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern IntPtr OpenProcess(uint access, bool inherit, uint processId);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetExitCodeProcess(IntPtr process, out uint code);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "QueryFullProcessImageNameW")]
        static extern bool QueryFullProcessImageName(IntPtr process, uint flags, StringBuilder name, ref int size);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool GetProcessTimes(IntPtr process, out long creation, out long exit, out long kernel, out long user);

        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool OpenProcessToken(IntPtr process, uint access, out IntPtr token);

        [DllImport("advapi32.dll", SetLastError = true)]
        static extern bool GetTokenInformation(IntPtr token, int infoClass, IntPtr info, int length, out int needed);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool CloseHandle(IntPtr handle);

        Dictionary<long, long> parents;
        readonly Dictionary<long, ProcessFacts> read = new Dictionary<long, ProcessFacts>();

        public ProcessFacts Read(long pid)
        {
            ProcessFacts kept;
            if (read.TryGetValue(pid, out kept)) return kept;
            ProcessFacts facts = ReadOnce(pid);
            read[pid] = facts;
            return facts;
        }

        ProcessFacts ReadOnce(long pid)
        {
            if (parents == null) parents = TakeTheSnapshot();
            long parent;
            if (!parents.TryGetValue(pid, out parent)) return null;
            ProcessFacts facts = new ProcessFacts();
            facts.ProcessId = pid;
            facts.ParentProcessId = parent;
            IntPtr process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, (uint)pid);
            if (process == IntPtr.Zero)
            {
                // Windows gives ERROR_INVALID_PARAMETER for a number no process has. Process 0 is never opened.
                return pid != 0 && Marshal.GetLastWin32Error() == ERROR_INVALID_PARAMETER ? null : facts;
            }
            try
            {
                uint code;
                if (GetExitCodeProcess(process, out code) && code != STILL_ACTIVE) return null;
                StringBuilder name = new StringBuilder(32768);
                int length = 32768;
                if (QueryFullProcessImageName(process, 0, name, ref length)) facts.ExecutablePath = name.ToString();
                long creation, exit, kernel, user;
                if (GetProcessTimes(process, out creation, out exit, out kernel, out user) && creation > 0)
                {
                    facts.CreationDate = (creation - THE_UNIX_EPOCH_IN_FILETIME) / 10000;
                }
                facts.Sid = SidOf(process);
            }
            finally
            {
                CloseHandle(process);
            }
            return facts;
        }

        static string SidOf(IntPtr process)
        {
            IntPtr token;
            if (!OpenProcessToken(process, TOKEN_QUERY, out token)) return null;
            IntPtr user = IntPtr.Zero;
            try
            {
                int needed;
                GetTokenInformation(token, TOKEN_USER, IntPtr.Zero, 0, out needed);
                if (needed <= 0) return null;
                user = Marshal.AllocHGlobal(needed);
                if (!GetTokenInformation(token, TOKEN_USER, user, needed, out needed)) return null;
                return new SecurityIdentifier(Marshal.ReadIntPtr(user)).Value;
            }
            finally
            {
                if (user != IntPtr.Zero) Marshal.FreeHGlobal(user);
                CloseHandle(token);
            }
        }

        static Dictionary<long, long> TakeTheSnapshot()
        {
            IntPtr snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if (snapshot == new IntPtr(-1))
            {
                throw new Exception("CreateToolhelp32Snapshot did not list the processes: " + new Win32Exception(Marshal.GetLastWin32Error()).Message);
            }
            try
            {
                Dictionary<long, long> each = new Dictionary<long, long>();
                PROCESSENTRY32W entry = new PROCESSENTRY32W();
                entry.dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32W));
                for (bool more = Process32First(snapshot, ref entry); more; more = Process32Next(snapshot, ref entry))
                {
                    each[entry.th32ProcessID] = entry.th32ParentProcessID;
                }
                int error = Marshal.GetLastWin32Error();
                if (error != ERROR_NO_MORE_FILES)
                {
                    throw new Exception("Process32Next did not list every process: " + new Win32Exception(error).Message);
                }
                return each;
            }
            finally
            {
                CloseHandle(snapshot);
            }
        }
    }
}`

/**
 * THE SCRIPT THAT READS WHO HOLDS EACH CONNECTION it is asked about, from the far end's port to this server's port.
 *
 * Windows lists each end of a connection on this computer as a row of its own. The row whose local port is the far
 * end's port and whose remote port is this server's is the far end's own row, and its owner is the program that holds
 * that end. Only established connections are listed. The connections are listed once for all the connections asked
 * about, and each process is read once however many of them name it. A process that has ended prints as null, and a
 * field Windows refuses prints as null. This server is read only when the script is given its number.
 *
 * The first line after the error rule says what the script asks, as JSON. Windows' own calls are compiled at the first
 * script of a PowerShell, and a compile that fails stops the script with the reason. The four steps are timed after
 * the compile, so a compile is in the script's whole time and in none of its steps.
 * @param {AConnectionAsked[]} connections
 * @param {number | null} serverPid this server's number when the script reads it, or null
 * @returns {string}
 */
function theConnectionScript(connections, serverPid) {
  const asked = JSON.stringify({ Connections: connections.map((one) => ({ Peer: one.peerPort, Ours: one.ourPort })), Server: serverPid })
  return [
    "$ErrorActionPreference = 'Stop'",
    `$asked = ConvertFrom-Json '${asked}'`,
    "if ($null -eq ('MoleOffice.TheProcesses' -as [type])) {",
    '  try {',
    "    Add-Type -TypeDefinition @'",
    THE_CALLS_IN_CSHARP,
    "'@",
    '  } catch {',
    `    throw "Windows' own calls could not be compiled: $($_.Exception.Message)"`,
    '  }',
    '}',
    'function Rows-Of($table, $one) {',
    '  foreach ($row in $table.From($one.Peer, $one.Ours)) {',
    '    [pscustomobject]@{ LocalAddress = $row.LocalAddress; LocalPort = $row.LocalPort; RemoteAddress = $row.RemoteAddress; RemotePort = $row.RemotePort; OwningProcess = $row.OwningProcess }',
    '  }',
    '}',
    'function Facts-Of($facts) {',
    '  if ($null -eq $facts) { return $null }',
    '  [pscustomobject]@{ ProcessId = $facts.ProcessId; ParentProcessId = $facts.ParentProcessId; CreationDate = $facts.CreationDate; ExecutablePath = $facts.ExecutablePath; Sid = $facts.Sid }',
    '}',
    '$processes = [MoleOffice.TheProcesses]::new()',
    '$each = [System.Collections.Generic.List[object]]::new()',
    '$watch = [System.Diagnostics.Stopwatch]::StartNew()',
    '$table = [MoleOffice.TheConnections]::Read()',
    'foreach ($one in $asked.Connections) {',
    '  $each.Add([pscustomobject]@{ Peer = [int64]$one.Peer; Ours = [int64]$one.Ours; Before = @(Rows-Of $table $one); Holders = @(); After = @() })',
    '}',
    '$readBefore = $watch.ElapsedMilliseconds',
    'foreach ($one in $each) {',
    '  $holders = [System.Collections.Generic.List[object]]::new()',
    '  foreach ($id in @($one.Before | ForEach-Object { $_.OwningProcess } | Sort-Object -Unique)) {',
    '    $holder = $processes.Read($id)',
    '    $parent = if ($null -ne $holder) { Facts-Of $processes.Read($holder.ParentProcessId) } else { $null }',
    '    $holders.Add([pscustomobject]@{ ProcessId = $id; Holder = (Facts-Of $holder); Parent = $parent })',
    '  }',
    '  $one.Holders = $holders.ToArray()',
    '}',
    '$readHolders = $watch.ElapsedMilliseconds',
    '$server = if ($null -ne $asked.Server) { Facts-Of $processes.Read([int64]$asked.Server) } else { $null }',
    '$readServer = $watch.ElapsedMilliseconds',
    '$table = [MoleOffice.TheConnections]::Read()',
    'foreach ($one in $each) { $one.After = @(Rows-Of $table $one) }',
    '$readAfter = $watch.ElapsedMilliseconds',
    '$took = [pscustomobject]@{ Before = $readBefore; Holders = $readHolders - $readBefore; Server = $readServer - $readHolders; After = $readAfter - $readServer }',
    '$said = [pscustomobject]@{ Connections = $each.ToArray(); Server = $server; Took = $took }',
    'ConvertTo-Json -InputObject $said -Compress -Depth 8',
  ].join('\n')
}

/**
 * The words naming one connection, as each reading's own failure says them.
 * @param {AConnectionAsked} one
 * @returns {string}
 */
function theConnectionNamed(one) {
  return `the connection from port ${String(one.peerPort)} to port ${String(one.ourPort)}`
}

/**
 * What a script answered about each connection it was asked about, and this server, after the shape is checked. Each
 * connection asked about is paired with its rows or with the failure that is its answer. A command that did not run, a
 * failed command, an answer that is not JSON and an answer that does not list each connection asked about fail every
 * connection in the script, each in words naming it, and then `server` is undefined. An entry of another shape, or
 * about another connection, fails that connection alone. None is read as "nobody holds it".
 * @template {AConnectionAsked} T
 * @param {WhatACommandDid} did
 * @param {T[]} asked
 * @param {boolean} readsTheServer whether the script was given this server's number
 * @returns {WhatAScriptRead<T>}
 */
function theHoldersIn(did, asked, readsTheServer) {
  const failEach = (/** @type {(which: string) => string} */ words) => ({
    server: undefined,
    steps: undefined,
    each: asked.map((one) => ({ asked: one, got: new Error(words(theConnectionNamed(one))) })),
  })
  if (!did.ran) return failEach((which) => `Who holds ${which} is unknown: ${did.reason}`)
  if (did.status !== 0) return failEach((which) => `Who holds ${which} is unknown: ${whatItSaid(did)}`)
  const didNotList = (/** @type {string} */ which) => `The answer about ${which} did not list its rows, their owners and this server.`
  let said
  try {
    said = JSON.parse(did.stdout)
  } catch {
    return failEach((which) => `The answer about ${which} was not JSON.`)
  }
  const isAList = (/** @type {unknown} */ one) => Array.isArray(one)
  if (
    said === null ||
    typeof said !== 'object' ||
    !isAList(said.Connections) ||
    said.Connections.length !== asked.length ||
    (readsTheServer && said.Server !== null && typeof said.Server !== 'object')
  ) {
    return failEach(didNotList)
  }
  return {
    server: readsTheServer ? said.Server : null,
    steps: said.Took,
    each: asked.map((one, at) => {
      const entry = said.Connections[at]
      if (
        entry === null ||
        typeof entry !== 'object' ||
        entry.Peer !== one.peerPort ||
        entry.Ours !== one.ourPort ||
        !isAList(entry.Before) ||
        !isAList(entry.Holders) ||
        !isAList(entry.After)
      ) {
        return { asked: one, got: new Error(didNotList(theConnectionNamed(one))) }
      }
      return { asked: one, got: { Before: entry.Before, Holders: entry.Holders, After: entry.After } }
    }),
  }
}

/**
 * Whether a row of this server's own process has every field Windows can give, so it may answer later scripts.
 * @param {AnOwningProcess | null} row
 * @param {number} pid
 * @returns {row is AnOwningProcess}
 */
function isWhole(row, pid) {
  return (
    row !== null &&
    row.ProcessId === pid &&
    Number.isSafeInteger(row.ParentProcessId) &&
    typeof row.CreationDate === 'number' &&
    typeof row.ExecutablePath === 'string' &&
    typeof row.Sid === 'string'
  )
}

/**
 * The two ports of a connection, checked before a script names them.
 * @param {number} peerPort
 * @param {number} ourPort
 * @param {number} serverPid
 */
function checkTheConnection(peerPort, ourPort, serverPid) {
  for (const port of [peerPort, ourPort]) {
    if (!Number.isSafeInteger(port) || port <= 0 || port > 65535) throw new Error(`Port ${String(port)} is not a port.`)
  }
  if (!Number.isSafeInteger(serverPid) || serverPid <= 0) {
    throw new Error(`Process number ${String(serverPid)} is not a whole number above 0.`)
  }
}

/**
 * The words a process that is running is said to be unreadable in when Windows did not say when it started.
 * @param {number} pid
 * @returns {string}
 */
export function theStartWasNotSaidWords(pid) {
  return `Process ${String(pid)} is running, but Windows did not say when it started.`
}

/**
 * The words a failure to look is said in. They name the process, because the caller is asking
 * about that one.
 * @param {number} pid
 * @param {string} why
 * @returns {string}
 */
export function whetherItRunsIsUnknownWords(pid, why) {
  return `Whether process ${String(pid)} is running is unknown: ${why}`
}

/**
 * What a failed command said, in one plain sentence.
 * @param {WhatACommandDid & { ran: true }} did
 * @returns {string}
 */
function whatItSaid(did) {
  const onTheErrorStream = did.stderr.trim()
  return onTheErrorStream === '' ? `powershell.exe exited ${String(did.status)}` : onTheErrorStream
}

/**
 * The rows in an answer about one process. A command that did not run, a failed command, an answer
 * that is not JSON and an answer that is not a list all throw; none is read as an absence.
 * @param {WhatACommandDid} did
 * @param {number} pid
 * @returns {WindowsProcess[]}
 */
function theRowsIn(did, pid) {
  if (!did.ran) throw new Error(whetherItRunsIsUnknownWords(pid, did.reason))
  if (did.status !== 0) throw new Error(whetherItRunsIsUnknownWords(pid, whatItSaid(did)))
  let said
  try {
    said = JSON.parse(did.stdout)
  } catch {
    throw new Error(`The answer about process ${String(pid)} was not JSON.`)
  }
  if (!Array.isArray(said)) {
    throw new Error(`The answer about process ${String(pid)} was not a list of rows.`)
  }
  return said
}

/**
 * The rows in an answer listing the processes on this machine. A command that did not run, a failed command, an answer
 * that is not JSON and an answer that is not a list all throw.
 * @param {WhatACommandDid} did
 * @returns {WindowsProcess[]}
 */
function theListIn(did) {
  if (!did.ran) throw new Error(`The processes on this machine could not be listed: ${did.reason}`)
  if (did.status !== 0) throw new Error(`The processes on this machine could not be listed: ${whatItSaid(did)}`)
  let said
  try {
    said = JSON.parse(did.stdout)
  } catch {
    throw new Error('The answer listing the processes on this machine was not JSON.')
  }
  if (!Array.isArray(said)) {
    throw new Error('The answer listing the processes on this machine was not a list of rows.')
  }
  return said
}

/**
 * The rows of a reading of every process, by their number. A row whose number is not a whole number throws, because
 * the questions about it would then be answered "no such process". Windows lists the System Idle Process as 0.
 * @param {WindowsProcess[]} rows
 * @returns {Map<number, WindowsProcess[]>}
 */
function theRowsByNumber(rows) {
  /** @type {Map<number, WindowsProcess[]>} */
  const byNumber = new Map()
  for (const row of rows) {
    const pid = row?.ProcessId
    if (!Number.isSafeInteger(pid) || pid < 0) {
      throw new Error(`The answer listing the processes on this machine held a row whose process number is ${JSON.stringify(pid)}.`)
    }
    byNumber.set(pid, [...(byNumber.get(pid) ?? []), row])
  }
  return byNumber
}

/**
 * The moment the process started, or null when Windows gave none. A value that is neither a
 * number nor null throws, because a string would become an invalid Date and be handed on as a
 * start time.
 * @param {number} pid
 * @param {number | null} creation
 * @returns {Date | null}
 */
function theStartTime(pid, creation) {
  if (creation === null) return null
  if (typeof creation !== 'number' || !Number.isFinite(creation)) {
    throw new Error(`The start time of process ${String(pid)} was neither a number nor null.`)
  }
  return new Date(creation)
}

/**
 * THE WINDOWS READER.
 *
 * Every question about one process runs one script for that pid, except while an act runs inside
 * `readEveryProcessFirst`, and except when the same run of the thread has read a row about that pid already, with no
 * group ended since. An empty list is the one answer read as gone. More than one row, or a row
 * about another process, is not an answer about the process asked for, so it throws rather than
 * taking the first row.
 *
 * Each question that reads the process table has a twin whose name begins with "read". The twin runs the
 * same script by the way that waits for PowerShell without holding the thread, and reads its answer the
 * same way.
 *
 * @param {WindowsCommands} [commands] the real PowerShell unless a test hands in its own
 * @returns {ProcessReader & {
 *   readProcessAt: (pid: number) => Promise<ProcessAt>,
 *   processWithItsCommandLine: (pid: number) => ProcessWithItsCommandLine,
 *   readProcessWithItsCommandLine: (pid: number) => Promise<ProcessWithItsCommandLine>,
 *   readWhoHoldsAConnection: (peerPort: number, ourPort: number, serverPid: number) => Promise<WhoHoldsAConnectionAndTheTime>,
 *   readEveryProcessFirst: <T>(act: () => T) => Promise<T>,
 * }}
 */
export function windowsProcessReader(commands = theRealWindowsCommands()) {
  /**
   * This process's own row, once one with a start has been read.
   * @type {WindowsProcess | null}
   */
  let ownRow = null

  /**
   * The reading of every process an act is answered from while it runs inside `readEveryProcessFirst`, or the failure
   * that reading met. Null when no act is running inside one.
   * @type {{ rows: Map<number, WindowsProcess[]> } | { failed: string } | null}
   */
  let lent = null

  /**
   * The rows about other processes read in this run of the thread, and how many groups had been ended when they were
   * read. Null when none has been read since the last microtask that forgot them.
   * @type {{ rows: Map<number, WindowsProcess>, groupsEnded: number } | null}
   */
  let thisRun = null

  /**
   * This server's own process as a script of the PowerShell that stays read it, or is reading it. Null until a script
   * is made to read it, and again once that script failed or printed a row that is not whole.
   * @type {TheServersReading | null}
   */
  let theServer = null

  /**
   * The readings of who holds a connection that wait for the next script of the PowerShell that stays, by the number
   * of the server they name. A reading that arrives while they wait joins them. That script takes them at its turn,
   * so a reading that arrives after it waits for the script after it.
   * @type {Map<number, AGathering>}
   */
  const gathered = new Map()

  /**
   * Ask the PowerShell that stays for one script about the readings gathered, made at its turn, and answer each of
   * them. The script reads this server when no script of the same PowerShell has read it or is reading it.
   * @param {NonNullable<WindowsCommands['askThePowerShellThatStays']>} ask
   * @param {AGathering} gathering
   * @param {number} serverPid
   */
  const readTogether = (ask, gathering, serverPid) => {
    /** @type {TheServersReading | null} */
    let from = null
    let readsTheServer = false
    const takeThem = () => {
      if (gathered.get(serverPid) === gathering) gathered.delete(serverPid)
    }
    ask((program) => {
      takeThem()
      if (theServer === null || theServer.program !== program || theServer.pid !== serverPid) {
        theServer = { program, pid: serverPid, row: undefined }
        readsTheServer = true
      }
      from = theServer
      return theConnectionScript(gathering.readings, readsTheServer ? serverPid : null)
    }).then(
      (did) => {
        takeThem()
        const read = theHoldersIn(did, gathering.readings, readsTheServer)
        if (readsTheServer && from !== null) {
          from.row = read.server
          // A row with a field Windows did not give, and a script that failed, are not kept: the next script reads it.
          if ((read.server === undefined || !isWhole(read.server, serverPid)) && theServer === from) theServer = null
        }
        // Each reading's own wait: the script's, less the time from the first reading in it to this one. A reading
        // joins before the script's turn, so only a clock's rounding could make it less than 0.
        answerEach(read, from?.row, (reading) => ({
          ...did.took,
          queuedMs: Math.max(0, did.took.queuedMs - (reading.arrivedAt - gathering.askedAt)),
        }))
      },
      (why) => {
        takeThem()
        if (readsTheServer && theServer === from) theServer = null
        failEach(gathering.readings, why)
      },
    )
  }

  /**
   * Answer each reading a script was about. A reading whose connection the script could not read fails with why. With
   * no row of this server to judge them by, because the script that was to read it failed, every reading fails.
   * @param {WhatAScriptRead<AReading>} read
   * @param {AnOwningProcess | null | undefined} server
   * @param {(reading: AReading) => import('./windows-commands.mjs').TheTimeAScriptTook | null} tookBy
   */
  const answerEach = (read, server, tookBy) => {
    for (const { asked: reading, got } of read.each) {
      if (got instanceof Error) {
        reading.fail(got)
      } else if (server === undefined) {
        reading.fail(new Error(`Who holds ${theConnectionNamed(reading)} is unknown: this server's own process was not read, because the script that was to read it in this PowerShell failed.`))
      } else {
        reading.answer({ ...got, Server: server, ...(read.steps === undefined ? {} : { Took: read.steps }), took: tookBy(reading) })
      }
    }
  }

  /**
   * Fail each reading of a script that was not answered at all, with why.
   * @param {AReading[]} readings
   * @param {unknown} why
   */
  const failEach = (readings, why) => {
    const words = why instanceof Error ? why.message : String(why)
    for (const reading of readings) reading.fail(new Error(`Who holds ${theConnectionNamed(reading)} is unknown: ${words}`))
  }

  /**
   * The one row about the process, or null when the answer says no process has the number.
   * @param {number} pid
   * @returns {WindowsProcess | null}
   */
  const one = (pid) => {
    const kept = theRowKeptFor(pid)
    if (kept !== undefined) return kept
    if (lent !== null) {
      if ('failed' in lent) throw new Error(whetherItRunsIsUnknownWords(pid, lent.failed))
      return theOneRowOf(lent.rows.get(pid) ?? [], pid)
    }
    const keptThisRun = thisRun?.groupsEnded === theGroupsEnded ? thisRun.rows.get(pid) : undefined
    if (keptThisRun !== undefined) return keptThisRun
    const row = theOneRowIn(commands.powershell(theOneProcessScript(pid)), pid)
    if (row !== null && pid !== process.pid) keepForThisRun(pid, row)
    return row
  }

  /**
   * Keep a row about another process for the rest of this run of the thread.
   * @param {number} pid
   * @param {WindowsProcess} row
   */
  const keepForThisRun = (pid, row) => {
    if (thisRun === null) {
      queueMicrotask(() => {
        thisRun = null
      })
    }
    if (thisRun === null || thisRun.groupsEnded !== theGroupsEnded) thisRun = { rows: new Map(), groupsEnded: theGroupsEnded }
    thisRun.rows.set(pid, row)
  }

  /**
   * The same row, read by the way that does not hold the thread while PowerShell runs.
   * @param {number} pid
   * @returns {Promise<WindowsProcess | null>}
   */
  const readOne = async (pid) => {
    const kept = theRowKeptFor(pid)
    if (kept !== undefined) return kept
    return theOneRowIn(await commands.startPowerShell(theOneProcessScript(pid)), pid)
  }

  /**
   * This process's own row when it has been read already, after the number is checked. Undefined means: ask.
   * @param {number} pid
   * @returns {WindowsProcess | undefined}
   */
  const theRowKeptFor = (pid) => {
    if (!Number.isSafeInteger(pid) || pid <= 0) {
      throw new Error(`Process number ${String(pid)} is not a whole number above 0.`)
    }
    if (pid === process.pid && ownRow !== null) return ownRow
    return undefined
  }

  /**
   * The one row a script's answer holds about the process.
   * @param {WhatACommandDid} did
   * @param {number} pid
   * @returns {WindowsProcess | null}
   */
  const theOneRowIn = (did, pid) => theOneRowOf(theRowsIn(did, pid), pid)

  /**
   * The one row of these rows about the process.
   * @param {WindowsProcess[]} rows
   * @param {number} pid
   * @returns {WindowsProcess | null}
   */
  const theOneRowOf = (rows, pid) => {
    const [row] = rows
    if (row === undefined) return null
    if (rows.length !== 1) {
      throw new Error(`The answer about process ${String(pid)} held ${String(rows.length)} rows rather than one.`)
    }
    if (row.ProcessId !== pid) {
      throw new Error(`The answer about process ${String(pid)} was about process ${String(row.ProcessId)}.`)
    }
    if (pid === process.pid && theStartTime(pid, row.CreationDate) !== null) ownRow = row
    return row
  }

  /**
   * What `processAt` answers, from one row.
   * @param {number} pid
   * @param {WindowsProcess | null} row
   * @returns {ProcessAt}
   */
  const atOf = (pid, row) => {
    if (row === null) return { here: false }
    const startedAt = theStartTime(pid, row.CreationDate)
    if (startedAt === null) {
      return { here: true, unreadable: theStartWasNotSaidWords(pid) }
    }
    return {
      here: true,
      pid: row.ProcessId,
      ppid: row.ParentProcessId,
      pgid: 0,
      state: '',
      startedAt,
    }
  }

  /**
   * What `processWithItsCommandLine` answers, from one row.
   * @param {number} pid
   * @param {WindowsProcess | null} row
   * @returns {ProcessWithItsCommandLine}
   */
  const withItsCommandLineOf = (pid, row) => {
    const at = atOf(pid, row)
    if (!at.here || at.unreadable !== undefined) return at
    return { ...at, commandLine: row?.CommandLine ?? null, name: row?.Name ?? null }
  }

  return {
    platform: 'win32',

    processAt(pid) {
      return atOf(pid, one(pid))
    },

    async readProcessAt(pid) {
      return atOf(pid, await readOne(pid))
    },

    processWithItsCommandLine(pid) {
      return withItsCommandLineOf(pid, one(pid))
    },

    async readProcessWithItsCommandLine(pid) {
      return withItsCommandLineOf(pid, await readOne(pid))
    },

    commandLineOf(pid) {
      return one(pid)?.CommandLine ?? null
    },

    nameOf(pid) {
      return one(pid)?.Name ?? null
    },

    executableOf(pid) {
      return one(pid)?.ExecutablePath ?? null
    },

    parentOf(pid) {
      return one(pid)?.ParentProcessId ?? null
    },

    startTimeOf(pid) {
      const row = one(pid)
      return row === null ? null : theStartTime(pid, row.CreationDate)
    },

    everyCommandLine() {
      const said = theListIn(commands.powershell(THE_EVERY_COMMAND_LINE_SCRIPT))
      /** @type {{ pid: number, command: string }[]} */
      const out = []
      for (const row of said) {
        if (row.CommandLine === null || row.CommandLine === undefined) continue
        out.push({ pid: row.ProcessId, command: row.CommandLine })
      }
      return out
    },

    async readWhoHoldsAConnection(peerPort, ourPort, serverPid) {
      checkTheConnection(peerPort, ourPort, serverPid)
      const ask = commands.askThePowerShellThatStays
      /** @type {Promise<WhoHoldsAConnectionAndTheTime>} */
      const answered = new Promise((answer, fail) => {
        /** @type {AReading} */
        const reading = { peerPort, ourPort, arrivedAt: performance.now(), answer, fail }
        if (ask === undefined) {
          // A POWERSHELL STARTED FOR THE READING reads this server as well, as the first script of each PowerShell does.
          commands.startPowerShell(theConnectionScript([reading], serverPid)).then(
            (did) => {
              const read = theHoldersIn(did, [reading], true)
              answerEach(read, read.server, () => null)
            },
            (why) => failEach([reading], why),
          )
          return
        }
        const waiting = gathered.get(serverPid)
        if (waiting !== undefined) {
          waiting.readings.push(reading)
          return
        }
        /** @type {AGathering} */
        const gathering = { askedAt: reading.arrivedAt, readings: [reading] }
        gathered.set(serverPid, gathering)
        readTogether(ask, gathering, serverPid)
      })
      return await answered
    },

    readEveryProcessFirst,
  }

  /**
   * Read every process by the way that waits, then run the act, answering each question it asks about one process from
   * that reading. The reading answers only while the act runs.
   * @template T
   * @param {() => T} act
   * @returns {Promise<T>}
   */
  async function readEveryProcessFirst(act) {
    /** @type {{ rows: Map<number, WindowsProcess[]> } | { failed: string }} */
    let reading
    try {
      reading = { rows: theRowsByNumber(theListIn(await commands.startPowerShell(THE_EVERY_PROCESS_SCRIPT))) }
    } catch (failed) {
      // Kept to be thrown at each question the act asks, as a reading of that one process would have thrown.
      reading = { failed: failed instanceof Error ? failed.message : String(failed) }
    }
    const before = lent
    lent = reading
    try {
      const done = act()
      if (typeof (/** @type {{ then?: unknown } | null | undefined} */ (done))?.then === 'function') {
        throw new Error('An act read inside one reading of every process must not wait: the reading answers it only while it runs. This one returned a promise.')
      }
      return done
    } finally {
      lent = before
    }
  }
}
