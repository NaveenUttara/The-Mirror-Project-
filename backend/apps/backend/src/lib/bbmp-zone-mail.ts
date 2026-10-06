export type BbmpZoneId = "east" | "west" | "south" | "rr_nagar"

export type BbmpZoneMatch = {
  zoneId: BbmpZoneId
  zoneName: string
  zonalEmail: string
}

export const BBMP_CENTRAL_EMAILS = [
  "comm@bbmp.gov.in",
  "contactusbbmp@gmail.com",
] as const

const BBMP_ZONES: Array<{
  zoneId: BbmpZoneId
  zoneName: string
  zonalEmail: string
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}> = [
  {
    zoneId: "rr_nagar",
    zoneName: "RR Nagar Zone",
    zonalEmail: "zc-rrnagara@bbmp.gov.in",
    minLat: 12.855,
    maxLat: 12.948,
    minLng: 77.462,
    maxLng: 77.578,
  },
  {
    zoneId: "east",
    zoneName: "East Zone",
    zonalEmail: "zc-east@bbmp.gov.in",
    minLat: 12.9,
    maxLat: 13.08,
    minLng: 77.62,
    maxLng: 77.78,
  },
  {
    zoneId: "west",
    zoneName: "West Zone",
    zonalEmail: "zc-west@bbmp.gov.in",
    minLat: 12.94,
    maxLat: 13.08,
    minLng: 77.44,
    maxLng: 77.58,
  },
  {
    zoneId: "south",
    zoneName: "South Zone",
    zonalEmail: "zc-south@bbmp.gov.in",
    minLat: 12.82,
    maxLat: 12.93,
    minLng: 77.5,
    maxLng: 77.7,
  },
]

const BENGALURU_BOUNDS = {
  minLat: 12.8,
  maxLat: 13.1,
  minLng: 77.42,
  maxLng: 77.8,
}

function inBounds(
  latitude: number,
  longitude: number,
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
): boolean {
  return (
    latitude >= bounds.minLat
    && latitude <= bounds.maxLat
    && longitude >= bounds.minLng
    && longitude <= bounds.maxLng
  )
}

export function matchBbmpZone(latitude: number, longitude: number): BbmpZoneMatch | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null
  }

  for (const zone of BBMP_ZONES) {
    if (inBounds(latitude, longitude, zone)) {
      return {
        zoneId: zone.zoneId,
        zoneName: zone.zoneName,
        zonalEmail: zone.zonalEmail,
      }
    }
  }

  return null
}

export function isInsideBengaluruServiceArea(latitude: number, longitude: number): boolean {
  return inBounds(latitude, longitude, BENGALURU_BOUNDS)
}

export function parseExtraRecipientList(): string[] {
  const raw = process.env.REPORT_NOTIFY_EMAILS || ""
  return raw
    .split(/[,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry))
}

export function resolveBbmpMailTargets(
  latitude: number,
  longitude: number,
  extraRecipients: string[] = [],
): { to: string[]; cc: string[]; zone: BbmpZoneMatch | null } {
  const pilotTo = process.env.BBMP_EMAIL_TO?.trim()
  if (pilotTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pilotTo)) {
    const cc = new Set<string>(extraRecipients)
    const senderCc = process.env.SMTP_CC?.trim()
    if (senderCc && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(senderCc)) {
      cc.add(senderCc)
    }
    return { to: [pilotTo], cc: [...cc], zone: matchBbmpZone(latitude, longitude) }
  }

  const zone = matchBbmpZone(latitude, longitude)
  const central = [...BBMP_CENTRAL_EMAILS]
  const centralSet = new Set<string>(central)
  const extras = extraRecipients.filter((email) => !centralSet.has(email))

  if (zone) {
    return {
      to: [zone.zonalEmail],
      cc: [...central, ...extras],
      zone,
    }
  }

  return {
    to: central,
    cc: extras,
    zone: null,
  }
}
