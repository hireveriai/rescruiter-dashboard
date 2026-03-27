const BACKEND_BASE_URL = process.env.BACKEND_BASE_URL || "http://127.0.0.1:4000";

function buildBackendUrl(pathSegments, requestUrl) {
  const targetUrl = new URL(requestUrl);
  const backendPath = Array.isArray(pathSegments) ? pathSegments.join("/") : "";
  return `${BACKEND_BASE_URL}/${backendPath}${targetUrl.search}`;
}

async function proxyRequest(request, context) {
  const params = await context.params;
  const backendUrl = buildBackendUrl(params?.path, request.url);
  const headers = new Headers(request.headers);

  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  const init = {
    method: request.method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  try {
    const response = await fetch(backendUrl, init);
    const responseHeaders = new Headers(response.headers);

    responseHeaders.delete("content-encoding");
    responseHeaders.delete("transfer-encoding");

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: "Backend API is unavailable",
        details: error.message,
      },
      { status: 502 }
    );
  }
}

export async function GET(request, context) {
  return proxyRequest(request, context);
}

export async function POST(request, context) {
  return proxyRequest(request, context);
}

export async function PUT(request, context) {
  return proxyRequest(request, context);
}

export async function PATCH(request, context) {
  return proxyRequest(request, context);
}

export async function DELETE(request, context) {
  return proxyRequest(request, context);
}

export async function OPTIONS(request, context) {
  return proxyRequest(request, context);
}
