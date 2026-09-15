import { getMedusaBackendUrl } from "@/lib/medusa-proxy";

export async function fetchMedusaAuth(
  path: string,
  init: RequestInit,
): Promise<Response | null> {
  const medusaUrl = getMedusaBackendUrl();
  if (!medusaUrl) {
    return null;
  }

  try {
    const response = await fetch(`${medusaUrl}${path}`, {
      ...init,
      cache: "no-store",
    });

    if (response.ok) {
      return response;
    }

    const body = await response.text();
    console.error(
      `[auth] Medusa ${path} returned ${response.status}: ${body.slice(0, 200)}`,
    );
    return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[auth] Medusa ${path} unreachable at ${medusaUrl}: ${message}`);
    return null;
  }
}
