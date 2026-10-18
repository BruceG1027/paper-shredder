@echo off
cd /d "%~dp0"
where python >nul 2>nul
if errorlevel 1 (
    py -3 start_game.py
) else (
    python start_game.py
)
if errorlevel 1 pause
