import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import About from './page';

vi.mock('@/components/dynamic-sidebar/configs', () => ({
  UserSidebarConfig: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="user-sidebar-config">{children}</div>
  ),
}));

describe('About Page', () => {
  it('should render page title', () => {
    render(<About />);

    expect(screen.getByText(/About Bernard/i)).toBeInTheDocument();
    expect(screen.getByText(/Technology stack and project information/i)).toBeInTheDocument();
  });

  it('should render Frontend card', () => {
    render(<About />);

    expect(screen.getByText(/Frontend/i)).toBeInTheDocument();
    expect(screen.getByText(/React/i)).toBeInTheDocument();
    expect(screen.getByText(/Next\.js/i)).toBeInTheDocument();
  });

  it('should render UI Components card', () => {
    render(<About />);

    expect(screen.getByText(/UI Components/i)).toBeInTheDocument();
    expect(screen.getByText(/Radix-UI/i)).toBeInTheDocument();
    expect(screen.getByText(/Shadcn\/ui/i)).toBeInTheDocument();
  });

  it('should render Backend Services card', () => {
    render(<About />);

    expect(screen.getByText(/Backend Services/i)).toBeInTheDocument();
    expect(screen.getByText(/LangGraph agent/i)).toBeInTheDocument();
    expect(screen.getByText(/Whisper\.cpp/i)).toBeInTheDocument();
    expect(screen.getByText(/Kokoro/i)).toBeInTheDocument();
  });

  it('should render Features card', () => {
    render(<About />);

    expect(screen.getByText(/Features/i)).toBeInTheDocument();
    expect(screen.getByText(/AI-powered conversations/i)).toBeInTheDocument();
  });

  it('should wrap content in UserSidebarConfig', () => {
    render(<About />);

    expect(screen.getByTestId('user-sidebar-config')).toBeInTheDocument();
  });
});
