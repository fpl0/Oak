// Components that MDX prose (lesson text, the About page) renders through. Code spans use the code font; links
// stay inside the app.
import type { MDXProvider } from "@mdx-js/react";
import type { ComponentProps } from "react";

type MDXComponents = NonNullable<
  Exclude<ComponentProps<typeof MDXProvider>["components"], (...args: never[]) => unknown>
>;

export const mdxComponents: MDXComponents = {
  h1: (p) => <h2 className="mt-6 mb-2 text-h2" {...p} />,
  h2: (p) => <h3 className="mt-5 mb-2 text-h3" {...p} />,
  p: (p) => <p className="mb-3 max-w-[60ch] leading-relaxed" {...p} />,
  ul: (p) => <ul className="mb-3 ml-5 list-disc space-y-1" {...p} />,
  ol: (p) => <ol className="mb-3 ml-5 list-decimal space-y-1" {...p} />,
  code: (p) => <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.9em]" {...p} />,
  pre: (p) => (
    <pre className="mb-3 overflow-auto rounded-control bg-surface-2 p-3 font-mono text-sm" {...p} />
  ),
  a: (p) => <a className="text-link underline underline-offset-2" {...p} />,
};
