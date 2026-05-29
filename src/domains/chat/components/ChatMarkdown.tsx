'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatMarkdownProps {
  content: string;
}

/** 어시스턴트 메시지 본문을 디자인 토큰에 맞춰 렌더링하는 마크다운 뷰. */
export default function ChatMarkdown({ content }: ChatMarkdownProps) {
  const raw = String(content || '').trim();
  if (!raw) return null;

  return (
    <div className="text-[15px] leading-7 break-words space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="leading-7 [&:not(:first-child)]:mt-2">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 my-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 my-1">{children}</ol>,
          li: ({ children }) => <li className="leading-6">{children}</li>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:opacity-80">
              {children}
            </a>
          ),
          h1: ({ children }) => <h3 className="text-base font-bold text-foreground mt-3 mb-1">{children}</h3>,
          h2: ({ children }) => <h3 className="text-base font-bold text-foreground mt-3 mb-1">{children}</h3>,
          h3: ({ children }) => <h4 className="text-sm font-semibold text-foreground mt-2 mb-0.5">{children}</h4>,
          h4: ({ children }) => <h4 className="text-sm font-semibold text-foreground mt-2 mb-0.5">{children}</h4>,
          hr: () => <hr className="my-3 border-border" />,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-3 text-muted-foreground my-1">{children}</blockquote>
          ),
          code: ({ children }) => (
            <code className="px-1 py-0.5 rounded bg-muted text-[13px] font-mono text-foreground">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="bg-foreground text-background rounded-lg p-3 overflow-x-auto text-[13px] my-2">{children}</pre>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead>{children}</thead>,
          th: ({ children }) => (
            <th className="text-left font-medium text-muted-foreground border-b border-border py-1.5 px-2 whitespace-nowrap">{children}</th>
          ),
          td: ({ children }) => <td className="py-1.5 px-2 border-b border-border align-top">{children}</td>,
        }}
      >
        {raw}
      </ReactMarkdown>
    </div>
  );
}
