# Unresolved questions

## Required before later phases

- IT provisioning of the dedicated `.\CS_FileAgent` account (or approved domain equivalent).
  `TUDB01\Designer-TUUO` is approved only as the temporary Phase 2 pilot identity.
- **Phase 3 entry gate:** n8n installed as a Windows service on the CS box.
- **Phase 3 entry gate:** Gmail OAuth completed for the shared CS mailbox.
- **Phase 3 entry gate:** approved exact wording for outbound templates
  `ACKNOWLEDGEMENT`, `FILES_VERIFIED`, and `ETA_NOTICE` (paste into
  `docs/superpowers/plans/2026-07-26-cs-automation-phase-3.md`; do not invent copy).

### Phase 3 gate audit — 2026-07-26

- **Gate 0 — blocked:** verified Phase 2 head `1207d01` is not an ancestor of local `develop`
  (`63802b7`); Phase 2 remains on `feature/file-agent` / `docs/phase-3-plan`.
- **Gate 1 — blocked:** no Windows service with an n8n service name or display name is
  registered on this host.
- **Gate 2 — blocked:** shared-mailbox Gmail OAuth completion is not evidenced in the repository
  or configured environment and remains explicitly unresolved.
- **Gate 3 — blocked:** the Phase 3 plan still contains `GATE_BLOCKED_PLACEHOLDER` for the subject
  and body of all three outbound templates.
- **Required next action:** merge the Phase 2 review-hardened branch into `develop`, install and
  verify n8n as a Windows service, complete shared-mailbox Gmail OAuth, and paste owner-approved
  wording into the Phase 3 plan. Re-run this gate audit before creating
  `feature/gmail-integration` or implementing Tasks 3.1–3.10.

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
