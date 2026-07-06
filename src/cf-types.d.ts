// Minimal ambient types for the Cloudflare Workers runtime bindings used by
// this project. Kept hand-rolled so `deno check` stays clean without pulling
// @cloudflare/workers-types (which conflicts with the DOM lib the client
// islands need).

interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface KVListResult {
  keys: { name: string; expiration?: number }[];
  list_complete: boolean;
  cursor?: string;
}

interface KVNamespace {
  get(key: string): Promise<string | null>;
  get(key: string, type: "text"): Promise<string | null>;
  get(key: string, type: "arrayBuffer"): Promise<ArrayBuffer | null>;
  put(
    key: string,
    value: string | ArrayBuffer | ReadableStream,
    options?: { expirationTtl?: number; expiration?: number },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  list(
    options?: { prefix?: string; limit?: number; cursor?: string },
  ): Promise<KVListResult>;
}

interface R2HTTPMetadata {
  contentType?: string;
  cacheControl?: string;
}

interface R2Object {
  key: string;
  size: number;
  httpEtag: string;
  httpMetadata?: R2HTTPMetadata;
  writeHttpMetadata(headers: Headers): void;
}

interface R2ObjectBody extends R2Object {
  body: ReadableStream;
  arrayBuffer(): Promise<ArrayBuffer>;
}

interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | string,
    options?: { httpMetadata?: R2HTTPMetadata },
  ): Promise<R2Object>;
  delete(key: string): Promise<void>;
}

interface Ai {
  run(
    model: string,
    inputs: Record<string, unknown>,
    options?: { gateway?: { id: string; skipCache?: boolean } },
  ): Promise<unknown>;
}

interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
