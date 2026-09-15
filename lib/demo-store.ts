import { createHash } from "crypto";

type DemoUser = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: string;
};

const users = new Map<string, DemoUser>();

function demoUserId(phone: string): string {
  return createHash("sha256").update(phone).digest("hex").slice(0, 12);
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
    id: demoUserId(phone),
    name,
    phone,
    email,
    role: "citizen",
  };
  users.set(phone, created);
  return created;
}

export function getOrCreateDemoUser(
  phone: string,
  name: string,
  email: string | null,
): DemoUser {
  const existing = users.get(phone);
  if (existing) {
    return existing;
  }

  return upsertDemoUser(phone, name, email);
}
