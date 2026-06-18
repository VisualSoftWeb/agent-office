import { logger } from "../utils/logger.js";
import { config } from "../config.js";
import type { ToolCall } from "../llm/types.js";

const DESTRUCTIVE_PATTERNS = ["delete", "remove", "rm", "unlink", "destroy", "wipe", "send.email", "send.mail"];

export interface ApprovalRequest {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  toolCall: ToolCall;
  userId: string;
  chatId: number;
  resolved: boolean;
  approved: boolean;
}

const pendingApprovals = new Map<string, ApprovalRequest>();

export function requiresApproval(toolName: string): boolean {
  if (!config.APPROVALS_ENABLED) return false;
  return DESTRUCTIVE_PATTERNS.some((p) => toolName.toLowerCase().includes(p));
}

export function createApprovalRequest(toolName: string, args: Record<string, unknown>, userId: string, chatId: number, toolCall: ToolCall): ApprovalRequest {
  const id = crypto.randomUUID().slice(0, 8);
  const request: ApprovalRequest = { id, toolName, args, toolCall, userId, chatId, resolved: false, approved: false };
  pendingApprovals.set(id, request);
  logger.info(`Approval requested: ${toolName}(${JSON.stringify(args)}) from ${userId} [id=${id}]`);
  return request;
}

export function resolveApproval(id: string, approved: boolean): boolean {
  const request = pendingApprovals.get(id);
  if (!request || request.resolved) return false;
  request.resolved = true;
  request.approved = approved;
  logger.info(`Approval ${approved ? "APPROVED" : "REJECTED"}: ${request.toolName} [id=${id}]`);
  return true;
}

export function getPendingApproval(userId: string): ApprovalRequest | undefined {
  return Array.from(pendingApprovals.values()).find((r) => r.userId === userId && !r.resolved);
}

export function getApprovalById(id: string): ApprovalRequest | undefined {
  return pendingApprovals.get(id);
}

export function consumeApproval(id: string): ApprovalRequest | undefined {
  const request = pendingApprovals.get(id);
  if (request) pendingApprovals.delete(id);
  return request;
}

export function cleanupExpiredApprovals(): void {
  const timeout = config.APPROVAL_TIMEOUT;
  const now = Date.now();
  for (const [id, request] of pendingApprovals) {
    const createdAt = parseInt(id.split("-")[0], 16) || 0;
    if (now - createdAt > timeout) {
      pendingApprovals.delete(id);
    }
  }
}
