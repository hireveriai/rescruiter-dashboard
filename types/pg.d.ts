declare module "pg" {
  export class Pool {
    constructor(config?: unknown)
    query<T = unknown>(queryText: string, values?: unknown[]): Promise<{ rows: T[] }>
    end(): Promise<void>
  }
}
