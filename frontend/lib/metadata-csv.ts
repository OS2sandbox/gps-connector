import type { DeviceMetadata } from "@/lib/gps-client"

export type MetadataRow =
  | { imei: string; metadata: DeviceMetadata; status: "ok" }
  | { imei: string; status: "unknown" }
  | { imei: string; status: "invalid"; reason: string }

export type ParsedMetadata = {
  rows: MetadataRow[]
  columns: string[]
}

const TEXT_FIELDS = [
  "plate",
  "vehicle_id",
  "make",
  "model",
  "vehicle_type",
  "fuel_type",
  "associated_location",
] as const

const NUMBER_FIELDS = ["fuel_usage", "capacity", "cost"] as const

function splitLine(line: string, separator: string): string[] {
  return line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, ""))
}

function detectSeparator(headerLine: string): string {
  return headerLine.includes(";") ? ";" : ","
}

function toNumber(value: string, separator: string): number | undefined {
  const normalised = separator === ";" ? value.replace(",", ".") : value
  const parsed = Number(normalised)
  return Number.isFinite(parsed) ? parsed : undefined
}

function toUnixSeconds(value: string): number | undefined {
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) return undefined
  return Math.floor(ms / 1000)
}

function rowToMetadata(
  cells: Record<string, string>,
  separator: string
): DeviceMetadata {
  const metadata: DeviceMetadata = {}
  for (const field of TEXT_FIELDS) {
    const value = cells[field]
    if (value) metadata[field] = value
  }
  for (const field of NUMBER_FIELDS) {
    const value = cells[field]
    if (!value) continue
    const parsed = toNumber(value, separator)
    if (parsed !== undefined) metadata[field] = parsed
  }
  const leasing = cells["leasing_end_date"]
  if (leasing) {
    const parsed = toUnixSeconds(leasing)
    if (parsed !== undefined) metadata.leasing_end_date = parsed
  }
  return metadata
}

export function parseMetadataCsv(
  text: string,
  knownImeis: ReadonlySet<string>
): ParsedMetadata {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
  if (lines.length < 2) return { rows: [], columns: [] }

  const separator = detectSeparator(lines[0])
  const columns = splitLine(lines[0], separator).map((column) =>
    column.toLowerCase()
  )
  const imeiIndex = columns.indexOf("imei")
  if (imeiIndex === -1) return { rows: [], columns }

  const seen = new Set<string>()
  const rows: MetadataRow[] = []
  for (const line of lines.slice(1)) {
    const values = splitLine(line, separator)
    const imei = values[imeiIndex] ?? ""
    // Only the 15-digit shape is enforced here, matching the API. Whether the
    // IMEI is a real device is decided by the tenant's registered IMEIs below.
    if (!/^\d{15}$/.test(imei)) {
      rows.push({ imei, status: "invalid", reason: "Not 15 digits" })
      continue
    }
    if (seen.has(imei)) {
      rows.push({ imei, status: "invalid", reason: "Duplicate" })
      continue
    }
    seen.add(imei)
    if (!knownImeis.has(imei)) {
      rows.push({ imei, status: "unknown" })
      continue
    }
    const cells: Record<string, string> = {}
    columns.forEach((column, index) => {
      cells[column] = values[index] ?? ""
    })
    rows.push({
      imei,
      metadata: rowToMetadata(cells, separator),
      status: "ok",
    })
  }
  return { rows, columns }
}
