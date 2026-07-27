"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Map, PlusCircle, Table } from "lucide-react"

import { cn } from "@/lib/utils"

const items: {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { href: "/overview", label: "Overview", icon: Table },
  { href: "/register", label: "Register", icon: PlusCircle },
  { href: "/map", label: "Map", icon: Map },
]

export function MainNav() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Primary"
      className="inline-flex items-center gap-1 rounded-full bg-muted p-1 text-sm"
    >
      {items.map(({ href, label, icon: Icon }) => {
        const isActive =
          pathname === href || pathname?.startsWith(`${href}/`) === true
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium transition-colors",
              "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            <span className="hidden md:inline">{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
