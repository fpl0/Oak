// Scripted review turns: the model delivers a CapstoneReview through its submit tool, or fails to.
// Test code only.
import { CAPSTONE_REVIEW } from "../../../testing/fixtures.ts";
import { type Cassette, chunkJson, response, textBlock, thinkingBlock, toolUseBlock } from "./builders.ts";
import { cassette } from "./scenarios.ts";

const submit = (id: string, review: unknown) =>
  toolUseBlock(1, id, "submit_capstone_review", chunkJson(review, 40));

/** Three revisions where one is wanted: the validator answers `accepted: false`. */
export const REJECTED_REVIEW = {
  ...CAPSTONE_REVIEW,
  revisions: [CAPSTONE_REVIEW.revisions[0], CAPSTONE_REVIEW.revisions[0], CAPSTONE_REVIEW.revisions[0]],
};

export function reviewAccepted(): Cassette {
  return cassette(
    "review-accepted",
    response(
      "msg_v1",
      [thinkingBlock(0, ["Read the piece."]), submit("toolu_v1", CAPSTONE_REVIEW)],
      "tool_use",
      {
        usage: { input: 800, cacheWrite1h: 6000 },
        output: 400,
      },
    ),
  );
}

export function reviewResubmitted(): Cassette {
  return cassette(
    "review-resubmitted",
    response("msg_v1", [thinkingBlock(0, ["Draft."]), submit("toolu_v1", REJECTED_REVIEW)], "tool_use"),
    response("msg_v2", [thinkingBlock(0, ["Fix it."]), submit("toolu_v2", CAPSTONE_REVIEW)], "tool_use"),
  );
}

export function reviewRejectedTwice(): Cassette {
  return cassette(
    "review-rejected-twice",
    response("msg_v1", [thinkingBlock(0, ["Draft."]), submit("toolu_v1", REJECTED_REVIEW)], "tool_use"),
    response("msg_v2", [thinkingBlock(0, ["Again."]), submit("toolu_v2", REJECTED_REVIEW)], "tool_use"),
  );
}

export function reviewAfterReminder(): Cassette {
  return cassette(
    "review-after-reminder",
    response("msg_v1", [textBlock(0, ["This is a lovely groove."])], "end_turn"),
    response("msg_v2", [thinkingBlock(0, ["Deliver it."]), submit("toolu_v2", CAPSTONE_REVIEW)], "tool_use"),
  );
}

export function reviewNeverDelivered(): Cassette {
  return cassette(
    "review-never-delivered",
    response("msg_v1", [textBlock(0, ["This is a lovely groove."])], "end_turn"),
    response("msg_v2", [textBlock(0, ["As I said, lovely."])], "end_turn"),
  );
}
