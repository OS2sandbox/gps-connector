"use client"

import { useState } from "react"
import { AlertCircle, Satellite } from "lucide-react"

import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { authClient } from "@/lib/auth-client"

export default function SignInPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSignIn = async () => {
    setLoading(true)
    setError(null)
    try {
      const { error } = await authClient.signIn.oauth2({
        providerId: "keycloak",
        callbackURL: "/overview",
      })
      if (error) throw error
    } catch {
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2 text-lg font-semibold tracking-tight">
          <Satellite className="size-5 text-primary" />
          <span>GPS Connector</span>
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Welcome back</CardTitle>
            <CardDescription>Log in to GPS Connector</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              className="w-full"
              size="lg"
              disabled={loading}
              onClick={handleSignIn}
            >
              {loading ? <Spinner data-icon="inline-start" /> : null}
              Log in
            </Button>
            {error && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>{error}</AlertTitle>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
