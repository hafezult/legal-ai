"use client"

import { Container, Section } from "@/components/marketing/primitives"
import { motion, useReducedMotion } from "framer-motion"

const hub = { cx: 280, cy: 220, w: 136, h: 54, rx: 12 }
const nodes = [
  {
    id: "m365",
    x: 176,
    y: 24,
    w: 208,
    h: 48,
    title: "Microsoft 365",
    sub: "Outlook · Word · Teams · SharePoint",
  },
  {
    id: "imanage",
    x: 20,
    y: 152,
    w: 108,
    h: 40,
    title: "iManage",
    sub: "Worksite / Cloud",
  },
  {
    id: "netdocs",
    x: 20,
    y: 208,
    w: 108,
    h: 40,
    title: "NetDocuments",
    sub: "DMS",
  },
  {
    id: "compliance",
    x: 48,
    y: 332,
    w: 124,
    h: 38,
    title: "Compliance",
    sub: "Policies & controls",
  },
  {
    id: "docstores",
    x: 218,
    y: 374,
    w: 124,
    h: 38,
    title: "Document stores",
    sub: "Repositories",
  },
  {
    id: "matters",
    x: 392,
    y: 312,
    w: 124,
    h: 40,
    title: "Matter repositories",
    sub: "Matters & files",
  },
  {
    id: "knowledge",
    x: 400,
    y: 128,
    w: 132,
    h: 46,
    title: "Internal firm knowledge",
    sub: "Precedent & playbooks",
  },
] as const

function nodeAnchor(n: (typeof nodes)[number], side: "in" | "out") {
  const cx = n.x + n.w / 2
  const cy = n.y + n.h / 2
  const hcx = hub.cx
  const hcy = hub.cy
  if (side === "out") {
    const dx = cx - hcx
    const dy = cy - hcy
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    return { x: hcx + ux * (hub.w / 2 + 4), y: hcy + uy * (hub.h / 2 + 4) }
  }
  const dx = hcx - cx
  const dy = hcy - cy
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  return { x: cx + ux * (n.w / 2 + 2), y: cy + uy * (n.h / 2 + 2) }
}

