import { Container } from "@/components/container"

import { RegisterForm } from "./register-form"

export default function RegisterPage() {
  return (
    <Container className="py-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Register devices
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Generate a certificate for one or more IMEIs.
      </p>
      <div className="mt-8">
        <RegisterForm />
      </div>
    </Container>
  )
}
