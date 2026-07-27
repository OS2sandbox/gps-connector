import { NextResponse, type NextRequest } from "next/server"

import { proxyToBackend } from "@/lib/gps-proxy"

export async function GET(req: NextRequest) {
  return proxyToBackend("/devices", undefined, "application/json", {
    signal: req.signal,
  })
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new NextResponse("Invalid JSON body", { status: 400 })
  }
  return proxyToBackend("/devices", undefined, "application/json", {
    method: "POST",
    body,
  })
}

export async function PATCH(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new NextResponse("Invalid JSON body", { status: 400 })
  }
  return proxyToBackend("/devices", undefined, "application/json", {
    method: "PATCH",
    body,
  })
}

export async function DELETE(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new NextResponse("Invalid JSON body", { status: 400 })
  }
  return proxyToBackend("/devices", undefined, "application/json", {
    method: "DELETE",
    body,
  })
}
