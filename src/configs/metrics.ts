interface RouteMetric {
  count: number;
  errors: number;
  totalLatencyMs: number;
}

const routeMetrics = new Map<string, RouteMetric>();

export function recordRouteMetric(params: {
  method: string;
  route: string;
  statusCode: number;
  latencyMs: number;
}) {
  const key = `${params.method.toUpperCase()} ${params.route}`;
  const current = routeMetrics.get(key) ?? {
    count: 0,
    errors: 0,
    totalLatencyMs: 0,
  };

  current.count += 1;
  if (params.statusCode >= 400) {
    current.errors += 1;
  }
  current.totalLatencyMs += params.latencyMs;

  routeMetrics.set(key, current);
}

export function getMetricsSnapshot() {
  const routes = Array.from(routeMetrics.entries(), ([route, value]) => ({
    route,
    requests: value.count,
    errors: value.errors,
    errorRate: value.count > 0 ? value.errors / value.count : 0,
    avgLatencyMs: value.count > 0 ? value.totalLatencyMs / value.count : 0,
  }));

  const totals = routes.reduce(
    (acc, route) => {
      acc.requests += route.requests;
      acc.errors += route.errors;
      return acc;
    },
    { requests: 0, errors: 0 },
  );

  return {
    totals: {
      ...totals,
      errorRate: totals.requests > 0 ? totals.errors / totals.requests : 0,
    },
    routes,
    generatedAt: new Date().toISOString(),
  };
}
