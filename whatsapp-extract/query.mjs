const PORT = process.env.CDP_PORT ?? 9222;
const expression = process.argv[2];

const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const page = targets.find((t) => t.type === "page" && t.url.includes("whatsapp"));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
ws.onmessage = ({ data }) => {
  const { result } = JSON.parse(data);
  console.log(result.exceptionDetails ? result.exceptionDetails : result.result.value);
  ws.close();
};
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
