@echo off
setlocal enabledelayedexpansion

echo ===================================
echo Bulk Screenshots Utility
echo ===================================

REM Check if website_list.txt exists
if not exist website_list.txt (
    echo ERROR: website_list.txt not found.
    echo Please create a file named website_list.txt with one URL per line.
    echo Example:
    echo https://example.com
    echo https://another-site.org
    pause
    exit /b 1
)

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Check if dependencies are installed
if not exist node_modules (
    echo Dependencies not found. Installing required packages...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo Failed to install dependencies!
        pause
        exit /b 1
    )
)

echo Running Bulk Screenshots utility...

REM Check if Bun is installed and use it, otherwise fall back to ts-node
where bun >nul 2>nul
if %ERRORLEVEL% equ 0 (
    echo Using Bun runtime...
    bun run index.ts
) else (
    echo Using Node.js with ts-node...
    REM Check if ts-node is installed globally
    where ts-node >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        ts-node index.ts
    ) else (
        echo Installing ts-node temporarily...
        npx ts-node index.ts
    )
)

if %ERRORLEVEL% neq 0 (
    echo Error running the script!
    pause
    exit /b 1
)

echo.
echo Process completed! Screenshots are saved in the screenshots folder.
echo Check the log file for details about successful and failed captures.

pause
