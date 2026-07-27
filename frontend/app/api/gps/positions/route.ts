import { type NextRequest } from "next/server"

import { proxyToBackend } from "@/lib/gps-proxy"

export async function GET(req: NextRequest) {
  const search = new URLSearchParams()
  for (const key of ["from", "to", "device_id"]) {
    const value = req.nextUrl.searchParams.get(key)
    if (value) search.set(key, value)
  }
  return proxyToBackend("/positions", search, "application/x-ndjson", {
    signal: req.signal,
  })
}
