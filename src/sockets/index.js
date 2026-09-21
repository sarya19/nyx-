const Workspace = require("../models/Workspace");
const { verifySocketToken } = require("../middleware/auth");
const { isSupportedLanguage } = require("../lib/languages");

function roomName(workspaceId) {
  return `workspace:${workspaceId}`;
}

function extractToken(socket) {
  const authToken = socket.handshake.auth && socket.handshake.auth.token;
  if (authToken) return authToken;

  const header = socket.handshake.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme === "Bearer" && token) return token;

  return socket.handshake.query && socket.handshake.query.token;
}

function createCodeSaver(intervalMs) {
  const pending = new Map();

  async function flush(workspaceId) {
    const entry = pending.get(workspaceId);
    if (!entry) return;

    pending.delete(workspaceId);
    if (entry.timer) clearTimeout(entry.timer);

    try {
      await Workspace.findByIdAndUpdate(workspaceId, {
        code: entry.code,
      });
    } catch (err) {
      console.error("failed to persist workspace code", workspaceId, err);
      pending.set(workspaceId, { ...entry, timer: null, dirty: true });
    }
  }

  function queue(workspaceId, code) {
    const existing = pending.get(workspaceId) || {};
    if (existing.timer) clearTimeout(existing.timer);

    pending.set(workspaceId, {
      code,
      dirty: true,
      timer: setTimeout(() => {
        flush(workspaceId);
      }, 400),
    });
  }

  const interval = setInterval(() => {
    for (const workspaceId of pending.keys()) {
      flush(workspaceId);
    }
  }, intervalMs);

  async function shutdown() {
    clearInterval(interval);
    await Promise.all([...pending.keys()].map((id) => flush(id)));
  }

  return { queue, shutdown };
}

function presenceList(io, workspaceId) {
  const room = io.sockets.adapter.rooms.get(roomName(workspaceId));
  if (!room) return [];

  const seen = new Set();
  const users = [];

  for (const socketId of room) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket || !socket.user) continue;
    const id = String(socket.user.id);
    if (seen.has(id)) continue;
    seen.add(id);
    users.push({
      id,
      name: socket.user.name,
      email: socket.user.email,
    });
  }

  return users;
}

function emitPresence(io, workspaceId) {
  io.to(roomName(workspaceId)).emit("presence_update", {
    workspaceId,
    users: presenceList(io, workspaceId),
  });
}

function isPositiveInt(value) {
  return Number.isInteger(value) && value >= 1 && value < 200000;
}

function isCursorPayload(position, selection) {
  if (!position || !selection) return false;
  return (
    isPositiveInt(position.lineNumber) &&
    isPositiveInt(position.column) &&
    isPositiveInt(selection.startLineNumber) &&
    isPositiveInt(selection.startColumn) &&
    isPositiveInt(selection.endLineNumber) &&
    isPositiveInt(selection.endColumn)
  );
}

function attachSockets(io) {
  const saveIntervalMs = Number(process.env.CODE_SAVE_INTERVAL_MS || 10000);
  const saver = createCodeSaver(saveIntervalMs);

  io.use((socket, next) => {
    try {
      const payload = verifySocketToken(extractToken(socket));
      socket.user = {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
      };
      return next();
    } catch (_err) {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.data.workspaces = new Set();

    socket.on("join_workspace", async ({ workspaceId } = {}, ack) => {
      try {
        if (!workspaceId) {
          throw new Error("workspaceId is required");
        }

        const workspace = await Workspace.findById(workspaceId);
        if (!workspace) {
          throw new Error("workspace not found");
        }
        if (!workspace.isMember(socket.user.id)) {
          workspace.memberIds.push(socket.user.id);
          await workspace.save();
        }

        await socket.join(roomName(workspaceId));
        socket.data.workspaces.add(String(workspaceId));
        emitPresence(io, workspaceId);

        const response = {
          ok: true,
          workspaceId,
          code: workspace.code,
          language: workspace.language,
          users: presenceList(io, workspaceId),
        };
        if (typeof ack === "function") ack(response);
      } catch (err) {
        const response = { ok: false, error: err.message };
        if (typeof ack === "function") ack(response);
        socket.emit("error_message", response);
      }
    });

    socket.on("leave_workspace", ({ workspaceId } = {}, ack) => {
      if (!workspaceId) {
        if (typeof ack === "function") ack({ ok: false, error: "workspaceId is required" });
        return;
      }

      socket.leave(roomName(workspaceId));
      socket.data.workspaces.delete(String(workspaceId));
      socket.to(roomName(workspaceId)).emit("cursor_leave", {
        workspaceId,
        userId: socket.user.id,
      });
      emitPresence(io, workspaceId);
      if (typeof ack === "function") ack({ ok: true, workspaceId });
    });

    socket.on("code_change", ({ workspaceId, code, userId } = {}) => {
      if (!workspaceId || typeof code !== "string") return;
      if (!socket.data.workspaces.has(String(workspaceId))) return;

      const actorId = userId || socket.user.id;
      saver.queue(String(workspaceId), code);

      socket.to(roomName(workspaceId)).emit("code_change", {
        workspaceId,
        code,
        userId: actorId,
      });
    });

    socket.on("language_change", async ({ workspaceId, language } = {}) => {
      if (!workspaceId || !isSupportedLanguage(language)) return;
      if (!socket.data.workspaces.has(String(workspaceId))) return;

      try {
        await Workspace.findByIdAndUpdate(workspaceId, { language });
      } catch (err) {
        console.error("failed to persist workspace language", workspaceId, err);
      }

      io.to(roomName(workspaceId)).emit("language_change", {
        workspaceId,
        language,
        userId: socket.user.id,
      });
    });

    socket.on("cursor_change", ({ workspaceId, position, selection } = {}) => {
      if (!workspaceId || !socket.data.workspaces.has(String(workspaceId))) return;
      if (!isCursorPayload(position, selection)) return;

      socket.to(roomName(workspaceId)).emit("cursor_change", {
        workspaceId,
        userId: socket.user.id,
        name: socket.user.name,
        position,
        selection,
      });
    });

    socket.on("disconnecting", () => {
      for (const workspaceId of socket.data.workspaces) {
        socket.to(roomName(workspaceId)).emit("cursor_leave", {
          workspaceId,
          userId: socket.user.id,
        });
        socket.leave(roomName(workspaceId));
        setImmediate(() => emitPresence(io, workspaceId));
      }
    });
  });

  return saver;
}

module.exports = { attachSockets };
