; Al desinstalar, quita «Abrir al encender el PC» (1.17.4, index.js) para que Windows no intente
; abrir un launcher que ya no existe. Las actualizaciones también pasan por aquí (desinstalan la
; versión vieja): ahí NO se borra, o cada actualización apagaría la opción del jugador.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "SC Launcher"
  ${endIf}
!macroend
