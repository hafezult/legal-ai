"use client"

import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import type { ComponentPropsWithoutRef, ReactNode } from "react"

const revealEase = [0.22, 1, 0.36, 1] as const

export function Container({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-6 sm:px-8", className)}>
      {children}
    </div>
  )
}

type SectionProps = {
  id?: string
  className?: string
  children: ReactNode
  /** Single whileInView per section when true */
  reveal?: boolean
  contentClassName?: string
} & ComponentPropsWithoutRef<"section">

export function Section({
  id,
  className,
  children,
  reveal = true,
  contentClassName,
  ...sectionProps
}: SectionProps) {
  return (
    <section
      id={id}
      className={cn(
        "relative z-10 bg-black py-section-y-lg text-white",
        className
      )}
      {...sectionProps}
    >
      {reveal ? (
        <motion.div
          className={cn(contentClassName)}
          initial={{ opacity: 0, y: 44 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-12%" }}
          transition={{ duration: 0.95, ease: revealEase }}
        >
          {children}
        </motion.div>
      ) : (
        children
      )}
    </section>
  )
}

export function GlassPanel({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--aether-radius-card)] border border-white/[0.08] bg-white/[0.03] shadow-2xl backdrop-blur-xl",
        className
      )}
    >
      {children}
    </div>
  )
}

