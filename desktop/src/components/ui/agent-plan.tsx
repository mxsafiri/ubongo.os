import React, { useState } from "react";
import {
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDotDashed,
  CircleX,
} from "lucide-react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";

export interface Subtask {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  tools?: string[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  level: number;
  dependencies: string[];
  subtasks: Subtask[];
}

interface PlanProps {
  tasks: Task[];
  onTaskClick?: (taskId: string) => void;
}

export default function Plan({ tasks: initialTasks, onTaskClick }: PlanProps) {
  const [tasks] = useState<Task[]>(initialTasks);
  const [expandedTasks, setExpandedTasks] = useState<string[]>(
    initialTasks.length > 0 ? [initialTasks[0].id] : []
  );
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<string, boolean>>({});

  const toggleTaskExpansion = (taskId: string) => {
    setExpandedTasks((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId]
    );
  };

  const toggleSubtaskExpansion = (taskId: string, subtaskId: string) => {
    const key = `${taskId}-${subtaskId}`;
    setExpandedSubtasks((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const taskVariants = {
    hidden: { opacity: 0, y: -5 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 500, damping: 30 },
    },
  };

  const subtaskListVariants = {
    hidden: { opacity: 0, height: 0, overflow: "hidden" as const },
    visible: {
      height: "auto",
      opacity: 1,
      overflow: "visible" as const,
      transition: {
        duration: 0.25,
        staggerChildren: 0.05,
        when: "beforeChildren" as const,
        ease: [0.2, 0.65, 0.3, 0.9] as [number, number, number, number],
      },
    },
  };

  const subtaskVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { type: "spring" as const, stiffness: 500, damping: 25 },
    },
  };

  if (tasks.length === 0) return null;

  return (
    <div className="text-slate-200 w-full overflow-auto">
      <motion.div
        className="rounded-xl border border-white/[0.06] bg-white/[0.02] shadow overflow-hidden"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.2, 0.65, 0.3, 0.9] } }}
      >
        <LayoutGroup>
          <div className="p-3 overflow-hidden">
            <ul className="space-y-0.5 overflow-hidden">
              {tasks.map((task, index) => {
                const isExpanded = expandedTasks.includes(task.id);
                const isCompleted = task.status === "completed";
                return (
                  <motion.li
                    key={task.id}
                    className={index !== 0 ? "mt-0.5 pt-1" : ""}
                    initial="hidden"
                    animate="visible"
                    variants={taskVariants}
                  >
                    <motion.div
                      className="group flex items-center px-2 py-1.5 rounded-lg cursor-pointer"
                      whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                      onClick={() => {
                        toggleTaskExpansion(task.id);
                        onTaskClick?.(task.id);
                      }}
                    >
                      <div className="mr-2 flex-shrink-0">
                        <StatusIcon status={task.status} size="h-4 w-4" />
                      </div>
                      <div className="flex min-w-0 flex-grow items-center justify-between">
                        <span className={`text-[12.5px] truncate ${isCompleted ? "text-slate-600 line-through" : "text-slate-300"}`}>
                          {task.title}
                        </span>
                        <div className="flex flex-shrink-0 items-center gap-1.5 ml-2">
                          {task.dependencies.length > 0 && (
                            <div className="flex gap-0.5">
                              {task.dependencies.map((dep, idx) => (
                                <span key={idx} className="bg-white/[0.04] text-slate-500 rounded px-1 py-0.5 text-[9px] font-medium">
                                  {dep}
                                </span>
                              ))}
                            </div>
                          )}
                          <StatusBadge status={task.status} />
                        </div>
                      </div>
                    </motion.div>

                    <AnimatePresence mode="wait">
                      {isExpanded && task.subtasks.length > 0 && (
                        <motion.div
                          className="relative overflow-hidden"
                          variants={subtaskListVariants}
                          initial="hidden"
                          animate="visible"
                          exit="hidden"
                          layout
                        >
                          <div className="absolute top-0 bottom-0 left-[18px] border-l border-dashed border-white/[0.08]" />
                          <ul className="mt-0.5 mr-1 mb-1 ml-3 space-y-0">
                            {task.subtasks.map((subtask) => {
                              const subtaskKey = `${task.id}-${subtask.id}`;
                              const isSubExpanded = expandedSubtasks[subtaskKey];
                              return (
                                <motion.li
                                  key={subtask.id}
                                  className="group flex flex-col py-0.5 pl-5 cursor-pointer"
                                  onClick={() => toggleSubtaskExpansion(task.id, subtask.id)}
                                  variants={subtaskVariants}
                                  layout
                                >
                                  <motion.div
                                    className="flex items-center rounded-md p-1"
                                    whileHover={{ backgroundColor: "rgba(255,255,255,0.03)" }}
                                    layout
                                  >
                                    <div className="mr-1.5 flex-shrink-0">
                                      <StatusIcon status={subtask.status} size="h-3 w-3" />
                                    </div>
                                    <span className={`text-[11px] ${subtask.status === "completed" ? "text-slate-600 line-through" : "text-slate-400"}`}>
                                      {subtask.title}
                                    </span>
                                  </motion.div>
                                  <AnimatePresence mode="wait">
                                    {isSubExpanded && (
                                      <motion.div
                                        className="text-slate-500 border-white/[0.06] mt-0.5 ml-1 border-l border-dashed pl-4 text-[10px] overflow-hidden"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                        layout
                                      >
                                        <p className="py-0.5">{subtask.description}</p>
                                        {subtask.tools && subtask.tools.length > 0 && (
                                          <div className="mt-0.5 mb-1 flex flex-wrap items-center gap-1">
                                            <span className="text-slate-600 font-medium text-[9px]">Tools:</span>
                                            {subtask.tools.map((tool, idx) => (
                                              <span key={idx} className="bg-indigo-500/10 text-indigo-400 rounded px-1 py-0.5 text-[9px]">
                                                {tool}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </motion.div>
                                    )}
                                  </AnimatePresence>
                                </motion.li>
                              );
                            })}
                          </ul>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </LayoutGroup>
      </motion.div>
    </div>
  );
}

function StatusIcon({ status, size }: { status: string; size: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className={`${size} text-emerald-400`} />;
    case "in-progress":
      return <CircleDotDashed className={`${size} text-blue-400`} />;
    case "need-help":
      return <CircleAlert className={`${size} text-amber-400`} />;
    case "failed":
      return <CircleX className={`${size} text-red-400`} />;
    default:
      return <Circle className={`${size} text-slate-600`} />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-emerald-500/10 text-emerald-400",
    "in-progress": "bg-blue-500/10 text-blue-400",
    "need-help": "bg-amber-500/10 text-amber-400",
    failed: "bg-red-500/10 text-red-400",
    pending: "bg-white/[0.04] text-slate-500",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${styles[status] || styles.pending}`}>
      {status}
    </span>
  );
}
