"use client"

import { useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { validateImei } from "@/lib/imei"

export type ManualSubmitResult = { ok: true } | { ok: false; error: string }

type Props = {
  requireDevice: () => boolean
  onSubmit: (imei: string) => Promise<ManualSubmitResult>
}

export function ManualImeiTab({ requireDevice, onSubmit }: Props) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (submitting) return
    if (!requireDevice()) return
    const imei = value.trim()
    if (!imei) return

    const validation = validateImei(imei)
    if (!validation.ok) {
      setError(validation.reason)
      return
    }

    setSubmitting(true)
    setError(null)
    const result = await onSubmit(imei)
    setSubmitting(false)
    if (result.ok) setValue("")
    else setError(result.error)
  }

  return (
    <form onSubmit={handleSubmit}>
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor="imei-single" className="sr-only">
          IMEI
        </FieldLabel>
        <div className="flex flex-wrap items-start gap-2">
          <Input
            id="imei-single"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError(null)
            }}
            aria-invalid={error ? "true" : undefined}
            className="min-w-0 flex-1 font-mono sm:max-w-sm"
          />
          <Button type="submit" disabled={submitting}>
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            Register
          </Button>
        </div>
        {error ? (
          <FieldError>{error}</FieldError>
        ) : (
          <FieldDescription>
            15-digit number printed on the device.
          </FieldDescription>
        )}
      </Field>
    </form>
  )
}
