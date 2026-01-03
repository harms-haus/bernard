# Chat Page Overhaul Plan: bernard-ui using bernard-chat Components

> **Status**: Planning Complete
> **Last Updated**: 2026-01-03
> **Reference**: bernard-chat package at `services/bernard-chat/`

## Overview

This plan details the complete replacement of bernard-ui's chat interface with the modern React components from the bernard-chat reference package (built on LangChain's agent-chat-ui).

**Key Principle**: No legacy code retained. Full adoption of bernard-chat patterns and LangGraph SDK.

### Current State (Will Be Replaced)

- **Custom ChatInterface.tsx**: ~1100 lines of custom chat logic
- **Custom message types**: MessageRecord, TraceEvent, etc.
- **Custom API integration**: Direct fetch calls to `/v1/chat/completions`
- **Custom state management**: useState + localStorage
- **Plain text rendering**: No markdown or syntax highlighting
- **Manual scroll handling**: Custom scroll detection logic
- **Separate history page**: Conversation list on `/conversations` route

### Target State

- **LangGraph SDK**: Direct use of `@langchain/langgraph-sdk`
- **bernard-chat components**: Copy and adapt all chat components
- **Full markdown**: ReactMarkdown with GFM, KaTeX math, syntax highlighting
- **Framer Motion**: Professional animations throughout
- **use-stick-to-bottom**: Robust scroll management
- **Inline history sidebar**: Conversation list within chat interface
- **Message actions**: Edit, copy, regenerate, branch switching

---

## Phase 1: Dependencies & Configuration

**Duration**: 1-2 days
**Outcome**: All required dependencies installed, configuration updated, ready to copy components

### Phase Boundary: Phase 1 ends when `npm install` completes, dev server starts, and tailwind build succeeds.

### 1.1 Add Dependencies

Add to `services/bernard-ui/package.json`:

```json
{
  "dependencies": {
    "@langchain/core": "^0.3.42",
    "@langchain/langgraph-sdk": "^0.0.57",
    "@langchain/langgraph-sdk-react": "^0.0.57",
    "framer-motion": "^12.4.9",
    "react-markdown": "^10.0.1",
    "remark-gfm": "^4.0.1",
    "remark-math": "^6.0.0",
    "rehype-katex": "^7.0.1",
    "react-syntax-highlighter": "^15.5.0",
    "use-stick-to-bottom": "^1.0.46"
  }
}
```

### 1.2 Update Vite Configuration

File: `services/bernard-ui/vite.config.ts`

```typescript
import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

### 1.3 Update Tailwind Configuration

File: `services/bernard-ui/tailwind.config.js`

```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        'card-foreground': 'hsl(var(--card-foreground))',
        popover: 'hsl(var(--popover))',
        'popover-foreground': 'hsl(var(--popover-foreground))',
        primary: 'hsl(var(--primary))',
        'primary-foreground': 'hsl(var(--primary-foreground))',
        secondary: 'hsl(var(--secondary))',
        'secondary-foreground': 'hsl(var(--secondary-foreground))',
        muted: 'hsl(var(--muted))',
        'muted-foreground': 'hsl(var(--muted-foreground))',
        accent: 'hsl(var(--accent))',
        'accent-foreground': 'hsl(var(--accent-foreground))',
        destructive: 'hsl(var(--destructive))',
        'destructive-foreground': 'hsl(var(--destructive-foreground))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}
```

### 1.4 Update Global Styles

File: `services/bernard-ui/src/index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}

/* KaTeX styles */
.katex-display {
  margin: 1em 0;
  overflow-x: auto;
}

.katex {
  font-size: 1.1em;
}

/* Scrollbar styles */
.overflow-y-scroll::-webkit-scrollbar,
.overflow-x-scroll::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.overflow-y-scroll::-webkit-scrollbar-track,
.overflow-x-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-scroll::-webkit-scrollbar-thumb,
.overflow-x-scroll::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
}

.dark .overflow-y-scroll::-webkit-scrollbar-thumb,
.dark .overflow-x-scroll::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.2);
}
```

### Deliverables

- [ ] All dependencies installed via `npm install`
- [ ] Vite config updated with `@` path alias
- [ ] Tailwind config updated with CSS variables and colors
- [ ] Global styles updated with markdown/KaTeX/scrollbar styles
- [ ] Dev server starts without errors
- [ ] Tailwind build succeeds

---

## Phase 2: Copy UI Components

**Duration**: 2-3 days
**Outcome**: All bernard-chat UI components copied and adapted to bernard-ui

### Phase Boundary: Phase 2 ends when all UI components compile without TypeScript errors.

### 2.1 Copy shadcn-like UI Components

Copy from `bernard-chat/apps/web/src/components/ui/` to `src/components/ui/`:

- `button.tsx`
- `input.tsx`
- `textarea.tsx`
- `avatar.tsx`
- `label.tsx`
- `switch.tsx`
- `tooltip.tsx`
- `sheet.tsx`
- `separator.tsx`
- `skeleton.tsx`
- `sonner.tsx`
- `card.tsx`
- `dropdown-menu.tsx`

### 2.2 Create Utility Function

File: `src/lib/utils.ts`

```typescript
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 2.3 Copy Icon Components

