"use client";

import { memo } from "react";
import { AnimatePresence, motion } from "framer-motion";

type DockTooltipProps = {
  label: string;
  open: boolean;
};

function DockTooltip({ label, open }: DockTooltipProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.span
          initial={{ opacity: 0, x: -5, scale: 0.98 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: -5, scale: 0.98 }}
          transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none absolute left-[calc(100%+12px)] top-1/2 hidden -translate-y-1/2 whitespace-nowrap rounded-xl border border-cyan-300/15 bg-[#081120]/88 px-3 py-2 text-xs font-medium text-cyan-50 shadow-[0_18px_42px_rgba(2,6,23,0.44),0_0_18px_rgba(34,211,238,0.08)] backdrop-blur-2xl md:block"
          role="tooltip"
        >
          {label}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

export default memo(DockTooltip);
