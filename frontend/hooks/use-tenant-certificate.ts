"use client"

import { useEffect, useState } from "react"

import { getTenantCertificate, type TenantCertificate } from "@/lib/gps-client"

type State = {
  data: TenantCertificate | null
  error: string | null
  loaded: boolean
}

export function useTenantCertificate(): State {
  const [state, setState] = useState<State>({
    data: null,
    error: null,
    loaded: false,
  })

  useEffect(() => {
    const controller = new AbortController()
    getTenantCertificate(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return
        setState({ data, error: null, loaded: true })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setState({
          data: null,
          error: "Could not load tenant certificate",
          loaded: true,
        })
      })
    return () => controller.abort()
  }, [])

  return state
}
