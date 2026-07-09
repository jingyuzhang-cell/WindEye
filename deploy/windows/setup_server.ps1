<#
.SYNOPSIS
    WindEye Windows Server 一键部署脚本
.DESCRIPTION
    在 Windows Server 上自动完成：
    1. 检查/安装 Python 3.11+
    2. 安装项目依赖
    3. 配置 .env
    4. 下载安装 nginx
    5. 构建前端
    6. 安装 Windows Service (NSSM)
    7. 配置防火墙
.NOTES
    以管理员身份运行此脚本！
#>

param(
    [string]$InstallDir = "C:\WindEye",
    [string]$DomainOrIP = "你的服务器IP或域名",
    [switch]$SkipFirewall = $false,
    [switch]$SkipService = $false
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  WindEye Server Deployment Setup" -ForegroundColor Cyan
Write-Host "  Install Dir: $InstallDir" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# ============================================
# 1. Copy project to install directory
# ============================================
Write-Host "`n[1/8] Copying project to $InstallDir ..." -ForegroundColor Green
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$excludeDirs = @(".git", "node_modules", "venv", "__pycache__", ".pytest_cache", "output")
$excludeArgs = $excludeDirs | ForEach-Object { "--exclude=$_" }
robocopy $RootDir $InstallDir /MIR /NFL /NDL /NJH /NJS /NP $excludeArgs 2>&1 | Out-Null
Write-Host "  Done." -ForegroundColor Gray

# ============================================
# 2. Python virtual environment
# ============================================
Write-Host "`n[2/8] Setting up Python environment ..." -ForegroundColor Green
$VenvPath = "$InstallDir\backend\venv"

if (-not (Test-Path $VenvPath)) {
    python -m venv $VenvPath
}
& "$VenvPath\Scripts\activate.ps1"

Write-Host "  Installing Python dependencies..." -ForegroundColor Gray
pip install -r "$InstallDir\backend\requirements.txt" -q 2>&1 | Out-Null

# spaCy model (optional)
try {
    python -m spacy download zh_core_web_sm 2>&1 | Out-Null
    Write-Host "  spaCy model installed." -ForegroundColor Gray
} catch {
    Write-Host "  [WARN] spaCy model download failed. NER may use fallback." -ForegroundColor Yellow
}
Write-Host "  Done." -ForegroundColor Gray

# ============================================
# 3. Configure .env
# ============================================
Write-Host "`n[3/8] Configuring environment ..." -ForegroundColor Green
$EnvFile = "$InstallDir\backend\.env"
if (-not (Test-Path $EnvFile)) {
    Copy-Item "$InstallDir\backend\.env.example" $EnvFile
}

Write-Host "`n  === Neo4j Configuration ===" -ForegroundColor Yellow
$Neo4jUri = Read-Host "  Neo4j URI [bolt://localhost:7687]"
if (-not $Neo4jUri) { $Neo4jUri = "bolt://localhost:7687" }
$Neo4jPwd = Read-Host "  Neo4j Password" -MaskInput

Write-Host "`n  === MySQL Configuration ===" -ForegroundColor Yellow
$MysqlHost = Read-Host "  MySQL Host [127.0.0.1]"
if (-not $MysqlHost) { $MysqlHost = "127.0.0.1" }
$MysqlPwd = Read-Host "  MySQL Password" -MaskInput

Write-Host "`n  === JWT Secret (auto-generate if empty) ===" -ForegroundColor Yellow
$JwtSecret = & python -c "import secrets; print(secrets.token_hex(48))"

# Write .env
$envContent = @"
NEO4J_URI=$Neo4jUri
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=$Neo4jPwd
NEO4J_DATABASE=neo4j

MYSQL_ENABLED=true
MYSQL_HOST=$MysqlHost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=$MysqlPwd
MYSQL_DATABASE=user
MYSQL_POOL_SIZE=5
MYSQL_POOL_MAX=20

AUTH_MODE=enforce
JWT_SECRET=$JwtSecret
JWT_ALGORITHM=HS256
JWT_ACCESS_EXPIRE_MINUTES=120
JWT_REFRESH_EXPIRE_DAYS=7

REDIS_ENABLED=false
AUDIT_API_LOG_ENABLED=true
AUDIT_OPERATION_LOG_ENABLED=true
LOG_RETENTION_DAYS=180

CRAWL_DEMO_MODE=true
ETL_BATCH_SIZE=100
KG_DATASET=finance
NER_MODEL=rule
SPACY_MODEL=zh_core_web_sm
"@
Set-Content -Path $EnvFile -Value $envContent -Encoding UTF8
Write-Host "  .env configured." -ForegroundColor Gray

# ============================================
# 4. Initialize MySQL
# ============================================
Write-Host "`n[4/8] Initializing MySQL tables ..." -ForegroundColor Green
try {
    Push-Location "$InstallDir\backend"
    python -m db.seed 2>&1 | Out-Null
    Pop-Location
    Write-Host "  MySQL tables created." -ForegroundColor Gray
} catch {
    Write-Host "  [WARN] MySQL init failed: $_" -ForegroundColor Yellow
    Write-Host "  Run manually: cd C:\WindEye\backend && python -m db.seed" -ForegroundColor Yellow
}

# ============================================
# 5. Build frontend
# ============================================
Write-Host "`n[5/8] Building frontend ..." -ForegroundColor Green
Push-Location "$InstallDir\frontend"
try {
    npm ci 2>&1 | Out-Null
    npm run build 2>&1 | Out-Null
    Write-Host "  Frontend built to: frontend/dist/" -ForegroundColor Gray
} catch {
    Write-Host "  [ERROR] Frontend build failed: $_" -ForegroundColor Red
    Write-Host "  Try: cd $InstallDir\frontend && npm ci && npm run build" -ForegroundColor Yellow
}
Pop-Location

# ============================================
# 6. Install nginx
# ============================================
Write-Host "`n[6/8] Setting up nginx ..." -ForegroundColor Green
$NginxDir = "C:\nginx"
$NginxZip = "$env:TEMP\nginx.zip"

if (-not (Test-Path "$NginxDir\nginx.exe")) {
    Write-Host "  Downloading nginx for Windows..." -ForegroundColor Gray
    Invoke-WebRequest -Uri "https://nginx.org/download/nginx-1.26.2.zip" -OutFile $NginxZip -UseBasicParsing
    Expand-Archive -Path $NginxZip -DestinationPath "C:\" -Force
    Remove-Item $NginxZip
    Write-Host "  nginx installed to $NginxDir" -ForegroundColor Gray
}

# Copy nginx config
Copy-Item "$InstallDir\deploy\windows\nginx.conf" "$NginxDir\conf\nginx.conf" -Force
Write-Host "  nginx config deployed." -ForegroundColor Gray

# Start nginx
try {
    & "$NginxDir\nginx.exe" -s stop 2>$null
} catch {}
Start-Process -FilePath "$NginxDir\nginx.exe" -WorkingDirectory $NginxDir
Write-Host "  nginx started on port 80." -ForegroundColor Gray

# ============================================
# 7. Configure Windows Firewall
# ============================================
if (-not $SkipFirewall) {
    Write-Host "`n[7/8] Configuring firewall ..." -ForegroundColor Green
    try {
        New-NetFirewallRule -DisplayName "WindEye HTTP (80)" -Direction Inbound -LocalPort 80 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName "WindEye API Internal (8000)" -Direction Inbound -LocalPort 8000 -Protocol TCP -Action Allow -ErrorAction SilentlyContinue
        Write-Host "  Firewall rules added." -ForegroundColor Gray
    } catch {
        Write-Host "  [WARN] Firewall config failed: $_" -ForegroundColor Yellow
    }
}

# ============================================
# 8. Install Windows Service (NSSM)
# ============================================
if (-not $SkipService) {
    Write-Host "`n[8/8] Installing Windows Service ..." -ForegroundColor Green
    $NssmUrl = "https://nssm.cc/release/nssm-2.24.zip"
    $NssmZip = "$env:TEMP\nssm.zip"
    $NssmDir = "C:\nssm"

    if (-not (Test-Path "$NssmDir\win64\nssm.exe")) {
        Write-Host "  Downloading NSSM..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $NssmUrl -OutFile $NssmZip -UseBasicParsing
        Expand-Archive -Path $NssmZip -DestinationPath $NssmDir -Force
        Remove-Item $NssmZip
    }

    $NssmExe = "$NssmDir\nssm-2.24\win64\nssm.exe"

    # Stop existing service if any
    & $NssmExe stop WindEyeAPI 2>$null
    & $NssmExe remove WindEyeAPI confirm 2>$null

    # Install backend service
    $UvicornPath = "$VenvPath\Scripts\uvicorn.exe"
    & $NssmExe install WindEyeAPI $UvicornPath "main:app --host 127.0.0.1 --port 8000 --workers 4"
    & $NssmExe set WindEyeAPI AppDirectory "$InstallDir\backend"
    & $NssmExe set WindEyeAPI DisplayName "WindEye API Server"
    & $NssmExe set WindEyeAPI Description "WindEye FastAPI Backend"
    & $NssmExe set WindEyeAPI Start SERVICE_AUTO_START
    & $NssmExe set WindEyeAPI AppStdout "$InstallDir\backend\logs\uvicorn.log"
    & $NssmExe set WindEyeAPI AppStderr "$InstallDir\backend\logs\uvicorn_error.log"

    # Create logs directory
    New-Item -ItemType Directory -Force -Path "$InstallDir\backend\logs" | Out-Null

    # Start service
    & $NssmExe start WindEyeAPI
    Write-Host "  WindEyeAPI service installed and started." -ForegroundColor Gray
}

# ============================================
# Done
# ============================================
Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "  Deployment Complete!" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  API:      http://$DomainOrIP/api/v1/graph/search-all" -ForegroundColor White
Write-Host "  Docs:     http://$DomainOrIP/docs" -ForegroundColor White
Write-Host "  Frontend: http://$DomainOrIP" -ForegroundColor White
Write-Host "`n  Test: curl http://$DomainOrIP/health" -ForegroundColor Gray
Write-Host "`n  Service management:" -ForegroundColor Gray
Write-Host "    Check:  C:\nssm\nssm-2.24\win64\nssm.exe status WindEyeAPI" -ForegroundColor Gray
Write-Host "    Restart:C:\nssm\nssm-2.24\win64\nssm.exe restart WindEyeAPI" -ForegroundColor Gray
Write-Host "    Logs:   $InstallDir\backend\logs\uvicorn.log" -ForegroundColor Gray
