import { proxyToBackend } from "@/lib/gps-proxy"

export async function GET() {
  return proxyToBackend("/tenant/cert", undefined, "application/json")
}
