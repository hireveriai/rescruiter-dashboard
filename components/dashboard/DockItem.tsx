"use client";

import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

import DockTooltip from "./DockTooltip";

type DockItemProps = {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  alert?: boolean;
  badge?: number;
  href?: string;
  onClick?: () => void;
};

function formatBadge(value?: number) {
  if (!value || value <= 0) {
    return null;
  }

  return value > 99 ? "99+" : String(value);
}

export default function DockItem({
  icon: Icon,
  label,
  active = false,
  alert = false,
  badge,
  href,
  onClick,
}: DockItemProps) {
  const [hovered, setHovered] = useState(false);
  const badgeLabel = formatBadge(badge);

  const content = (
    <motion.span
      className={[
        "group relative flex h-10 w-10 items-center justify-center rounded-[18px] border transition-colors duration-200 md:h-10 md:w-10 xl:h-11 xl:w-11",
        active
          ? "border-cyan-300/25 bg-cyan-400/14 text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.16)]"
          : "border-transparent bg-transparent text-slate-300",
        alert
          ? "border-rose-300/20 bg-rose-500/9 text-rose-100 shadow-[0_0_22px_rgba(244,63,94,0.14)]"
          : "hover:border-cyan-300/18 hover:bg-cyan-400/9 hover:text-white hover:shadow-[0_0_18px_rgba(34,211,238,0.12)]",
      ].join(" ")}
      whileHover={{ scale: 1.11, x: 5, y: -1 }}
      whileTap={{ scale: 0.96 }}
      transition={{ type: "spring", stiffness: 360, damping: 24 }}
    >
      {active ? (
        <span className="absolute -left-2.5 top-1/2 hidden h-6 w-1 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_14px_rgba(34,211,238,0.85)] md:block" />
      ) : null}

      {alert ? (
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-rose-400 shadow-[0_0_14px_rgba(251,113,133,0.95)]">
          <span className="absolute inset-0 rounded-full bg-rose-400/80 motion-safe:animate-ping" />
        </span>
      ) : null}

      <Icon
        aria-hidden="true"
        strokeWidth={1.8}
        className={[
          "h-[19px] w-[19px] transition duration-200 xl:h-5 xl:w-5",
          hovered ? "drop-shadow-[0_0_10px_rgba(103,232,249,0.42)]" : "",
        ].join(" ")}
      />

      {badgeLabel ? (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-cyan-200/35 bg-cyan-400/20 px-1 text-[10px] font-semibold leading-none text-cyan-50 shadow-[0_0_14px_rgba(34,211,238,0.18)] backdrop-blur-md">
          {badgeLabel}
        </span>
      ) : null}
    </motion.span>
  );

  const commonProps = {
    "aria-label": label,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
    onFocus: () => setHovered(true),
    onBlur: () => setHovered(false),
    className: "relative flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#071226]",
  };

  return (
    <div className="relative">
      {href ? (
        <Link {...commonProps} href={href}>
          {content}
        </Link>
      ) : (
        <button {...commonProps} type="button" onClick={onClick}>
          {content}
        </button>
      )}
      <DockTooltip label={label} open={hovered} />
    </div>
  );
}
