/** Messages between the page and the asset pack worker (pack-worker.ts). */

/** Where a pack is and the base64 key that opens it. */
export interface PackSource {
  readonly url: string
  readonly key: string
}

/** The page asks the worker to fetch and open a pack, then to read files from it. */
export type PackRequest = ({ kind: "open" } & PackSource) | { kind: "read"; id: number; path: string }

/** The worker reports the opened pack, then answers each read with its file or an error. */
export type PackReply =
  | { kind: "opened"; files: number; bytes: number }
  | { kind: "file"; id: number; data: ArrayBuffer }
  | { kind: "error"; id: number; error: string }

/** The worker, from the page's side, or the page, from the worker's: a Worker, a worker scope or a MessagePort. */
export interface PackPort {
  postMessage(message: PackRequest | PackReply, options?: StructuredSerializeOptions): void
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

export function isPackSource(value: unknown): value is PackSource {
  return isRecord(value) && typeof value.url === "string" && typeof value.key === "string"
}

export function isPackRequest(value: unknown): value is PackRequest {
  if (!isRecord(value)) {
    return false
  }
  switch (value.kind) {
    case "open":
      return isPackSource(value)
    case "read":
      return typeof value.id === "number" && typeof value.path === "string"
    default:
      return false
  }
}

export function isPackReply(value: unknown): value is PackReply {
  if (!isRecord(value)) {
    return false
  }
  switch (value.kind) {
    case "opened":
      return typeof value.files === "number" && typeof value.bytes === "number"
    case "file":
      return typeof value.id === "number" && value.data instanceof ArrayBuffer
    case "error":
      return typeof value.id === "number" && typeof value.error === "string"
    default:
      return false
  }
}
