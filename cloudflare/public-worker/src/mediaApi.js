export async function serveMediaObject(request, env, pathname) {
  if (!env?.MEDIA) {
    return Response.json(
      { ok: false, error: "r2_media_binding_missing" },
      { status: 503 }
    );
  }

  const relative = pathname.replace(/^\/media\//, "");
  if (!relative || relative.includes("..")) {
    return new Response("Not Found", { status: 404 });
  }

  const key = `media/${relative}`;
  const object = request.method === "HEAD"
    ? await env.MEDIA.head(key)
    : await env.MEDIA.get(key);

  if (!object) return new Response("Not Found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag || object.etag || "");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");

  return request.method === "HEAD"
    ? new Response(null, { status: 200, headers })
    : new Response(object.body, { status: 200, headers });
}
