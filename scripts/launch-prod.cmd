@echo off
REM Launch the web dashboard in prod mode.
setlocal
node "%~dp0launcher-dashboard.mjs" --mode prod
