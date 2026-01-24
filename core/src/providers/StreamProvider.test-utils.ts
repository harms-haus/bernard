// Test-only utilities for StreamProvider
// This file should only be imported in test files

import { createContext } from 'react';
import { type Mock } from 'vitest';
import { type Message } from '@langchain/langgraph-sdk';
import { type ToolProgressEvent } from './StreamProvider';

export type TestStreamContextType = {
  messages: Message[];
  isLoading: boolean;
  submit: Mock;
  stop: Mock;
  error: string | null;
  latestProgress: ToolProgressEvent | null;
  resetProgress: Mock;
  getMessagesMetadata: Mock;
  setBranch: Mock;
};

export const TestStreamContext = createContext<TestStreamContextType | undefined>(undefined);
