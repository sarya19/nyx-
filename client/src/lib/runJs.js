function formatValue(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const WORKER_SOURCE = `
  const logs = [];
  function fmt(v) {
    if (typeof v === "string") return v;
    try { return JSON.stringify(v); } catch { return String(v); }
  }
  ["log", "info", "warn", "error"].forEach((level) => {
    console[level] = (...args) => {
      logs.push(args.map(fmt).join(" "));
    };
  });
  self.onmessage = (event) => {
    try {
      const result = (0, eval)(event.data);
      self.postMessage({
        ok: true,
        logs,
        result: result === undefined ? undefined : fmt(result),
      });
    } catch (err) {
      self.postMessage({
        ok: false,
        logs,
        error: err && err.stack ? String(err.stack) : String(err),
      });
    }
  };
`;

export function runJavaScript(code, { timeoutMs = 5000 } = {}) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
    const worker = new Worker(url);

    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve(payload);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, output: `Timed out after ${timeoutMs}ms` });
    }, timeoutMs);

    worker.onerror = (event) => {
      finish({
        ok: false,
        output: event.message || "Worker failed to run the code",
      });
    };

    worker.onmessage = (event) => {
      const data = event.data || {};
      const lines = Array.isArray(data.logs) ? data.logs : [];
      if (!data.ok) {
        finish({ ok: false, output: [...lines, data.error].filter(Boolean).join("\n") });
        return;
      }
      if (data.result !== undefined) lines.push(String(data.result));
      finish({
        ok: true,
        output: lines.join("\n") || "(no output)",
      });
    };

    worker.postMessage(code);
  });
}

export { formatValue };
