param(
  [string]$BaseUrl = "http://127.0.0.1:8001",
  [string]$OutputDir = "D:\Code\WindEye\backend\report_outputs",
  [int]$TimeoutSec = 120
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

function Save-Json($Path, $Object) {
  $Object | ConvertTo-Json -Depth 80 | Set-Content -Encoding UTF8 -Path $Path
}

function Invoke-JsonApi {
  param(
    [string]$Name,
    [string]$Method,
    [string]$Path,
    [object]$Body = $null
  )

  $uri = "$BaseUrl$Path"
  $bodyJson = $null
  if ($null -ne $Body) {
    $bodyJson = $Body | ConvertTo-Json -Depth 80
  }

  $statusCode = $null
  $contentType = ""
  $content = ""
  $errorMessage = $null

  try {
    $resp = Invoke-WebRequest -Uri $uri -Method $Method -Body $bodyJson -ContentType "application/json" -UseBasicParsing -TimeoutSec $TimeoutSec
    $statusCode = [int]$resp.StatusCode
    $contentType = [string]$resp.Headers["Content-Type"]
    $content = [string]$resp.Content
  } catch {
    $errorMessage = $_.Exception.Message
    if ($_.Exception.Response) {
      $statusCode = [int]$_.Exception.Response.StatusCode
      $contentType = [string]$_.Exception.Response.ContentType
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $content = $reader.ReadToEnd()
      $reader.Close()
    }
  }

  $isJson = $false
  $parsed = $null
  try {
    if ($content -and $content.Trim().Length -gt 0) {
      $parsed = $content | ConvertFrom-Json
      $isJson = $true
    }
  } catch {
    $isJson = $false
  }

  $result = [ordered]@{
    name = $Name
    method = $Method
    path = $Path
    url = $uri
    statusCode = $statusCode
    ok = ($statusCode -ge 200 -and $statusCode -lt 300)
    contentType = $contentType
    isJson = $isJson
    error = $errorMessage
    requestBody = $Body
    response = $(if ($isJson) { $parsed } else { $content })
    testedAt = (Get-Date).ToString("s")
  }
  return $result
}

$summary = @()

$port = Invoke-JsonApi -Name "port_check" -Method "GET" -Path "/health"
Save-Json (Join-Path $OutputDir "00_port_check.json") $port
$summary += $port

$searchBody = @{
  query = "华创"
  layer = "all"
  depth = 1
  nodeLimit = 30
  edgeLimit = 80
  outputFormat = "both"
  responseMode = "full"
  includeProperties = $true
}
$search = Invoke-JsonApi -Name "graph_search_all" -Method "POST" -Path "/api/v1/graph/search-all" -Body $searchBody
Save-Json (Join-Path $OutputDir "01_search_all.json") $search
$summary += $search

$nodeId = $null
if ($search.isJson -and $search.response) {
  $nodes = @()
  if ($search.response.nodes) { $nodes += @($search.response.nodes) }
  if ($nodes.Count -eq 0 -and $search.response.matchedNodes) { $nodes += @($search.response.matchedNodes) }
  if ($nodes.Count -gt 0) {
    $n = $nodes[0]
    $nodeId = $n.id
    if (-not $nodeId) { $nodeId = $n.element_id }
    if (-not $nodeId) { $nodeId = $n.elementId }
  }
}

if ($nodeId) {
  $expandBody = @{
    depth = 1
    nodeLimit = 30
    edgeLimit = 80
    responseMode = "full"
    includeProperties = $true
  }
  $expand = Invoke-JsonApi -Name "graph_expand" -Method "POST" -Path "/api/v1/graph/expand/$nodeId" -Body $expandBody
} else {
  $expand = [ordered]@{
    name = "graph_expand"
    method = "POST"
    path = "/api/v1/graph/expand/{node_id}"
    statusCode = $null
    ok = $false
    contentType = ""
    isJson = $true
    error = "Skipped: no node id returned by search-all"
    response = @{ detail = "Skipped because search-all returned no usable node id." }
    testedAt = (Get-Date).ToString("s")
  }
}
Save-Json (Join-Path $OutputDir "02_expand_node.json") $expand
$summary += $expand

$communityBody = @{
  seedNames = @("华创控股集团有限公司")
  seedIds = @()
  maxHop = 2
  method = "auto"
  communityMode = "expanded"
  minCommunitySize = 2
  pathLimit = 1000
  maxNodes = 300
  responseMode = "summary"
  includeRawSubgraph = $false
  includeCommunityGraph = $true
}
$community = Invoke-JsonApi -Name "community_discovery" -Method "POST" -Path "/api/v1/governance/community-discovery" -Body $communityBody
Save-Json (Join-Path $OutputDir "03_community_discovery.json") $community
$summary += $community

$riskBody = @{
  seedNames = @("华创控股集团有限公司")
  seedIds = @()
  maxHop = 2
  maxPathLength = 4
  method = "auto"
  communityMode = "expanded"
  includeCommunityDiscovery = $true
  includeCommunityPath = $true
  includeNodePath = $true
  subgraphPathLimit = 1000
  riskPathLimit = 10
  maxBranchPerNode = 10
  minRiskScore = 0
  responseMode = "full"
}
$risk = Invoke-JsonApi -Name "risk_paths" -Method "POST" -Path "/api/v1/governance/risk-paths" -Body $riskBody
Save-Json (Join-Path $OutputDir "04_risk_paths.json") $risk
$summary += $risk

$reportBody = @{
  query = "分析华创控股集团有限公司的风险传导、群体发现和协同治理社区报告"
  focusEntities = @("华创控股集团有限公司")
  maxHop = 2
  exportFormats = @("markdown")
  sessionId = "api-json-test"
  roundId = 1
}
$compliance = Invoke-JsonApi -Name "compliance_report_open_api_path" -Method "POST" -Path "/api/v1/governance/compliance-report" -Body $reportBody
Save-Json (Join-Path $OutputDir "05_compliance_report.json") $compliance
$summary += $compliance

$actualReport = Invoke-JsonApi -Name "governance_reports_actual_path" -Method "POST" -Path "/api/v1/governance/reports" -Body $reportBody
Save-Json (Join-Path $OutputDir "05b_governance_reports_actual_path.json") $actualReport

$summaryObject = [ordered]@{
  baseUrl = $BaseUrl
  outputDir = $OutputDir
  allFiveReturnedJson = -not (($summary | Where-Object { -not $_.isJson }).Count)
  allFiveStatusOk = -not (($summary | Where-Object { -not $_.ok }).Count)
  results = $summary | ForEach-Object {
    [ordered]@{
      name = $_.name
      path = $_.path
      statusCode = $_.statusCode
      ok = $_.ok
      isJson = $_.isJson
      error = $_.error
    }
  }
  actualReportPathCheck = [ordered]@{
    path = "/api/v1/governance/reports"
    statusCode = $actualReport.statusCode
    ok = $actualReport.ok
    isJson = $actualReport.isJson
    error = $actualReport.error
  }
  testedAt = (Get-Date).ToString("s")
}
Save-Json (Join-Path $OutputDir "summary.json") $summaryObject
$summaryObject | ConvertTo-Json -Depth 80
