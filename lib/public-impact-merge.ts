export type PublicImpactIssue = {
  id: string;
  latitude: number;
  longitude: number;
  severity: string;
  status: string;
};

export type PublicImpactData = {
  totalReports: number;
  underReview: number;
  inProgress: number;
  repaired: number;
  issues: PublicImpactIssue[];
};

function normalizeSeverity(severity: string): string {
  return severity.trim().toLowerCase();
}

function normalizeIssue(issue: PublicImpactIssue): PublicImpactIssue {
  return {
    ...issue,
    severity: normalizeSeverity(issue.severity),
  };
}

function countByStatus(issues: PublicImpactIssue[]) {
  const underReview = issues.filter((issue) =>
    ["reported", "verified", "assigned", "submitted", "under_verification"].includes(issue.status),
  ).length;
  const inProgress = issues.filter((issue) =>
    ["in_progress", "reopened", "escalated"].includes(issue.status),
  ).length;
  const repaired = issues.filter((issue) =>
    ["repaired", "closed"].includes(issue.status),
  ).length;

  return { underReview, inProgress, repaired };
}

export function mergePublicImpact(
  primary: PublicImpactData,
  secondary: PublicImpactData | null,
): PublicImpactData {
  if (!secondary) {
    return {
      ...primary,
      issues: primary.issues.map(normalizeIssue),
    };
  }

  const byId = new Map<string, PublicImpactIssue>();
  for (const issue of primary.issues) {
    byId.set(issue.id, normalizeIssue(issue));
  }
  for (const issue of secondary.issues) {
    byId.set(issue.id, normalizeIssue(issue));
  }

  const issues = [...byId.values()];
  const counts = countByStatus(issues);

  return {
    totalReports: issues.length,
    underReview: counts.underReview,
    inProgress: counts.inProgress,
    repaired: counts.repaired,
    issues,
  };
}
