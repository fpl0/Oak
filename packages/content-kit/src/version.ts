/**
 * Version of docs/design/contracts.md that this package implements. Bump it in the same commit as any
 * contract change (contracts "Changing a contract").
 */
export const CONTRACTS_VERSION = "1.3";

/**
 * Bump when the shape of a content schema changes in a way that old generated content or an older reader
 * cannot satisfy (the schemas are strict: an older reader refuses a new field). 2: the Wave 3 shapes
 * (staff writing with a key, key signatures in order, sung labels, octaves and the lenient first sing,
 * by-ear transcription, passive listening, `revealRollAfter`, `staffLabels`, fact-card `accept`,
 * milestone `ladder`/`anyOf`).
 */
export const CONTENT_SCHEMA_VERSION = 2;
