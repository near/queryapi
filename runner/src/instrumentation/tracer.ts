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

import logger from '../logger';

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
      logger.debug('Using No Op Exporter. No traces will be recorded.');
      break;
  }
}

function setGCPExport (): void {
  logger.debug('Using GCP Exporter. Traces exported to GCP Trace.');
  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: 'queryapi-runner',
      [SEMRESATTRS_SERVICE_VERSION]: '1.0',
    }),
    traceExporter: new TraceExporter(),
    spanProcessors: [new BatchSpanProcessor(new TraceExporter(
      {
        projectId: process.env.GCP_PROJECT_ID ?? ''
      }
    ))],
    metricReader: new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(), // TODO: Replace with Prometheus
    }),
    sampler: new TraceIdRatioBasedSampler(Math.min(parseFloat(process.env.TRACING_SAMPLE_RATE ?? '0.1'), 1.0)),
  });

  sdk.start();
}

function setZipkinExport (): void {
  logger.debug('Using Zipkin Exporter. Traces exported to Zipkin in port 9411.');
  const sdk = new NodeSDK({
    resource: new Resource({
      [SEMRESATTRS_SERVICE_NAME]: 'queryapi-runner',
      [SEMRESATTRS_SERVICE_VERSION]: '1.0',
    }),
    traceExporter: new ZipkinExporter({
      url: process.env.ZIPKIN_ENDPOINT ?? 'http://localhost:9411/api/v2/spans',
    }),
    spanProcessors: [new BatchSpanProcessor(new ZipkinExporter())],
    metricReader: new PeriodicExportingMetricReader({
      exporter: new ConsoleMetricExporter(), // TODO: Replace with Prometheus
    }),
    sampler: new TraceIdRatioBasedSampler(Math.min(parseFloat(process.env.TRACING_SAMPLE_RATE ?? '0.1'), 1.0)),
  });

  sdk.start();
}

function setConsoleExport (): void {
  logger.debug('Using Console Exporter. Traces exported to console.');
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
