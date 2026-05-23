export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:5000";

export type StoredUser = {
  id: number;
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
};

const TOKEN_KEY = "ewtpma_token";
const USER_KEY = "ewtpma_user";
const SESSION_KEY = "ewtpma_session_id";
const NAVIGATION_KEY = "ewtpma_allowed_route";

function browserStorage() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

export function getStoredToken() {
  return browserStorage()?.getItem(TOKEN_KEY) || "";
}

export function getStoredUser(): StoredUser | null {
  const raw = browserStorage()?.getItem(USER_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

export function storeAuth(token: string, user: StoredUser) {
  const storage = browserStorage();

  if (!storage) {
    return;
  }

  storage.setItem(TOKEN_KEY, token);
  storage.setItem(USER_KEY, JSON.stringify(user));
  storage.setItem("employeeId", String(user.id));
  
}

export function allowProtectedNavigation(path: string) {
  browserStorage()?.setItem(
    NAVIGATION_KEY,
    JSON.stringify({
      path,
      expiresAt: Date.now() + 15000,
    }),
  );
}

export function consumeProtectedNavigation(path: string) {
  const storage = browserStorage();

  if (!storage) {
    return false;
  }

  const raw = storage.getItem(NAVIGATION_KEY);

  if (!raw) {
    return false;
  }

  try {
    const allowed = JSON.parse(raw) as { path?: string; expiresAt?: number };
    const isAllowed = allowed.path === path && Number(allowed.expiresAt) > Date.now();

    if (!isAllowed) {
      storage.removeItem(NAVIGATION_KEY);
    }

    return isAllowed;
  } catch {
    storage.removeItem(NAVIGATION_KEY);
    return false;
  }
}

export function clearAuth() {
  const storage = browserStorage();

  if (!storage) {
    return;
  }

  storage.removeItem(TOKEN_KEY);
  storage.removeItem(USER_KEY);
  storage.removeItem(SESSION_KEY);
  storage.removeItem(NAVIGATION_KEY);
}

export function storeSessionId(sessionId: number) {
  browserStorage()?.setItem(SESSION_KEY, String(sessionId));
}

export function clearSessionId() {
  browserStorage()?.removeItem(SESSION_KEY);
}

export function getStoredSessionId() {
  const sessionId = browserStorage()?.getItem(SESSION_KEY);
  return sessionId ? Number(sessionId) : null;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {},
): Promise<T> {
  const { auth = true, headers, ...requestOptions } = options;
  const token = getStoredToken();
  const requestHeaders = new Headers(headers);

  if (!requestHeaders.has("Content-Type") && requestOptions.body) {
    requestHeaders.set("Content-Type", "application/json");
  }

  if (auth && token) {
    requestHeaders.set("Authorization", `Bearer ${token}`);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...requestOptions,
      headers: requestHeaders,
    });
  } catch {
    throw new Error(
      `Backend is not running at ${API_BASE_URL}. Start the backend with: cd backend && npm.cmd run dev`,
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String(payload.message)
        : "Request failed";
    throw new Error(message);
  }

  return payload as T;
}

export async function downloadApiFile(path: string, fileName: string) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${getStoredToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error("Could not download report");
  }

  const blob = await response.blob();
  const contentDisposition = response.headers.get("content-disposition") || "";
  const serverFileName = contentDisposition.match(/filename="?([^"]+)"?/)?.[1];
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = serverFileName || fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
