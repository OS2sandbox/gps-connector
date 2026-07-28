"use client"

import { useCallback, useEffect, useRef, useState } from "react"

import { getTenantCertificate, type TenantCertificate } from "@/lib/gps-client"

type State = {
  data: TenantCertificate | null
  error: string | null
  loaded: boolean
}

export function useTenantCertificate() {
  const [state, setState] = useState<State>({
    data: null,
    error: null,
    loaded: false,
  })
  const abortRef = useRef<AbortController | null>(null)

  const load = useCallback(() => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
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
  }, [])

  useEffect(() => {
    load()
    return () => abortRef.current?.abort()
  }, [load])

  return {
    data: state.data,
    error: state.error,
    loaded: state.loaded,
    refresh: load,
  }
}
