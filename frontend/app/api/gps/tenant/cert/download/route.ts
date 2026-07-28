import { proxyToBackend } from "@/lib/gps-proxy"

export async function POST() {
  return proxyToBackend("/tenant/cert", undefined, "application/x-pem-file", {
    method: "POST",
  })
}