function pathToHub(n: (typeof nodes)[number]) {
  const a = nodeAnchor(n, "in")
  const b = nodeAnchor(n, "out")
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2 - 24
  return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`
}

function EcosystemTopology() {
  const reduceMotion = useReducedMotion()
  const animateLoop = !reduceMotion

  return (
    <div
      className="relative mx-auto w-full max-w-[min(100%,36rem)] overflow-hidden rounded-[var(--aether-radius-card)] border border-white/[0.09] bg-black/50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur-xl lg:max-w-none"
      style={{
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_65%_at_50%_48%,rgba(255,255,255,0.04),transparent_72%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/45"
        aria-hidden
      />

      <svg
        className="relative z-[1] block h-auto w-full text-white/[0.14]"
        viewBox="0 0 560 440"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <linearGradient id="eco-line" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.22)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
          </linearGradient>
        </defs>

        {nodes.map((n) => (
          <path
            key={`static-${n.id}`}
            d={pathToHub(n)}
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            opacity={0.55}
          />
        ))}

        {animateLoop ? (
          <>
            <motion.path
              d={pathToHub(nodes[0])}
              stroke="url(#eco-line)"
              strokeWidth="1.1"
              strokeLinecap="round"
              fill="none"
              vectorEffect="non-scaling-stroke"
              initial={{ strokeDasharray: "4 10", strokeDashoffset: 0, opacity: 0.35 }}
              animate={{ strokeDashoffset: [0, -42], opacity: [0.28, 0.42, 0.28] }}
              transition={{
                duration: 14,
                repeat: Infinity,
                ease: "linear",
              }}
            />
            <motion.path
              d={pathToHub(nodes[6])}
              stroke="url(#eco-line)"
              strokeWidth="1.1"
              strokeLinecap="round"
              fill="none"
              vectorEffect="non-scaling-stroke"
              initial={{ strokeDasharray: "4 10", strokeDashoffset: -12, opacity: 0.3 }}
              animate={{ strokeDashoffset: [-12, -54], opacity: [0.24, 0.38, 0.24] }}
              transition={{
                duration: 18,
                repeat: Infinity,
                ease: "linear",
                delay: 2,
              }}
            />
          </>
        ) : null}

        {nodes.map((n) => (
          <g key={n.id}>
            <rect
              x={n.x}
              y={n.y}
              width={n.w}
              height={n.h}
              rx="8"
              fill="rgba(0,0,0,0.35)"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="1"
            />
            <text
              x={n.x + n.w / 2}
              y={n.y + (n.sub ? 20 : 26)}
              textAnchor="middle"
              fill="rgba(255,255,255,0.72)"
              fontSize="11"
              fontFamily="ui-sans-serif, system-ui, sans-serif"
              fontWeight="500"
              letterSpacing="-0.01em"
            >
              {n.title}
            </text>
            {n.sub ? (
              <text
                x={n.x + n.w / 2}
                y={n.y + 34}
                textAnchor="middle"
                fill="rgba(255,255,255,0.38)"
                fontSize="9"
                fontFamily="ui-monospace, monospace"
                letterSpacing="0.02em"
              >
                {n.sub}
              </text>
            ) : null}
          </g>
        ))}

        <motion.rect
          x={hub.cx - hub.w / 2}
          y={hub.cy - hub.h / 2}
          width={hub.w}
          height={hub.h}
          rx={hub.rx}
          fill="rgba(255,255,255,0.06)"
          stroke="rgba(255,255,255,0.16)"
          strokeWidth="1"
          initial={false}
          animate={
            animateLoop
              ? { opacity: [0.82, 0.98, 0.82] }
              : { opacity: 1 }
          }
          transition={{
            duration: 5.5,
            repeat: animateLoop ? Infinity : 0,
            ease: "easeInOut",
          }}
        />

        <text
          x={hub.cx}
          y={hub.cy - 2}
          textAnchor="middle"
          fill="rgba(255,255,255,0.9)"
          fontSize="12"
          fontFamily="ui-serif, Georgia, serif"
          fontWeight="500"
          letterSpacing="-0.02em"
        >
          Aether Core
        </text>
        <text
          x={hub.cx}
          y={hub.cy + 14}
          textAnchor="middle"
          fill="rgba(255,255,255,0.4)"
          fontSize="9"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
          letterSpacing="0.22em"
        >
          ORCHESTRATION
        </text>
      </svg>
    </div>
  )
}

export function EnterpriseEcosystemSection() {
  return (
    <Section id="ecosystem" className="border-t border-white/[0.06]">
      <span className="sr-only">
        Diagram: enterprise systems such as Microsoft 365, iManage, NetDocuments,
        SharePoint, compliance, document stores, matters, and internal knowledge connect
        into Aether Core as the central orchestration layer.
      </span>
      <Container>
        <div className="grid gap-14 lg:grid-cols-12 lg:items-center lg:gap-16">
          <div className="lg:col-span-5">
            <div className="mb-5 text-sm uppercase tracking-[0.3em] text-white/40">
              Enterprise ecosystem
            </div>
            <h2 className="max-w-xl text-4xl font-serif leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
              Intelligence embedded across the systems your firm already trusts.
            </h2>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/[0.62]">
              Aether does not replace your firm&apos;s infrastructure. It connects what
              you already operate—governed workflows, controlled routing, and a single
              legal operating layer across the organization.
            </p>
            <ul className="mt-10 max-w-lg space-y-4 text-sm leading-relaxed text-white/[0.58]">
              <li className="border-l border-white/[0.12] pl-4">
                Policy-aware orchestration across tools, repositories, and matter
                surfaces.
              </li>
              <li className="border-l border-white/[0.12] pl-4">
                Intelligence routed with lineage—auditable paths from source systems to
                outcomes.
              </li>
              <li className="border-l border-white/[0.12] pl-4">
                Mission-critical posture: stable integrations, least-noise operation, and
                operational clarity for partners and IT.
              </li>
            </ul>
          </div>

          <div className="lg:col-span-7">
            <EcosystemTopology />
          </div>
        </div>
      </Container>
    </Section>
  )
}
