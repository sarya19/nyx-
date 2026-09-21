// src/app.js

const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const workspaceRoutes = require("./routes/workspaces");

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "*";

const app = express();

// Allow requests from the configured frontend
app.use(
  cors({
    origin: CLIENT_ORIGIN,
  })
);

// Parse JSON request bodies
app.use(express.json({ limit: "1mb" }));

// Health check used to verify that the API is running
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Authentication routes
app.use("/api/auth", authRoutes);

// Workspace routes
app.use("/api/workspaces", workspaceRoutes);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    error: `not found: ${req.method} ${req.path}`,
  });
});

// Handle unexpected errors
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    error: "internal server error",
  });
});

module.exports = app;
