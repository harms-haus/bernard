import * as React from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { useDarkMode } from '../../hooks/useDarkMode';

interface RecollectionItem {
  recollectionId: string;
  conversationId: string;
  chunkIndex: number;
  content: string;
  score: number;
  conversationMetadata?: {
    summary?: string;
    tags?: string[];
    startedAt?: string;
    messageCount?: number;
  };
  messageStartIndex: number;
  messageEndIndex: number;
}

interface RecollectionsMessageProps {
  recollections: RecollectionItem[];
}

export function RecollectionsMessage({ recollections }: RecollectionsMessageProps) {
  const { isDarkMode } = useDarkMode();
  const [isExpanded, setIsExpanded] = React.useState(false);

  const getStyles = () => {
    return {
      container: isDarkMode
        ? 'bg-blue-800/20 border-blue-600/30 text-blue-200'
        : 'bg-blue-50/50 border-blue-300/30 text-blue-700',
      border: 'border-blue-400/20',
      itemContainer: isDarkMode
        ? 'bg-blue-900/10 border-blue-700/20 text-blue-100'
        : 'bg-blue-25/30 border-blue-200/20 text-blue-800'
    };
  };

  const styles = getStyles();

  const handleToggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggleExpanded();
    }
  };


  return (
    <div className={`max-w-xs lg:max-w-md rounded-sm ml-0 px-2 py-1 border ${styles.container} ${styles.border}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        className="flex items-center justify-between cursor-pointer hover:opacity-80"
        onClick={handleToggleExpanded}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center space-x-2 flex-1">
          <Search className="h-3 w-3 flex-shrink-0 opacity-60" />
          <div className="text-xs font-mono break-words flex-1 opacity-75">
            Recollections ({recollections.length})
          </div>
        </div>
        <ChevronDown
          className={`h-3 w-3 ml-2 transition-transform duration-200 flex-shrink-0 opacity-60 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </div>

      {isExpanded && (
        <div className={`mt-3 pt-3 border-t ${styles.border}`}>
          <div className="space-y-2">
            {recollections.map((recollection) => (
              <RecollectionItemComponent
                key={recollection.recollectionId}
                recollection={recollection}
                styles={styles}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface RecollectionItemComponentProps {
  recollection: RecollectionItem;
  styles: any;
}

function RecollectionItemComponent({ recollection, styles }: RecollectionItemComponentProps) {
  const [isItemExpanded, setIsItemExpanded] = React.useState(false);

  const handleToggleItemExpanded = () => {
    setIsItemExpanded(!isItemExpanded);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleToggleItemExpanded();
    }
  };

  const shortenConversationId = (id: string) => {
    if (id.length <= 8) return id;
    return `${id.slice(0, 4)}...${id.slice(-4)}`;
  };

  const formatScore = (score: number) => score.toFixed(3);

  const getContentPreview = (content: string, maxLength = 80) => {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  };

  return (
    <div className={`rounded-sm p-2 border ${styles.itemContainer} ${styles.border}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={isItemExpanded}
        className="flex items-center justify-between cursor-pointer hover:opacity-80"
        onClick={handleToggleItemExpanded}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center space-x-2 flex-1">
          <div className="text-xs font-mono break-words flex-1 opacity-75">
            {shortenConversationId(recollection.conversationId)} • {formatScore(recollection.score)}
          </div>
        </div>
        <ChevronDown
          className={`h-3 w-3 ml-2 transition-transform duration-200 flex-shrink-0 opacity-60 ${
            isItemExpanded ? 'rotate-180' : ''
          }`}
        />
      </div>

      {/* Collapsed preview */}
      {!isItemExpanded && (
        <div className="mt-1 text-xs opacity-70 font-mono">
          {getContentPreview(recollection.content)}
        </div>
      )}

      {/* Expanded content */}
      {isItemExpanded && (
        <div className="mt-3 pt-2 border-t border-current border-opacity-20">
          <div className="space-y-2">
            {/* Full content */}
            <div>
              <div className="text-xs font-medium mb-1 opacity-75">Content:</div>
              <div className="text-sm whitespace-pre-wrap break-words font-mono bg-black/5 dark:bg-white/5 p-2 rounded text-xs">
                {recollection.content}
              </div>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="font-medium opacity-75">Conversation:</span>
                <div className="font-mono">{recollection.conversationId}</div>
              </div>
              <div>
                <span className="font-medium opacity-75">Chunk:</span>
                <div className="font-mono">{recollection.chunkIndex}</div>
              </div>
              <div>
                <span className="font-medium opacity-75">Messages:</span>
                <div className="font-mono">{recollection.messageStartIndex}-{recollection.messageEndIndex}</div>
              </div>
              <div>
                <span className="font-medium opacity-75">Score:</span>
                <div className="font-mono">{formatScore(recollection.score)}</div>
              </div>
            </div>

            {/* Conversation metadata */}
            {recollection.conversationMetadata && (
              <div className="border-t border-current border-opacity-10 pt-2">
                {recollection.conversationMetadata.summary && (
                  <div>
                    <div className="text-xs font-medium mb-1 opacity-75">Summary:</div>
                    <div className="text-xs opacity-80">{recollection.conversationMetadata.summary}</div>
                  </div>
                )}
                {recollection.conversationMetadata.tags && recollection.conversationMetadata.tags.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs font-medium mb-1 opacity-75">Tags:</div>
                    <div className="flex flex-wrap gap-1">
                      {recollection.conversationMetadata.tags.map((tag, tagIndex) => (
                        <span key={tagIndex} className="text-xs bg-current bg-opacity-10 px-1 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {recollection.conversationMetadata.startedAt && (
                  <div className="mt-2 text-xs opacity-70">
                    Started: {new Date(recollection.conversationMetadata.startedAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

