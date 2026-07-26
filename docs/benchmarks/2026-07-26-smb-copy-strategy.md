# SMB copy-strategy benchmark

## Run details

- Run time: 2026-07-26 03:23 UTC
- Workstation: Windows 10 Pro, Windows PowerShell 5.1
- Source: designated backup `_Software Test` root
- Destination: designated production `_Software Test` root
- Dataset: 10 files × 200 MiB = 2,000 MiB
- Order: `Copy-Item` first, then `robocopy`

Both roots are separate SMB shares on `192.168.0.15`. The benchmark created a fresh destination
for each method.

## Results

| Method      | Seconds |    Throughput |
| ----------- | ------: | ------------: |
| `Copy-Item` |    3.83 |   522.8 MiB/s |
| `robocopy`  |    0.23 | 8,757.3 MiB/s |

The source and both destinations were checked after the run. Each contained 10 files totaling
2,097,152,000 bytes (2,000 MiB), so neither timing represents an empty or failed copy.

The reported robocopy rate is far above the workstation's expected network throughput. It likely
reflects server-side behavior, filesystem caching, or SMB offload rather than sustained LAN
bandwidth. Since robocopy ran second, warm-cache effects may also contribute. The result should be
treated as a relative implementation decision, not a network-capacity measurement.

## Decision

Phase 2 should use `robocopy` as the primary backup-to-production transfer mechanism. It completed
the validated copy much faster in this run and provides the retry and restart semantics needed by
the File Agent. Phase 2 must still verify the resulting manifest and checksums rather than trusting
the process exit alone.

`Copy-Item` remains a useful diagnostic fallback, but it should not be the primary transfer path
based on this measurement.

## Cleanup

The first benchmark launch was interrupted by the command runner after source generation, before
either copy. It left one additional source-only folder.

At the owner's explicit direction, cleanup completed at 2026-07-26 03:34 UTC. All four folder
paths were validated as `_BENCH_` children of the designated `_Software Test` roots before
deletion, and their absence was verified afterward. These were the exact commands represented by
that cleanup:

```powershell
Remove-Item -LiteralPath '\\192.168.0.15\Production\File Transfer Server\Sifat_Project Coordinator\Software test\_Software Test\_BENCH_20260726-092223' -Recurse -Force
Remove-Item -LiteralPath '\\192.168.0.15\Production\File Transfer Server\Sifat_Project Coordinator\Software test\_Software Test\_BENCH_20260726-092305' -Recurse -Force
Remove-Item -LiteralPath '\\192.168.0.15\Production\File Server\_Share Work\2026\_Software Test\_BENCH_20260726-092305_copyitem' -Recurse -Force
Remove-Item -LiteralPath '\\192.168.0.15\Production\File Server\_Share Work\2026\_Software Test\_BENCH_20260726-092305_robocopy' -Recurse -Force
```
