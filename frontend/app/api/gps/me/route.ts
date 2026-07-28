import { type NextRequest } from "next/server"

import { proxyToBackend } from "@/lib/gps-proxy"

export async function GET(req: NextRequest) {
  return proxyToBackend("/me", undefined, "application/json", {
    signal: req.signal,
  })
}
