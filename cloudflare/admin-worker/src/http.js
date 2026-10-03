export function requestId(request) {
  return request.headers.get("cf-ray") || crypto.randomUUID();
}

export function json(data, status = 200, extraHeaders = {}) {
  return Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders
    }
  });
}

export function safeErrorResponse(error, id) {
  const status = Number(error?.status || 500);
  const code = String(error?.code || "internal_error");

  if (status >= 500 && code !== "access_not_configured") {
    console.error("[AdminWorker]", {
      request_id: id,
      code,
      name: error?.name || "Error"
    });
  }

  return json({
    ok: false,
    error: code,
    request_id: id
  }, status);
}
