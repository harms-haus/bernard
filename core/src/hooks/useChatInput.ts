import { useState, useCallback, KeyboardEvent } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import { v4 as uuidv4 } from 'uuid';

interface UseChatInputOptions {
  onSubmit: (message: Message) => void;
  isLoading: boolean;
  uuidGenerator?: () => string;
}

interface UseChatInputResult {
  input: string;
  setInput: (value: string) => void;
  handleSubmit: (e?: React.FormEvent) => void;
  handleKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  canSubmit: boolean;
}

export function useChatInput({
  onSubmit,
  isLoading,
  uuidGenerator = () => uuidv4(),
}: UseChatInputOptions): UseChatInputResult {
  const [input, setInput] = useState('');

  const canSubmit = input.trim().length > 0 && !isLoading;

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;

    const newMessage: Message = {
      id: uuidGenerator(),
      type: 'human',
      content: input.trim(),
    };

    onSubmit(newMessage);
    setInput('');
  }, [input, canSubmit, onSubmit, uuidGenerator]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }, []);

  return {
    input,
    setInput,
    handleSubmit,
    handleKeyDown,
    canSubmit,
  };
}
