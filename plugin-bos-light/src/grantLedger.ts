import type {
  GrantRequest,
  GrantDecision,
  BudgetGrant,
  AccessGrant,
  EmergencyGrant,
  GrantApproved,
} from "./contracts";

/**
 * In-memory grant ledger for Div3.Treasury.
 * Tracks issued grants and their status.
 */
export interface GrantLedgerEntry {
  grantId: string;
  missionId: string;
  targetDivision: string;
  grantType: "BUDGET_GRANT" | "ACCESS_GRANT" | "EMERGENCY_GRANT";
  tokenCap: number;
  ttlMinutes: number;
  issuedAt: string;
  expiresAt: string;
  revoked: boolean;
  revokedAt?: string;
  revokedReason?: string;
}

export interface GrantLedger {
  add(entry: GrantLedgerEntry): void;
  get(grantId: string): GrantLedgerEntry | undefined;
  getByMission(missionId: string): GrantLedgerEntry[];
  revoke(grantId: string, reason: string): boolean;
  isExpired(grantId: string): boolean;
  checkOverrun(grantId: string, actualCost: number): boolean;
}

export class InMemoryGrantLedger implements GrantLedger {
  private entries = new Map<string, GrantLedgerEntry>();

  add(entry: GrantLedgerEntry): void {
    this.entries.set(entry.grantId, entry);
  }

  get(grantId: string): GrantLedgerEntry | undefined {
    return this.entries.get(grantId);
  }

  getByMission(missionId: string): GrantLedgerEntry[] {
    return [...this.entries.values()].filter(e => e.missionId === missionId);
  }

  revoke(grantId: string, reason: string): boolean {
    const entry = this.entries.get(grantId);
    if (!entry || entry.revoked) return false;
    entry.revoked = true;
    entry.revokedAt = new Date().toISOString();
    entry.revokedReason = reason;
    return true;
  }

  isExpired(grantId: string): boolean {
    const entry = this.entries.get(grantId);
    if (!entry) return true;
    return new Date(entry.expiresAt) < new Date();
  }

  checkOverrun(grantId: string, actualCost: number): boolean {
    const entry = this.entries.get(grantId);
    if (!entry) return true;
    return actualCost > entry.tokenCap;
  }

  clear(): void {
    this.entries.clear();
  }
}

/**
 * Create a BudgetGrant from an approved grant request.
 */
export function createBudgetGrant(
  request: GrantRequest,
  decision: GrantApproved
): BudgetGrant {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + decision.ttl_minutes * 60_000);

  return {
    schema_version: "1.0",
    grant_id: decision.budget_grant_id,
    grant_type: "BUDGET_GRANT",
    mission_id: request.mission_id,
    target_division: request.target_division,
    allowed_tools: decision.allowed_tools,
    denied_tools: decision.denied_tools,
    token_cap: decision.token_cap,
    ttl_minutes: decision.ttl_minutes,
    secrets: request.requested_secrets,
    requires_qa: true,
    granted_by: "Div3.Treasury",
    granted_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

/**
 * Create an AccessGrant from an approved grant request.
 */
export function createAccessGrant(
  request: GrantRequest,
  decision: GrantApproved
): AccessGrant {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + decision.ttl_minutes * 60_000);

  return {
    schema_version: "1.0",
    grant_id: `agr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    grant_type: "ACCESS_GRANT",
    mission_id: request.mission_id,
    target_division: request.target_division,
    allowed_tools: decision.allowed_tools,
    denied_tools: decision.denied_tools,
    secrets: request.requested_secrets,
    adapter_scope: request.target_division,
    granted_by: "Div3.Treasury",
    granted_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}
