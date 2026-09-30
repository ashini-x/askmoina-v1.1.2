const WORKER_URL = "https://askmoina.thenewtongs.workers.dev";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/v1/chat/stream") {
      if (request.method !== "POST") {
        return new Response("Method Not Allowed", {
          status: 405,
          headers: { Allow: "POST" },
        });
      }

      const headers = new Headers(request.headers);
      headers.delete("origin");
      headers.delete("host");
      headers.delete("content-length");

      const upstream = await fetch(
        `${WORKER_URL}/api/v1/chat/stream`,
        {
          method: "POST",
          headers,
          body: request.body,
        }
      );

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: upstream.headers,
      });
    }

    return env.ASSETS.fetch(request);
  },
};
