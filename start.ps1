# WindEye 一键启动脚本
# Usage: .\start.ps1
# 启动顺序：数据库服务（如已安装为 Windows 服务） -> 后端 -> 前端
# 仅占用 8000 (backend) 和 8001 (frontend) 端口，不影响其他项目进程

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "=== WindEye Dev Server ===" -ForegroundColor Cyan

function Test-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# ── 辅助函数: 检查并释放指定端口 ──
function Free-Port {
    param([int]$Port, [string]$Label)
    $conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        Write-Host "  Port $Port is in use by $($proc.ProcessName) (PID $($conn.OwningProcess)), stopping..." -ForegroundColor Yellow
        $proc | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Write-Host "  Port $Port released" -ForegroundColor Gray
    } else {
        Write-Host "  Port $Port is free" -ForegroundColor Gray
    }
}

function Show-Dependency {
    param([int]$Port, [string]$Label, [bool]$Required)
    $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($connection) {
        Write-Host "  $Label is listening on port $Port" -ForegroundColor Green
    } elseif ($Required) {
        Write-Host "  $Label is not listening on port $Port (required)" -ForegroundColor Red
    } else {
        Write-Host "  $Label is not listening on port $Port (optional)" -ForegroundColor DarkYellow
    }
}

function Start-DependencyService {
    param(
        [string]$Label,
        [string[]]$NamePatterns,
        [int]$Port,
        [bool]$Required
    )

    $services = Get-Service -ErrorAction SilentlyContinue | Where-Object {
        $service = $_
        $NamePatterns | Where-Object {
            $service.Name -like $_ -or $service.DisplayName -like $_
        }
    }
    $service = $services | Select-Object -First 1

    if (-not $service) {
        $level = if ($Required) { "Red" } else { "DarkYellow" }
        Write-Host "  $Label service not found; install it or start it manually if needed" -ForegroundColor $level
        return
    }

    if ($service.Status -eq "Running") {
        Write-Host "  $Label service '$($service.Name)' is already running" -ForegroundColor Green
        return
    }

    if (-not (Test-Admin)) {
        Write-Host "  $Label service '$($service.Name)' is $($service.Status); run PowerShell as Administrator to auto-start it" -ForegroundColor Yellow
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

# ── 1. 启动数据库服务（如已注册 Windows 服务） ──
Write-Host "[1/5] Starting database services..." -ForegroundColor Yellow
Start-DependencyService -Label "Neo4j" -NamePatterns @("neo4j*") -Port 7687 -Required $true
Start-DependencyService -Label "MySQL" -NamePatterns @("mysql*") -Port 3306 -Required $false
Start-DependencyService -Label "Redis" -NamePatterns @("redis*") -Port 6379 -Required $false

# ── 2. 仅释放目标端口，不影响其他进程 ──
Write-Host "[2/5] Checking ports..." -ForegroundColor Yellow
Free-Port -Port 8000 -Label "Backend"
Free-Port -Port 8001 -Label "Frontend"
Write-Host "  Dependency status:" -ForegroundColor Gray
Show-Dependency -Port 7687 -Label "Neo4j" -Required $true
Show-Dependency -Port 3306 -Label "MySQL" -Required $false
Show-Dependency -Port 6379 -Label "Redis" -Required $false

# ── 3. 启动后端 ──
Write-Host "[3/5] Starting backend (port 8000)..." -ForegroundColor Green
$backendDir = Join-Path $root "backend"
$venvPython = Join-Path $backendDir "venv\Scripts\python.exe"
$pythonCommand = if (Test-Path $venvPython) { "'$venvPython'" } else { "python" }
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendDir'; Write-Host 'Backend: http://localhost:8000' -ForegroundColor Green; & $pythonCommand -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

# ── 4. 启动前端 (使用 PORT 环境变量指定端口，避免默认 8000 冲突) ──
Write-Host "[4/5] Starting frontend (port 8001)..." -ForegroundColor Green
$frontendDir = Join-Path $root "frontend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendDir'; `$env:PORT = '8001'; Write-Host 'Frontend: http://localhost:8001' -ForegroundColor Green; npm run dev"

Write-Host "[5/5] Waiting for services..." -ForegroundColor Yellow
Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Frontend: http://localhost:8001" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:8000" -ForegroundColor Cyan
Write-Host "API Docs: http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""

# 可选: 检查前端 proxy 配置
$proxyConfig = Join-Path $root "frontend\config\proxy.ts"
if (Test-Path $proxyConfig) {
    Write-Host "Proxy config found — /api/* requests will be forwarded to backend" -ForegroundColor Gray
}
