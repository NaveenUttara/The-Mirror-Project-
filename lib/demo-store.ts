import { hashOtp } from "@/lib/otp-crypto";

type OtpEntry = {
  otpHash: string;
  expiresAt: Date;
};

type DemoUser = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
};

const otpRequests = new Map<string, OtpEntry>();
const users = new Map<string, DemoUser>();
let nextUserId = 1;

export function saveDemoOtpRequest(phone: string, otp: string): void {
  otpRequests.set(phone, {
    otpHash: hashOtp(otp),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
}

export function getDemoOtpRequest(phone: string): OtpEntry | undefined {
  return otpRequests.get(phone);
}

export function deleteDemoOtpRequest(phone: string): void {
  otpRequests.delete(phone);
}

export function findDemoUser(phone: string): DemoUser | undefined {
  return users.get(phone);
}

export function upsertDemoUser(
  phone: string,
  name: string,
  email: string | null,
): DemoUser {
  const existing = users.get(phone);

  if (existing) {
    const updated = {
      ...existing,
      name,
      email,
    };
    users.set(phone, updated);
    return updated;
  }

  const created: DemoUser = {
    id: String(nextUserId++),
    name,
    phone,
    email,
    role: "citizen",
  };
  users.set(phone, created);
  return created;
}
