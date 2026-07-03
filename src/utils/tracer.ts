import { config } from "../config.js";

interface Span {
  id: string;
  parentId: string | null;
  name: string;
  startTime: number;
  endTime: number | null;
  attributes: Record<string, unknown>;
  status: "ok" | "error";
}

interface Trace {
  traceId: string;
  rootSpan: Span;
  spans: Map<string, Span>;
}

const traces = new Map<string, Trace>();

function generateId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function startTrace(name: string): string {
  const traceId = generateId();
  const span: Span = {
    id: generateId(),
    parentId: null,
    name,
    startTime: performance.now(),
    endTime: null,
    attributes: {},
    status: "ok",
  };
  traces.set(traceId, { traceId, rootSpan: span, spans: new Map([[span.id, span]]) });
  if (config.OTEL_ENABLED) {
    console.log(JSON.stringify({ trace_id: traceId, span_id: span.id, name, event: "start", timestamp: new Date().toISOString() }));
  }
  return traceId;
}

export function startSpan(traceId: string, name: string, attributes?: Record<string, unknown>): string | null {
  const trace = traces.get(traceId);
  if (!trace) return null;
  const span: Span = {
    id: generateId(),
    parentId: trace.rootSpan.id,
    name,
    startTime: performance.now(),
    endTime: null,
    attributes: attributes ?? {},
    status: "ok",
  };
  trace.spans.set(span.id, span);
  if (config.OTEL_ENABLED) {
    console.log(JSON.stringify({ trace_id: traceId, span_id: span.id, parent_id: span.parentId, name, event: "start", attributes, timestamp: new Date().toISOString() }));
  }
  return span.id;
}

export function endSpan(traceId: string, spanId: string, status: "ok" | "error" = "ok"): void {
  const trace = traces.get(traceId);
  if (!trace) return;
  const span = trace.spans.get(spanId);
  if (!span) return;
  span.endTime = performance.now();
  span.status = status;
  if (config.OTEL_ENABLED) {
    console.log(JSON.stringify({
      trace_id: traceId,
      span_id: spanId,
      name: span.name,
      event: "end",
      duration_ms: Math.round(span.endTime - span.startTime),
      status,
      timestamp: new Date().toISOString(),
    }));
  }
}

export function endTrace(traceId: string, status: "ok" | "error" = "ok"): void {
  const trace = traces.get(traceId);
  if (!trace) return;
  trace.rootSpan.endTime = performance.now();
  trace.rootSpan.status = status;
  for (const span of trace.spans.values()) {
    if (span.endTime === null) {
      span.endTime = performance.now();
      span.status = status;
    }
  }
  if (config.OTEL_ENABLED) {
    const durationMs = Math.round(trace.rootSpan.endTime - trace.rootSpan.startTime);
    console.log(JSON.stringify({
      trace_id: traceId,
      name: trace.rootSpan.name,
      event: "end",
      duration_ms: durationMs,
      span_count: trace.spans.size,
      status,
      timestamp: new Date().toISOString(),
    }));
  }
}

export function addSpanAttributes(traceId: string, spanId: string, attributes: Record<string, unknown>): void {
  const trace = traces.get(traceId);
  if (!trace) return;
  const span = trace.spans.get(spanId);
  if (!span) return;
  Object.assign(span.attributes, attributes);
}
