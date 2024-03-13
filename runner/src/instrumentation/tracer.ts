import { type Tracer, trace } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import {
  PeriodicExportingMetricReader,
  ConsoleMetricExporter,
} from '@opentelemetry/sdk-metrics';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';

export default function getTracer (): Tracer {
  switch (process.env.TRACING_EXPORTER) {
    case 'CONSOLE':
      setConsoleExport();
      break;
    case 'ZIPKIN':
      setZipkinExport();
      break;
    case 'GCP':
      setConsoleExport();
      break;
    default: // No-Op
      console.log('no op exporter');
      break;
  }
  const tracer = trace.getTracer('runner-worker', '0.0.0');
  return tracer;
}

function setZipkinExport (): void {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: 'queryapi-runner',
      [SEMRESATTRS_SERVICE_VERSION]: '1.0',
    }),
    traceExporter: new ZipkinExporter(),
    spanProcessors: [new BatchSpanProcessor(new ZipkinExporter())],
    metricReader: new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(), // TODO: Replace with Prometheus
    }),
  });

  sdk.start();
}

function setConsoleExport (): void {
  console.log('Setting up console export');
  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: 'queryapi-runner',
      [SEMRESATTRS_SERVICE_VERSION]: '1.0',
    }),
    traceExporter: new ConsoleSpanExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(),
    }),
  });

  sdk.start();
}
