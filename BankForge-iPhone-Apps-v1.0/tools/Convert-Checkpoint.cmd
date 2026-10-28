@echo off
setlocal
set "BF_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%BF_PYTHON%" (
  set "PYTHONPATH=%~dp0..\..\..\work\packages;%PYTHONPATH%"
  "%BF_PYTHON%" "%~dp0convert_checkpoint.py" %*
) else (
  py -3 "%~dp0convert_checkpoint.py" %*
)
if errorlevel 1 (
  echo Conversion requires Python and PyTorch on this PC. You can also import the existing best-weights.json directly.
  pause
)
endlocal
