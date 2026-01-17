import { StructuredTool } from "@langchain/core/tools";
import type { UserRole } from "@/lib/auth/types";

export type ToolFactoryResult = {
  ok: true;
  tool: StructuredTool;
} | {
  ok: false;
  name: string;
  reason: string;
};

export type ToolFactory = () => Promise<ToolFactoryResult>;

export interface DisabledTool {
  name: string;
  reason?: string | undefined;
}

/**
 * Context passed to tool factories to enable role-based behavior.
 * For example, guests get mock Home Assistant tools instead of real ones.
 */
export type ToolContext = {
  userRole?: UserRole;
};