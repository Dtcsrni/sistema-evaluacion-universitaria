@echo off
REM Launch the web dashboard in dev mode.
setlocal
node "%~dp0launcher-dashboard.mjs" --mode dev
