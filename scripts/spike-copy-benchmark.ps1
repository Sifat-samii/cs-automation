<#
.SYNOPSIS
  Compares Copy-Item and robocopy for a backup-to-production transfer.
.NOTES
  Refuses to run outside the designated test roots.
#>
[CmdletBinding()]
param(
  [string]$BackupRoot = '\\192.168.0.15\Production\File Transfer Server\Sifat_Project Coordinator\Software test\_Software Test',
  [string]$ProductionRoot = '\\192.168.0.15\Production\File Server\_Share Work\2026\_Software Test',
  [int]$FileCount = 10,
  [int]$FileSizeMB = 200
)

$ErrorActionPreference = 'Stop'

foreach ($root in @($BackupRoot, $ProductionRoot)) {
  if ($root -notmatch '_Software Test') {
    throw "Refusing to run: '$root' is not a designated test root."
  }
  if (-not (Test-Path -LiteralPath $root)) {
    throw "Root not reachable: $root"
  }
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$source = Join-Path $BackupRoot "_BENCH_$stamp"
$destCopyItem = Join-Path $ProductionRoot "_BENCH_${stamp}_copyitem"
$destRobocopy = Join-Path $ProductionRoot "_BENCH_${stamp}_robocopy"

Write-Host "Creating $FileCount x ${FileSizeMB}MB test files in $source"
New-Item -ItemType Directory -Path $source -Force | Out-Null

$buffer = New-Object byte[] (1MB)
(New-Object Random).NextBytes($buffer)
for ($i = 1; $i -le $FileCount; $i++) {
  $path = Join-Path $source ("bench_{0:D3}.bin" -f $i)
  $stream = [System.IO.File]::Create($path)
  try {
    for ($m = 0; $m -lt $FileSizeMB; $m++) {
      $stream.Write($buffer, 0, $buffer.Length)
    }
  }
  finally {
    $stream.Dispose()
  }
}

$totalMB = $FileCount * $FileSizeMB

Write-Host 'Measuring Copy-Item'
$copyItem = Measure-Command {
  Copy-Item -LiteralPath $source -Destination $destCopyItem -Recurse -Force
}

Write-Host 'Measuring robocopy'
$robocopy = Measure-Command {
  robocopy $source $destRobocopy /E /R:2 /W:5 /NFL /NDL /NJH /NJS /NP | Out-Null
}

[pscustomobject]@{
  TotalMB         = $totalMB
  CopyItemSeconds = [math]::Round($copyItem.TotalSeconds, 2)
  CopyItemMBps    = [math]::Round($totalMB / $copyItem.TotalSeconds, 1)
  RobocopySeconds = [math]::Round($robocopy.TotalSeconds, 2)
  RobocopyMBps    = [math]::Round($totalMB / $robocopy.TotalSeconds, 1)
} | Format-List

Write-Host ''
Write-Host 'Clean up when finished:'
Write-Host "  Remove-Item -LiteralPath '$source' -Recurse -Force"
Write-Host "  Remove-Item -LiteralPath '$destCopyItem' -Recurse -Force"
Write-Host "  Remove-Item -LiteralPath '$destRobocopy' -Recurse -Force"
