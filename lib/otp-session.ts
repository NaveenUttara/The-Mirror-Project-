import jwt, { type JwtPayload } from "jsonwebtoken";
import { hashOtp, isValidOtp } from "@/lib/otp-crypto";
import { getJwtSecret } from "@/lib/jwt-secret";

type OtpSessionPayload = JwtPayload & {
  phone: string;
  otpHash: string;
};

export function createOtpSession(phone: string, otp: string): string {
  return jwt.sign(
    { phone, otpHash: hashOtp(otp) },
    getJwtSecret(),
    { expiresIn: "10m" },
  );
}

export function verifyOtpSession(
  session: string,
  phone: string,
  otp: string,
): boolean {
  try {
    const payload = jwt.verify(session, getJwtSecret()) as OtpSessionPayload;

    return payload.phone === phone && isValidOtp(otp, payload.otpHash);
  } catch {
    return false;
  }
}
