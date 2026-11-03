/** Same-origin session token prevents untrusted websites from driving local mutations. */
let sessionPromise: Promise<string> | null = null;
async function getLocalToken(): Promise<string> {
  if (!sessionPromise) {
    sessionPromise = fetch('/api/session', { cache: 'no-store' }).then(async (res) => {
      if (!res.ok) throw new Error('Local TTS server is unavailable');
      const data = await res.json();
      if (typeof data.token !== 'string') throw new Error('Invalid local session');
      return data.token as string;
    }).catch((err) => {
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/api/')) throw new Error('Invalid API path');
  const method = (init.method || 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-Local-Token', await getLocalToken());
  }
  const response = await fetch(path, { ...init, headers, cache: 'no-store' });
  if (response.status === 403 && method !== 'GET') sessionPromise = null;
  return response;
}
