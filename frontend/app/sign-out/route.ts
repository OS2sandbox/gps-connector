import { NextResponse, type NextRequest } from "next/server"

import { auth } from "@/lib/auth"

async function resolveEndSessionEndpoint(): Promise<string | null> {
  const discoveryUrl = process.env.KEYCLOAK_DISCOVERY_URL
  if (!discoveryUrl) return null
  try {
    const res = await fetch(discoveryUrl)
    if (!res.ok) return null
    const discovery = (await res.json()) as { end_session_endpoint?: string }
    return discovery.end_session_endpoint ?? null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const signInUrl = new URL("/sign-in", process.env.BETTER_AUTH_URL ?? req.url)

  let idToken: string | null = null
  try {
    const tokens = await auth.api.getAccessToken({
      body: { providerId: "keycloak" },
      headers: req.headers,
    })
    idToken = tokens.idToken ?? null
  } catch {
    idToken = null
  }

  const signOutResponse = await auth.api.signOut({
    headers: req.headers,
    asResponse: true,
  })

  let target = signInUrl.toString()
  if (idToken) {
    const endSessionEndpoint = await resolveEndSessionEndpoint()
    if (endSessionEndpoint) {
      target = `${endSessionEndpoint}?id_token_hint=${encodeURIComponent(idToken)}&post_logout_redirect_uri=${encodeURIComponent(signInUrl.toString())}`
    }
  }

  const response = NextResponse.redirect(target)
  for (const cookie of signOutResponse.headers.getSetCookie()) {
    response.headers.append("set-cookie", cookie)
  }
  return response
}
