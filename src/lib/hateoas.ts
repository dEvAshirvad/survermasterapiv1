import type { Request } from 'express';

/**
 * HATEOAS link interface
 */
export interface Link {
  rel: string;
  href: string;
  method?: string;
  type?: string;
}

/**
 * HATEOAS resource interface
 */
export interface HATEOASResource {
  _links?: Link[];
  _embedded?: Record<string, unknown>;
}

/**
 * Generate base URL from request
 */
export function getBaseUrl(req: Request): string {
  const protocol = req.protocol || 'http';
  const host = req.get('host') || 'localhost';
  return `${protocol}://${host}`;
}

/**
 * Generate API base URL
 */
export function getApiBaseUrl(req: Request, version?: string): string {
  const baseUrl = getBaseUrl(req);
  return version ? `${baseUrl}/api/${version}` : `${baseUrl}/api`;
}

function toSearchParams(query: Request['query']): URLSearchParams {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value == null)
      continue;
    if (Array.isArray(value)) {
      value.forEach(item => params.append(key, String(item)));
      continue;
    }
    params.set(key, String(value));
  }

  return params;
}

/**
 * Create HATEOAS link
 */
export function createLink(rel: string, href: string, method: string = 'GET', type: string = 'application/json'): Link {
  return { rel, href, method, type };
}

/**
 * Generate pagination links
 */
export function generatePaginationLinks(req: Request, page: number, totalPages: number, basePath: string): Link[] {
  const baseUrl = getBaseUrl(req);
  const query = toSearchParams(req.query);
  const links: Link[] = [];

  // Self link
  query.set('page', page.toString());
  links.push(
    createLink('self', `${baseUrl}${basePath}?${query.toString()}`, 'GET'),
  );

  // First page
  if (page > 1) {
    query.set('page', '1');
    links.push(
      createLink('first', `${baseUrl}${basePath}?${query.toString()}`, 'GET'),
    );
  }

  // Previous page
  if (page > 1) {
    query.set('page', (page - 1).toString());
    links.push(
      createLink('prev', `${baseUrl}${basePath}?${query.toString()}`, 'GET'),
    );
  }

  // Next page
  if (page < totalPages) {
    query.set('page', (page + 1).toString());
    links.push(
      createLink('next', `${baseUrl}${basePath}?${query.toString()}`, 'GET'),
    );
  }

  // Last page
  if (page < totalPages) {
    query.set('page', totalPages.toString());
    links.push(
      createLink('last', `${baseUrl}${basePath}?${query.toString()}`, 'GET'),
    );
  }

  return links;
}

/**
 * Generate resource links
 */
export function generateResourceLinks(req: Request, resourceId: string, resourcePath: string, availableActions: string[] = []): Link[] {
  const baseUrl = getBaseUrl(req);
  const links: Link[] = [];

  // Self link
  links.push(
    createLink('self', `${baseUrl}${resourcePath}/${resourceId}`, 'GET'),
  );

  // Collection link
  links.push(createLink('collection', `${baseUrl}${resourcePath}`, 'GET'));

  // Action links
  if (availableActions.includes('update')) {
    links.push(
      createLink(
        'update',
        `${baseUrl}${resourcePath}/${resourceId}`,
        'PUT',
        'application/json',
      ),
    );
  }

  if (availableActions.includes('delete')) {
    links.push(
      createLink('delete', `${baseUrl}${resourcePath}/${resourceId}`, 'DELETE'),
    );
  }

  if (availableActions.includes('patch')) {
    links.push(
      createLink(
        'patch',
        `${baseUrl}${resourcePath}/${resourceId}`,
        'PATCH',
        'application/json',
      ),
    );
  }

  return links;
}

/**
 * Add HATEOAS links to resource
 */
export function addHATEOASLinks<T extends Record<string, unknown>>(resource: T, links: Link[]): T & HATEOASResource {
  return {
    ...resource,
    _links: links,
  };
}

/**
 * Add embedded resources (for collections)
 */
export function addEmbeddedResources<T extends Record<string, unknown>>(resource: T, embedded: Record<string, unknown>): T & HATEOASResource {
  return {
    ...resource,
    _embedded: embedded,
  };
}
