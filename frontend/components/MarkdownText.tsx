"use client";

import ReactMarkdown from "react-markdown";

/**
 * Renders AI output as markdown with our typography. The model is instructed
 * to use only **bold** + paragraph breaks (no headers/lists), but ReactMarkdown
 * handles anything it might slip in — safe by default (no raw HTML).
 */
export function MarkdownText({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => (
          <p className="text-[13.5px] leading-relaxed mb-3 last:mb-0">
            {children}
          </p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-mm-text">{children}</strong>
        ),
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-mm-accent hover:underline"
          >
            {children}
          </a>
        ),
        code: ({ children }) => (
          <code className="font-mono text-[12px] px-1 py-0.5 rounded bg-mm-bg-sub">
            {children}
          </code>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-5 space-y-1 mb-3 last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-5 space-y-1 mb-3 last:mb-0">{children}</ol>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
