"use client";

import React, { createContext, useContext, ReactNode, useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserRole } from "@/lib/auth/types";

const STORAGE_KEY = "bernard-selected-agent";

export type AgentId = "bernard_agent" | "gertrude_agent";

export interface AgentInfo {
  id: AgentId;
  name: string;
  description: string;
  allowedRoles: UserRole[];
}

const AGENTS: AgentInfo[] = [
  {
    id: "bernard_agent",
    name: "Bernard",
    description: "Full access including home automation and media",
    allowedRoles: ["user", "admin"],
  },
  {
    id: "gertrude_agent",
    name: "Gertrude",
    description: "Guest access with limited tools",
    allowedRoles: ["guest", "admin"],
  },
];

function getStoredAgent(): AgentId {
  if (typeof window === "undefined") return "bernard_agent";
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "bernard_agent" || stored === "gertrude_agent") {
      return stored;
    }
  } catch {
    // Ignore storage errors
  }
  return "bernard_agent";
}

function setStoredAgent(id: AgentId) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Ignore storage errors
  }
}

interface AgentSelectorContextType {
  selectedAgent: AgentId;
  setSelectedAgent: (id: AgentId) => void;
  availableAgents: AgentInfo[];
  getAgentById: (id: AgentId) => AgentInfo | undefined;
}

const AgentSelectorContext = createContext<AgentSelectorContextType | undefined>(undefined);

interface AgentSelectorProviderProps {
  children: ReactNode;
  userRole: UserRole;
}

export function AgentSelectorProvider({ children, userRole }: AgentSelectorProviderProps) {
  const [selectedAgent, setSelectedAgentState] = useState<AgentId>(() => {
    const stored = getStoredAgent();
    // Check if the stored agent is available for this user role
    const agent = AGENTS.find((a) => a.id === stored);
    if (agent && agent.allowedRoles.includes(userRole)) {
      return stored;
    }
    // Otherwise return first available agent
    const firstAvailable = AGENTS.find((a) => a.allowedRoles.includes(userRole));
    // AGENTS is a constant array, so AGENTS[0] always exists
    return firstAvailable?.id ?? (AGENTS[0]?.id as AgentId);
  });

  // Filter agents based on user role
  const availableAgents = useMemo(
    () => AGENTS.filter((agent) => agent.allowedRoles.includes(userRole)),
    [userRole]
  );

  // Initialize selected agent from localStorage when userRole changes
  useEffect(() => {
    const stored = getStoredAgent();
    const agent = AGENTS.find((a) => a.id === stored);

    if (agent && agent.allowedRoles.includes(userRole)) {
      // Stored agent is available for this role
      if (selectedAgent !== stored) {
        setSelectedAgentState(stored);
      }
    } else {
      // Stored agent not available, use first available for this role
      const firstAvailable = AGENTS.find((a) => a.allowedRoles.includes(userRole));
      if (firstAvailable && selectedAgent !== firstAvailable.id) {
        setSelectedAgentState(firstAvailable.id);
        setStoredAgent(firstAvailable.id);
      }
    }
  }, [userRole]); // Only depend on userRole, not selectedAgent

  // Update selected agent if current is no longer available (e.g., role changed)
  useEffect(() => {
    const isCurrentAvailable = availableAgents.some((a) => a.id === selectedAgent);
    if (!isCurrentAvailable && availableAgents.length > 0) {
      setSelectedAgentState(availableAgents[0].id);
      setStoredAgent(availableAgents[0].id);
    }
  }, [availableAgents, selectedAgent]);

  const setSelectedAgent = (id: AgentId) => {
    setSelectedAgentState(id);
    setStoredAgent(id);
  };

  const getAgentById = (id: AgentId) => AGENTS.find((a) => a.id === id);

  return (
    <AgentSelectorContext.Provider
      value={{ selectedAgent, setSelectedAgent, availableAgents, getAgentById }}
    >
      {children}
    </AgentSelectorContext.Provider>
  );
}

export const useAgentSelector = (): AgentSelectorContextType => {
  const context = useContext(AgentSelectorContext);
  if (context === undefined) {
    throw new Error("useAgentSelector must be used within an AgentSelectorProvider");
  }
  return context;
};

interface AgentSelectorButtonProps {
  className?: string;
}

export function AgentSelectorButton({ className }: AgentSelectorButtonProps) {
  const { selectedAgent, availableAgents, setSelectedAgent } = useAgentSelector();

  const currentAgent = availableAgents.find((a) => a.id === selectedAgent);

  if (!currentAgent || availableAgents.length <= 1) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className={className}>
          <span className="font-medium">{currentAgent.name}</span>
          <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {availableAgents.map((agent) => (
          <DropdownMenuItem
            key={agent.id}
            onClick={() => setSelectedAgent(agent.id)}
            className="flex flex-col items-start gap-1"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{agent.name}</span>
              {agent.id === selectedAgent && (
                <span className="text-xs text-muted-foreground">(Active)</span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">{agent.description}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default AgentSelectorContext;
