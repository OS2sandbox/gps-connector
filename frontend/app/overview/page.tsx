import { Container } from "@/components/container"
import { TenantCertificateCard } from "@/components/tenant-certificate-card"

import { OverviewTable } from "./overview-table"

export default function OverviewPage() {
  return (
    <Container className="py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        All registered devices and their vehicles.
      </p>
      <div className="mt-6">
        <TenantCertificateCard />
      </div>
      <div className="mt-6">
        <OverviewTable />
      </div>
    </Container>
  )
}