Copy from `bernard-chat/apps/web/src/components/icons/`:

- `langgraph.tsx`
- `github.tsx`

### 2.4 Copy TooltipIconButton

File: `src/components/chat/TooltipIconButton.tsx`

```typescript
import { Button } from '../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip';
import { cn } from '../../lib/utils';

interface TooltipIconButtonProps {
  children: React.ReactNode;
  tooltip: string;
  variant?: 'ghost' | 'secondary' | 'default';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}

export function TooltipIconButton({
  children,
  tooltip,
  variant = 'ghost',
  size = 'icon',
  onClick,
  disabled,
  className,
}: TooltipIconButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={variant}
            size={size}
            onClick={onClick}
            disabled={disabled}
            className={cn("h-8 w-8", className)}
          >
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

### Deliverables

- [ ] All shadcn UI components copied to `src/components/ui/`
- [ ] `src/lib/utils.ts` created with `cn()` function
- [ ] Icon components copied to `src/components/icons/`
- [ ] `TooltipIconButton.tsx` created
- [ ] All components compile without TypeScript errors

---

## Phase 3: Copy Message Components

**Duration**: 2-3 days
**Outcome**: All message components (Human, AI, Tool) copied and adapted

### Phase Boundary: Phase 3 ends when message components render correctly with sample data.

### 3.1 Create Message Utility

File: `src/components/chat/utils.ts`

```typescript
import type { Message } from '@langchain/langgraph-sdk';

export function getContentString(content: Message['content']): string {
  if (typeof content === 'string') return content;
  const texts = content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map((c) => c.text);
  return texts.join(' ');
}
```

### 3.2 Copy Markdown Components

File: `src/components/chat/markdown-text.tsx`

```typescript
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { memo } from 'react';
import { cn } from '../../lib/utils';
import { SyntaxHighlighter } from './syntax-highlighter';
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
    <pre className={cn("overflow-x-auto rounded-lg bg-black text-white max-w-4xl", className)} {...props} />
  ),
  code: ({ className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || '');
    if (match) {
      return <SyntaxHighlighter language={match[1]}>{String(children).replace(/\n$/, '')}</SyntaxHighlighter>;
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
```

### 3.3 Copy SyntaxHighlighter

File: `src/components/chat/syntax-highlighter.tsx`

```typescript
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../lib/utils';

interface SyntaxHighlighterProps {
  language: string;
  children: string;
  className?: string;
}

export function SyntaxHighlighter({ language, children, className }: SyntaxHighlighterProps) {
  return (
    <div className={cn("rounded-lg overflow-hidden", className)}>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        customStyle={{ margin: 0, padding: '1rem' }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}
```

### 3.4 Copy Message Components

**File**: `src/components/chat/messages/human.tsx`

```typescript
import { useState } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import { Textarea } from '../../ui/textarea';
import { getContentString } from '../utils';
import { cn } from '../../../lib/utils';
import { TooltipIconButton } from '../TooltipIconButton';
import { Pencil, X, SendHorizontal, RefreshCcw } from 'lucide-react';

export function HumanMessage({ message }: { message: Message }) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState('');
  const contentString = getContentString(message.content);

  // Placeholder - will be connected to StreamProvider in Phase 4
  const handleSubmitEdit = () => {
    setIsEditing(false);
    // TODO: Submit edited message
  };

  return (
    <div className={cn("flex items-center ml-auto gap-2 group", isEditing && "w-full max-w-xl")}>
      <div className={cn("flex flex-col gap-2", isEditing && "w-full")}>
        {isEditing ? (
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                handleSubmitEdit();
              }
            }}
            className="focus-visible:ring-0 min-h-[44px] resize-none"
          />
        ) : (
          <p className="px-4 py-2 rounded-3xl bg-muted w-fit ml-auto whitespace-pre-wrap">
            {contentString}
          </p>
        )}
        
        <div className={cn(
          "flex gap-2 items-center ml-auto transition-opacity",
          "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100",
          isEditing && "opacity-100"
        )}>
          {isEditing ? (
            <>
              <TooltipIconButton onClick={() => setIsEditing(false)} tooltip="Cancel" variant="ghost">
                <X className="w-4 h-4" />
              </TooltipIconButton>
              <TooltipIconButton onClick={handleSubmitEdit} tooltip="Submit" variant="secondary">
                <SendHorizontal className="w-4 h-4" />
              </TooltipIconButton>
            </>
          ) : (
            <TooltipIconButton onClick={() => { setValue(contentString); setIsEditing(true); }} tooltip="Edit" variant="ghost">
              <Pencil className="w-4 h-4" />
            </TooltipIconButton>
          )}
        </div>
      </div>
    </div>
  );
}
```

**File**: `src/components/chat/messages/ai.tsx`

```typescript
import type { Message, AIMessage } from '@langchain/langgraph-sdk';
import { getContentString } from '../utils';
import { MarkdownText } from '../markdown-text';
import { cn } from '../../../lib/utils';
import { TooltipIconButton } from '../TooltipIconButton';
import { RefreshCcw, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function ContentCopyable({ content, disabled }: { content: string; disabled: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TooltipIconButton onClick={handleCopy} tooltip={copied ? "Copied" : "Copy"} variant="ghost" disabled={disabled}>
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.div key="check" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <Check className="w-4 h-4 text-green-500" />
          </motion.div>
        ) : (
          <motion.div key="copy" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}>
            <Copy className="w-4 h-4" />
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipIconButton>
  );
}

