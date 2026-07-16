"use client"

import { Satellite } from "lucide-react"
import { usePathname } from "next/navigation"

import { Container } from "@/components/container"
import { MainNav } from "@/components/main-nav"
import { UserNav } from "@/components/user-nav"

export function SiteHeader() {
  const pathname = usePathname()
  if (pathname.startsWith("/sign-in")) {
    return null
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Container className="flex h-16 items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-semibold tracking-tight">
          <Satellite className="size-5 text-primary" />
          <span>GPS Connector</span>
        </div>

        <div className="flex flex-1 justify-center">
          <MainNav />
        </div>

        <div className="flex items-center gap-2">
          <UserNav />
        </div>
      </Container>
    </header>
  )
}
