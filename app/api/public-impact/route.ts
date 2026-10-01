import { NextResponse } from "next/server";
import { getDemoPublicImpact } from "@/lib/demo-store";
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
  const demoImpact = await getDemoPublicImpact();
  const medusaImpact = await fetchMedusaPublicImpact();
  return NextResponse.json(mergePublicImpact(demoImpact, medusaImpact));
}
