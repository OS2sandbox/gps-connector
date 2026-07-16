export type ParsedRow =
  | { raw: string; status: "ok" }
  | { raw: string; status: "invalid"; reason: string }
  | { raw: string; status: "duplicate"; reason: string }

type Validation = { ok: true } | { ok: false; reason: string }

export function validateImei(value: string): Validation {
  if (!/^\d{15}$/.test(value)) {
    return { ok: false, reason: "Not 15 digits" }
  }
  if (!luhnCheck(value)) {
    return { ok: false, reason: "Invalid IMEI" }
  }
  return { ok: true }
}

function luhnCheck(value: string): boolean {
  let sum = 0
  for (let i = 0; i < value.length; i++) {
    let digit = Number(value[value.length - 1 - i])
    if (i % 2 === 1) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

export function parseImeis(text: string): ParsedRow[] {
  const cleaned = text.replace(/^\uFEFF/, "")
  const tokens = cleaned.split(/[\s,;]+/).filter(Boolean)
  const seen = new Set<string>()
  return tokens.map((raw) => {
    const validation = validateImei(raw)
    if (!validation.ok) {
      return { raw, status: "invalid", reason: validation.reason }
    }
    if (seen.has(raw)) {
      return { raw, status: "duplicate", reason: "Duplicate" }
    }
    seen.add(raw)
    return { raw, status: "ok" }
  })
}
