import { proxyToBackend } from "@/lib/gps-proxy"

export async function POST() {
  return proxyToBackend(
    "/tenant/cert/rotate",
    undefined,
    "application/x-pem-file",
    { method: "POST" }
  )
}
