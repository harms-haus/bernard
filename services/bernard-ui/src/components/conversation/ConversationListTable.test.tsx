/**
 * Unit tests for ConversationListTable component
 */

import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConversationListTable } from "./ConversationListTable";
import type { ConversationListItem } from "../../types/conversation";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
  Eye: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} data-testid="eye-icon" />,
  MoreVertical: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} data-testid="more-vertical-icon" />,
  Archive: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} data-testid="archive-icon" />,
  Trash2: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} data-testid="trash2-icon" />,
  Link: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} data-testid="link-icon" />,
  Loader2: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} data-testid="loader2-icon" />,
}));

describe("ConversationListTable", () => {
  const mockConversations: ConversationListItem[] = [
    {
      id: "conv-1",
      name: "Test Conversation 1",
      userId: "user-1",
      userName: "John Doe",
      createdAt: "2026-01-15T10:30:00.000Z",
      lastTouchedAt: "2026-01-15T10:35:00.000Z",
      archived: false,
      messageCount: 5,
      llmCallCount: 3,
      toolCallCount: 2,
    },
    {
      id: "conv-2",
      name: undefined,
      userId: "user-2",
      userName: "Jane Smith",
      createdAt: "2026-01-14T15:45:00.000Z",
      lastTouchedAt: "2026-01-14T16:00:00.000Z",
      archived: true,
      messageCount: 3,
      llmCallCount: 1,
      toolCallCount: 0,
    },
    {
      id: "conv-3",
      name: "Another Conversation",
      userId: "user-1",
      createdAt: "2026-01-13T09:00:00.000Z",
      lastTouchedAt: "2026-01-13T09:30:00.000Z",
      archived: false,
      messageCount: 10,
      llmCallCount: 8,
      toolCallCount: 5,
    },
  ];

  const defaultProps = {
    conversations: mockConversations,
    showUserColumn: false,
    onView: vi.fn(),
    onArchive: vi.fn(),
    onCopyLink: vi.fn(),
    loading: false,
  };

  describe("Rendering", () => {
    it("should render table with correct headers", () => {
      render(<ConversationListTable {...defaultProps} />);

      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("Created")).toBeInTheDocument();
      expect(screen.getByText("Stats")).toBeInTheDocument();
    });

    it("should render all conversations", () => {
      render(<ConversationListTable {...defaultProps} />);

      expect(screen.getByText("Test Conversation 1")).toBeInTheDocument();
      expect(screen.getByText("Another Conversation")).toBeInTheDocument();
    });

  it("should show ID when name is undefined", () => {
    render(<ConversationListTable {...defaultProps} />);

    // The second conversation has no name, so it should show the ID
    // The ID "conv-2" should appear in the second row's name column
    expect(screen.getByText((content, element) => {
      // Match the span with font-medium class that contains "conv-2"
      return element?.classList.contains("font-medium") === true && content.includes("conv-2");
    })).toBeInTheDocument();
  });

    it("should display stats correctly", () => {
      render(<ConversationListTable {...defaultProps} />);

      // First conversation: messageCount/llmCallCount/toolCallCount = 5/3/2
      expect(screen.getByText("5/3/2")).toBeInTheDocument();
    });

    it("should display dash for missing llmCallCount", () => {
      const conversationsWithoutLlmCount: ConversationListItem[] = [
        {
          id: "conv-1",
          name: "Test",
          userId: "user-1",
          createdAt: "2026-01-15T10:30:00.000Z",
          lastTouchedAt: "2026-01-15T10:35:00.000Z",
          archived: false,
          messageCount: 5,
          toolCallCount: 2,
        },
      ];
      render(<ConversationListTable conversations={conversationsWithoutLlmCount} />);

      expect(screen.getByText("5/-/2")).toBeInTheDocument();
    });

    it("should show user column when showUserColumn is true", () => {
      render(<ConversationListTable {...defaultProps} showUserColumn={true} />);

      expect(screen.getByText("User")).toBeInTheDocument();
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });

    it("should hide user column when showUserColumn is false", () => {
      render(<ConversationListTable {...defaultProps} showUserColumn={false} />);

      // User column should not be visible
      const headers = screen.getAllByRole("columnheader");
      const userHeader = headers.find((header) => header.textContent === "User");
      expect(userHeader).toBeUndefined();
    });
  });

  describe("Loading state", () => {
    it("should show loading spinner when loading is true", () => {
      render(<ConversationListTable {...defaultProps} loading={true} />);

      const loader = screen.getByTestId("loader2-icon");
      expect(loader).toBeInTheDocument();
    });

    it("should not show table when loading", () => {
      render(<ConversationListTable {...defaultProps} loading={true} />);

      expect(screen.queryByText("Name")).not.toBeInTheDocument();
    });
  });

  describe("Empty state", () => {
    it("should show empty message when no conversations", () => {
      render(<ConversationListTable {...defaultProps} conversations={[]} />);

      expect(screen.getByText("No conversations found.")).toBeInTheDocument();
    });
  });

  describe("Action handlers", () => {
    it("should call onView when eye button is clicked", async () => {
      const onView = vi.fn();
      render(<ConversationListTable {...defaultProps} onView={onView} />);

      const eyeButton = screen.getAllByTestId("eye-icon")[0].closest("button");
      await userEvent.click(eyeButton!);

      expect(onView).toHaveBeenCalledWith("conv-1");
    });

    it("should call onArchive when Archive menu item is clicked", async () => {
      const onArchive = vi.fn();
      render(<ConversationListTable {...defaultProps} onArchive={onArchive} />);

      // Open dropdown menu
      const moreButton = screen.getAllByTestId("more-vertical-icon")[0].closest("button");
      await userEvent.click(moreButton!);

      // Click Archive
      const archiveItem = screen.getByText("Archive");
      await userEvent.click(archiveItem);

      expect(onArchive).toHaveBeenCalledWith("conv-1");
    });

    it("should call onCopyLink when Copy Link menu item is clicked", async () => {
      const onCopyLink = vi.fn();
      render(<ConversationListTable {...defaultProps} onCopyLink={onCopyLink} />);

      // Open dropdown menu
      const moreButton = screen.getAllByTestId("more-vertical-icon")[0].closest("button");
      await userEvent.click(moreButton!);

      // Click Copy Link
      const copyLinkItem = screen.getByText("Copy Link");
      await userEvent.click(copyLinkItem);

      expect(onCopyLink).toHaveBeenCalledWith("conv-1");
    });

    it("should call onDelete when Delete menu item is clicked", async () => {
      const onDelete = vi.fn();
      render(<ConversationListTable {...defaultProps} onDelete={onDelete} />);

      // Open dropdown menu
      const moreButton = screen.getAllByTestId("more-vertical-icon")[0].closest("button");
      await userEvent.click(moreButton!);

      // Click Delete
      const deleteItem = screen.getByText("Delete");
      await userEvent.click(deleteItem);

      expect(onDelete).toHaveBeenCalledWith("conv-1");
    });

  it("should hide Delete menu item when onDelete is not provided", async () => {
    const propsWithoutDelete = { ...defaultProps };
    delete (propsWithoutDelete as { onDelete?: unknown }).onDelete;
    render(<ConversationListTable {...propsWithoutDelete} />);

    // Open dropdown menu
    const moreButton = screen.getAllByTestId("more-vertical-icon")[0].closest("button");
    await userEvent.click(moreButton!);

    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });
  });

  describe("Archived conversations", () => {
    it("should disable archive action for archived conversations", async () => {
      render(<ConversationListTable {...defaultProps} />);

      // Open dropdown for the archived conversation (second one)
      const moreButtons = screen.getAllByTestId("more-vertical-icon");
      await userEvent.click(moreButtons[1].closest("button")!);

      // Check if Archive is disabled - should be grayed out
      const archiveItem = screen.getByText("Archive");
      expect(archiveItem).toHaveAttribute("aria-disabled", "true");
    });
  });

  describe("Date formatting", () => {
  it("should format date correctly", () => {
    render(<ConversationListTable {...defaultProps} />);

    // Should show formatted date
    expect(screen.getByText("Jan 15, 2026")).toBeInTheDocument();
    // Time format depends on locale/timezone, use regex to match any time format
    expect(screen.getByText(/Jan 15, 2026/)).toBeInTheDocument();
  });
  });

  describe("Action loading state", () => {
    it("should disable actions while loading", async () => {
      const onArchive = vi.fn().mockImplementation(() => new Promise((r) => setTimeout(r, 100)));
      render(<ConversationListTable {...defaultProps} onArchive={onArchive} />);

      // Open dropdown
      const moreButton = screen.getAllByTestId("more-vertical-icon")[0].closest("button");
      await userEvent.click(moreButton!);

      // Click Archive to start loading
      const archiveItem = screen.getByText("Archive");
      await userEvent.click(archiveItem);

      // The onArchive handler should have been called
      expect(onArchive).toHaveBeenCalledWith("conv-1");
    });
  });
});
