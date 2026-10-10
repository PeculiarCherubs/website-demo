export async function serveAdminMedia(request, env, pathname) {
  if (!env?.MEDIA) return new Response("Not Found", { status: 404 });

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
  headers.set("Cache-Control", "private, max-age=3600");
  headers.set("X-Content-Type-Options", "nosniff");

  return request.method === "HEAD"
    ? new Response(null, { status: 200, headers })
    : new Response(object.body, { status: 200, headers });
}
