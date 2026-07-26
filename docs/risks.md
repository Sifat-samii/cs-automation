# Risks

| Risk                                         | Severity            | Notes                                                                                                                                                       |
| -------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| X: and Z: are the same physical server/share | High (ops)          | Not an independent backup. Infrastructure decision outside this app.                                                                                        |
| Plain HTTP on the LAN                        | Medium              | Session cookies cannot be `Secure` until HTTPS.                                                                                                             |
| CPU-only LLM latency                         | Medium              | ~1 min/classification at `qwen3:8b`; inbox must not block.                                                                                                  |
| `C:` ~57 GB free                             | Medium              | DB on C:; staging on D:; monitor disk.                                                                                                                      |
| Unmanaged share debris                       | Medium              | Agent must never write to share roots; namespaced `_Software Test` roots only.                                                                              |
| Google Sheets cutover                        | High for go-live    | Production head depends on the sheet until mirror ships.                                                                                                    |
| Path length (`MAX_PATH`)                     | High for transfers  | Require `\\?\UNC\` and name length caps.                                                                                                                    |
| Authenticated Dropbox/Drive links            | High for automation | Manual-drop fallback is required in MVP.                                                                                                                    |
| Pixofix API unknown                          | Medium              | Portal orders may stay manual until known.                                                                                                                  |
| Next.js 16.2 transitive audit findings       | High (upstream)     | Pinned PostCSS/Sharp and ESLint-chain findings have no compatible stable fix; avoid untrusted image/CSS processing and upgrade when upstream releases land. |
