import jwt, { type JwtPayload } from "jsonwebtoken";
import { getJwtSecret } from "@/lib/jwt-secret";
import { authenticatePostgresSession, isPostgresConfigured } from "@/lib/mirror-postgres";
import { isJwtToken } from "@/lib/token-kind";

export type AuthenticatedUser = {
  userId: string;
  phone: string;
  role: string;
};

export async function authenticateRequest(request: Request): Promise<AuthenticatedUser> {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("AUTH_REQUIRED");
  }

  const token = authorization.slice(7).trim();

  if (isPostgresConfigured() && !isJwtToken(token)) {
    return authenticatePostgresSession(token);
  }

  try {
    const payload = jwt.verify(token, getJwtSecret()) as JwtPayload;

    if (!payload.userId || !payload.phone) {
      throw new Error("AUTH_REQUIRED");
    }

    return {
      userId: String(payload.userId),
      phone: String(payload.phone),
      role: String(payload.role || "citizen"),
    };
  } catch {
    throw new Error("AUTH_REQUIRED");
  }
}
