const express = require("express");
const mongoose = require("mongoose");
const Workspace = require("../models/Workspace");
const { auth } = require("../middleware/auth");
const { isSupportedLanguage } = require("../lib/languages");

const router = express.Router();
router.use(auth);

function serializeWorkspace(workspace, { includeCode = false } = {}) {
  const payload = {
    id: String(workspace._id),
    name: workspace.name,
    language: workspace.language,
    ownerId: String(workspace.ownerId),
    memberIds: workspace.memberIds.map((id) => String(id)),
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };

  if (includeCode) {
    payload.code = workspace.code;
  }

  return payload;
}

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

router.post("/", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const language = String(req.body.language || "javascript").trim();
    if (!isSupportedLanguage(language)) {
      return res.status(400).json({ error: "unsupported language" });
    }
    const code = typeof req.body.code === "string" ? req.body.code : "";

    if (!name) {
      return res.status(400).json({ error: "name is required" });
    }

    const ownerId = req.user.id;
    const workspace = await Workspace.create({
      name,
      language,
      code,
      ownerId,
      memberIds: [ownerId],
    });

    return res.status(201).json(serializeWorkspace(workspace, { includeCode: true }));
  } catch (err) {
    console.error("create workspace error", err);
    return res.status(500).json({ error: "failed to create workspace" });
  }
});

router.get("/", async (req, res) => {
  try {
    const userId = req.user.id;
    const workspaces = await Workspace.find({
      $or: [{ ownerId: userId }, { memberIds: userId }],
    }).sort({ updatedAt: -1 });

    return res.json(workspaces.map((ws) => serializeWorkspace(ws)));
  } catch (err) {
    console.error("list workspaces error", err);
    return res.status(500).json({ error: "failed to list workspaces" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "invalid workspace id" });
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ error: "workspace not found" });
    }

    if (!workspace.isMember(req.user.id)) {
      workspace.memberIds.push(req.user.id);
      await workspace.save();
    }

    return res.json(serializeWorkspace(workspace, { includeCode: true }));
  } catch (err) {
    console.error("get workspace error", err);
    return res.status(500).json({ error: "failed to get workspace" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: "invalid workspace id" });
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ error: "workspace not found" });
    }

    if (!workspace.isMember(req.user.id)) {
      return res.status(403).json({ error: "not a member of this workspace" });
    }

    const language = String(req.body.language || "").trim();
    if (language) {
      if (!isSupportedLanguage(language)) {
        return res.status(400).json({ error: "unsupported language" });
      }
      workspace.language = language;
    }

    await workspace.save();
    return res.json(serializeWorkspace(workspace, { includeCode: true }));
  } catch (err) {
    console.error("update workspace error", err);
    return res.status(500).json({ error: "failed to update workspace" });
  }
});

module.exports = router;
