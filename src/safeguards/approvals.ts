import { logger } from "../utils/logger.js";

const DESTRUCTIVE_PATTERNS = ["delete", "remove", "rm", "unlink", "destroy", "wipe", "send.email", "send.mail"];

export interface ApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  userId: string;
  resolved: boolean;
  approved: boolean;
}

const pendingApprovals = new Map<string, ApprovalRequest>();

export function requiresApproval(toolName: string): boolean {
  return DESTRUCTIVE_PATTERNS.some((p) => toolName.toLowerCase().includes(p));
}

export function createApprovalRequest(toolName: string, args: Record<string, unknown>, userId: string): ApprovalRequest {
  const id = crypto.randomUUID();
  const request: ApprovalRequest = { id, toolName, args, userId, resolved: false, approved: false };
  pendingApprovals.set(id, request);
  logger.info(`Approval requested: ${toolName}(${JSON.stringify(args)}) from ${userId}`);
  return request;
}

export function resolveApproval(id: string, approved: boolean): boolean {
  const request = pendingApprovals.get(id);
  if (!request || request.resolved) return false;
  request.resolved = true;
  request.approved = approved;
  return true;
}

export function getPendingApproval(userId: string): ApprovalRequest | undefined {
  return Array.from(pendingApprovals.values()).find((r) => r.userId === userId && !r.resolved);
}

export async function waitForApproval(toolName: string, args: Record<string, unknown>, userId: string): Promise<boolean> {
  const request = createApprovalRequest(toolName, args, userId);

  const timeout = 120_000;
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const current = pendingApprovals.get(request.id);
    if (current?.resolved) {
      pendingApprovals.delete(request.id);
      return current.approved;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  pendingApprovals.delete(request.id);
  return false;
}
