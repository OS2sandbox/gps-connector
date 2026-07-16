"use client"

import { useCallback, useEffect, useState } from "react"

import { getDevices } from "@/lib/gps-client"

type State = {
  imeis: Set<string>
  loaded: boolean
  errored: boolean
}

export type TenantImeisHook = {
  imeis: ReadonlySet<string>
  loaded: boolean
  errored: boolean
  markRegistered: (imeis: readonly string[]) => void
}

export function useTenantImeis(): TenantImeisHook {
  const [state, setState] = useState<State>({
    imeis: new Set(),
    loaded: false,
    errored: false,
  })

  useEffect(() => {
    const controller = new AbortController()
    getDevices(controller.signal)
      .then((devices) => {
        if (controller.signal.aborted) return
        setState({
          imeis: new Set(devices.map((device) => device.imei)),
          loaded: true,
          errored: false,
        })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setState((prev) => ({ ...prev, loaded: true, errored: true }))
      })
    return () => controller.abort()
  }, [])

  const markRegistered = useCallback((imeis: readonly string[]) => {
    if (imeis.length === 0) return
    setState((prev) => {
      if (imeis.every((imei) => prev.imeis.has(imei))) return prev
      const next = new Set(prev.imeis)
      for (const imei of imeis) next.add(imei)
      return { ...prev, imeis: next }
    })
  }, [])

  return {
    imeis: state.imeis,
    loaded: state.loaded,
    errored: state.errored,
    markRegistered,
  }
}
