import "server-only"

import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { auth } from "@/lib/auth"

class ProxyError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

function backendBaseUrl(): string {
  const url = process.env.GPS_CONNECTOR_API_URL
  if (!url) throw new ProxyError(500, "Backend API URL is not configured")
  return url
}

async function getKeycloakAccessToken(): Promise<string> {
  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session) throw new ProxyError(401, "No session")

  const tokens = await auth.api.getAccessToken({
    body: { providerId: "keycloak", userId: session.user.id },
    headers: requestHeaders,
  })
  if (!tokens?.accessToken) {
    throw new ProxyError(401, "No access token")
  }
  return tokens.accessToken
}

function backendUrl(path: string, search?: URLSearchParams) {
  const url = new URL(backendBaseUrl().replace(/\/+$/, "") + path)
  if (search) url.search = search.toString()
  return url
}

type ProxyInit = {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  body?: unknown
  signal?: AbortSignal
}

export async function proxyToBackend(
  upstreamPath: string,
  search: URLSearchParams | undefined,
  contentType: string,
  init?: ProxyInit
): Promise<Response> {
  try {
    const token = await getKeycloakAccessToken()
    const upstreamHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    }
    let body: string | undefined
    if (init?.body !== undefined) {
      body = JSON.stringify(init.body)
      upstreamHeaders["Content-Type"] = "application/json"
    }
    const upstream = await fetch(backendUrl(upstreamPath, search), {
      method: init?.method ?? "GET",
      headers: upstreamHeaders,
      body,
      cache: "no-store",
      signal: init?.signal,
    })
    if (!upstream.ok) {
      return new NextResponse("Upstream request failed", {
        status: upstream.status,
      })
    }
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: { "Content-Type": contentType },
    })
  } catch (err) {
    if (err instanceof ProxyError) {
      return new NextResponse(err.message, { status: err.status })
    }
    return new NextResponse("Upstream request failed", { status: 500 })
  }
}
