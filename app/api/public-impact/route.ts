import { NextResponse } from "next/server";
import { getDemoPublicImpact } from "@/lib/demo-store";
import { getPostgresPublicImpact, isPostgresConfigured } from "@/lib/mirror-postgres";
import { mergePublicImpact, type PublicImpactData } from "@/lib/public-impact-merge";
import { getMedusaBackendUrl } from "@/lib/medusa-proxy";

async function fetchMedusaPublicImpact(): Promise<PublicImpactData | null> {
  const medusaUrl = getMedusaBackendUrl();
  if (!medusaUrl) {
    return null;
  }

  try {
    const response = await fetch(`${medusaUrl}/mirror/public-impact`, {
      cache: "no-store",
    });
    if (!response.ok) {
      return null;
    }
    return await response.json() as PublicImpactData;
  } catch (error) {
    console.error("[public-impact] Medusa request failed:", error);
    return null;
  }
}

export async function GET() {
  let impact: PublicImpactData = await getDemoPublicImpact();

  if (isPostgresConfigured()) {
    try {
      const postgresImpact = await getPostgresPublicImpact();
      impact = mergePublicImpact(impact, postgresImpact);
    } catch (error) {
      console.error("[public-impact] PostgreSQL request failed:", error);
    }
  }

  const medusaImpact = await fetchMedusaPublicImpact();
  impact = mergePublicImpact(impact, medusaImpact);

  return NextResponse.json(impact);
}
