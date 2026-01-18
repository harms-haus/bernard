import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Badge } from './badge';

// ============================================
// TEST SUITE
// ============================================
describe('Badge', () => {
  describe('Variants', () => {
    it('renders default variant', () => {
      render(<Badge variant="default">Default</Badge>);
      expect(screen.getByText('Default')).toBeInTheDocument();
    });

    it('renders secondary variant', () => {
      render(<Badge variant="secondary">Secondary</Badge>);
      expect(screen.getByText('Secondary')).toBeInTheDocument();
    });

    it('renders destructive variant', () => {
      render(<Badge variant="destructive">Destructive</Badge>);
      expect(screen.getByText('Destructive')).toBeInTheDocument();
    });

    it('renders outline variant', () => {
      render(<Badge variant="outline">Outline</Badge>);
      expect(screen.getByText('Outline')).toBeInTheDocument();
    });

    it('defaults to default variant when no variant specified', () => {
      render(<Badge>Default</Badge>);
      expect(screen.getByText('Default')).toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('passes through className', () => {
      render(<Badge className="custom-class" data-testid="custom-badge">Badge</Badge>);
      expect(screen.getByTestId('custom-badge')).toHaveClass('custom-class');
    });

    it('passes through additional props', () => {
      render(
        <Badge data-testid="test-badge" data-value="test">
          Badge
        </Badge>
      );
      expect(screen.getByTestId('test-badge')).toHaveAttribute('data-value', 'test');
    });

    it('renders children', () => {
      render(<Badge>Content</Badge>);
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('renders number content', () => {
      render(<Badge>5</Badge>);
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  describe('Structure', () => {
    it('is inline-flex', () => {
      render(<Badge>Badge</Badge>);
      expect(screen.getByText('Badge')).toHaveClass('inline-flex');
    });

    it('has rounded-full class', () => {
      render(<Badge>Badge</Badge>);
      expect(screen.getByText('Badge')).toHaveClass('rounded-full');
    });

    it('has border class for outline variant', () => {
      render(<Badge variant="outline">Badge</Badge>);
      expect(screen.getByText('Badge')).toHaveClass('border');
    });
  });
});
