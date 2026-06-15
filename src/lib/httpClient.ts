import logger from '@/configs/logger/winston';

export interface HttpClientOptions {
  baseURL?: string;
  timeoutMs?: number;
}

export interface HttpClientRequestOptions extends RequestInit {
  timeoutMs?: number;
}

function buildUrl(pathOrUrl: string, baseURL?: string): string {
  if (!baseURL) {
    return pathOrUrl;
  }
  return new URL(pathOrUrl, baseURL).toString();
}

export async function httpRequest<T = unknown>(
  pathOrUrl: string,
  options: HttpClientRequestOptions & HttpClientOptions = {},
): Promise<T> {
  const { baseURL, timeoutMs = 10000, ...fetchOptions } = options;
  const url = buildUrl(pathOrUrl, baseURL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  logger.debug('http_request', {
    method: fetchOptions.method?.toUpperCase() ?? 'GET',
    url,
    timeoutMs,
  });

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: fetchOptions.signal ?? controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }
  catch (error) {
    logger.error('http_request_failed', {
      url,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  finally {
    clearTimeout(timeout);
  }
}

export async function httpGet<T = unknown>(
  url: string,
  options?: HttpClientRequestOptions & HttpClientOptions,
): Promise<T> {
  return httpRequest<T>(url, { ...options, method: 'GET' });
}
