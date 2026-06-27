import { config } from "../config.js";
import { logger } from "../utils/logger.js";

export interface N8nExecuteOptions {
  webhookPath: string;
  payload: Record<string, unknown>;
  userId?: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface N8nResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  executionId?: string;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.N8N_WEBHOOK_SECRET) {
    headers["Authorization"] = `Bearer ${config.N8N_WEBHOOK_SECRET}`;
  }
  return headers;
}

function buildUrl(webhookPath: string): string {
  const base = config.N8N_BASE_URL?.replace(/\/$/, "") ?? "";
  const path = webhookPath.startsWith("/") ? webhookPath : `/${webhookPath}`;
  return `${base}/webhook${path}`;
}

export async function executeN8nWebhook<T = unknown>(
  options: N8nExecuteOptions
): Promise<N8nResponse<T>> {
  const {
    webhookPath,
    payload,
    userId,
    timeoutMs = config.N8N_TIMEOUT_MS,
    maxRetries = config.N8N_MAX_RETRIES,
  } = options;

  if (!config.N8N_BASE_URL) {
    return {
      success: false,
      error: "N8N_BASE_URL not configured",
    };
  }

  const url = buildUrl(webhookPath);
  const headers = buildHeaders();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const startTime = Date.now();
      logger.debug(`[N8N] Executing webhook: ${webhookPath} (attempt ${attempt + 1}/${maxRetries + 1})`);

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - startTime;
      logger.info(`[N8N] Webhook ${webhookPath} completed in ${duration}ms (status: ${response.status})`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      let data: T;

      if (contentType.includes("application/json")) {
        data = (await response.json()) as T;
      } else {
        data = (await response.text()) as unknown as T;
      }

      return {
        success: true,
        data,
        executionId: response.headers.get("x-n8n-execution-id") ?? undefined,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (err instanceof DOMException && err.name === "AbortError") {
        lastError = new Error(`Request timeout after ${timeoutMs}ms`);
      }

      logger.warn(`[N8N] Webhook ${webhookPath} attempt ${attempt + 1} failed: ${lastError.message}`);

      if (attempt < maxRetries) {
        const backoffMs = Math.min(1000 * 2 ** attempt, 10000);
        await sleep(backoffMs);
      }
    }
  }

  return {
    success: false,
    error: lastError?.message ?? "Unknown error after retries",
  };
}

export function createN8nToolHandler(webhookPath: string) {
  return async (args: Record<string, unknown>, userId?: string): Promise<string> => {
    const result = await executeN8nWebhook({
      webhookPath,
      payload: args,
      userId,
    });

    if (!result.success) {
      throw new Error(`N8N webhook failed: ${result.error}`);
    }

    return typeof result.data === "string"
      ? result.data
      : JSON.stringify(result.data, null, 2);
  };
}