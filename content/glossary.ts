// The glossary under the name the content-tooling task uses. The source of truth is content/terms.ts
// (the file contracts §5.8 names); this module only re-exports it.
export { default, termById, terms as glossary, terms } from "./terms.ts";