export function AssistantMessage({ message }: { message: Message }) {
  const contentString = getContentString(message.content);

  // Placeholder for regeneration
  const handleRegenerate = () => {
    // TODO: Implement regeneration
  };

  return (
    <div className="flex items-start mr-auto gap-2 group">
      <div className="flex flex-col gap-2">
        {contentString.length > 0 && (
          <div className="py-1">
            <MarkdownText>{contentString}</MarkdownText>
          </div>
        )}
        
        <div className={cn(
          "flex gap-2 items-center mr-auto transition-opacity",
          "opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        )}>
          <ContentCopyable content={contentString} disabled={false} />
          <TooltipIconButton onClick={handleRegenerate} tooltip="Regenerate" variant="ghost">
            <RefreshCcw className="w-4 h-4" />
          </TooltipIconButton>
        </div>
      </div>
    </div>
  );
}

export function AssistantMessageLoading() {
  return (
    <div className="flex items-start mr-auto gap-2">
      <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-2 h-8">
        <div className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[pulse_1.5s_ease-in-out_infinite]"></div>
        <div className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[pulse_1.5s_ease-in-out_0.5s_infinite]"></div>
        <div className="w-1.5 h-1.5 rounded-full bg-foreground/50 animate-[pulse_1.5s_ease-in-out_1s_infinite]"></div>
      </div>
    </div>
  );
}
```

### 3.5 Copy Tool Components

**File**: `src/components/chat/messages/tool-calls.tsx`

```typescript
import type { AIMessage } from '@langchain/langgraph-sdk';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../../lib/utils';

function isComplexValue(value: any): boolean {
  return Array.isArray(value) || (typeof value === 'object" && value !== null);
}

export function ToolCalls({ toolCalls }: { toolCalls: AIMessage['tool_calls'] }) {
  if (!toolCalls || toolCalls.length === 0) return null;

  return (
    <div className="space-y-4 w-full max-w-4xl">
      {toolCalls.map((tc, idx) => {
        const args = tc.args as Record<string, any>;
        const hasArgs = Object.keys(args).length > 0;
        return (
          <div key={idx} className="border border-border rounded-lg overflow-hidden">
            <div className="bg-muted px-4 py-2 border-b border-border">
              <h3 className="font-medium">
                {tc.name}
                {tc.id && (
                  <code className="ml-2 text-sm bg-background px-2 py-1 rounded">{tc.id}</code>
                )}
              </h3>
            </div>
            {hasArgs ? (
              <table className="min-w-full divide-y divide-border">
                <tbody className="divide-y divide-border">
                  {Object.entries(args).map(([key, value], argIdx) => (
                    <tr key={argIdx}>
                      <td className="px-4 py-2 text-sm font-medium">{key}</td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {isComplexValue(value) ? (
                          <code className="bg-muted rounded px-2 py-1 font-mono text-sm break-all">
                            {JSON.stringify(value, null, 2)}
                          </code>
                        ) : (
                          String(value)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <code className="text-sm block p-3">{"{}"}</code>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

### Deliverables

- [ ] `src/components/chat/utils.ts` created
- [ ] `src/components/chat/markdown-text.tsx` created
- [ ] `src/components/chat/syntax-highlighter.tsx` created
- [ ] `src/components/chat/messages/human.tsx` created
- [ ] `src/components/chat/messages/ai.tsx` created
- [ ] `src/components/chat/messages/tool-calls.tsx` created
- [ ] All message components render correctly with sample data

---

## Phase 4: Providers & API Integration

**Duration**: 3-4 days
**Outcome**: StreamProvider and ThreadProvider connected to Bernard API

### Phase Boundary: Phase 4 ends when messages stream correctly from Bernard's `/v1/chat/completions` endpoint.

### 4.1 Create StreamProvider

File: `src/providers/StreamProvider.tsx`

```typescript
import React, { createContext, useContext, ReactNode, useState, useCallback, useRef, useEffect } from 'react';
import type { Message } from '@langchain/langgraph-sdk';

interface StreamContextType {
  messages: Message[];
  submit: (input: { messages: Message[] }, options?: any) => Promise<void>;
  isLoading: boolean;
  error: Error | null;
  stop: () => void;
}

const StreamContext = createContext<StreamContextType | undefined>(undefined);

export function StreamProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const submit = useCallback(async (input: { messages: Message[] }, options?: any) => {
    setIsLoading(true);
    setError(null);
    abortControllerRef.current = new AbortController();

    try {
      // Convert LangGraph messages to OpenAI format
      const messagesPayload = input.messages.map(msg => ({
        role: msg.type === 'human' ? 'user' : 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      }));

      const response = await fetch(`/v1/chat/completions`, {
        credentials: 'same-origin',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'bernard-v1',
          messages: messagesPayload,
          stream: true
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) throw new Error('Failed to send message');
      if (!response.body) throw new Error('Response body is null');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Add user message immediately
      const lastUserMessage = input.messages[input.messages.length - 1];
      if (lastUserMessage.type === 'human') {
        setMessages(prev => [...prev, lastUserMessage as Message]);
      }

      // Create assistant message placeholder
      let assistantMessage: Message = {
        id: `ai_${Date.now()}`,
        type: 'ai',
        content: ''
      };
      setMessages(prev => [...prev, assistantMessage]);

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        let boundary = buffer.indexOf('\n\n');

        while (boundary !== -1) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          
          let payload = raw;
          if (raw.startsWith('data: ')) {
            payload = raw.substring(6).trim();
          }

          if (!payload || payload === '[DONE]') {
            break;
          }

          try {
            const chunk = JSON.parse(payload);
            const text = chunk.choices?.[0]?.delta?.content;
            
            if (text) {
              setMessages(prev => {
                const updated = [...prev];
                const lastMsg = updated[updated.length - 1];
                if (lastMsg.type === 'ai') {
                  updated[updated.length - 1] = {
                    ...lastMsg,
                    content: (lastMsg.content as string) + text
                  };
                }
                return updated;
              });
            }
          } catch {
            // Ignore parse errors
          }

          boundary = buffer.indexOf('\n\n');
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, []);

  return (
    <StreamContext.Provider value={{ messages, submit, isLoading, error, stop }}>
      {children}
    </StreamContext.Provider>
  );
}

export function useStream() {
  const context = useContext(StreamContext);
  if (context === undefined) {
    throw new Error('useStream must be used within a StreamProvider');
  }
  return context;
}
```

### 4.2 Create ThreadProvider

File: `src/providers/ThreadProvider.tsx`

```typescript
import { createContext, useContext, ReactNode, useCallback, useState } from 'react';
import type { ConversationListItem } from '../types/conversation';
import { apiClient } from '../services/api';

interface ThreadContextType {
  threads: ConversationListItem[];
  getThreads: () => Promise<ConversationListItem[]>;
  setThreads: (threads: ConversationListItem[]) => void;
  threadsLoading: boolean;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

export function ThreadProvider({ children }: { children: ReactNode }) {
  const [threads, setThreads] = useState<ConversationListItem[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(false);

  const getThreads = useCallback(async (): Promise<ConversationListItem[]> => {
    setThreadsLoading(true);
    try {
      const response = await apiClient.listConversations({ limit: 50 });
      setThreads(response.conversations);
      return response.conversations;
    } finally {
      setThreadsLoading(false);
    }
  }, []);

  return (
    <ThreadContext.Provider value={{ threads, getThreads, setThreads, threadsLoading }}>
      {children}
    </ThreadContext.Provider>
  );
}

export function useThreads() {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error('useThreads must be used within a ThreadProvider');
  }
  return context;
}
```

### 4.3 Update Main Entry Point

File: `src/main.tsx`

```typescript
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { StreamProvider } from './providers/StreamProvider';
import { ThreadProvider } from './providers/ThreadProvider';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <ThreadProvider>
      <StreamProvider>
        <App />
      </StreamProvider>
    </ThreadProvider>
    <Toaster />
  </BrowserRouter>
);
```

### 4.4 Update Conversation Types

File: `src/types/conversation.ts` - Keep only what ThreadProvider needs:

```typescript
export interface ConversationListItem {
  id: string;
  name?: string;
  userId: string;
  createdAt: string;
  lastTouchedAt: string;
  archived: boolean;
  messageCount: number;
  toolCallCount: number;
}

export interface ConversationsListResponse {
  conversations: ConversationListItem[];
  total: number;
  hasMore: boolean;
}
```

### Deliverables

- [ ] `src/providers/StreamProvider.tsx` implemented with streaming
- [ ] `src/providers/ThreadProvider.tsx` implemented
- [ ] `src/main.tsx` updated with providers
- [ ] `src/types/conversation.ts` cleaned up
- [ ] Messages stream correctly from API
- [ ] Thread list loads from API

---

## Phase 5: Main Thread Component

**Duration**: 3-4 days
**Outcome**: Complete chat interface with sidebar, message list, and input

### Phase Boundary: Phase 5 ends when the full Thread component renders and handles the complete chat flow.

### 5.1 Create Conversation History Component

File: `src/components/chat/ConversationHistory.tsx`

```typescript
import { useEffect } from 'react';
import { useQueryState, parseAsBoolean } from 'nuqs';
import { motion } from 'framer-motion';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Sheet, SheetContent } from '../ui/sheet';
import { useThreads } from '../../providers/ThreadProvider';
import { PanelRightOpen, PanelRightClose } from 'lucide-react';
import { cn } from '../../lib/utils';

export function ConversationHistory({ 
  open, 
  onOpenChange 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const [threadId, setThreadId] = useQueryState('conversationId');
  const { threads, threadsLoading, getThreads } = useThreads();

  useEffect(() => {
    getThreads();
  }, [getThreads]);

  return (
    <>
      {/* Desktop Sidebar */}
      <motion.div
        className="hidden lg:flex flex-col border-r bg-background items-start justify-start gap-6 h-screen w-[300px] shrink-0"
        animate={{ x: open ? 0 : -300 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="flex items-center justify-between w-full pt-1.5 px-4">
          <Button variant="ghost" onClick={() => onOpenChange(!open)}>
            {open ? <PanelRightOpen className="size-5" /> : <PanelRightClose className="size-5" />}
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">Chat History</h1>
        </div>
        
        {threadsLoading ? (
          <ThreadHistoryLoading />
        ) : (
          <ThreadList 
            threads={threads} 
            activeId={threadId || null}
            onThreadClick={(id) => setThreadId(id)}
          />
        )}
      </motion.div>

      {/* Mobile Sheet */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="lg:hidden flex">
          <ThreadList 
            threads={threads}
            activeId={threadId || null}
            onThreadClick={(id) => {
              setThreadId(id);
              onOpenChange(false);
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function ThreadList({ 
  threads, 
  activeId,
  onThreadClick 
}: { 
  threads: any[]; 
  activeId: string | null;
  onThreadClick: (id: string) => void;
}) {
  return (
    <div className="h-full flex flex-col w-full gap-2 items-start justify-start overflow-y-scroll">
      {threads.map((t) => (
        <Button
          key={t.id}
          variant={activeId === t.id ? 'secondary' : 'ghost'}
          className="text-left items-start justify-start font-normal w-full"
          onClick={() => onThreadClick(t.id)}
        >
          <p className="truncate text-ellipsis">{t.name || `Conversation ${t.id.slice(0, 8)}`}</p>
        </Button>
      ))}
      {threads.length === 0 && (
        <p className="text-muted-foreground text-sm p-4">No conversations yet</p>
      )}
    </div>
  );
}

function ThreadHistoryLoading() {
  return (
    <div className="h-full flex flex-col w-full gap-2 items-start justify-start overflow-y-scroll px-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="w-full h-10" />
      ))}
    </div>
  );
}
```

### 5.2 Create Main Thread Component

File: `src/components/chat/Thread.tsx`

```typescript
import { useState, useEffect, FormEvent, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { StickToBottom, useStickToBottomContext } from 'use-stick-to-bottom';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useStream } from '../../providers/StreamProvider';
import { useThreads } from '../../providers/ThreadProvider';
import { HumanMessage } from './messages/human';
import { AssistantMessage, AssistantMessageLoading } from './messages/ai';
import { ConversationHistory } from './ConversationHistory';
import { cn } from '../../lib/utils';
import { ArrowDown, PanelRightOpen, PanelRightClose, SquarePen, MoreVertical, Ghost, Plus, Copy, Download, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Message } from '@langchain/langgraph-sdk';

function ScrollToBottomButton({ className }: { className?: string }) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  if (isAtBottom) return null;
  
  return (
    <Button variant="outline" className={cn("absolute bottom-full left-1/2 -translate-x-1/2 mb-4", className)} onClick={() => scrollToBottom()}>
      <ArrowDown className="w-4 h-4 mr-2" />
      Scroll to bottom
    </Button>
  );
}

export function Thread() {
  const [searchParams, setSearchParams] = useSearchParams();
  const conversationId = searchParams.get('conversationId');
  
  const { messages, submit, isLoading, stop } = useStream();
  const { threads, getThreads } = useThreads();
  
  const [input, setInput] = useState('');
  const [chatHistoryOpen, setChatHistoryOpen] = useState(false);
  const [isGhostMode, setIsGhostMode] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const newHumanMessage: Message = {
      id: uuidv4(),
      type: 'human',
      content: input.trim(),
    };

    await submit({ messages: [...messages, newHumanMessage] });
    setInput('');
  };

  const handleNewChat = () => {
    const newId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    setSearchParams({ conversationId: newId });
  };

  const handleCopyChatHistory = async () => {
    const historyData = messages.map(msg => ({
      role: msg.type === 'human' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));
    await navigator.clipboard.writeText(JSON.stringify(historyData, null, 2));
    toast.success('Chat history copied to clipboard');
  };

  const handleDownloadChatHistory = () => {
    const historyData = messages.map(msg => ({
      role: msg.type === 'human' ? 'user' : 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }));
    const blob = new Blob([JSON.stringify(historyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bernard-chat-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Chat history downloaded');
  };

  const chatStarted = !!conversationId || !!messages.length;

  return (
    <div className="flex w-full h-screen overflow-hidden">
      <ConversationHistory open={chatHistoryOpen} onOpenChange={setChatHistoryOpen} />
      
      <motion.div
        className={cn(
          "flex-1 flex flex-col min-w-0 overflow-hidden relative",
          !chatStarted && "grid-rows-[1fr]"
        )}
        animate={{
          marginLeft: chatHistoryOpen ? 300 : 0,
          width: chatHistoryOpen ? "calc(100% - 300px)" : "100%",
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 p-2 z-10 relative border-b bg-background">
          <div className="flex items-center gap-2">
            {!chatHistoryOpen && (
              <Button variant="ghost" onClick={() => setChatHistoryOpen(true)}>
                <PanelRightClose className="size-5" />
              </Button>
            )}
            <div className="flex items-center gap-2">
              <Avatar className="h-8 w-8">
                <AvatarFallback>B</AvatarFallback>
              </Avatar>
              <span className="font-medium">Bernard</span>
              {isGhostMode && <Ghost className="h-4 w-4 text-muted-foreground" />}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleNewChat}>
                  <SquarePen className="mr-2 h-4 w-4" />
                  New Chat
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleCopyChatHistory}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Chat History
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleDownloadChatHistory}>
                  <Download className="mr-2 h-4 w-4" />
                  Download Chat History
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsGhostMode(!isGhostMode)}>
                  <Ghost className="mr-2 h-4 w-4" />
                  {isGhostMode ? 'Disable' : 'Enable'} Ghost Mode
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Messages Area */}
        <StickToBottom className="relative flex-1 overflow-hidden">
          <div className="absolute px-4 inset-0 overflow-y-scroll">
            <div className="pt-8 pb-16 max-w-3xl mx-auto flex flex-col gap-4 w-full">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-[50vh]">
                  <Avatar className="h-16 w-16 mb-4">
                    <AvatarFallback className="text-2xl">B</AvatarFallback>
                  </Avatar>
                  <h2 className="text-xl font-semibold mb-2">How can I help you today?</h2>
                  <p className="text-muted-foreground">Ask about the weather, set a timer, or search the web.</p>
                </div>
              )}
              
              {messages.map((message, index) => (
                message.type === 'human' ? (
                  <HumanMessage key={message.id || `human-${index}`} message={message} />
                ) : (
                  <AssistantMessage key={message.id || `ai-${index}`} message={message} />
                )
              ))}
              
              {isLoading && <AssistantMessageLoading />}
            </div>
          </div>
          
          <div className="sticky flex flex-col items-center gap-8 bottom-0 bg-background/80 backdrop-blur-sm">
            <ScrollToBottomButton />
            
            {/* Input Area */}
            <div className="bg-muted rounded-2xl border shadow-xs mx-auto mb-4 w-full max-w-3xl relative z-10">
              <form onSubmit={handleSubmit} className="grid grid-rows-[1fr_auto] gap-2 max-w-3xl mx-auto p-2">
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Type your message..."
                  className="min-h-[44px] max-h-[200px] resize-none border-0 bg-transparent shadow-none ring-0 outline-none focus:ring-0"
                />
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="icon" type="button">
                    <Plus className="h-4 w-4" />
                  </Button>
                  {isLoading ? (
                    <Button key="stop" onClick={stop} type="button">
                      <div className="w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Cancel
                    </Button>
                  ) : (
                    <Button type="submit" disabled={!input.trim()}>
                      Send
                    </Button>
                  )}
                </div>
              </form>
            </div>
          </div>
        </StickToBottom>
      </motion.div>
    </div>
  );
}
```

### 5.3 Add UUID Dependency

Install uuid package:
```bash
npm install uuid
npm install --save-dev @types/uuid
```

### Deliverables

- [ ] `src/components/chat/ConversationHistory.tsx` implemented
- [ ] `src/components/chat/Thread.tsx` implemented
- [ ] uuid installed and types added
- [ ] Full chat interface renders with sidebar
- [ ] Messages stream and display correctly
- [ ] Input submits and creates new messages
- [ ] Sidebar opens/closes with animation
- [ ] New chat, copy, download features work

---

## Phase 6: Delete Legacy Code

**Duration**: 1 day
**Outcome**: All legacy chat code removed, only new components remain

### Phase Boundary: Phase 6 ends when no legacy chat code remains and the app builds successfully.

### 6.1 Delete Legacy Files

```bash
# Delete old chat components
rm src/components/ChatInterface.tsx
rm -rf src/components/chat-messages/

# Delete old types (if no longer needed)
rm src/types/messageRecord.ts

# Delete old utilities (if no longer needed)
rm src/utils/traceEventParser.ts
```

### 6.2 Update Routes

File: `src/App.tsx`

```typescript
import { Thread } from './components/chat/Thread';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/chat" element={<Thread />} />
      <Route path="/chat/:conversationId" element={<Thread />} />
      {/* Conversation history now inline */}
    </Routes>
  );
}
```

### 6.3 Update Page Component

File: `src/pages/Chat.tsx`

```typescript
import { Thread } from '../components/chat/Thread';
import { useSearchParams } from 'react-router-dom';

export function Chat() {
  const [searchParams] = useSearchParams();
  const conversationId = searchParams.get('conversationId');
  
  return <Thread initialConversationId={conversationId || undefined} />;
}
```

### 6.4 Clean Up Imports

Remove any remaining imports of old components:
- Search for `ChatInterface`
- Search for `UserMessage`, `AssistantMessage` (old versions)
- Search for `MessageRecord`
- Search for `TraceEvent`

### Deliverables

- [ ] `ChatInterface.tsx` deleted
- [ ] `chat-messages/` directory deleted
- [ ] `messageRecord.ts` deleted
- [ ] Routes updated to use new Thread component
- [ ] `Chat.tsx` updated to render Thread
- [ ] No references to legacy chat code
- [ ] Build succeeds without errors

---

## Phase 7: Polish & Dark Mode

**Duration**: 2 days
**Outcome**: Smooth animations, complete dark mode support, polished UI

### Phase Boundary: Phase 7 ends when all components support dark mode and animations are smooth.

### 7.1 Ensure Dark Mode Support

Update all components to use CSS variables for colors:

```typescript
// Example pattern
<div className={cn(
  "rounded-lg border",
  isDarkMode ? "bg-card text-card-foreground border-border" : "bg-white text-gray-900 border-gray-200"
)}>
```

### 7.2 Add Loading Skeleton

File: `src/components/chat/messages/loading.tsx`

```typescript
import { Skeleton } from '../../ui/skeleton';

export function MessageListLoading() {
  return (
    <div className="flex flex-col gap-4 w-full max-w-3xl mx-auto">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className={cn("flex gap-2", i % 2 === 0 ? "justify-end" : "justify-start")}>
          {i % 2 === 0 ? (
            <Skeleton className="h-10 w-64 rounded-3xl" />
          ) : (
            <>
              <Skeleton className="h-8 w-8 rounded-full" />
              <Skeleton className="h-20 w-96 rounded-2xl" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
```

### 7.3 Add Error State

File: `src/components/chat/ErrorState.tsx`

```typescript
import { Button } from '../ui/button';
import { RefreshCw } from 'lucide-react';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8">
      <p className="text-destructive">{message}</p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline">
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}
```

### 7.4 Optimize Animations

Ensure framer-motion animations are performant:

```typescript
// Use transform only
<motion.div
  animate={{ x: 0 }}
  transition={{ type: 'spring' }}
>
// Avoid animating layout properties that cause reflow
```

### Deliverables

- [ ] All components support dark mode via CSS variables
- [ ] Loading skeleton component created
- [ ] Error state component created
- [ ] Animations are smooth (60fps)
- [ ] No layout shifts during streaming
- [ ] Visual polish complete

---

## Phase 8: Testing

**Duration**: 2-3 days
**Outcome**: Manual testing complete, no critical bugs

### Phase Boundary: Phase 8 ends when all critical bugs are fixed and the interface is stable.

### 8.1 Manual Testing Checklist

- [ ] Load chat page with no conversation
- [ ] Load chat page with conversationId query param
- [ ] Send a message and receive streaming response
- [ ] Edit a human message
- [ ] Regenerate an AI response (if implemented)
- [ ] Copy message content
- [ ] Open/close chat history sidebar
- [ ] Switch between conversations
- [ ] Create new conversation
- [ ] Copy chat history
- [ ] Download chat history
- [ ] Enable/disable ghost mode
- [ ] Dark mode toggle
- [ ] Mobile layout (sidebar, messages)
- [ ] Network error handling
- [ ] Streaming interruption (stop button)

### 8.2 Bug Fixes

Address any issues found:

- [ ] TypeScript errors fixed
- [ ] Linting issues fixed
- [ ] Accessibility issues fixed
- [ ] Performance issues fixed
- [ ] Edge cases handled

### Deliverables

- [ ] Manual testing checklist complete
- [ ] All critical bugs fixed
- [ ] No TypeScript errors
- [ ] No linting errors

---

## Phase 9: Build & Deploy

**Duration**: 1-2 days
**Outcome**: New chat interface deployed to production

### Phase Boundary: Phase 9 ends when the new interface is live and monitoring shows no issues.

### 9.1 Build Verification

```bash
npm run build
npm run type-check
npm run lint
```

### 9.2 Deployment

Deploy to production using existing deployment pipeline.

### 9.3 Monitoring

- Monitor error rates
- Monitor performance metrics
- Monitor user feedback
- Set up alerts for errors

### 9.4 Rollback Plan

If issues arise, rollback to previous version using standard deployment process.

### Deliverables

- [ ] Build succeeds without errors
- [ ] Type check passes
- [ ] Lint passes
- [ ] Deployed to production
- [ ] Monitoring configured
- [ ] Rollback plan documented

---

## Summary

### Phase Timeline

| Phase | Duration | Focus |
|-------|----------|-------|
| Phase 1 | 1-2 days | Dependencies & Configuration |
| Phase 2 | 2-3 days | Copy UI Components |
| Phase 3 | 2-3 days | Copy Message Components |
| Phase 4 | 3-4 days | Providers & API Integration |
| Phase 5 | 3-4 days | Main Thread Component |
| Phase 6 | 1 day | Delete Legacy Code |
| Phase 7 | 2 days | Polish & Dark Mode |
| Phase 8 | 2-3 days | Testing |
| Phase 9 | 1-2 days | Build & Deploy |

**Total Estimated Duration**: 17-24 working days

### Files Created

```
src/
├── lib/
│   └── utils.ts                 # cn() utility function
├── providers/
│   ├── StreamProvider.tsx       # Chat streaming context
│   └── ThreadProvider.tsx       # Conversation list context
├── components/
│   ├── ui/                      # shadcn-like components (copied)
│   ├── icons/                   # Icon components (copied)
│   └── chat/
│       ├── Thread.tsx           # Main chat component
│       ├── ConversationHistory.tsx  # Sidebar history
│       ├── ConversationHistory.tsx  # Sidebar history
│       ├── markdown-text.tsx    # Markdown rendering
│       ├── syntax-highlighter.tsx   # Code highlighting
│       ├── TooltipIconButton.tsx    # Tooltip button
│       ├── utils.ts             # Message utilities
│       └── messages/
│           ├── human.tsx        # User message
│           ├── ai.tsx           # AI message
│           └── tool-calls.tsx   # Tool call display
```

### Files Deleted

```
src/
├── components/
│   ├── ChatInterface.tsx        # Old custom chat (~1100 lines)
│   └── chat-messages/           # Old message components
│       ├── UserMessage.tsx
│       ├── AssistantMessage.tsx
│       ├── ToolUseMessage.tsx
│       ├── ToolCallMessage.tsx
│       ├── LLMCallMessage.tsx
│       ├── RecollectionsMessage.tsx
│       └── ThinkingMessage.tsx
├── types/
│   └── messageRecord.ts         # Old custom type
└── utils/
    └── traceEventParser.ts      # Old utility
```

### No Legacy Code Principle

This migration follows a strict **no legacy code** policy:
- No type adapters or compatibility layers
- No backward compatibility with old message formats
- No dual implementation periods
- Complete replacement of old implementation
- Full adoption of bernard-chat patterns and LangGraph SDK

The result is a clean, modern chat interface that leverages a well-maintained reference implementation.
