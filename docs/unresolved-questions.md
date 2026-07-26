# Unresolved questions

## Required before later phases

- IT provisioning of the dedicated `.\CS_FileAgent` account (or approved domain equivalent).
  `TUDB01\Designer-TUUO` is approved only as the temporary Phase 2 pilot identity.
- Pixofix portal API / webhook availability.
- Whether authenticated Dropbox/Google Drive automation will be added after the credential-free
  public-Dropbox/manual-drop MVP. Authenticated Google Drive currently fails permanently to manual
  drop by decision.
- Google Sheets cutover plan so production is never starved of order info during pilot.
- HTTPS termination for the web app on the LAN.
- `qwen3:4b` vs `qwen3:8b` bake-off on real emails for classification quality vs latency.

## Additional open decisions

- Whether to split PostgreSQL migration role from runtime role (`cs_app` currently does both).
- Daily volume confirmation over a longer window (current estimate: 20-100 emails / 5-20 orders).
- Exact production path convention after leaving `_Software Test` pilot roots.
- New backup server cutover date and target UNC.
