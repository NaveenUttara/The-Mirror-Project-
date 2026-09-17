export function getBearerToken(request: Request): string {
  const authorization = request.headers.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
}

export function isJwtToken(token: string): boolean {
  return token.split(".").length === 3;
}

export function shouldUseMedusaBackend(request: Request): boolean {
  const token = getBearerToken(request);
  return Boolean(token) && !isJwtToken(token);
}
