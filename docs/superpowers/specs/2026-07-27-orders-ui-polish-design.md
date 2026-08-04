# Orders list + detail UI polish (Approach A)

**Date:** 2026-07-27  
**Status:** Approved  
**Scope:** `/orders` list and `/orders/[id]` detail only  
**Out of scope:** New APIs, schema changes, inbox/clients redesign, new brand system

## Goals

1. **Scan & find** — Faster recognition of order identity and status; filter/search on the list.
2. **Act faster** — Detail page puts transfer/batches and a single actions area ahead of secondary noise.

## Non-goals

- Card-based order list (keep table for density).
- Changing order lifecycle rules or transfer behaviour.
- Full visual rebrand (stay within existing slate / indigo app chrome).

## Orders list (`/orders`)

### Header

- Keep page title “Orders”, short supporting line, primary **New order** CTA.

### Findability

- **Status filter chips** (mutually exclusive, via `?status=`):
  - `all` (default)
  - `draft` → `DRAFT`
  - `acknowledged` → `ACKNOWLEDGED`
  - `awaiting_eta` → `AWAITING_ETA`
  - `eta_sent` → `ETA_SENT`
  - `in_production` → `IN_PRODUCTION`
  - `closed` → `CLOSED` and `CANCELLED`
- **Search** via `?q=` matching (case-insensitive) order `code`, `title`, or client `displayName`.
- Filters compose: both `q` and `status` may be set. Prefer server-side filtering in the page for correct empty states without shipping a large client table.

### Table

- **Primary:** order title (link to detail).
- **Secondary:** mono order code under or beside title.
- Client display name.
- Status badge with lightweight lifecycle colour (draft = slate, active mid-funnel = indigo/amber tones, in production = stronger indigo, closed/cancelled = muted).
- ETA (or “Not set”).
- Batch count.
- Preserve hover row affordance; entire title/code cell is the main click target.

### Empty states

- No orders at all → existing dashed empty + Create CTA.
- Orders exist but filter/search matches none → “No matching orders” + clear filters link.

### Loading / error

- Keep existing `loading.tsx` / `error.tsx` patterns for the route.

## Order detail (`/orders/[id]`)

### Header

- Back to orders.
- Title as H1; mono code; client name (link to `/clients/[id]` if `client:read`, otherwise plain text); order type.
- Prominent status badge; show ETA in header when set.

### At-a-glance strip

- Compact horizontal/grid strip (not four heavy equal cards): Quantity, Client code, Created (UTC), Latest batch status (or “No batches”).
- Paths moved out of a large mid-page block into a compact **Paths** subsection with mono text + copy buttons (same pattern as clients table Copy).

### Actions (single panel)

- One **Actions** section containing:
  - Edit details
  - Progress order
  - Set ETA
  - Add batch
- Layout: responsive grid inside one panel (not four competing top-level cards).
- Hidden entirely when order is `CLOSED` or `CANCELLED` (unchanged rule).
- Visual weight secondary to Batches.

### Work sections (order)

1. **Batches** — transfer monitor prominent; failure text remains loud; source links readable with kind labels.
2. **Outbound email** — existing list/approve behaviour; calmer section intro.
3. **Paths** — compact, copyable.
4. **Timeline** — last; humanised event type labels; raw JSON payload inside collapsed `<details>` per event (default closed).

### Loading / empty / error

- Keep route loading/error.
- Empty outbound / empty timeline: short calm copy (already partly present).
- Preserve transfer monitor loading/disabled feedback on buttons.

## Technical notes

- Reuse existing server actions and forms in `order-controls.tsx`; restyle/restructure presentation only where needed.
- Extract small presentational helpers if useful (`OrderStatusBadge`, filter chip row) under `orders/` — no new shared design system package.
- `searchParams` on the list page for `q` and `status`.
- No Prisma schema or API contract changes.

## Acceptance criteria

- [ ] List supports status chip filter and text search via URL params.
- [ ] List empty and no-match states are distinct and clear.
- [ ] Detail header shows status (and ETA when set) without scrolling.
- [ ] Actions live in one panel; batches appear above outbound/timeline.
- [ ] Timeline payloads are collapsed by default.
- [ ] Paths are copyable; loading/empty/error behaviours preserved.
- [ ] Existing order action tests still pass; add minimal tests only if new pure helpers warrant them.

## Risks

- Colour badges must remain readable (not rely on colour alone — keep text labels).
- Server-side filter on large order sets is fine for current on-prem volume; revisit pagination later if needed.
