const PALETTE = [
  { hex: "#2563eb", rgb: "37, 99, 235" },
  { hex: "#dc2626", rgb: "220, 38, 38" },
  { hex: "#059669", rgb: "5, 150, 105" },
  { hex: "#d97706", rgb: "217, 119, 6" },
  { hex: "#7c3aed", rgb: "124, 58, 237" },
  { hex: "#db2777", rgb: "219, 39, 119" },
  { hex: "#0f766e", rgb: "15, 118, 110" },
  { hex: "#ea580c", rgb: "234, 88, 12" },
];

export function colorForUser(userId) {
  let hash = 0;
  for (const ch of String(userId)) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

function clampSelection(model, selection) {
  const lineCount = Math.max(1, model.getLineCount());
  const startLine = Math.min(Math.max(1, selection.startLineNumber), lineCount);
  const endLine = Math.min(Math.max(1, selection.endLineNumber), lineCount);
  const startColumn = Math.min(
    Math.max(1, selection.startColumn),
    model.getLineMaxColumn(startLine)
  );
  const endColumn = Math.min(Math.max(1, selection.endColumn), model.getLineMaxColumn(endLine));
  return { startLine, startColumn, endLine, endColumn };
}

export function createRemoteCursorLayer(editor, monaco) {
  const widgets = new Map();
  const decorationIds = new Map();
  const styleEl = document.createElement("style");
  document.head.appendChild(styleEl);
  const injected = new Set();

  function ensureCaretStyle(userId, color) {
    const key = String(userId);
    if (injected.has(key)) return;
    injected.add(key);
    const cls = `nyx-${key.replace(/[^a-zA-Z0-9_-]/g, "")}`;
    styleEl.appendChild(
      document.createTextNode(`
        .${cls}-sel { background: rgba(${color.rgb}, 0.2); }
        .${cls}-caret {
          border-left: 2px solid ${color.hex};
          margin-left: -1px;
          height: 1.15em;
        }
      `)
    );
    return cls;
  }

  function classStem(userId) {
    return `nyx-${String(userId).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  }

  function upsert({ userId, name, selection }) {
    if (!userId || !selection) return;
    const model = editor.getModel();
    if (!model) return;

    const color = colorForUser(userId);
    ensureCaretStyle(userId, color);
    const stem = classStem(userId);
    const clamped = clampSelection(model, selection);
    const range = new monaco.Range(
      clamped.startLine,
      clamped.startColumn,
      clamped.endLine,
      clamped.endColumn
    );

    const nextDecorations = [
      {
        range,
        options: {
          className: `${stem}-sel`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      },
      {
        range: new monaco.Range(clamped.endLine, clamped.endColumn, clamped.endLine, clamped.endColumn),
        options: {
          afterContentClassName: `${stem}-caret`,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      },
    ];

    const previous = decorationIds.get(userId) || [];
    decorationIds.set(userId, editor.deltaDecorations(previous, nextDecorations));

    let widget = widgets.get(userId);
    if (!widget) {
      const node = document.createElement("div");
      node.className = "nyx-cursor-label";
      node.style.background = color.hex;
      widget = {
        node,
        getId: () => `nyx-cursor-${userId}`,
        getDomNode: () => node,
        getPosition: () => ({
          position: { lineNumber: clamped.endLine, column: clamped.endColumn },
          preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE],
        }),
      };
      widgets.set(userId, widget);
      editor.addContentWidget(widget);
    }

    widget.node.textContent = name || "classmate";
    widget.getPosition = () => ({
      position: { lineNumber: clamped.endLine, column: clamped.endColumn },
      preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE],
    });
    editor.layoutContentWidget(widget);
  }

  function remove(userId) {
    const previous = decorationIds.get(userId);
    if (previous) {
      editor.deltaDecorations(previous, []);
      decorationIds.delete(userId);
    }
    const widget = widgets.get(userId);
    if (widget) {
      editor.removeContentWidget(widget);
      widgets.delete(userId);
    }
  }

  function retain(userIds) {
    const keep = new Set((userIds || []).map(String));
    for (const id of [...decorationIds.keys(), ...widgets.keys()]) {
      if (!keep.has(String(id))) remove(id);
    }
  }

  function dispose() {
    for (const id of [...decorationIds.keys()]) remove(id);
    styleEl.remove();
  }

  return { upsert, remove, retain, dispose };
}
