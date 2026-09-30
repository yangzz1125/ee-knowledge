const API_BASE = "http://127.0.0.1:8000/api";

async function request(path, options) {
  const response = await fetch(`${API_BASE}${path}`, options);
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try {
      const body = await response.json();
      message = body.detail?.message || message;
    } catch {
      // 非 JSON 错误沿用状态码提示。
    }
    throw new Error(message);
  }
  return response;
}

export async function loadApplicationData() {
  const [health, meta, chapters, graph] = await Promise.all([
    request("/health").then(response => response.json()),
    request("/meta").then(response => response.json()),
    request("/chapters").then(response => response.json()),
    request("/graph").then(response => response.json()),
  ]);
  return { health, meta, chapters, graph };
}

export async function searchEntities(keyword) {
  const query = new URLSearchParams({ keyword, limit: "12" });
  return request(`/entities?${query}`).then(response => response.json());
}

export async function loadNeighbors(entityId) {
  return request(`/entities/${encodeURIComponent(entityId)}/neighbors`)
    .then(response => response.json());
}

export async function loadLocalGraph(entityId, depth = 1) {
  const query = new URLSearchParams({ center_id: entityId, depth: String(depth) });
  return request(`/graph?${query}`).then(response => response.json());
}

export async function streamAnswer(payload, onEvent, signal) {
  const response = await request("/ai/ask/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function dispatch(block) {
    let event = "message";
    const dataLines = [];
    block.split(/\r?\n/).forEach(line => {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    });
    if (!dataLines.length) return;
    onEvent(event, JSON.parse(dataLines.join("\n")));
  }

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    blocks.forEach(dispatch);
    if (done) break;
  }
  if (buffer.trim()) dispatch(buffer);
}
