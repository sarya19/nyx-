// src/server.js

require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const { connectDb } = require("./config/db");
const { attachSockets } = require("./sockets");
const app = require("./app");

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

async function main() {
  // Required environment variables
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is required");
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required");
  }

  // Connect to MongoDB before starting the server
  await connectDb(process.env.MONGODB_URI);

  const server = http.createServer(app);

  // Configure Socket.IO for real-time collaboration
  const io = new Server(server, {
    cors: {
      origin: CLIENT_ORIGIN,
      methods: ["GET", "POST"],
    },
  });

  const saver = attachSockets(io);

  // Start HTTP + Socket.IO server
  server.listen(PORT, () => {
    console.log(`Nyx API listening on http://localhost:${PORT}`);
  });

  // Gracefully shut down the server
  const shutdown = async () => {
    console.log("shutting down");

    await saver.shutdown();
    io.close();

    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
