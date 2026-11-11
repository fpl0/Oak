// @oak/api: the REST contract (zod), the shared DTOs, a typed fetch client and the tutor's SSE event
// types. The content schema (contracts §5) is implemented in @oak/content-kit and re-exported here, as
// §5.1 asks, so the app and the server can take every wire type from one package. Isomorphic.
export * from "@oak/content-kit";
export * from "./client.ts";
export * from "./contract.ts";
export * from "./dto.ts";
export * from "./tutor.ts";
