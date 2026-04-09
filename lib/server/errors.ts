export class ApiError extends Error {
  constructor(statusCode, code, message) {
    super(message)
    this.name = "ApiError"
    this.statusCode = statusCode
    this.code = code
  }
}

export function isApiError(error) {
  return error instanceof ApiError
}
