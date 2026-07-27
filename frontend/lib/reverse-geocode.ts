export async function fetchAddress(
  coordinates: [number, number],
  token: string,
  signal?: AbortSignal
): Promise<string | null> {
  const [longitude, latitude] = coordinates
  const url =
    `https://api.mapbox.com/search/geocode/v6/reverse` +
    `?longitude=${longitude}&latitude=${latitude}` +
    `&access_token=${token}`

  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`Reverse geocoding: ${res.status} ${await res.text()}`)
  }

  const data = (await res.json()) as {
    features?: {
      properties?: {
        full_address?: string
        name?: string
        context?: {
          postcode?: { name?: string }
          place?: { name?: string }
          locality?: { name?: string }
        }
      }
    }[]
  }
  const properties = data.features?.[0]?.properties
  if (!properties) return null
  const city =
    properties.context?.place?.name ?? properties.context?.locality?.name
  const postcode = properties.context?.postcode?.name
  if (properties.name && city) {
    return postcode
      ? `${properties.name}, ${postcode} ${city}`
      : `${properties.name}, ${city}`
  }
  return properties.full_address ?? properties.name ?? null
}
