import { clearTokens, getAccessToken } from './tokenStore';
import { isDevAuthBypassEnabled } from './devAuthBypass';

let installed = false;

function getRequestUrl(input: RequestInfo | URL): URL | null {
  if (typeof window === 'undefined') return null;

  if (typeof input === 'string' || input instanceof URL) {
    return new URL(input.toString(), window.location.origin);
  }

  return new URL(input.url, window.location.origin);
}

function shouldAttachAuth(input: RequestInfo | URL): boolean {
  const url = getRequestUrl(input);
  if (!url) return false;
  if (!url.pathname.startsWith('/api/')) return false;
  if (url.origin === window.location.origin) return true;

  const isLocalPage = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isLocalApi = ['localhost', '127.0.0.1'].includes(url.hostname);
  return isDevAuthBypassEnabled && isLocalPage && isLocalApi;
}

function mergeHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const sourceHeaders =
    init?.headers ?? (input instanceof Request ? input.headers : undefined);
  return new Headers(sourceHeaders);
}

export function installAuthFetch(): void {
  if (installed || typeof window === 'undefined') return;

  const nativeFetch = window.fetch.bind(window);

  function handleUnauthorized(input: RequestInfo | URL, response: Response): void {
    if (response.status !== 401 || !shouldAttachAuth(input)) return;
    if (isDevAuthBypassEnabled) return;

    clearTokens();
    if (window.location.pathname === '/user/login') return;
    const redirect = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
    window.location.href = `/user/login?redirect=${redirect}`;
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getAccessToken();

    if (!shouldAttachAuth(input)) {
      const response = await nativeFetch(input, init);
      handleUnauthorized(input, response);
      return response;
    }

    const headers = mergeHeaders(input, init);
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    if (!token && isDevAuthBypassEnabled && !headers.has('X-WindEye-Dev-Auth')) {
      headers.set('X-WindEye-Dev-Auth', 'true');
    }

    if (input instanceof Request) {
      const request = new Request(input, { ...init, headers });
      const response = await nativeFetch(request);
      handleUnauthorized(input, response);
      return response;
    }

    const response = await nativeFetch(input, { ...init, headers });
    handleUnauthorized(input, response);
    return response;
  };

  installed = true;
}
