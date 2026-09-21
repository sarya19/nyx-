import { createContext, useContext, useMemo, useState } from "react";
import { api } from "./api";

const TOKEN_KEY = "nyx_token";
const USER_KEY = "nyx_user";

const AuthContext = createContext(null);

function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(readStoredUser);

  function persist(nextToken, nextUser) {
    if (nextToken && nextUser) {
      localStorage.setItem(TOKEN_KEY, nextToken);
      localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    setToken(nextToken);
    setUser(nextUser);
  }

  async function register({ name, email, password }) {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: { name, email, password },
    });
    persist(data.token, data.user);
    return data;
  }

  async function login({ email, password }) {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    persist(data.token, data.user);
    return data;
  }

  function logout() {
    persist(null, null);
  }

  const value = useMemo(
    () => ({ token, user, register, login, logout }),
    [token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
