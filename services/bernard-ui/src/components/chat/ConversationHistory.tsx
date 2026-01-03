import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';
import { Sheet, SheetContent } from '../ui/sheet';
import { useThreads } from '../../providers/ThreadProvider';
import { PanelRightOpen, PanelRight, Plus } from 'lucide-react';

export function ConversationHistory({ 
  open, 
  onOpenChange 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const threadId = searchParams.get('threadId');
  const { threads, threadsLoading, getThreads } = useThreads();

  useEffect(() => {
    getThreads();
  }, [getThreads]);

  const handleThreadClick = (id: string) => {
    setSearchParams({ threadId: id });
  };

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
            {open ? <PanelRight className="size-5" /> : <PanelRightOpen className="size-5" />}
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">Chat History</h1>
        </div>
        
        {threadsLoading ? (
          <ThreadHistoryLoading />
        ) : (
          <ThreadList 
            threads={threads} 
            activeId={threadId || null}
            onThreadClick={handleThreadClick}
          />
        )}
      </motion.div>

      {/* Mobile Sheet */}
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="left" className="lg:hidden flex p-0">
          <div className="flex flex-col w-full h-full">
            <div className="flex items-center justify-between p-4 border-b">
              <h1 className="text-xl font-semibold tracking-tight">Chat History</h1>
            </div>
            {threadsLoading ? (
              <ThreadHistoryLoading />
            ) : (
              <ThreadList 
                threads={threads}
                activeId={threadId || null}
                onThreadClick={(id) => {
                  handleThreadClick(id);
                  onOpenChange(false);
                }}
              />
            )}
          </div>
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
    <div className="h-full flex flex-col w-full gap-2 items-start justify-start overflow-y-auto px-2 py-2">
      <Button
        variant="ghost"
        className="w-full justify-start"
        onClick={() => {
          const newId = `thread_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
          onThreadClick(newId);
        }}
      >
        <Plus className="mr-2 h-4 w-4" />
        New Chat
      </Button>
      {threads.map((t) => (
        <Button
          key={t.id}
          variant={activeId === t.id ? 'secondary' : 'ghost'}
          className="text-left items-start justify-start font-normal w-full truncate"
          onClick={() => onThreadClick(t.id)}
        >
          <span className="truncate">{t.name || `Thread ${t.id.slice(0, 8)}`}</span>
        </Button>
      ))}
      {threads.length === 0 && (
        <p className="text-muted-foreground text-sm p-4">No threads yet</p>
      )}
    </div>
  );
}

function ThreadHistoryLoading() {
  return (
    <div className="h-full flex flex-col w-full gap-2 items-start justify-start overflow-y-auto px-2 py-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="w-full h-10" />
      ))}
    </div>
  );
}
