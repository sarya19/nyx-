const mongoose = require("mongoose");

const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    language: {
      type: String,
      required: true,
      trim: true,
      default: "javascript",
    },
    code: {
      type: String,
      default: "",
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    memberIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      default: [],
    },
  },
  { timestamps: true }
);

workspaceSchema.index({ ownerId: 1 });
workspaceSchema.index({ memberIds: 1 });

workspaceSchema.methods.isMember = function isMember(userId) {
  const id = String(userId);
  if (String(this.ownerId) === id) return true;
  return this.memberIds.some((memberId) => String(memberId) === id);
};

module.exports = mongoose.model("Workspace", workspaceSchema);
