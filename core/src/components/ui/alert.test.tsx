import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Alert, AlertTitle, AlertDescription } from './alert';

// ============================================
// TEST SUITE
// ============================================
describe('Alert', () => {
  describe('Variants', () => {
    it('renders default variant', () => {
      render(
        <Alert variant="default">
          <AlertTitle>Title</AlertTitle>
          <AlertDescription>Description</AlertDescription>
        </Alert>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
    });

    it('renders destructive variant', () => {
      render(
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Something went wrong</AlertDescription>
        </Alert>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('defaults to default variant when no variant specified', () => {
      render(
        <Alert>
          <AlertTitle>Title</AlertTitle>
        </Alert>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  describe('Sub-components', () => {
    it('renders AlertTitle', () => {
      render(
        <Alert>
          <AlertTitle data-testid="alert-title">Test Title</AlertTitle>
        </Alert>
      );

      expect(screen.getByTestId('alert-title')).toBeInTheDocument();
      expect(screen.getByText('Test Title')).toBeInTheDocument();
    });

    it('renders AlertDescription', () => {
      render(
        <Alert>
          <AlertDescription data-testid="alert-desc">Test Description</AlertDescription>
        </Alert>
      );

      expect(screen.getByTestId('alert-desc')).toBeInTheDocument();
      expect(screen.getByText('Test Description')).toBeInTheDocument();
    });

    it('renders without description', () => {
      render(
        <Alert>
          <AlertTitle>Title Only</AlertTitle>
        </Alert>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Title Only')).toBeInTheDocument();
    });

    it('renders without title', () => {
      render(
        <Alert>
          <AlertDescription>Description only</AlertDescription>
        </Alert>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Description only')).toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('passes through className', () => {
      render(
        <Alert className="custom-class" data-testid="custom-alert">
          <AlertTitle>Title</AlertTitle>
        </Alert>
      );

      expect(screen.getByTestId('custom-alert')).toHaveClass('custom-class');
    });

    it('passes through additional props', () => {
      render(
        <Alert data-testid="test-alert" data-custom="value">
          <AlertTitle>Title</AlertTitle>
        </Alert>
      );

      expect(screen.getByTestId('test-alert')).toHaveAttribute('data-custom', 'value');
    });
  });

  describe('Structure', () => {
    it('has correct role attribute', () => {
      render(
        <Alert>
          <AlertTitle>Title</AlertTitle>
        </Alert>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    it('renders nested children', () => {
      render(
        <Alert>
          <div data-testid="nested-child">
            <AlertTitle>Title</AlertTitle>
            <AlertDescription>Description</AlertDescription>
          </div>
        </Alert>
      );

      expect(screen.getByTestId('nested-child')).toBeInTheDocument();
    });
  });
});
