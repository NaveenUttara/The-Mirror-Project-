import jwt, { type JwtPayload } from "jsonwebtoken";

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

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("Missing required environment variable: JWT_SECRET");
  }

  try {
    const payload = jwt.verify(authorization.slice(7), secret) as JwtPayload;

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
