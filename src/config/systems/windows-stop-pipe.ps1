# Copyright © 2026 Zhengyang Shen
# Licensed under the MIT License. See LICENSE.
# THE STOP PIPE OF ONE PROGRAM ON WINDOWS, owned by this helper and not by Node.
#
# Node's own pipe server cannot refuse remote clients or set who may open the pipe. This helper makes the
# pipe itself: the first instance of its name only, remote clients refused, and access for this Windows
# user alone. It answers only the exact line "stop" with "stopping", and writes "stop" on its standard
# output for the program to read. It ends when the program ends.
#
# It is started by ./windows-groups.mjs, which reads this file as it is. Its two values come in its
# environment: the pipe's name, and the number of the program it serves. When it cannot make the pipe,
# it writes one sentence on its error stream and ends with exit code 125.
#
# Progress is silenced first: hidden, PowerShell writes it to the error stream as XML, and that stream is said when
# the helper ends.
$ProgressPreference = 'SilentlyContinue'
$ErrorActionPreference = 'Stop'
try {
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Text;
using System.Threading;

public static class MoleOfficeStopPipe {
  [StructLayout(LayoutKind.Sequential)]
  public struct SecurityAttributes {
    public int nLength;
    public IntPtr lpSecurityDescriptor;
    public int bInheritHandle;
  }

  [DllImport("advapi32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool ConvertStringSecurityDescriptorToSecurityDescriptorW(string StringSecurityDescriptor, uint StringSDRevision, out IntPtr SecurityDescriptor, IntPtr SecurityDescriptorSize);

  [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern IntPtr CreateNamedPipeW(string lpName, uint dwOpenMode, uint dwPipeMode, uint nMaxInstances, uint nOutBufferSize, uint nInBufferSize, uint nDefaultTimeOut, ref SecurityAttributes lpSecurityAttributes);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool ConnectNamedPipe(IntPtr hNamedPipe, IntPtr lpOverlapped);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool DisconnectNamedPipe(IntPtr hNamedPipe);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool ReadFile(IntPtr hFile, byte[] lpBuffer, uint nNumberOfBytesToRead, out uint lpNumberOfBytesRead, IntPtr lpOverlapped);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool WriteFile(IntPtr hFile, byte[] lpBuffer, uint nNumberOfBytesToWrite, out uint lpNumberOfBytesWritten, IntPtr lpOverlapped);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern bool FlushFileBuffers(IntPtr hFile);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, int dwProcessId);

  [DllImport("kernel32.dll", SetLastError = true)]
  public static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);

  // PIPE_ACCESS_DUPLEX, and FILE_FLAG_FIRST_PIPE_INSTANCE: the pipe is not made when its name is taken.
  const uint OPEN_MODE = 0x00000003 | 0x00080000;
  // PIPE_REJECT_REMOTE_CLIENTS. A byte pipe that waits: PIPE_TYPE_BYTE, PIPE_READMODE_BYTE and PIPE_WAIT are 0.
  const uint PIPE_MODE = 0x00000008;
  const uint ONE_INSTANCE = 1;
  const int LONGEST_LINE = 64;
  const uint SYNCHRONIZE = 0x00100000;
  const int ERROR_NO_DATA = 232;
  const int ERROR_PIPE_CONNECTED = 535;

  static readonly Stream output = Console.OpenStandardOutput();

  // One line on the output stream, for the program to read.
  static void Tell(string line) {
    byte[] bytes = Encoding.UTF8.GetBytes(line + "\n");
    output.Write(bytes, 0, bytes.Length);
    output.Flush();
  }

  // One sentence on the error stream, as UTF-8 bytes written straight to it: the helper has no console.
  static int Refuse(string words) {
    byte[] bytes = Encoding.UTF8.GetBytes(words + "\n");
    using (Stream errors = Console.OpenStandardError()) { errors.Write(bytes, 0, bytes.Length); }
    return 125;
  }

  static string Error(int error) {
    return "Windows error " + error + ": " + new Win32Exception(error).Message;
  }

  // The first line an asker writes, or null when it writes no line of at most LONGEST_LINE bytes.
  static string TheLineFrom(IntPtr pipe) {
    byte[] line = new byte[LONGEST_LINE];
    byte[] part = new byte[LONGEST_LINE];
    int count = 0;
    while (count < LONGEST_LINE) {
      uint read;
      if (!ReadFile(pipe, part, (uint)(LONGEST_LINE - count), out read, IntPtr.Zero) || read == 0) return null;
      Array.Copy(part, 0, line, count, (int)read);
      count += (int)read;
      int end = Array.IndexOf(line, (byte)10, 0, count);
      if (end != -1) return Encoding.UTF8.GetString(line, 0, end);
    }
    return null;
  }

  public static int Serve(string name, string written) {
    int program;
    if (name == null || written == null || !int.TryParse(written, out program) || program <= 0) {
      return Refuse("The stop pipe's helper was not given a pipe and a program, so it made no pipe.");
    }
    // Held from the start, so the number cannot name another program later.
    IntPtr watched = OpenProcess(SYNCHRONIZE, false, program);
    if (watched == IntPtr.Zero) return Refuse("Program " + program + " could not be watched (" + Error(Marshal.GetLastWin32Error()) + "), so no pipe " + name + " was made for it.");

    string sddl = "D:P(A;;GA;;;" + WindowsIdentity.GetCurrent().User.Value + ")";
    IntPtr descriptor;
    if (!ConvertStringSecurityDescriptorToSecurityDescriptorW(sddl, 1, out descriptor, IntPtr.Zero)) {
      return Refuse("The access list of the pipe " + name + " could not be made (" + Error(Marshal.GetLastWin32Error()) + "), so the pipe was not made.");
    }
    SecurityAttributes attributes = new SecurityAttributes();
    attributes.nLength = Marshal.SizeOf(typeof(SecurityAttributes));
    attributes.lpSecurityDescriptor = descriptor;
    IntPtr pipe = CreateNamedPipeW(name, OPEN_MODE, PIPE_MODE, ONE_INSTANCE, (uint)LONGEST_LINE, (uint)LONGEST_LINE, 0, ref attributes);
    if (pipe == new IntPtr(-1)) return Refuse("Windows did not make the pipe " + name + " (" + Error(Marshal.GetLastWin32Error()) + ").");

    Thread watch = new Thread(() => { WaitForSingleObject(watched, 0xFFFFFFFF); Environment.Exit(0); });
    watch.IsBackground = true;
    watch.Start();
    Tell("listening");

    byte[] answer = Encoding.UTF8.GetBytes("stopping\n");
    while (true) {
      bool connected = ConnectNamedPipe(pipe, IntPtr.Zero);
      int error = connected ? 0 : Marshal.GetLastWin32Error();
      // An asker that went before it was waited for has left nothing to answer.
      if (!connected && error != ERROR_PIPE_CONNECTED && error != ERROR_NO_DATA) {
        return Refuse("The pipe " + name + " could not wait for an asker (" + Error(error) + ").");
      }
      if (error != ERROR_NO_DATA && TheLineFrom(pipe) == "stop") {
        // Every line but the exact request is closed without an answer.
        uint sent;
        WriteFile(pipe, answer, (uint)answer.Length, out sent, IntPtr.Zero);
        FlushFileBuffers(pipe);
        Tell("stop");
      }
      DisconnectNamedPipe(pipe);
    }
  }
}
'@
} catch {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes("The stop pipe's helper could not be compiled, so it made no pipe: " + $_.Exception.Message + "`n")
  $errors = [Console]::OpenStandardError()
  $errors.Write($bytes, 0, $bytes.Length)
  $errors.Dispose()
  exit 125
}
exit ([MoleOfficeStopPipe]::Serve($env:MOLE_STOP_PIPE_NAME, $env:MOLE_STOP_PIPE_PROGRAM))
