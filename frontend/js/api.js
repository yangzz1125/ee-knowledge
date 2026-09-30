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

const getJson = async path => (await request(path)).json();

export async function loadApplicationData() {
  const [health, meta, chapters, graph] = await Promise.all(
    ["/health", "/meta", "/chapters", "/graph"].map(getJson),
  );
  return { health, meta, chapters, graph };
}

export const searchEntities = keyword =>
  getJson(`/entities?${new URLSearchParams({ keyword, limit: "12" })}`);

export const loadNeighbors = entityId =>
  getJson(`/entities/${encodeURIComponent(entityId)}/neighbors`);

export const findPath = (startId, endId, undirected = false) =>
  getJson(`/path?${new URLSearchParams({
    start_id: startId,
    end_id: endId,
    direction: undirected ? "undirected" : "directed",
  })}`);

export const loadLocalGraph = (entityId, depth = 1) =>
  getJson(`/graph?${new URLSearchParams({ center_id: entityId, depth })}`);

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
