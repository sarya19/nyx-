const TOKEN_KEY = "nyx_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export async function api(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const auth = token ?? getToken();
  if (auth) {
    headers.Authorization = `Bearer ${auth}`;
  }

  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}
