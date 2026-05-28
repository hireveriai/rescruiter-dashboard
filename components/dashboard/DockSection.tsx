"use client";

import { memo, type ReactNode } from "react";

type DockSectionProps = {
  children: ReactNode;
  label: string;
};

function DockSection({ children, label }: DockSectionProps) {
  return (
    <div className="flex items-center gap-1.5 md:flex-col" aria-label={label}>
      <div className="flex items-center gap-1 md:flex-col md:gap-1.5">
        {children}
      </div>
    </div>
  );
}

export default memo(DockSection);
