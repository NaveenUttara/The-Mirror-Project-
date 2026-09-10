import { NextResponse } from "next/server"
import { forwardedResponse, getMedusaBackendUrl } from "@/lib/medusa-proxy"

export async function GET() {
  const medusaUrl = getMedusaBackendUrl()
  if (!medusaUrl) {
    return NextResponse.json(
      { error: "Public impact statistics are unavailable" },
      { status: 503 },
    )
  }

  const response = await fetch(`${medusaUrl}/mirror/public-impact`, {
    cache: "no-store",
  })
  return forwardedResponse(response)
}
