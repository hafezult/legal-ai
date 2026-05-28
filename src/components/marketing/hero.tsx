"use client"

import { motion } from "framer-motion"
import Link from "next/link"

import { Button } from "@/components/ui/button"

const ease = [0.22, 1, 0.36, 1] as const

const childFade = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 1.05, ease },
  },
}

export function Hero() {
  return (
    <section className="relative z-10 flex h-screen flex-col items-center justify-center overflow-hidden px-8 text-center">
      {/* Background video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className="absolute inset-0 h-screen w-full object-cover brightness-[0.82] contrast-[1.02]"
      >
        <source src="/videos/hero.mp4" type="video/mp4" />
      </video>

      {/* Base grade + readability */}
      <div className="absolute inset-0 h-screen bg-black/[0.58]" />
      <div className="absolute inset-0 h-screen bg-[radial-gradient(circle_at_50%_18%,rgba(255,255,255,0.06),transparent_52%)]" />
      <div
        className="absolute inset-0 h-screen opacity-95"
        style={{ background: "var(--aether-hero-scrim)" }}
      />

      {/* Film grain — near-invisible */}
      <div
        className="pointer-events-none absolute inset-0 h-screen mix-blend-overlay aether-grain"
        aria-hidden
      />

      {/* Ambient depth (hero-scoped) */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_92%_65%_at_50%_34%,rgba(255,255,255,0.038),transparent_70%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/[0.48]" />

        <motion.div
          className="absolute -left-[18%] top-[20%] h-[min(85vw,28rem)] w-[min(85vw,28rem)] rounded-full bg-white/[0.038] blur-[112px]"
          animate={{
            x: [0, 18, 6, 0],
            y: [0, 12, -8, 0],
            opacity: [0.48, 0.62, 0.44, 0.48],
          }}
          transition={{
            duration: 26,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />

        <motion.div
          className="absolute -right-[14%] top-[36%] h-[min(95vw,32rem)] w-[min(95vw,32rem)] rounded-full bg-slate-200/[0.042] blur-[128px]"
          animate={{
            x: [0, -16, -5, 0],
            y: [0, -14, 10, 0],
            opacity: [0.4, 0.52, 0.36, 0.4],
          }}
          transition={{
            duration: 32,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2.5,
          }}
        />

        <motion.div
          className="absolute left-1/2 top-[58%] h-[min(70vw,22rem)] w-[min(70vw,22rem)] -translate-x-1/2 rounded-full bg-white/[0.022] blur-[100px]"
          animate={{
            scale: [1, 1.06, 0.98, 1],
            opacity: [0.35, 0.48, 0.32, 0.35],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 1,
          }}
        />
      </div>

      <div className="relative z-10 -mt-10 max-w-6xl md:-mt-16">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{
            hidden: {},
            visible: {
              transition: { staggerChildren: 0.14, delayChildren: 0.12 },
            },
          }}
          className="flex flex-col items-center"
        >
          <motion.div
            variants={childFade}
            className="mb-6 rounded-[var(--aether-radius-pill)] border border-white/[0.12] bg-white/[0.07] px-5 py-2 text-sm text-white/[0.82] shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] backdrop-blur-md"
          >
            AI-Native Legal Intelligence
          </motion.div>

          <motion.h1
            variants={childFade}
            className="max-w-6xl text-7xl font-serif leading-[0.95] tracking-tight text-white aether-text-elegant md:text-9xl"
          >
            Intelligence,
            <br />
            Perfected
          </motion.h1>

          <motion.p
            variants={childFade}
            className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-white/[0.78] md:text-xl"
          >
            Advanced legal reasoning, drafting, research and workflow intelligence
            for the next generation of law firms and enterprise legal teams.
          </motion.p>

          <motion.div
            variants={childFade}
            className="mt-12 flex flex-wrap justify-center gap-4 sm:gap-5"
          >
            <Button
              size="lg"
              className="rounded-[var(--aether-radius-pill)] bg-white px-8 py-6 text-base text-black transition-colors duration-300 hover:bg-zinc-200"
              asChild
            >
              <Link href="/sign-up">Request Demo</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-[var(--aether-radius-pill)] border-white/22 bg-white/[0.06] px-8 py-6 text-base text-white/95 backdrop-blur-md transition-colors duration-300 hover:bg-white/12"
              asChild
            >
              <Link href="/app">Explore Platform</Link>
            </Button>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
