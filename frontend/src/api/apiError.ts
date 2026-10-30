/** An HTTP error from the backend: status plus the server's `detail`.
 *  Its own module so the auth store can use it without importing the API
 *  client (which itself imports the auth store). */
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
