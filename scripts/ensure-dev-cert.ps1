param(
  [string]$HostIp = '',
  [string]$OutDir = '',
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$company = 'Cybersys Tech'
$caName = 'EvaluaPro'
$serverName = 'EvaluaPro Local'
$subjectCa = "CN=$caName, O=$company"
$subjectServer = "CN=$serverName, O=$company"

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if (-not $OutDir) {
  if ($env:LOCALAPPDATA) {
    $OutDir = Join-Path $env:LOCALAPPDATA 'EvaluaPro\certs'
  } else {
    $OutDir = Join-Path $root 'logs\certs'
  }
}

if (-not (Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir -Force | Out-Null
}

$caCertPath = Join-Path $OutDir 'evaluapro-dev-ca.pem'
$serverCertPath = Join-Path $OutDir 'evaluapro-dev-cert.pem'
$serverKeyPath = Join-Path $OutDir 'evaluapro-dev-key.pem'
$infoPath = Join-Path $OutDir 'evaluapro-dev-cert.json'

function Write-Pem([string]$label, [byte[]]$bytes, [string]$path) {
  $b64 = [System.Convert]::ToBase64String($bytes)
  $lines = ($b64 -split '(.{1,64})' | Where-Object { $_ -ne '' })
  $content = @("-----BEGIN $label-----") + $lines + @("-----END $label-----")
  Set-Content -Path $path -Value $content -Encoding ascii
}

function Get-ExistingCert([string]$storePath, [string]$subject, [bool]$requirePrivateKey) {
  $items = Get-ChildItem -Path $storePath -ErrorAction SilentlyContinue | Where-Object { $_.Subject -eq $subject }
  if ($requirePrivateKey) {
    $items = $items | Where-Object { $_.HasPrivateKey }
  }
  return $items | Sort-Object NotAfter -Descending | Select-Object -First 1
}

$caCert = Get-ExistingCert 'Cert:\CurrentUser\My' $subjectCa $true
if (-not $caCert -or $Force) {
  $caCert = New-SelfSignedCertificate `
    -Subject $subjectCa `
    -FriendlyName 'EvaluaPro Dev Root' `
    -KeyUsage CertSign, CRLSign, DigitalSignature `
    -KeyExportPolicy Exportable `
    -KeyLength 2048 `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -NotAfter (Get-Date).AddYears(10) `
    -TextExtension @('2.5.29.19={text}CA=TRUE')
}

$rootStoreMatch = Get-ChildItem -Path 'Cert:\CurrentUser\Root' -ErrorAction SilentlyContinue | Where-Object {
  $_.Thumbprint -eq $caCert.Thumbprint
} | Select-Object -First 1

if (-not $rootStoreMatch) {
  $tmpCa = Join-Path $OutDir 'evaluapro-dev-ca.cer'
  Export-Certificate -Cert $caCert -FilePath $tmpCa -Force | Out-Null
  Import-Certificate -FilePath $tmpCa -CertStoreLocation 'Cert:\CurrentUser\Root' | Out-Null
  Remove-Item -LiteralPath $tmpCa -Force -ErrorAction SilentlyContinue
}

Write-Pem 'CERTIFICATE' $caCert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert) $caCertPath

$hosts = @('localhost', '127.0.0.1')
if ($HostIp) {
  $trimmed = $HostIp.Trim()
  if ($trimmed) { $hosts += $trimmed }
}
$hosts = $hosts | Select-Object -Unique

$needsServerCert = $Force -or -not (Test-Path $serverCertPath) -or -not (Test-Path $serverKeyPath)
if (-not $needsServerCert -and (Test-Path $infoPath)) {
  try {
    $info = Get-Content -LiteralPath $infoPath -Raw | ConvertFrom-Json -ErrorAction Stop
  } catch {
    $info = $null
  }
  if (-not $info -or -not $info.hosts) {
    $needsServerCert = $true
  } else {
    foreach ($host in $hosts) {
      if ($info.hosts -notcontains $host) {
        $needsServerCert = $true
        break
      }
    }
  }
}

if ($needsServerCert) {
  $dnsNames = @()
  $ipNames = @()
  foreach ($host in $hosts) {
    if ($host -match '^\d{1,3}(\.\d{1,3}){3}$') { $ipNames += $host }
    else { $dnsNames += $host }
  }

  $sanParts = @()
  foreach ($dns in $dnsNames) { $sanParts += "DNS=$dns" }
  foreach ($ip in $ipNames) { $sanParts += "IPAddress=$ip" }
  $sanText = $sanParts -join '&'

  $extensions = @()
  if ($sanText) { $extensions += "2.5.29.17={text}$sanText" }
  $extensions += '2.5.29.37={text}1.3.6.1.5.5.7.3.1'

  $serverCert = New-SelfSignedCertificate `
    -Subject $subjectServer `
    -FriendlyName 'EvaluaPro Dev Server' `
    -Signer $caCert `
    -CertStoreLocation 'Cert:\CurrentUser\My' `
    -KeyExportPolicy Exportable `
    -KeyLength 2048 `
    -KeyUsage DigitalSignature, KeyEncipherment `
    -NotAfter (Get-Date).AddYears(3) `
    -TextExtension $extensions

  Write-Pem 'CERTIFICATE' $serverCert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert) $serverCertPath
  $rsa = $serverCert.GetRSAPrivateKey()
  if (-not $rsa) { throw 'No private key available for server certificate.' }
  Write-Pem 'PRIVATE KEY' $rsa.ExportPkcs8PrivateKey() $serverKeyPath

  $info = [ordered]@{
    subject = $subjectServer
    issuer = $subjectCa
    hosts = $hosts
    generatedAt = (Get-Date).ToString('s')
    certPath = $serverCertPath
    keyPath = $serverKeyPath
  }
  $info | ConvertTo-Json -Depth 3 | Set-Content -Path $infoPath -Encoding UTF8
}
