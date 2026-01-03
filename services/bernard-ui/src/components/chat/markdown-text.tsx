import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { memo } from 'react';
import { cn } from '../../lib/utils';
import { CodeBlock } from './syntax-highlighter';
import 'katex/dist/katex.min.css';

const defaultComponents = {
  h1: ({ className, ...props }: any) => (
    <h1 className={cn("mb-8 scroll-m-20 text-4xl font-extrabold tracking-tight", className)} {...props} />
  ),
  h2: ({ className, ...props }: any) => (
    <h2 className={cn("mb-4 mt-8 scroll-m-20 text-3xl font-semibold tracking-tight", className)} {...props} />
  ),
  h3: ({ className, ...props }: any) => (
    <h3 className={cn("mb-4 mt-6 scroll-m-20 text-2xl font-semibold tracking-tight", className)} {...props} />
  ),
  h4: ({ className, ...props }: any) => (
    <h4 className={cn("mb-4 mt-6 scroll-m-20 text-xl font-semibold tracking-tight", className)} {...props} />
  ),
  p: ({ className, ...props }: any) => (
    <p className={cn("mb-5 mt-5 leading-7 first:mt-0 last:mb-0", className)} {...props} />
  ),
  a: ({ className, ...props }: any) => (
    <a className={cn("text-primary font-medium underline underline-offset-4", className)} {...props} />
  ),
  ul: ({ className, ...props }: any) => (
    <ul className={cn("my-5 ml-6 list-disc [&>li]:mt-2", className)} {...props} />
  ),
  ol: ({ className, ...props }: any) => (
    <ol className={cn("my-5 ml-6 list-decimal [&>li]:mt-2", className)} {...props} />
  ),
  blockquote: ({ className, ...props }: any) => (
    <blockquote className={cn("border-l-2 pl-6 italic", className)} {...props} />
  ),
  table: ({ className, ...props }: any) => (
    <table className={cn("my-5 w-full border-separate border-spacing-0 overflow-y-auto", className)} {...props} />
  ),
  th: ({ className, ...props }: any) => (
    <th className={cn("bg-muted px-4 py-2 text-left font-bold first:rounded-tl-lg last:rounded-tr-lg", className)} {...props} />
  ),
  td: ({ className, ...props }: any) => (
    <td className={cn("border-b border-l px-4 py-2 text-left last:border-r", className)} {...props} />
  ),
  tr: ({ className, ...props }: any) => (
    <tr className={cn("m-0 border-b p-0 first:border-t", className)} {...props} />
  ),
  pre: ({ className, ...props }: any) => (
    <pre className={cn("overflow-x-auto rounded-lg bg-muted text-foreground max-w-4xl", className)} {...props} />
  ),
  code: ({ className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    if (match) {
      return <CodeBlock language={match[1]}>{String(children).replace(/\n$/, '')}</CodeBlock>;
    }
    return <code className={cn("rounded font-semibold", className)} {...props}>{children}</code>;
  },
};

const MarkdownTextImpl: React.FC<{ children: string }> = ({ children }) => {
  return (
    <div className="markdown-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={defaultComponents}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
};

export const MarkdownText = memo(MarkdownTextImpl);
