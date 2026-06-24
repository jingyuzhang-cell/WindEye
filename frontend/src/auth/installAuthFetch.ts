import { getAccessToken } from './tokenStore';

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
  return url.origin === window.location.origin && url.pathname.startsWith('/api/');
}

function mergeHeaders(input: RequestInfo | URL, init?: RequestInit): Headers {
  const sourceHeaders =
    init?.headers ?? (input instanceof Request ? input.headers : undefined);
  return new Headers(sourceHeaders);
}

export function installAuthFetch(): void {
  if (installed || typeof window === 'undefined') return;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getAccessToken();

    if (!token || !shouldAttachAuth(input)) {
      return nativeFetch(input, init);
    }

    const headers = mergeHeaders(input, init);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (input instanceof Request) {
      return nativeFetch(new Request(input, { ...init, headers }));
    }

    return nativeFetch(input, { ...init, headers });
  };

  installed = true;
}
