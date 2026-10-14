function normalizeSecret(value) {
  if (!value) return "";
  let trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    trimmed = trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function requiredEnvironment(name) {
  const value = normalizeSecret(process.env[name]);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

try {
  const apiKey = requiredEnvironment("RESEND_API_KEY");
  const from = requiredEnvironment("REPORT_EMAIL_FROM");

  if (!apiKey.startsWith("re_")) {
    throw new Error(
      "RESEND_API_KEY should start with re_ (check for truncation, quotes, or wrong value in Vercel)",
    );
  }

  const response = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (response.status === 401) {
    throw new Error(
      "Resend rejected the API key (401). Create a new key in Resend, paste it into Vercel RESEND_API_KEY for Production, then redeploy.",
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Resend API ${response.status}: ${detail.slice(0, 300)}`);
  }

  const domains = await response.json().catch(() => null);
  const fromDomain = from.includes("@") ? from.split("@").pop()?.toLowerCase() : "";
  const domainList = Array.isArray(domains?.data)
    ? domains.data.map((entry) => String(entry.name || "").toLowerCase())
    : [];

  console.log("Resend API key: VALID");
  console.log(`REPORT_EMAIL_FROM domain check: ${fromDomain || "(could not parse)"}`);
  if (fromDomain && domainList.length && !domainList.includes(fromDomain)) {
    console.warn(
      `Warning: "${from}" may not match a verified Resend domain (${domainList.join(", ")}). Sending can still fail until the domain is verified.`,
    );
  } else if (fromDomain && domainList.includes(fromDomain)) {
    console.log("From-address domain appears verified in Resend.");
  }
} catch (error) {
  console.error("Resend check: FAILED");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
