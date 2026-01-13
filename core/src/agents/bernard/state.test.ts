/**
 * Tests for Bernard agent state management.
 */

import { describe, it, expect } from 'vitest';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { messagesStateReducer } from '@langchain/langgraph';
import {
  BernardStateAnnotation,
  type BernardState,
} from './state';

describe('BernardStateAnnotation', () => {
  describe('structure', () => {
    it('should be an Annotation.Root instance', () => {
      expect(BernardStateAnnotation).toBeDefined();
      expect(typeof BernardStateAnnotation).toBe('object');
    });

    it('should have messages field in spec', () => {
      expect(BernardStateAnnotation.spec).toHaveProperty('messages');
      expect(BernardStateAnnotation.spec.messages).toBeDefined();
    });
  });

  describe('BernardState type', () => {
    it('should define State with messages field', () => {
      const state: BernardState = {
        messages: [],
      };
      expect(state).toBeDefined();
      expect(state.messages).toBeInstanceOf(Array);
    });

    it('should allow messages array with BaseMessage items', () => {
      const mockMessage = new HumanMessage({ content: 'test' });

      const state: BernardState = {
        messages: [mockMessage],
      };

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toBe(mockMessage);
    });

    it('should allow empty messages array', () => {
      const state: BernardState = {
        messages: [],
      };

      expect(state.messages).toHaveLength(0);
    });

    it('should allow multiple messages', () => {
      const mockMessage1 = new HumanMessage({ content: 'test1' });
      const mockMessage2 = new AIMessage({ content: 'test2' });

      const state: BernardState = {
        messages: [mockMessage1, mockMessage2],
      };

      expect(state.messages).toHaveLength(2);
    });
  });

  describe('reducer behavior', () => {
    it('should use messagesStateReducer for combining messages', () => {
      expect(messagesStateReducer).toBeDefined();
      expect(typeof messagesStateReducer).toBe('function');
    });

    it('should append new messages to existing state', () => {
      const existingMessages: BaseMessage[] = [
        new HumanMessage({ content: 'hello' }),
      ];

      const newMessages: BaseMessage[] = [
        new AIMessage({ content: 'world' }),
      ];

      const result = messagesStateReducer(existingMessages, newMessages);

      expect(result).toHaveLength(2);
    });

    it('should return new messages when no existing messages', () => {
      const newMessages: BaseMessage[] = [
        new HumanMessage({ content: 'hello' }),
      ];

      const result = messagesStateReducer([], newMessages);

      expect(result).toHaveLength(1);
    });

    it('should handle multiple message appends', () => {
      const existingMessages: BaseMessage[] = [
        new HumanMessage({ content: 'first' }),
      ];

      const result1 = messagesStateReducer(existingMessages, [
        new AIMessage({ content: 'second' }),
      ]);

      const result2 = messagesStateReducer(result1, [
        new HumanMessage({ content: 'third' }),
      ]);

      expect(result2).toHaveLength(3);
    });
  });

  describe('state serialization', () => {
    it('should be JSON serializable', () => {
      const state: BernardState = {
        messages: [],
      };

      const json = JSON.stringify(state);
      expect(typeof json).toBe('string');
    });

    it('should be JSON deserializable to same structure', () => {
      const originalState: BernardState = {
        messages: [],
      };

      const json = JSON.stringify(originalState);
      const parsedState = JSON.parse(json) as BernardState;

      expect(parsedState.messages).toEqual(originalState.messages);
    });
  });
});
