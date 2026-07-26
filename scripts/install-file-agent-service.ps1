[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter()]
    [string]$ServiceName = 'CSFileAgent',

    [Parameter()]
    [string]$ServiceAccount = '.\CS_FileAgent',

    [Parameter()]
    [System.Management.Automation.PSCredential]$Credential,

    [Parameter()]
    [string]$NssmPath = 'C:\Program Files\nssm\win64\nssm.exe',

    [Parameter()]
    [string]$NodePath = 'C:\Program Files\nodejs\node.exe',

    [Parameter()]
    [string]$ApplicationDirectory = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = 'Stop'

if ($ServiceAccount -match '^(LocalSystem|NT AUTHORITY\\SYSTEM|SYSTEM)$') {
    throw 'The File Agent must not run as LocalSystem. Use the dedicated share-permitted account.'
}

foreach ($requiredPath in @($NssmPath, $NodePath)) {
    if (-not (Test-Path -LiteralPath $requiredPath -PathType Leaf)) {
        throw "Required executable was not found: $requiredPath"
    }
}

$agentEntryPoint = Join-Path $ApplicationDirectory 'apps\file-agent\dist\main.js'
if (-not (Test-Path -LiteralPath $agentEntryPoint -PathType Leaf)) {
    throw "Build the File Agent before installation. Missing: $agentEntryPoint"
}

if ($null -eq $Credential) {
    $Credential = Get-Credential -UserName $ServiceAccount -Message 'Enter the File Agent service-account password. It is used only for local service configuration.'
}
if ($Credential.UserName -ne $ServiceAccount) {
    throw 'The credential user name must exactly match -ServiceAccount.'
}

if (-not $PSCmdlet.ShouldProcess($env:COMPUTERNAME, "Install Windows service $ServiceName as $ServiceAccount")) {
    return
}

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($null -ne $existing) {
    throw "Service $ServiceName already exists. Uninstall it explicitly before reinstalling."
}

& $NssmPath install $ServiceName $NodePath $agentEntryPoint
if ($LASTEXITCODE -ne 0) { throw 'NSSM service creation failed.' }

& $NssmPath set $ServiceName AppDirectory $ApplicationDirectory
if ($LASTEXITCODE -ne 0) { throw 'NSSM AppDirectory configuration failed.' }
& $NssmPath set $ServiceName Start SERVICE_AUTO_START
if ($LASTEXITCODE -ne 0) { throw 'NSSM startup configuration failed.' }
& $NssmPath set $ServiceName AppExit Default Restart
if ($LASTEXITCODE -ne 0) { throw 'NSSM restart configuration failed.' }

$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Credential.Password)
try {
    $plainTextPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    & $NssmPath set $ServiceName ObjectName $ServiceAccount $plainTextPassword
    if ($LASTEXITCODE -ne 0) { throw 'NSSM service-account configuration failed.' }
}
finally {
    if ($null -ne $plainTextPassword) {
        $plainTextPassword = $null
    }
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

& sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Windows service recovery configuration failed.' }

Write-Output "Installed $ServiceName under $ServiceAccount. Grant 'Log on as a service' and verify R/W access before starting it."
