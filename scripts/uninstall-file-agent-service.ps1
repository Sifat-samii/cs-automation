[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter()]
    [string]$ServiceName = 'CSFileAgent',

    [Parameter()]
    [string]$NssmPath = 'C:\Program Files\nssm\win64\nssm.exe'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $NssmPath -PathType Leaf)) {
    throw "NSSM was not found: $NssmPath"
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -eq $service) {
    Write-Output "Service $ServiceName is not installed."
    return
}

if (-not $PSCmdlet.ShouldProcess($env:COMPUTERNAME, "Stop and remove Windows service $ServiceName")) {
    return
}

if ($service.Status -ne 'Stopped') {
    Stop-Service -Name $ServiceName -Force
    $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
}

& $NssmPath remove $ServiceName confirm
if ($LASTEXITCODE -ne 0) {
    throw "NSSM could not remove service $ServiceName."
}

Write-Output "Removed service $ServiceName. Repository files and staging data were not deleted."
