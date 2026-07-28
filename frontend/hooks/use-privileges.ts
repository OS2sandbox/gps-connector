"use client"

import { useEffect, useState } from "react"

import { ADMIN_PRIVILEGE, getMe } from "@/lib/gps-client"

type State = {
  urns: string[]
  isAdmin: boolean
  loaded: boolean
}

export function usePrivileges(): State {
  const [state, setState] = useState<State>({
    urns: [],
    isAdmin: false,
    loaded: false,
  })

  useEffect(() => {
    const controller = new AbortController()
    getMe(controller.signal)
      .then((me) => {
        if (controller.signal.aborted) return
        const urns = me.privilege_urns ?? []
        setState({
          urns,
          isAdmin: urns.includes(ADMIN_PRIVILEGE),
          loaded: true,
        })
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setState({ urns: [], isAdmin: false, loaded: true })
      })
    return () => controller.abort()
  }, [])

  return state
}
