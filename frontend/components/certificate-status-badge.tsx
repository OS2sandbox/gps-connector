import { ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { TenantCertificate } from "@/lib/gps-client"

const EXPIRING_SOON_DAYS = 90

export function CertificateStatusBadge({
  tenantCertificate,
}: {
  tenantCertificate: TenantCertificate | null
}) {
  if (!tenantCertificate) {
    return <span className="text-muted-foreground">-</span>
  }
  const days = tenantCertificate.days_until_expiry
  if (days <= 0) return <Badge variant="destructive">Expired</Badge>
  if (days < EXPIRING_SOON_DAYS || tenantCertificate.needs_rotation) {
    return <Badge variant="warning">Expiring soon</Badge>
  }
  return (
    <Badge variant="success">
      <ShieldCheck />
      Valid
    </Badge>
  )
}
