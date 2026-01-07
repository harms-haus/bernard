import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStreamContext } from '../../../providers/StreamProvider';
import { cn } from '../../../lib/utils';

function PulsingIndicator() {
  return (
    <div className="flex gap-0.5 items-center">
      <div className="w-1 h-1 rounded-full bg-primary/40 animate-[pulse_1s_ease-in-out_infinite]" />
      <div className="w-1 h-1 rounded-full bg-primary/40 animate-[pulse_1s_ease-in-out_0.2s_infinite]" />
      <div className="w-1 h-1 rounded-full bg-primary/40 animate-[pulse_1s_ease-in-out_0.4s_infinite]" />
    </div>
  );
}

export function ProgressIndicator() {
  const stream = useStreamContext();
  const [visibleProgress, setVisibleProgress] = useState<string | null>(null);

  // Sync with the latest progress from the stream context
  useEffect(() => {
    setVisibleProgress(stream.latestProgress?.message ?? null);
  }, [stream.latestProgress]);

  // Reset progress when loading completes (real message arrives)
  useEffect(() => {
    if (!stream.isLoading) {
      setVisibleProgress(null);
    }
  }, [stream.isLoading]);

  return (
    <AnimatePresence mode="wait">
      {visibleProgress ? (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="flex items-start mr-auto gap-2"
        >
          <div
            className={cn(
              "flex items-center gap-2 rounded-2xl",
              "bg-muted/80 px-4 py-2 h-8",
              "text-sm text-muted-foreground",
              "border border-muted-foreground/10"
            )}
          >
            <PulsingIndicator />
            {/* Progress message */}
            <span className="truncate max-w-[200px] sm:max-w-[300px]">{visibleProgress}</span>
          </div>
        </motion.div>
      ): (
        <PulsingIndicator />
      )}
    </AnimatePresence>
  );
}
