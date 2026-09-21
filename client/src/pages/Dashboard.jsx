import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth.jsx";
import { LANGUAGES, STARTERS, formatTime } from "../lib/languages";

const HIGHLIGHTS = [
  {
    title: "Share a room",
    body: "Copy the workspace URL. A classmate signs in and lands in the same file.",
  },
  {
    title: "Live coding",
    body: "Edits stream instantly. The green live badge means everyone is in sync.",
  },
  {
    title: "Autosave",
    body: "The server keeps the latest code, so a refresh does not wipe the lab.",
  },
  {
    title: "Run JavaScript",
    body: "Use console.log and click Run. Python and Java are highlighting only.",
  },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState([]);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function load() {
    setError("");
    try {
      const data = await api("/api/workspaces");
      setWorkspaces(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(event) {
    event.preventDefault();
    setError("");
    setCreating(true);
    try {
      const workspace = await api("/api/workspaces", {
        method: "POST",
        body: {
          name,
          language,
          code: STARTERS[language] || "",
        },
      });
      navigate(`/workspace/${workspace.id}`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-mist bg-white/70">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-stone-500">Nyx</p>
            <h1 className="text-lg font-semibold">Workspaces</h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden sm:inline text-stone-600">{user?.name}</span>
            <button
              className="rounded-lg border border-mist px-3 py-1.5 hover:bg-mist"
              type="button"
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-8">
        <ul className="grid gap-3 sm:grid-cols-2">
          {HIGHLIGHTS.map((item) => (
            <li key={item.title} className="rounded-2xl border border-mist bg-white p-4">
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-sm text-stone-600">{item.body}</p>
            </li>
          ))}
        </ul>

        <form
          onSubmit={onCreate}
          className="rounded-2xl border border-mist bg-white p-5 grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end"
        >
          <label>
            <span className="text-sm font-medium">New workspace</span>
            <input
              className="mt-1 w-full rounded-lg border border-mist px-3 py-2"
              placeholder="Lab 3 — sorting"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label>
            <span className="text-sm font-medium">Language</span>
            <select
              className="mt-1 w-full rounded-lg border border-mist px-3 py-2 bg-white"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded-lg bg-accent px-4 py-2.5 font-medium text-white disabled:opacity-60"
            disabled={creating}
            type="submit"
          >
            {creating ? "Creating…" : "Create"}
          </button>
        </form>

        {error ? <p className="text-sm text-red-700">{error}</p> : null}

        {loading ? (
          <p className="text-stone-600">Loading workspaces…</p>
        ) : workspaces.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-mist p-8 text-stone-600">
            No rooms yet. Create one, then copy the URL from the workspace and send it to a classmate.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {workspaces.map((ws) => (
              <li key={ws.id}>
                <Link
                  to={`/workspace/${ws.id}`}
                  className="block rounded-2xl border border-mist bg-white p-5 hover:border-accent"
                >
                  <p className="font-medium">{ws.name}</p>
                  <p className="mt-1 font-mono text-xs uppercase tracking-wide text-stone-500">
                    {ws.language}
                  </p>
                  <p className="mt-3 text-sm text-stone-500">Updated {formatTime(ws.updatedAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
