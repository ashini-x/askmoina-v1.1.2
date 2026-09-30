const WORKER_URL = "https://askmoina.thenewtongs.workers.dev";

export async function onRequestPost(context) {
  const request = context.request;

  const headers = new Headers(request.headers);
  headers.delete("origin");
  headers.delete("host");
  headers.delete("content-length");

  const response = await fetch(
    `${WORKER_URL}/api/v1/chat/stream`,
    {
      method: "POST",
      headers,
      body: request.body,
    }
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
