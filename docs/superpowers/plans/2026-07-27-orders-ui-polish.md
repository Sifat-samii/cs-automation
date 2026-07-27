# Orders UI Polish Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Improve `/orders` findability (status chips + search) and `/orders/[id]` action hierarchy per `docs/superpowers/specs/2026-07-27-orders-ui-polish-design.md`.

**Architecture:** Shared presentational helpers for status badges and filter parsing; server-side Prisma filtering on the list page via `searchParams`; detail page restructured section order without changing server actions.

**Tech Stack:** Next.js App Router, Prisma, Tailwind, existing `order-controls` forms.

## Global Constraints

- No schema/API changes; stay in slate/indigo chrome; preserve loading/empty/error.

---

### Task 1: Status helpers + filter parsing (with tests)

- Create `apps/web/src/app/(app)/orders/order-status.ts` with filter map, `parseOrderStatusFilter`, `orderStatusBadgeClass`, `humanizeOrderEventType`.
- Create `apps/web/src/app/(app)/orders/order-status.test.ts`.

### Task 2: Orders list UI

- Update `apps/web/src/app/(app)/orders/page.tsx` for chips, search GET form, table hierarchy, empty vs no-match.
- Optional small `orders-list-controls.tsx` if it keeps the page readable.

### Task 3: Order detail UI

- Update `apps/web/src/app/(app)/orders/[id]/page.tsx`: header, glance strip, single Actions panel, Batches → Outbound → Paths → Timeline.
- Add path copy control (clients-table pattern).
- Collapse timeline JSON in `<details>`.

### Task 4: Verify

- Run focused tests + lint/typecheck on touched files.
