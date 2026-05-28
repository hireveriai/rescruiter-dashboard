"use client";

import { AnimatePresence, motion } from "framer-motion";

type DockTooltipProps = {
  label: string;
  open: boolean;
};

export default function DockTooltip({ label, open }: DockTooltipProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.span
          initial={{ opacity: 0, x: -4, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -4, scale: 0.96 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="pointer-events-none absolute left-[calc(100%+14px)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-xl border border-cyan-400/15 bg-[#071226]/90 px-3 py-2 text-xs font-medium text-cyan-50 shadow-[0_18px_40px_rgba(2,6,23,0.45)] backdrop-blur-xl md:block"
          role="tooltip"
        >
          {label}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}
