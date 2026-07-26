#!/usr/bin/env node
/**
 * Compare Postgres order titles/codes against a CSV export of the Daily Order Pipeline sheet.
 *
 * Usage (PowerShell):
 *   node scripts/reconcile-sheet-mirror.mjs "C:\path\to\Daily Order Pipeline.csv"
 *
 * Exit codes:
 *   0 — every non-cancelled Postgres order with a title appears in the sheet Order Name column
 *   1 — usage / I/O error
 *   2 — missing sheet rows detected
 *
 * Sheets never writes Postgres. This script is read-only against the database.
 */
import { readFileSync } from "node:fs";
import process from "node:process";
import { prisma } from "@cs/db";

const csvPath = process.argv[2];
if (!csvPath) {
  console.error(
    'Usage: node scripts/reconcile-sheet-mirror.mjs "<path-to-daily-order-pipeline.csv>"',
  );
  process.exit(1);
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells;
}

function sheetOrderNames(csvText) {
  const names = new Set();
  for (const line of csvText.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    const cells = parseCsvLine(line);
    // Canonical columns: C=Date, D=Client, E=Order Name, F=Quantity (0-based index 4)
    const orderName = (cells[4] ?? "").trim();
    const date = (cells[2] ?? "").trim();
    if (!orderName || orderName === "Order Name" || orderName === "Order List") continue;
    if (!date || date === "Date") continue;
    names.add(orderName);
  }
  return names;
}

try {
  const csvText = readFileSync(csvPath, "utf8");
  const inSheet = sheetOrderNames(csvText);
  const orders = await prisma.order.findMany({
    where: { status: { notIn: ["CANCELLED"] } },
    select: { code: true, title: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  const missing = orders.filter((order) => !inSheet.has(order.title.trim()));
  console.error(`Sheet Order Name values: ${inSheet.size}`);
  console.error(`Active Postgres orders: ${orders.length}`);
  console.error(`Missing from sheet: ${missing.length}`);
  for (const order of missing) {
    console.error(`- ${order.code} | ${order.status} | ${order.title}`);
  }

  const pending = await prisma.sheetMirrorOutbox.count({
    where: { status: { in: ["PENDING", "CLAIMED"] } },
  });
  console.error(`Outbox still PENDING/CLAIMED: ${pending}`);

  process.exit(missing.length > 0 ? 2 : 0);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
