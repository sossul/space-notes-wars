@echo off
REM Abre Space Notes Wars en una ventana propia (sin pestanas ni barra de
REM direcciones), usando el navegador Edge que ya viene con Windows.
start "" msedge --app="file:///%~dp0index.html" --window-size=1000,720
