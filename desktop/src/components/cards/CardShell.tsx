import { motion } from "motion/react";
import { cn } from "@/lib/utils";

interface CardShellProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  delay?: number;
}

export function CardShell({ children, className, onClick, delay = 0 }: CardShellProps) {
  return (
    <motion.div
      className={cn(
        "bg-white/[0.03] border border-white/[0.06] rounded-xl p-3.5",
        "transition-colors duration-200",
        onClick && "cursor-pointer hover:bg-white/[0.06] hover:border-white/[0.1]",
        className
      )}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.25, ease: [0.2, 0.65, 0.3, 0.9] }}
      onClick={onClick}
    >
      {children}
    </motion.div>
  );
}
