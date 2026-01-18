import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card';

// ============================================
// TEST SUITE
// ============================================
describe('Card', () => {
  describe('Sub-components', () => {
    it('renders Card', () => {
      render(<Card data-testid="card">Content</Card>);
      expect(screen.getByTestId('card')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('renders CardHeader', () => {
      render(
        <Card>
          <CardHeader data-testid="header">Header</CardHeader>
        </Card>
      );
      expect(screen.getByTestId('header')).toBeInTheDocument();
      expect(screen.getByText('Header')).toBeInTheDocument();
    });

    it('renders CardTitle', () => {
      render(
        <Card>
          <CardTitle data-testid="title">Title</CardTitle>
        </Card>
      );
      expect(screen.getByTestId('title')).toBeInTheDocument();
      expect(screen.getByText('Title')).toBeInTheDocument();
    });

    it('renders CardDescription', () => {
      render(
        <Card>
          <CardDescription data-testid="desc">Description</CardDescription>
        </Card>
      );
      expect(screen.getByTestId('desc')).toBeInTheDocument();
      expect(screen.getByText('Description')).toBeInTheDocument();
    });

    it('renders CardContent', () => {
      render(
        <Card>
          <CardContent data-testid="content">Content</CardContent>
        </Card>
      );
      expect(screen.getByTestId('content')).toBeInTheDocument();
      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('renders CardFooter', () => {
      render(
        <Card>
          <CardFooter data-testid="footer">Footer</CardFooter>
        </Card>
      );
      expect(screen.getByTestId('footer')).toBeInTheDocument();
      expect(screen.getByText('Footer')).toBeInTheDocument();
    });
  });

  describe('Full Card Structure', () => {
    it('renders complete card with all sub-components', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Card Title</CardTitle>
            <CardDescription>Card Description</CardDescription>
          </CardHeader>
          <CardContent>Card Content</CardContent>
          <CardFooter>Card Footer</CardFooter>
        </Card>
      );

      expect(screen.getByText('Card Title')).toBeInTheDocument();
      expect(screen.getByText('Card Description')).toBeInTheDocument();
      expect(screen.getByText('Card Content')).toBeInTheDocument();
      expect(screen.getByText('Card Footer')).toBeInTheDocument();
    });
  });

  describe('Props', () => {
    it('passes through className', () => {
      render(<Card className="custom-class" data-testid="custom-card">Content</Card>);
      expect(screen.getByTestId('custom-card')).toHaveClass('custom-class');
    });

    it('passes through additional props', () => {
      render(
        <Card data-testid="test-card" data-value="test">
          Content
        </Card>
      );
      expect(screen.getByTestId('test-card')).toHaveAttribute('data-value', 'test');
    });
  });

  describe('Structure', () => {
    it('Card has flex-col class', () => {
      render(<Card>Content</Card>);
      expect(screen.getByText('Content')).toHaveClass('flex-col');
    });

    it('Card has gap-6 class', () => {
      render(<Card>Content</Card>);
      expect(screen.getByText('Content')).toHaveClass('gap-6');
    });

    it('Card has rounded-xl class', () => {
      render(<Card>Content</Card>);
      expect(screen.getByText('Content')).toHaveClass('rounded-xl');
    });

    it('CardHeader has flex-col class', () => {
      render(
        <Card>
          <CardHeader>Header</CardHeader>
        </Card>
      );
      expect(screen.getByText('Header')).toHaveClass('flex-col');
    });

    it('CardTitle has leading-none class', () => {
      render(
        <Card>
          <CardTitle>Title</CardTitle>
        </Card>
      );
      expect(screen.getByText('Title')).toHaveClass('leading-none');
    });

    it('CardDescription has text-sm class', () => {
      render(
        <Card>
          <CardDescription>Desc</CardDescription>
        </Card>
      );
      expect(screen.getByText('Desc')).toHaveClass('text-sm');
    });
  });
});
