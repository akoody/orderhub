import client from "prom-client";

client.collectDefaultMetrics();

export const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status"]
});

export const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"]
});

export const queueProcessedTotal = new client.Counter({
  name: "queue_processed_total",
  help: "Total processed queue messages",
  labelNames: ["queue"]
});

export const outboxLag = new client.Gauge({
  name: "outbox_lag",
  help: "Count of NEW outbox events"
});

export const register = client.register;
