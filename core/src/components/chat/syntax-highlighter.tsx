import { Prism as SyntaxHighlighterPrism } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ghcolors } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';
import { useDarkMode } from '@/hooks/useDarkMode';

interface CodeBlockProps {
  language: string;
  children: string;
  className?: string;
  style?: any;
  customStyle?: any;
}

export function CodeBlock({ language, children, className }: CodeBlockProps) {
  const { isDarkMode } = useDarkMode();
  
  return (
    <div className={cn("rounded-lg overflow-hidden", className)}>
      <SyntaxHighlighterPrism
        language={language}
        style={isDarkMode ? vscDarkPlus : ghcolors}
        customStyle={{ margin: 0, padding: '1rem' }}
      >
        {children}
      </SyntaxHighlighterPrism>
    </div>
  );
}
