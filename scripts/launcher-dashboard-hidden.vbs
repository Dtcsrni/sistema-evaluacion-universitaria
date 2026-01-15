' Launches the dashboard PowerShell wrapper fully hidden.
' Usage: wscript.exe //nologo launcher-dashboard-hidden.vbs <mode> <port>

Option Explicit

Dim shell, fso
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

Dim scriptDir, rootDir
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(scriptDir)

Dim mode, port
mode = "none"
port = "0"
If WScript.Arguments.Count >= 1 Then mode = WScript.Arguments(0)
If WScript.Arguments.Count >= 2 Then port = WScript.Arguments(1)

' Ensure stable working directory.
shell.CurrentDirectory = rootDir

' Show a lightweight splash while starting (only when a port is provided).
Dim splashExec
Set splashExec = Nothing
If port <> "0" And port <> "" Then
  On Error Resume Next
  Set splashExec = shell.Exec("mshta.exe \"" & rootDir & "\scripts\dashboard-splash.hta?port=" & port & "&mode=" & mode & "\"")
  On Error GoTo 0
End If

Dim psExe, psArgs, cmd
psExe = """" & shell.ExpandEnvironmentStrings("%WINDIR%") & "\System32\WindowsPowerShell\v1.0\powershell.exe""""
psArgs = "-NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File """ & rootDir & "\scripts\launcher-dashboard.ps1""" & " -Mode " & mode & " -NoOpen"
If port <> "0" And port <> "" Then
  psArgs = psArgs & " -Port " & port
End If

cmd = psExe & " " & psArgs

' 0 = hide window, False = don't wait.
shell.Run cmd, 0, False

' Wait until the dashboard HTTP endpoint responds, then open browser and close splash.
If port <> "0" And port <> "" Then
  Dim ok, tries, maxTries, url
  ok = False
  tries = 0
  maxTries = 120 ' ~24s with 200ms sleep
  url = "http://127.0.0.1:" & port & "/api/status"

  Do While (tries < maxTries) And (ok = False)
    tries = tries + 1
    ok = HttpOk(url)
    If ok = False Then
      WScript.Sleep 200
    End If
  Loop

  If ok = True Then
    shell.Run "cmd.exe /c start \"\" \"http://127.0.0.1:" & port & "/\"", 0, False
  End If

  ' Close splash only if the dashboard is reachable; otherwise let the HTA show a helpful error.
  If ok = True Then
    On Error Resume Next
    If Not (splashExec Is Nothing) Then
      splashExec.Terminate
    End If
    On Error GoTo 0
  End If
End If

Function HttpOk(ByVal u)
  On Error Resume Next
  Dim req
  Set req = CreateObject("WinHttp.WinHttpRequest.5.1")
  req.Open "GET", u, False
  req.SetTimeouts 300, 300, 300, 600
  req.Send
  If Err.Number <> 0 Then
    Err.Clear
    HttpOk = False
  Else
    ' Consider any 2xx/3xx/4xx (except connection errors) as "server is up".
    If (req.Status >= 200) And (req.Status < 500) Then
      HttpOk = True
    Else
      HttpOk = False
    End If
  End If
  On Error GoTo 0
End Function
