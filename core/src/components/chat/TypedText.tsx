import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';

interface TypedTextProps {
  text: string;
  speed?: number;
  className?: string;
}

export function TypedText({ text, speed = 100, className }: TypedTextProps) {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const prevTextRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevTextRef.current === null) {
      prevTextRef.current = text;
      setDisplayText(text);
      setIsComplete(true);
      return;
    }

    if (prevTextRef.current === text) {
      setDisplayText(text);
      setIsComplete(true);
      return;
    }

    prevTextRef.current = text;
    setIsComplete(false);
    setDisplayText('');

    const totalLength = text.length;
    if (totalLength === 0) {
      setDisplayText('');
      setIsComplete(true);
      return;
    }

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < totalLength) {
        currentIndex++;
        setDisplayText(text.slice(0, currentIndex));
      } else {
        setIsComplete(true);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <motion.span
      className={className}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {displayText}
      {!isComplete && (
        <motion.span
          className="inline-block w-1.5 h-3.5 bg-foreground ml-0.5"
          initial={{ opacity: 1 }}
          animate={{ opacity: [1, 0, 1] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      )}
    </motion.span>
  );
}
