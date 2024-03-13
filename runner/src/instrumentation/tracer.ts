import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import {
  PeriodicExportingMetricReader,
  ConsoleMetricExporter,
} from '@opentelemetry/sdk-metrics';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';
import { TraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-node';

export default function setUpTracerExport (): void {
  switch (process.env.TRACING_EXPORTER) {
    case 'CONSOLE':
      setConsoleExport();
      break;
    case 'ZIPKIN':
      setZipkinExport();
      break;
    case 'GCP':
      setGCPExport();
      break;
    default: // No-Op
      console.debug('Using No Op Exporter. No traces will be recorded.');
      break;
  }
}

function setGCPExport (): void {
  console.debug('Using GCP Exporter. Traces exported to GCP Trace.');
  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: 'queryapi-runner',
      [SEMRESATTRS_SERVICE_VERSION]: '1.0',
    }),
    traceExporter: new TraceExporter(),
    spanProcessors: [new BatchSpanProcessor(new TraceExporter())],
    metricReader: new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(), // TODO: Replace with Prometheus
    }),
    sampler: new TraceIdRatioBasedSampler(Math.min(parseFloat(process.env.TRACING_SAMPLE_RATE ?? '0.1'), 1.0)),
  });

  sdk.start();
}

function setZipkinExport (): void {
  console.debug('Using Zipkin Exporter. Traces exported to Zipkin in port 9411.');
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
    sampler: new TraceIdRatioBasedSampler(Math.min(parseFloat(process.env.TRACING_SAMPLE_RATE ?? '0.1'), 1.0)),
  });

  sdk.start();
}

function setConsoleExport (): void {
  console.debug('Using Console Exporter. Traces exported to console.');
  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: 'queryapi-runner',
      [SEMRESATTRS_SERVICE_VERSION]: '1.0',
    }),
    traceExporter: new ConsoleSpanExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(),
    }),
    sampler: new TraceIdRatioBasedSampler(Math.min(parseFloat(process.env.TRACING_SAMPLE_RATE ?? '0.1'), 1.0)),
  });

  sdk.start();
}
