# Unresolved questions

## Required before later phases

- IT provisioning of the dedicated `.\CS_FileAgent` account (or approved domain equivalent).
  `TUDB01\Designer-TUUO` is approved only as the temporary Phase 2 pilot identity.
- **Phase 3 entry gate:** n8n installed as a Windows service on the CS box.
- **Phase 3 entry gate:** Gmail OAuth completed for the shared CS mailbox.
- **Phase 3 entry gate:** final brand/legal wording may later replace the current pilot-approved
  outbound templates in `apps/web/src/lib/outbound/templates.ts` and the Phase 3 plan.

### Phase 3 gate audit — 2026-07-26 (updated)

- **Gate 0 — cleared:** Phase 2/3 work merged into `develop` (PR #3, merge commit `548fb59`).
- **Gate 1 — blocked:** n8n is not yet installed/registered as a Windows service on this host.
- **Gate 2 — blocked:** shared-mailbox Gmail OAuth completion is not evidenced; work-mailbox
  dry-run is permitted for local pilot only.
- **Gate 3 — cleared (pilot):** pilot-approved local copy for `ACKNOWLEDGEMENT`,
  `FILES_VERIFIED`, and `ETA_NOTICE` is recorded in the Phase 3 plan and
  `apps/web/src/lib/outbound/templates.ts`. Final brand/legal copy remains optional follow-up.
- **Required next action:** install and verify n8n as a Windows service, complete Gmail OAuth
  (work mailbox for dry-run; shared mailbox for production), import and dry-run both workflows
  per `docs/integrations/n8n-gmail.md`, then activate only after successful dry-run.

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
