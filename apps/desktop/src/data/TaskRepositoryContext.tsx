import { createContext, useContext, type ReactNode } from "react";
import {
  createTaskRepository,
  type TaskRepository,
} from "./taskRepository";

const defaultRepository = createTaskRepository();
const TaskRepositoryContext = createContext<TaskRepository>(defaultRepository);

interface TaskRepositoryProviderProps {
  children: ReactNode;
  repository?: TaskRepository;
}

export function TaskRepositoryProvider({
  children,
  repository = defaultRepository,
}: TaskRepositoryProviderProps) {
  return (
    <TaskRepositoryContext.Provider value={repository}>
      {children}
    </TaskRepositoryContext.Provider>
  );
}

export function useTaskRepository() {
  return useContext(TaskRepositoryContext);
}
