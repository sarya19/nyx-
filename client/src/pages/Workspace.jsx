import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { Link, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { api } from "../api";
import { useAuth } from "../auth.jsx";
import { LANGUAGES } from "../lib/languages";
import { colorForUser, createRemoteCursorLayer } from "../lib/remoteCursors";
import { runJavaScript } from "../lib/runJs";

function applyCodePreservingCursor(editor, nextCode) {
  const model = editor.getModel();
  if (!model || model.getValue() === nextCode) return;
  const selections = editor.getSelections();
  model.pushEditOperations(
    selections,
    [{ range: model.getFullModelRange(), text: nextCode }],
    () => selections
  );
}

export default function Workspace() {
  const { id } = useParams();
  const { token, user, logout } = useAuth();
  const editorRef = useRef(null);
  const socketRef = useRef(null);
  const applyingRemote = useRef(false);
  const cursorLayerRef = useRef(null);
  const pendingCursors = useRef(new Map());
  const cursorTimer = useRef(null);

  const [workspace, setWorkspace] = useState(null);
  const [code, setCode] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [users, setUsers] = useState([]);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  const applyRemoteCode = useCallback((nextCode) => {
    applyingRemote.current = true;
    setCode(nextCode);
    if (editorRef.current) {
      applyCodePreservingCursor(editorRef.current, nextCode);
    }
    queueMicrotask(() => {
      applyingRemote.current = false;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api(`/api/workspaces/${id}`);
        if (cancelled) return;
        setWorkspace(data);
        setLanguage(data.language || "javascript");
        applyRemoteCode(data.code || "");
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, applyRemoteCode]);

  useEffect(() => {
    if (!token || !id) return undefined;

    const socket = io({
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join_workspace", { workspaceId: id }, (ack) => {
        if (!ack?.ok) {
          setError(ack?.error || "Could not join workspace");
          return;
        }
        if (typeof ack.code === "string") applyRemoteCode(ack.code);
        if (ack.language) setLanguage(ack.language);
        if (Array.isArray(ack.users)) setUsers(ack.users);
      });
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("code_change", ({ workspaceId, code: nextCode, userId }) => {
      if (workspaceId !== id || userId === user.id) return;
      applyRemoteCode(nextCode);
    });

    socket.on("language_change", ({ workspaceId, language: nextLanguage }) => {
      if (workspaceId !== id || !nextLanguage) return;
      setLanguage(nextLanguage);
    });

    socket.on("presence_update", ({ workspaceId, users: nextUsers }) => {
      if (workspaceId !== id) return;
      setUsers(nextUsers || []);
      cursorLayerRef.current?.retain((nextUsers || []).map((person) => person.id));
    });

    socket.on("cursor_change", (payload) => {
      if (payload?.workspaceId !== id || payload.userId === user.id) return;
      if (cursorLayerRef.current) {
        cursorLayerRef.current.upsert(payload);
      } else {
        pendingCursors.current.set(payload.userId, payload);
      }
    });

    socket.on("cursor_leave", ({ workspaceId, userId }) => {
      if (workspaceId !== id) return;
      pendingCursors.current.delete(userId);
      cursorLayerRef.current?.remove(userId);
    });

    socket.on("error_message", (payload) => {
      setError(payload?.error || "Socket error");
    });

    return () => {
      socket.emit("leave_workspace", { workspaceId: id });
      socket.disconnect();
      socketRef.current = null;
      cursorLayerRef.current?.dispose();
      cursorLayerRef.current = null;
      pendingCursors.current.clear();
      if (cursorTimer.current) clearTimeout(cursorTimer.current);
    };
  }, [id, token, user.id, applyRemoteCode]);

  function emitCursor() {
    const editor = editorRef.current;
    if (!editor || applyingRemote.current) return;
    const selection = editor.getSelection();
    if (!selection) return;
    socketRef.current?.emit("cursor_change", {
      workspaceId: id,
      position: {
        lineNumber: selection.positionLineNumber,
        column: selection.positionColumn,
      },
      selection: {
        startLineNumber: selection.startLineNumber,
        startColumn: selection.startColumn,
        endLineNumber: selection.endLineNumber,
        endColumn: selection.endColumn,
      },
    });
  }

  function scheduleCursorEmit() {
    if (cursorTimer.current) return;
    cursorTimer.current = setTimeout(() => {
      cursorTimer.current = null;
      emitCursor();
    }, 50);
  }

  function handleEditorMount(editor, monaco) {
    editorRef.current = editor;
    if (typeof code === "string") {
      applyCodePreservingCursor(editor, code);
    }
    cursorLayerRef.current?.dispose();
    const layer = createRemoteCursorLayer(editor, monaco);
    cursorLayerRef.current = layer;
    pendingCursors.current.forEach((payload) => layer.upsert(payload));
    pendingCursors.current.clear();
    editor.onDidChangeCursorSelection(() => {
      if (applyingRemote.current) return;
      scheduleCursorEmit();
    });
    emitCursor();
  }

  function handleChange(value) {
    const next = value ?? "";
    setCode(next);
    if (applyingRemote.current) return;
    socketRef.current?.emit("code_change", {
      workspaceId: id,
      code: next,
      userId: user.id,
    });
  }

  function handleLanguageChange(event) {
    const next = event.target.value;
    setLanguage(next);
    socketRef.current?.emit("language_change", {
      workspaceId: id,
      language: next,
    });
  }

  async function onRun() {
    if (language !== "javascript") {
      setOutput(
        `${language} highlighting is on, but Run only executes JavaScript.\nSwitch the language to javascript and use console.log(...).`
      );
      return;
    }
    setOutput("Running…");
    const result = await runJavaScript(editorRef.current?.getValue() ?? code);
    setOutput(result.output);
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy the link. Copy the URL from the address bar.");
    }
  }

  const outputHint =
    language === "javascript"
      ? "Run JavaScript to see console.log output here."
      : "Run executes JavaScript only. Switch language to javascript to try it.";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-mist bg-white">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/dashboard" className="font-mono text-xs uppercase tracking-widest text-stone-500">
            Nyx
          </Link>
          <h1 className="font-semibold truncate">{workspace?.name || "Workspace"}</h1>
          <span className={`text-xs ${connected ? "text-emerald-700" : "text-stone-500"}`}>
            {connected ? "live" : "connecting"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              className="rounded-lg border border-mist px-3 py-1.5 text-sm"
              type="button"
              onClick={copyShareLink}
            >
              {copied ? "Link copied" : "Share link"}
            </button>
            <select
              className="rounded-lg border border-mist bg-white px-2 py-1.5 text-sm"
              value={language}
              onChange={handleLanguageChange}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <button
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
              type="button"
              onClick={onRun}
            >
              Run
            </button>
            <button
              className="rounded-lg border border-mist px-3 py-1.5 text-sm"
              type="button"
              onClick={logout}
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <p className="px-4 py-2 text-sm text-red-700 bg-red-50 border-b border-red-100">{error}</p>
      ) : null}

      <div className="flex-1 grid min-h-0 lg:grid-cols-[1fr_220px]">
        <section className="flex min-h-0 flex-col">
          <div className="min-h-[420px] flex-1">
            <Editor
              height="100%"
              theme="vs"
              language={language === "javascript" ? "javascript" : language}
              defaultValue=""
              onMount={handleEditorMount}
              onChange={handleChange}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "IBM Plex Mono, ui-monospace, monospace",
                automaticLayout: true,
                scrollBeyondLastLine: false,
                wordWrap: "on",
              }}
            />
          </div>
          <div className="border-t border-mist bg-ink text-paper p-4 min-h-[140px]">
            <p className="font-mono text-xs uppercase tracking-widest text-mist">Output</p>
            <pre className="mt-2 whitespace-pre-wrap font-mono text-sm">{output || outputHint}</pre>
          </div>
        </section>

        <aside className="border-t lg:border-t-0 lg:border-l border-mist bg-white p-4">
          <p className="text-sm font-medium">Online</p>
          <p className="mt-1 text-xs text-stone-500">
            Colored cursors in the editor match the names here. Share the link to pair.
          </p>
          <ul className="mt-3 space-y-2">
            {users.length === 0 ? (
              <li className="text-sm text-stone-500">Waiting for classmates…</li>
            ) : (
              users.map((person) => {
                const color = colorForUser(person.id);
                return (
                  <li key={person.id} className="text-sm flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ background: color.hex }}
                    />
                    {person.name}
                    {person.id === user.id ? " (you)" : ""}
                  </li>
                );
              })
            )}
          </ul>
        </aside>
      </div>
    </div>
  );
}
