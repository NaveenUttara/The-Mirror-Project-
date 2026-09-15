import crypto from "crypto";

export function hashOtp(otp: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${crypto.scryptSync(otp, salt, 64).toString("hex")}:${salt}`;
}

export function isValidOtp(otp: string, storedValue: string): boolean {
  const [storedHash, salt] = storedValue.split(":");

  if (!storedHash || !salt) {
    return false;
  }

  const submittedHash = crypto.scryptSync(otp, salt, 64);
  const storedHashBuffer = Buffer.from(storedHash, "hex");

  return storedHashBuffer.length === submittedHash.length
    && crypto.timingSafeEqual(storedHashBuffer, submittedHash);
}
