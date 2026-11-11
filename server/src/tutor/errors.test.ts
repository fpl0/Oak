import { describe, expect, test } from "bun:test";
import {
  classifyApiErrorType,
  classifyCliExit,
  classifyHttpStatus,
  classifyStopReason,
  classifyThrown,
  ERROR_COPY,
  errorInfo,
  parseRetryAfter,
  redactSecrets,
  TUTOR_ERROR_KINDS,
  TutorError,
} from "./errors.ts";

describe("error kinds", () => {
  test("are the contract's ten, each with fixed learner-facing copy", () => {
    expect([...TUTOR_ERROR_KINDS].sort() as string[]).toEqual(
      [
        "aborted",
        "auth",
        "bad_request",
        "internal",
        "iteration_limit",
        "max_tokens",
        "network",
        "overloaded",
        "rate_limit",
        "refusal",
      ].sort(),
    );
    for (const kind of TUTOR_ERROR_KINDS) expect(ERROR_COPY[kind].length).toBeGreaterThan(0);
  });

  test("HTTP status", () => {
    const table: [number, string][] = [
      [400, "bad_request"],
      [401, "auth"],
      [403, "auth"],
      [404, "bad_request"],
      [408, "network"],
      [413, "bad_request"],
      [429, "rate_limit"],
      [500, "overloaded"],
      [503, "overloaded"],
      [529, "overloaded"],
      [302, "internal"],
    ];
    for (const [status, kind] of table) expect(classifyHttpStatus(status)).toBe(kind as never);
  });

  test("API error types, as seen in-stream after an HTTP 200", () => {
    expect(classifyApiErrorType("overloaded_error")).toBe("overloaded");
    expect(classifyApiErrorType("rate_limit_error")).toBe("rate_limit");
    expect(classifyApiErrorType("authentication_error")).toBe("auth");
    expect(classifyApiErrorType("invalid_request_error")).toBe("bad_request");
    expect(classifyApiErrorType("something_new")).toBe("internal");
  });

  test("retry-after as seconds, as a date, from Headers or a record", () => {
    expect(parseRetryAfter(new Headers({ "retry-after": "17" }))).toBe(17);
    expect(parseRetryAfter({ "retry-after": "2.2" })).toBe(3);
    expect(
      parseRetryAfter({ "Retry-After": "Wed, 11 Nov 2026 15:00:30 GMT" }, Date.parse("2026-11-11T15:00:00Z")),
    ).toBe(30);
    expect(parseRetryAfter(new Headers())).toBeUndefined();
    expect(parseRetryAfter({ "retry-after": "soon" })).toBeUndefined();
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });
});

describe("classifyThrown, most specific first", () => {
  const named = (name: string, extra: object = {}) => Object.assign(new Error("boom"), { name }, extra);

  test("SDK-shaped errors by duck type", () => {
    expect(
      classifyThrown(named("RateLimitError", { status: 429, headers: new Headers({ "retry-after": "17" }) })),
    ).toEqual({
      ...errorInfo("rate_limit"),
      retryAfterSec: 17,
    });
    expect(classifyThrown(named("AuthenticationError", { status: 401 })).kind).toBe("auth");
    expect(classifyThrown(named("BadRequestError", { status: 400 })).kind).toBe("bad_request");
    expect(classifyThrown(named("OverloadedError", { status: 529 })).kind).toBe("overloaded");
    expect(classifyThrown(named("InternalServerError", { status: 500 })).kind).toBe("overloaded");
    expect(classifyThrown(named("APIConnectionError")).kind).toBe("network");
    expect(classifyThrown(named("APIConnectionTimeoutError")).kind).toBe("network");
    expect(classifyThrown(named("APIUserAbortError")).kind).toBe("aborted");
    expect(classifyThrown(named("AbortError")).kind).toBe("aborted");
    expect(
      classifyThrown(named("APIError", { error: { type: "error", error: { type: "overloaded_error" } } }))
        .kind,
    ).toBe("overloaded");
    expect(classifyThrown(named("Error", { code: "ECONNREFUSED" })).kind).toBe("network");
    expect(classifyThrown(named("AnthropicError")).kind).toBe("internal");
    expect(classifyThrown("a string").kind).toBe("internal");
    expect(classifyThrown(null).kind).toBe("internal");
  });

  test("once the learner pressed Stop, whatever was thrown is `aborted`", () => {
    expect(classifyThrown(named("RateLimitError", { status: 429 }), { aborted: true }).kind).toBe("aborted");
  });

  test("a TutorError keeps its kind", () => {
    expect(classifyThrown(new TutorError("bad_request"))).toEqual(errorInfo("bad_request"));
    expect(classifyThrown(new TutorError("rate_limit", { retryAfterSec: 5 })).retryAfterSec).toBe(5);
  });

  test("the message is fixed copy: nothing from the thrown error reaches the learner", () => {
    const leaky = named("AuthenticationError", {
      status: 401,
      message: "invalid x-api-key sk-ant-api03-SECRETSECRET",
    });
    const info = classifyThrown(leaky);
    expect(info.message).toBe(ERROR_COPY.auth);
    expect(JSON.stringify(info)).not.toContain("sk-ant");
  });
});

