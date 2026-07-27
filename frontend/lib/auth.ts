import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { genericOAuth } from "better-auth/plugins"

function requireEnv(value: string | undefined, capability: string): string {
  if (!value) {
    throw new Error(`${capability} is not configured`)
  }
  return value
}

export const auth = betterAuth({
  account: {
    storeAccountCookie: true,
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: "keycloak",
          clientId: requireEnv(
            process.env.KEYCLOAK_CLIENT_ID,
            "Keycloak client ID"
          ),
          clientSecret: requireEnv(
            process.env.KEYCLOAK_CLIENT_SECRET,
            "Keycloak client secret"
          ),
          discoveryUrl: requireEnv(
            process.env.KEYCLOAK_DISCOVERY_URL,
            "Keycloak discovery URL"
          ),
          scopes: ["openid", "email", "profile"],
          pkce: true,
        },
      ],
    }),
    nextCookies(),
  ],
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 12,
      strategy: "compact",
    },
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
})

export type Session = typeof auth.$Infer.Session
