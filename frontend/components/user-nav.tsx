"use client"

import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/auth-client"

export function UserNav() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending || !session) {
    return null
  }

  return (
    <Button size="sm" variant="outline" asChild>
      <a href="/sign-out">Log out</a>
    </Button>
  )
}
