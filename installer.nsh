; Kill running Videobox before install
!macro customInit
  nsExec::Exec 'taskkill /F /IM Videobox.exe' $0
  Sleep 1000
!macroend

; Kill running Videobox before uninstall
!macro customUnInit
  nsExec::Exec 'taskkill /F /IM Videobox.exe' $0
  Sleep 1000
!macroend
