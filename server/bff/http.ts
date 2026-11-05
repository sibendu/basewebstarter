import "server-only";

export class ApiError extends Error {
  constructor(public status: number, message: string, public challenge?: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200, challenge?: string) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(challenge ? { "WWW-Authenticate": challenge } : {}),
    },
  });
}
