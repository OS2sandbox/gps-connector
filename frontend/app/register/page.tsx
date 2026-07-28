import { Container } from "@/components/container"
import { TenantCertificateCard } from "@/components/tenant-certificate-card"

import { RegisterForm } from "./register-form"

export default function RegisterPage() {
  return (
    <Container className="py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Register devices
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Register one or more IMEIs to your organisation.
      </p>
      <div className="mt-6">
        <TenantCertificateCard />
      </div>
      <div className="mt-8">
        <RegisterForm />
      </div>
    </Container>
  )
}