describe("stop reasons", () => {
  test("checked before content is used", () => {
    expect(classifyStopReason("refusal", false)).toBe("refusal");
    expect(classifyStopReason("max_tokens", true)).toBe("max_tokens");
    expect(classifyStopReason("model_context_window_exceeded", true)).toBe("max_tokens");
    expect(classifyStopReason("max_tokens", false)).toBeNull();
    expect(classifyStopReason("end_turn", false)).toBeNull();
    expect(classifyStopReason("tool_use", true)).toBeNull();
    expect(classifyStopReason(null, false)).toBeNull();
  });
});

describe("CLI exits", () => {
  const exit = (over: object) =>
    classifyCliExit({
      exitCode: 0,
      sawResult: true,
      resultIsError: false,
      resultSubtype: "success",
      text: "",
      aborted: false,
      ...over,
    });

  test("a clean result is a success", () => {
    expect(exit({})).toBeNull();
  });

  test("a killed process leaves no result event: aborted", () => {
    expect(exit({ exitCode: 143, sawResult: false })).toBe("aborted");
    expect(exit({ exitCode: 1, sawResult: false, aborted: true })).toBe("aborted");
  });

  test("error results", () => {
    expect(exit({ exitCode: 1, sawResult: false, text: "Not logged in. Run /login" })).toBe("auth");
    expect(exit({ exitCode: 1, sawResult: false, text: "segfault" })).toBe("internal");
    expect(exit({ resultIsError: true, resultSubtype: "error_max_turns" })).toBe("iteration_limit");
    expect(exit({ resultIsError: true, text: "Claude usage limit reached. Resets at 5pm" })).toBe(
      "rate_limit",
    );
    expect(exit({ resultIsError: true, text: "API Error: 529 overloaded" })).toBe("overloaded");
    expect(exit({ resultIsError: true, text: "fetch failed ECONNRESET" })).toBe("network");
    expect(exit({ resultIsError: true, text: "???" })).toBe("internal");
  });
});

describe("secrets", () => {
  test("are scrubbed from anything that is logged", () => {
    const text =
      'POST /v1/messages {"x-api-key": "sk-ant-api03-AbC_dEf-123456"} Authorization: Bearer abcdefghijklmnop X-Oak-Turn: 6f1e2d3c-turn-token';
    const clean = redactSecrets(text);
    expect(clean).not.toContain("AbC_dEf");
    expect(clean).not.toContain("abcdefghijklmnop");
    expect(clean).not.toContain("6f1e2d3c");
    expect(new TutorError("auth", { detail: text }).detail).toBe(clean);
  });

  test("a TutorError's message is the fixed copy, whatever the detail", () => {
    const e = new TutorError("auth", { detail: "key sk-ant-api03-XXXXXXXX rejected" });
    expect(e.message).toBe(ERROR_COPY.auth);
    expect(JSON.stringify(e.toInfo())).not.toContain("sk-ant");
  });
});
