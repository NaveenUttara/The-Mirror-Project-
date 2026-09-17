import { NextResponse } from "next/server"
import { forwardedResponse, getMedusaBackendUrl } from "@/lib/medusa-proxy"
import { getDemoPublicImpactResponse } from "@/lib/demo-reports"

export async function GET() {
  const medusaUrl = getMedusaBackendUrl()

  if (medusaUrl) {
    try {
      const response = await fetch(`${medusaUrl}/mirror/public-impact`, {
        cache: "no-store",
      })
      if (response.ok) {
        return forwardedResponse(response)
      }
    } catch (error) {
      console.error("[public-impact] Medusa request failed:", error)
    }
  }

  return getDemoPublicImpactResponse()
}
