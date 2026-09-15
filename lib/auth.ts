import jwt, { type JwtPayload } from "jsonwebtoken";
import { getJwtSecret } from "@/lib/jwt-secret";

export type AuthenticatedUser = {
  userId: string;
  phone: string;
  role: string;
};

export function authenticateRequest(request: Request): AuthenticatedUser {
  const authorization = request.headers.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    throw new Error("AUTH_REQUIRED");
  }

  try {
    const payload = jwt.verify(authorization.slice(7), getJwtSecret()) as JwtPayload;

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
