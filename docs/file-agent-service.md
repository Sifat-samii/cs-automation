# File Agent Windows service

## Account decision

The production service identity is the dedicated local account `.\CS_FileAgent`. IT may instead
replace it with a dedicated domain identity such as `YOURDOMAIN\svc_cs_file_agent`. The password is
configured only through the local credential prompt used by the installer. It must never be
committed, written to a configuration file, pasted into chat, or included in an operational log.

Until IT creates the dedicated identity, the explicitly approved interim identity is
`TUDB01\Designer-TUUO`, because that host user already has proven access to the pilot shares. The
interim identity is not the production choice and must be replaced with `.\CS_FileAgent` (or the
approved domain equivalent) before general operation.

The selected identity requires:

- read/write access to both approved `_Software Test` UNC roots;
- read/write access to `D:\cs-staging`;
- the `Log on as a service` user right on `TUDB01`.

`LocalSystem`, `SYSTEM`, and `NT AUTHORITY\SYSTEM` are forbidden. They do not carry the intended
share identity and can make an interactive test pass while the service cannot access SMB.

## Build and install

NSSM must be installed locally at `C:\Program Files\nssm\win64\nssm.exe`, or its path must be
passed explicitly. From an elevated Windows PowerShell 5.1 prompt:

```powershell
npm.cmd run build --workspace @cs/file-agent
.\scripts\install-file-agent-service.ps1 -ServiceAccount '.\CS_FileAgent'
Start-Service -Name CSFileAgent
```

For the temporary identity only:

```powershell
.\scripts\install-file-agent-service.ps1 -ServiceAccount 'TUDB01\Designer-TUUO'
```

The installer requests a `PSCredential` locally, validates that the requested account is not
LocalSystem, configures automatic restart, and does not persist or print the password.

Before starting the service, keep the normal server environment values available to the service
process, including `DATABASE_URL`, `INGEST_HMAC_SECRET`, the two UNC roots, `D:\cs-staging`, and the
File Agent settings shown in `.env.example`. Dropbox and Google Drive credentials are deliberately
absent in Phase 2: public Dropbox links and confirmed manual drops are supported; Google Drive
sources fail permanently with an instruction to use manual drop.

## Uninstall

```powershell
.\scripts\uninstall-file-agent-service.ps1
```

Uninstalling removes only the service registration. It does not delete repository files,
`D:\cs-staging`, or content on either share.
