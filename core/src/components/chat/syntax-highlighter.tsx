import { Prism as SyntaxHighlighterPrism } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';

interface CodeBlockProps {
  language: string;
  children: string;
  className?: string;
  style?: any;
  customStyle?: any;
}

export function CodeBlock({ language, children, className }: CodeBlockProps) {
  return (
    <div className={cn("rounded-lg overflow-hidden", className)}>
      <SyntaxHighlighterPrism
        language={language}
        style={vscDarkPlus}
        customStyle={{ margin: 0, padding: '1rem' }}
      >
        {children}
      </SyntaxHighlighterPrism>
    </div>
  );
}
