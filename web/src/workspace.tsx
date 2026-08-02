import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { type WorkspaceDefinition } from "./api.js";
import { useResource } from "./hooks.js";

interface WorkspaceContextValue {
  workspaces: WorkspaceDefinition[];
  selectedWorkspaceId: string | null;
  selectWorkspace(id: string): void;
  reload(): Promise<void>;
  loading: boolean;
  error: string | null;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const resource = useResource<{ workspaces: WorkspaceDefinition[] }>("/api/workspaces");
  const workspaces = useMemo(() => resource.data?.workspaces ?? [], [resource.data]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    () => window.localStorage.getItem("agent-workbench-workspace"),
  );
  useEffect(() => {
    if (workspaces.length === 0) return;
    if (!selectedWorkspaceId || !workspaces.some(({ id }) => id === selectedWorkspaceId)) {
      setSelectedWorkspaceId(workspaces.find(({ builtIn }) => builtIn)?.id ?? workspaces[0]!.id);
    }
  }, [selectedWorkspaceId, workspaces]);
  function selectWorkspace(id: string) {
    setSelectedWorkspaceId(id);
    window.localStorage.setItem("agent-workbench-workspace", id);
  }
  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      selectedWorkspaceId,
      selectWorkspace,
      reload: resource.reload,
      loading: resource.loading,
      error: resource.error,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider is missing.");
  return value;
}
