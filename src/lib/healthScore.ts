import type { RepoStatus } from "../types";

export interface HealthResult {
  score: number;       // 0–100
  label: string;       // "Excellent" | "Good" | "Fair" | "Needs Attention" | "Critical"
  color: string;       // CSS color
  dimColor: string;    // CSS dim color for background
  issues: string[];    // Human-readable issues
}

export function computeHealth(status: RepoStatus | undefined): HealthResult {
  if (!status) {
    return { score: 0, label: "Unknown", color: "var(--color-text-disabled)", dimColor: "var(--overlay-subtle)", issues: ["No status data"] };
  }

  let score = 100;
  const issues: string[] = [];

  // State penalties
  if (status.state === "ERROR" || status.state === "NOT_INIT") {
    score -= 50;
    issues.push(status.state === "ERROR" ? "Repository error" : "Not initialized");
  } else if (status.state === "CONFLICT") {
    score -= 40;
    issues.push(`${status.conflicts} conflict${status.conflicts !== 1 ? "s" : ""}`);
  } else if (status.state === "DIVERGED") {
    score -= 25;
    issues.push("Diverged from remote");
  }

  // Uncommitted changes penalty
  const uncommitted = status.staged + status.modified + status.untracked;
  if (uncommitted > 20) {
    score -= 20;
    issues.push(`${uncommitted} uncommitted changes`);
  } else if (uncommitted > 5) {
    score -= 10;
    issues.push(`${uncommitted} uncommitted changes`);
  } else if (uncommitted > 0) {
    score -= 3;
  }

  // Ahead/behind penalty
  if (status.ahead > 10) {
    score -= 15;
    issues.push(`${status.ahead} commits ahead — push soon`);
  } else if (status.ahead > 0) {
    score -= 5;
    issues.push(`${status.ahead} commit${status.ahead !== 1 ? "s" : ""} ahead`);
  }

  if (status.behind > 10) {
    score -= 15;
    issues.push(`${status.behind} commits behind — pull soon`);
  } else if (status.behind > 0) {
    score -= 5;
    issues.push(`${status.behind} commit${status.behind !== 1 ? "s" : ""} behind`);
  }

  // Staleness penalty based on last_commit_time
  if (status.last_commit_time) {
    const lastCommit = new Date(status.last_commit_time);
    const now = new Date();
    const daysSince = (now.getTime() - lastCommit.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSince > 90) {
      score -= 15;
      issues.push("No commits in 90+ days");
    } else if (daysSince > 30) {
      score -= 8;
      issues.push("No commits in 30+ days");
    } else if (daysSince > 14) {
      score -= 3;
    }
  }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  // Classify
  let label: string;
  let color: string;
  let dimColor: string;

  if (score >= 90) {
    label = "Excellent";
    color = "var(--color-success)";
    dimColor = "var(--color-success-dim)";
  } else if (score >= 70) {
    label = "Good";
    color = "var(--color-info)";
    dimColor = "var(--color-info-dim)";
  } else if (score >= 50) {
    label = "Fair";
    color = "var(--color-warning)";
    dimColor = "var(--color-warning-dim)";
  } else if (score >= 25) {
    label = "Needs Attention";
    color = "var(--color-conflict)";
    dimColor = "var(--color-warning-dim)";
  } else {
    label = "Critical";
    color = "var(--color-error)";
    dimColor = "var(--color-error-dim)";
  }

  return { score, label, color, dimColor, issues };
}
