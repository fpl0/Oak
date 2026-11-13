// The app's one API client (interfaces §8: one `createClient()`), plus typed helpers that the query hooks and
// the tutor stream build on. Same origin: the Vite proxy in dev, the Oak server in production.
import {
  type CallOptions,
  type ConfirmAction,
  type ConfirmEndpointName,
  createClient,
  type EndpointInput,
  type EndpointOutput,
  type JsonEndpointName,
  type OakClient,
} from "@oak/api";

let client: OakClient = createClient();

export function api(): OakClient {
  return client;
}

/** Tests swap the client (a fake fetch) through this. */
export function setApiClient(next: OakClient): void {
  client = next;
}

type LooseCall = (name: string, input?: unknown, opts?: CallOptions) => Promise<unknown>;
type LooseDestructive = (
  name: string,
  target: string,
  input?: unknown,
  opts?: CallOptions,
) => Promise<unknown>;

/**
 * `api().call` with a uniform signature (the client's own overloads make the input optional only for endpoints
 * that take none; generic code cannot see that).
 */
export function callApi<N extends JsonEndpointName>(
  name: N,
  input?: EndpointInput<N>,
  opts?: CallOptions,
): Promise<EndpointOutput<N>> {
  return (client.call as unknown as LooseCall)(name, input, opts) as Promise<EndpointOutput<N>>;
}

/** Destructive call: the native confirm dialog first (it names the action), then nonce plus call. */
export async function callDestructive<N extends ConfirmEndpointName>(
  name: N,
  target: string,
  question: string,
  input?: EndpointInput<N>,
): Promise<EndpointOutput<N> | null> {
  if (typeof window !== "undefined" && !window.confirm(question)) return null;
  return (client.destructive as unknown as LooseDestructive)(name, target, input) as Promise<
    EndpointOutput<N>
  >;
}

/** URL of a media or download endpoint (`<audio src>`, backup export). */
export function apiUrl<N extends JsonEndpointName>(name: N, input?: EndpointInput<N>): string {
  return (client.url as unknown as (n: string, i?: unknown) => string)(name, input);
}

/**
 * Wave 5 (docs/design/wave5.md §4.1; carry-over c11): a call that replaces something only sometimes
 * (`EndpointDef.confirmIf`, re-recording an album version). The caller's own dialog has already asked the learner
 * ("Replace the earlier recording?"); this fetches the single-use nonce for `(action, target)` and sends it.
 */
export async function callConfirmed<N extends JsonEndpointName>(
  name: N,
  action: ConfirmAction,
  target: string,
  input?: EndpointInput<N>,
): Promise<EndpointOutput<N>> {
  const nonce = await client.confirm(action, target);
  return (client.call as unknown as LooseCall)(name, input, { confirmNonce: nonce.nonce }) as Promise<
    EndpointOutput<N>
  >;
}
