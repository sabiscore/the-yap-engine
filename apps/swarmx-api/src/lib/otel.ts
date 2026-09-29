/**
 * apps/swarmx-api/src/lib/otel.ts
 * SwarmXQ OpenTelemetry SDK initializer.
 *
 * Activated only when OTEL_EXPORTER_OTLP_ENDPOINT is set. When absent,
 * the @opentelemetry/api facade in tracer.ts remains a no-op ProxyTracer
 * with zero hot-path overhead.
 *
 * Activation:
 *   OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318/v1/traces
 *   OTEL_SERVICE_NAME=swarmx-api        (optional — defaults to "swarmx-api")
 *
 * Design notes:
 *   - SDK v2.x API: processors are passed via spanProcessors[] constructor option,
 *     not addSpanProcessor() (removed in v2). Resource created via resourceFromAttributes().
 *   - Manual-only instrumentation: no auto-HTTP/Fastify plugins pulled in.
 *   - BatchSpanProcessor buffers spans, flushes every 5 s — zero hot-path I/O.
 *     SimpleSpanProcessor flushes synchronously on span.end(); Batch avoids that.
 *   - Export failures: silent drop (OTel default); never crashes the API.
 *   - _provider.register() sets the global OTel provider. The ProxyTracer returned
 *     by tracer.ts auto-forwards — no re-import or re-initialization needed.
 *   - Shutdown: call shutdownOtel() before process.exit to flush pending spans.
 */

import { NodeTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";

let _provider: NodeTracerProvider | null = null;

// Minimal logger compatible with Fastify pino (server.log) and our own log.ts
type MiniLog = {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn?: (obj: Record<string, unknown>, msg: string) => void;
};

/**
 * Initialize the OTel trace provider.
 * Call after the Fastify server (and its logger) is created, before route registration.
 * When OTEL_EXPORTER_OTLP_ENDPOINT is unset this is a pure no-op.
 */
export function initOtel(log: MiniLog): void {
  const endpoint = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"];
  if (!endpoint) {
    log.info({ otelActive: false }, "OTel: disabled (no OTEL_EXPORTER_OTLP_ENDPOINT)");
    return;
  }

  const serviceName = process.env["OTEL_SERVICE_NAME"] ?? "swarmx-api";

  const exporter = new OTLPTraceExporter({ url: endpoint });
  const processor = new BatchSpanProcessor(exporter, {
    maxExportBatchSize: 64,
    scheduledDelayMillis: 5_000,
    maxQueueSize: 512,
  });

  _provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": serviceName }),
    spanProcessors: [processor],
  });

  // Registers as the global OTel provider. ProxyTracer in tracer.ts auto-delegates.
  _provider.register();

  log.info({ otelActive: true, endpoint, serviceName }, "OTel: trace provider registered — spans active");
}

/**
 * Flush pending spans and shut down the SDK.
 * Must be called in the graceful shutdown sequence before process.exit.
 */
export async function shutdownOtel(): Promise<void> {
  if (!_provider) return;
  await _provider.shutdown();
  _provider = null;
}
