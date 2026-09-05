export function getMedusaBackendUrl(): string | null {
  const value = process.env.MEDUSA_BACKEND_URL?.trim();
  return value ? value.replace(/\/$/, "") : null;
}

export function forwardedResponse(response: Response): Response {
  const headers = new Headers();
  for (const name of [
    "content-type",
    "content-length",
    "content-disposition",
    "cache-control",
    "x-content-type-options",
  ]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}
