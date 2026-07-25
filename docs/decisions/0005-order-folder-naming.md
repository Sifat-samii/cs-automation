# ADR 0005: Order folder naming

## Context

Existing share layout is `<ClientCode>\<OrderFolder>`. Order folder names are inconsistent today (`061126_kirkland`, `Vrly Order 002.06.20`, `vrly_16.07.2026.14.55`, plus `- Copy` debris). Client codes themselves are ad hoc. The backup UNC root is already ~102 characters against a 260-character Windows `MAX_PATH` limit.

## Decision

Use hybrid folder names: `CODE_YYMMDD_NNN__human_suffix` (example: `VRLY_260726_001__kirkland_spring_drop`). The agent resolves folders by the machine-identity prefix. A hidden `.cs-order.json` marker inside each order folder records the order ID so the binding survives a rename. `_Final Done` is reserved and never treated as an order folder.

## Alternatives considered

- Canonical code only (`VRLY_260726_001`) — rejected: opaque to production staff.
- Client-supplied names only — rejected: collisions and `- Copy` sprawl already visible on the share.
- Keep informal date-time style — rejected: no stable machine identity.

## Consequences

- The path builder must sanitise names, enforce a length cap, and emit extended-length `\\?\UNC\` paths.
- A client registry must map codes and sender emails to on-disk folder names.
- Humans may edit the descriptive suffix without breaking automation.

## Status

Accepted

## Date

2026-07-26
