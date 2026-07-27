export const GPS_DEVICES = ["teltonika"] as const

export type GpsDevice = (typeof GPS_DEVICES)[number]
