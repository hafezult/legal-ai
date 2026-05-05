"use client"

import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">

      {/* Background Video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 h-screen w-full object-cover"
      >
        <source src="/videos/hero.mp4" type="video/mp4" />
      </video>

      {/* Overlay */}
      <div className="absolute inset-0 h-screen bg-black/60" />

      {/* Gradient Glow */}
      <div className="absolute inset-0 h-screen bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_45%)]" />

      {/* Navbar */}
      <header className="absolute top-0 left-0 right-0 z-50">

        <div className="mx-auto flex max-w-7xl items-center justify-between px-8 py-6">

          <div className="text-3xl tracking-tight font-serif">
            Aether
          </div>

          <nav className="hidden md:flex items-center gap-10 text-sm text-white/70">

            <a href="#" className="transition hover:text-white">
              Platform
            </a>

            <a href="#" className="transition hover:text-white">
              Solutions
            </a>

            <a href="#" className="transition hover:text-white">
              Security
            </a>

            <a href="#" className="transition hover:text-white">
              Resources
            </a>

            <a href="#" className="transition hover:text-white">
              About
            </a>

          </nav>

          <div className="flex items-center gap-4">

            <Button
              variant="outline"
              className="border-white/20 bg-white/5 backdrop-blur-md hover:bg-white/10"
            >
              Login
            </Button>

            <Button className="bg-white text-black hover:bg-zinc-200">
              Request Demo
            </Button>

          </div>

        </div>

      </header>

      {/* Hero */}
      <section className="relative z-10 flex h-screen flex-col items-center justify-center px-8 text-center">

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2 }}
        >

          <div className="mb-6 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-sm text-white/70 backdrop-blur-md">
            AI-Native Legal Intelligence
          </div>

          <h1 className="max-w-6xl text-7xl font-serif leading-[0.95] tracking-tight md:text-9xl">
            Intelligence,
            <br />
            Perfected
          </h1>

          <p className="mx-auto mt-8 max-w-2xl text-lg leading-relaxed text-white/70 md:text-xl">
            Advanced legal reasoning, drafting, research,
            and workflow intelligence for the next generation
            of law firms and enterprise legal teams.
          </p>

          <div className="mt-12 flex justify-center gap-5">

            <Button
              size="lg"
              className="bg-white px-8 py-6 text-base text-black hover:bg-zinc-200"
            >
              Request Demo
            </Button>

            <Button
              size="lg"
              variant="outline"
              className="border-white/20 bg-white/5 px-8 py-6 text-base backdrop-blur-md hover:bg-white/10"
            >
              Explore Platform
            </Button>

          </div>

        </motion.div>

      </section>

      {/* Intelligence Section */}
      <section className="relative z-10 bg-black px-8 py-40">

        <motion.div
          initial={{ opacity: 0, y: 60 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2 }}
          viewport={{ once: true }}
          className="mx-auto max-w-7xl"
        >

          <div className="grid grid-cols-1 items-center gap-20 lg:grid-cols-2">

            {/* Left */}
            <div>

              <div className="mb-5 text-sm uppercase tracking-[0.3em] text-white/40">
                Legal Intelligence
              </div>

              <h2 className="text-5xl font-serif leading-[1] tracking-tight md:text-7xl">
                Built for
                <br />
                complex legal
                <br />
                workflows.
              </h2>

              <p className="mt-8 max-w-xl text-lg leading-relaxed text-white/60">
                Aether combines advanced reasoning,
                document intelligence, legal drafting,
                and enterprise workflow orchestration
                into one unified operating system for modern law.
              </p>

            </div>

            {/* Right */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.4 }}
              viewport={{ once: true }}
              className="relative"
            >

              <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 shadow-2xl backdrop-blur-xl">

                <div className="mb-6 flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-white/40" />
                  <div className="h-3 w-3 rounded-full bg-white/20" />
                  <div className="h-3 w-3 rounded-full bg-white/10" />
                </div>

                <div className="space-y-6">

                  <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                    <div className="text-sm text-white/40">
                      AI Research
                    </div>

                    <div className="mt-2 text-xl">
                      Cross-jurisdictional authority analysis
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                    <div className="text-sm text-white/40">
                      Drafting Intelligence
                    </div>

                    <div className="mt-2 text-xl">
                      Automated contract and litigation workflows
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                    <div className="text-sm text-white/40">
                      Enterprise Orchestration
                    </div>

                    <div className="mt-2 text-xl">
                      AI-native legal operating infrastructure
                    </div>
                  </div>

                </div>

              </div>

            </motion.div>

          </div>

        </motion.div>

      </section>

    </main>
  )
}