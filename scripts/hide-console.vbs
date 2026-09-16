Set sh = CreateObject("Wscript.Shell")
If Wscript.Arguments.Count < 1 Then
  Wscript.Quit 1
End If
cmd = """" & Wscript.Arguments(0) & """"
For i = 1 To Wscript.Arguments.Count - 1
  cmd = cmd & " " & Wscript.Arguments(i)
Next
sh.Run cmd, 0, True
