import { NextResponse } from "next/server"
import { forwardedResponse, getMedusaBackendUrl } from "@/lib/medusa-proxy"
import { getDemoPublicImpactResponse } from "@/lib/demo-reports"
import { getPostgresPublicImpact, isPostgresConfigured } from "@/lib/mirror-postgres"

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

  if (isPostgresConfigured()) {
    try {
      return NextResponse.json(await getPostgresPublicImpact())
    } catch (error) {
      console.error("[public-impact] PostgreSQL request failed:", error)
    }
  }

  return await getDemoPublicImpactResponse()
}
