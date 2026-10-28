/**
 * Shared JSON request helper for storefront actions and private data loading.
 * Unwraps the API success envelope and turns network, response and application failures into displayable errors.
 */
export async function api<T = any>(url: string, body?: unknown, method = 'POST'): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: body === undefined ? 'GET' : method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new Error('The service could not be reached. Check your connection and try again.');
  }
  let result: { ok?: boolean; data?: T; error?: unknown };
  try {
    result = await response.json();
  } catch {
    throw new Error('The service could not complete this request. Please try again.');
  }
  if (!response.ok || result.ok !== true)
    throw new Error(
      typeof result.error === 'string'
        ? result.error
        : 'This request could not be completed. Please try again.',
    );
  return result.data as T;
}
