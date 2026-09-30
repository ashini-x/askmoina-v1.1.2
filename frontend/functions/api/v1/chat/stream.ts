const WORKER_URL = "https://askmoina.thenewtongs.workers.dev";

export async function onRequestPost(context: any): Promise<Response> {
  const incoming = context.request;

  const target = `${WORKER_URL}/api/v1/chat/stream`;

  const headers = new Headers(incoming.headers);

  // The browser is now talking to Pages same-origin.
  // The Worker does not need the browser's Origin header for this server-to-server hop.
  headers.delete("origin");
  headers.delete("host");
  headers.delete("content-length");

  const upstream = await fetch(target, {
    method: "POST",
    headers,
    body: incoming.body,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers,
  });
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
