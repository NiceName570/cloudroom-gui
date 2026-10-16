!macro customInstall
  CreateShortcut "$SMPROGRAMS\Cloudroom Windows Terminal.lnk" "$SYSDIR\cmd.exe" '/K ""$INSTDIR\terminal.cmd""' "$INSTDIR\Cloudroom Windows.exe" 0
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Cloudroom Windows Terminal.lnk"
!macroend
