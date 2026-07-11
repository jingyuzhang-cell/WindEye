# WindEye one-click development launcher
# Usage: .\start.ps1
#
# Start order:
#   1. Check optional database services
#   2. Release WindEye development ports
#   3. Start backend on http://localhost:8002
#   4. Start frontend on http://localhost:8001

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$backendPort = 8002
$frontendPort = 8001

Write-Host "=== WindEye Dev Server ===" -ForegroundColor Cyan
Write-Host "Project root: $root" -ForegroundColor DarkGray
Write-Host ""

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Stop-PortProcess {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$Label
    )

    $connections = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue |
        Where-Object { $_.OwningProcess -and $_.OwningProcess -ne 0 }

    if (-not $connections) {
        Write-Host "  $Label port $Port is free" -ForegroundColor Gray
        return
    }

    $processIds = $connections |
        Select-Object -ExpandProperty OwningProcess -Unique

    foreach ($processId in $processIds) {
        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if (-not $process) {
            continue
        }

        Write-Host "  Port $Port is in use by $($process.ProcessName) (PID $processId); stopping it..." -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }

    Start-Sleep -Seconds 1

    $stillListening = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if ($stillListening) {
        Write-Host "  Port $Port is still busy. Please close PID $($stillListening.OwningProcess) manually." -ForegroundColor Red
    } else {
        Write-Host "  Port $Port released" -ForegroundColor Gray
    }
}

function Show-Dependency {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][bool]$Required
    )

    $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1

    if ($connection) {
        Write-Host "  $Label is listening on port $Port" -ForegroundColor Green
    } elseif ($Required) {
        Write-Host "  $Label is not listening on port $Port (required for graph features)" -ForegroundColor Red
    } else {
        Write-Host "  $Label is not listening on port $Port (optional)" -ForegroundColor DarkYellow
    }
}

function Start-DependencyService {
    param(
        [Parameter(Mandatory = $true)][string]$Label,
        [Parameter(Mandatory = $true)][string[]]$NamePatterns,
        [Parameter(Mandatory = $true)][bool]$Required
    )

    $services = Get-Service -ErrorAction SilentlyContinue | Where-Object {
        $service = $_
        $NamePatterns | Where-Object {
            $service.Name -like $_ -or $service.DisplayName -like $_
        }
    }
    $service = $services | Select-Object -First 1

    if (-not $service) {
        $color = if ($Required) { "Red" } else { "DarkYellow" }
        Write-Host "  $Label service was not found. Start it manually if this project needs it." -ForegroundColor $color
        return
    }

    if ($service.Status -eq "Running") {
        Write-Host "  $Label service '$($service.Name)' is already running" -ForegroundColor Green
        return
    }

    if (-not (Test-Admin)) {
        Write-Host "  $Label service '$($service.Name)' is $($service.Status). Run PowerShell as Administrator to auto-start it." -ForegroundColor Yellow
        return
    }

    try {
        Write-Host "  Starting $Label service '$($service.Name)'..." -ForegroundColor Yellow
        Start-Service -Name $service.Name -ErrorAction Stop
        Start-Sleep -Seconds 2
        $service.Refresh()

        if ($service.Status -eq "Running") {
            Write-Host "  $Label service started" -ForegroundColor Green
        } else {
            Write-Host "  $Label service status: $($service.Status)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  Failed to start $Label service '$($service.Name)': $($_.Exception.Message)" -ForegroundColor Red
    }
}

function Assert-Directory {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "$Label directory not found: $Path"
    }
}

function Start-PowerShellWindow {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Command
    )

    Start-Process powershell.exe -WorkingDirectory $WorkingDirectory -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy", "Bypass",
        "-Command",
        "`$Host.UI.RawUI.WindowTitle = '$Title'; $Command"
    )
}

try {
    $backendDir = Join-Path $root "backend"
    $frontendDir = Join-Path $root "frontend"

    Assert-Directory -Path $backendDir -Label "Backend"
    Assert-Directory -Path $frontendDir -Label "Frontend"

    Write-Host "[1/5] Checking database services..." -ForegroundColor Yellow
    Start-DependencyService -Label "Neo4j" -NamePatterns @("neo4j*") -Required $true
    Start-DependencyService -Label "MySQL" -NamePatterns @("mysql*") -Required $false
    Start-DependencyService -Label "Redis" -NamePatterns @("redis*") -Required $false

    Write-Host "[2/5] Checking ports..." -ForegroundColor Yellow
    Stop-PortProcess -Port $backendPort -Label "Backend"
    Stop-PortProcess -Port $frontendPort -Label "Frontend"

    Write-Host "  Dependency status:" -ForegroundColor Gray
    Show-Dependency -Port 7687 -Label "Neo4j" -Required $true
    Show-Dependency -Port 3306 -Label "MySQL" -Required $false
    Show-Dependency -Port 6379 -Label "Redis" -Required $false

    Write-Host "[3/5] Starting backend (port $backendPort)..." -ForegroundColor Green
    $venvPython = Join-Path $backendDir "venv\Scripts\python.exe"
    if (Test-Path -LiteralPath $venvPython -PathType Leaf) {
        $pythonCommand = "& '$venvPython'"
    } elseif (Test-CommandExists "python") {
        $pythonCommand = "python"
    } elseif (Test-CommandExists "py") {
        $pythonCommand = "py"
    } else {
        throw "Python was not found. Install Python or create backend\venv first."
    }

    $backendCommand = @"
Write-Host 'Backend: http://localhost:$backendPort' -ForegroundColor Green;
$pythonCommand -m uvicorn main:app --host 0.0.0.0 --port $backendPort --reload
"@ -replace "`r?`n", " "
    Start-PowerShellWindow -Title "WindEye Backend" -WorkingDirectory $backendDir -Command $backendCommand

    Write-Host "[4/5] Starting frontend (port $frontendPort)..." -ForegroundColor Green
    if (-not (Test-CommandExists "npm")) {
        throw "npm was not found. Install Node.js 20+ and run npm install in the frontend directory."
    }

    if (-not (Test-Path -LiteralPath (Join-Path $frontendDir "node_modules") -PathType Container)) {
        Write-Host "  frontend\node_modules was not found. Run 'npm install' in the frontend directory if startup fails." -ForegroundColor Yellow
    }

    $frontendCommand = @"
`$env:PORT = '$frontendPort';
`$env:WINDEYE_API_TARGET = 'http://127.0.0.1:$backendPort';
Write-Host 'Frontend: http://localhost:$frontendPort' -ForegroundColor Green;
npm run dev
"@ -replace "`r?`n", " "
    Start-PowerShellWindow -Title "WindEye Frontend" -WorkingDirectory $frontendDir -Command $frontendCommand

    Write-Host "[5/5] Waiting for services..." -ForegroundColor Yellow
    Start-Sleep -Seconds 2

    Write-Host ""
    Write-Host "=== Started ===" -ForegroundColor Cyan
    Write-Host "Frontend: http://localhost:$frontendPort" -ForegroundColor Cyan
    Write-Host "Backend:  http://localhost:$backendPort" -ForegroundColor Cyan
    Write-Host "API Docs: http://localhost:$backendPort/docs" -ForegroundColor Cyan
    Write-Host ""

    $proxyConfig = Join-Path $root "frontend\config\proxy.ts"
    if (Test-Path -LiteralPath $proxyConfig -PathType Leaf) {
        Write-Host "Proxy config found. /api/* requests will be forwarded to the backend." -ForegroundColor Gray
    }
} catch {
    Write-Host ""
    Write-Host "Startup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
