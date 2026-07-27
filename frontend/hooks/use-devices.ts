"use client"

import { useEffect, useRef, useState } from "react"

import { getDevices } from "@/lib/gps-client"
import {
  deviceToPending,
  deviceToVehicle,
  type PendingDevice,
  type VehicleLocation,
} from "@/lib/vehicle-locations"

const POLL_INTERVAL_MS = 60_000
const REQUEST_TIMEOUT_MS = 30_000

type State = {
  vehicles: VehicleLocation[]
  pendingDevices: PendingDevice[]
  error: string | null
  loaded: boolean
}

export function useDevices(): State {
  const [state, setState] = useState<State>({
    vehicles: [],
    pendingDevices: [],
    error: null,
    loaded: false,
  })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let stopped = false

    async function fetchOnce() {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      try {
        const devices = await getDevices(controller.signal)
        if (stopped) return
        const vehicles = devices
          .map(deviceToVehicle)
          .filter((vehicle): vehicle is VehicleLocation => vehicle !== null)
        const pendingDevices = devices
          .map(deviceToPending)
          .filter((pending): pending is PendingDevice => pending !== null)
        setState({ vehicles, pendingDevices, error: null, loaded: true })
      } catch {
        if (stopped) return
        if (controller.signal.aborted && abortRef.current !== controller) return
        setState((prev) => ({
          ...prev,
          error: "Could not load vehicles",
          loaded: true,
        }))
      } finally {
        clearTimeout(timeout)
      }
    }

    fetchOnce()
    const interval = setInterval(() => {
      if (document.hidden) return
      fetchOnce()
    }, POLL_INTERVAL_MS)

    const onVisibility = () => {
      if (!document.hidden) fetchOnce()
    }
    document.addEventListener("visibilitychange", onVisibility)

    return () => {
      stopped = true
      clearInterval(interval)
      document.removeEventListener("visibilitychange", onVisibility)
      abortRef.current?.abort()
    }
  }, [])

  return state
}
