import { Dao, PaginatedResponse } from "@/types";
import { formatGen } from "@/lib/formatGen";
import {
  ArrowRight,
  Coins,
  Users,
  ShieldCheck,
  Activity,
  Lightbulb,
  Package,
  Search,
  ArrowLeftRight,
  Cpu,
  Lock,
  History,
  Grid,
} from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollReveal } from "@/components/ScrollReveal";
import { AnimatedCounter } from "@/components/AnimatedCounter";

async function getDaos() {
  let apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  if (typeof window === "undefined") {
    apiUrl = apiUrl.replace("localhost", "127.0.0.1");
  }
  try {
    const res = await fetch(`${apiUrl}/api/daos/`, { cache: "no-store" });
    if (!res.ok) return [];
    const data: PaginatedResponse<Dao> = await res.json();
    return data.results;
  } catch (error) {
    console.error("Error fetching DAOs:", error);
    return [];
  }
}

export default async function Home() {
  const daos = await getDaos();

  const totalTreasuryBigInt = daos.reduce(
    (sum, dao) => sum + BigInt(dao.total_balance || 0),
    BigInt(0),
  );
  // Keep up to 2 decimals of GEN for the counter
  const totalTreasuryGen =
    Number(totalTreasuryBigInt / BigInt("10000000000000000")) / 100;
  const totalProposals = daos.reduce(
    (sum, dao) => sum + (dao.proposal_count || 0),
    0,
  );
  const totalDaos = daos.length;

  return (
    <div className="flex flex-col">
      {/* Hero Section */}
      <section className="relative pt-14 pb-12 px-6 max-w-5xl mx-auto w-full">
        <ScrollReveal>
          <div className="text-center relative overflow-visible pt-2 pb-8">
            {/* Abstract background element spanning the whole width of the section */}
            <div className="absolute inset-0 z-0 opacity-40 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.2)_0%,rgba(19,19,21,0)_70%)] -mx-[50vw] right-[50%] left-[50%] w-[100vw]"></div>

            <div className="relative z-10 max-w-3xl mx-auto pt-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-800/80 border border-zinc-700/50 mb-6">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                <span className="text-sm font-medium text-zinc-300">
                  Testnet Live
                </span>
              </div>

              <h1 className="text-5xl md:text-6xl font-display font-bold mb-6 tracking-tight text-white leading-tight">
                The Protocol for <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-hover to-accent">
                  Trustless DAO Escrow
                </span>
              </h1>

              <p className="text-lg md:text-xl text-zinc-400 mb-10 max-w-2xl mx-auto font-light leading-relaxed">
                Secure on-chain capital coordination powered by an AI-driven
                verification layer. Covenant ensures funds are released only
                when cryptographically verifiable milestones are met.
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link href="#daos" className={cn(buttonVariants({ variant: "default" }), "bg-accent hover:bg-accent/90 text-white shadow-[0_0_15px_rgba(139,92,246,0.3)] w-full sm:w-auto px-6 py-6")}>
                  Explore DAOs
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Link>
                <Link href="https://github.com/micoliser/covenant-escrow" target="_blank" className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto px-6 py-6 border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700")}>
                  View Github
                  <Cpu className="w-4 h-4 ml-2" />
                </Link>
              </div>
            </div>

            {/* Global Stats Ribbon */}
            <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4 border-t border-zinc-800/50 pt-8 relative z-10 max-w-5xl mx-auto">
              <div className="text-left md:text-center px-4">
                <div className="text-sm text-zinc-400 font-medium mb-1 uppercase tracking-wider">
                  Total Value Secured
                </div>
                <div className="text-3xl font-display font-bold text-white tabular-nums">
                  <AnimatedCounter value={totalTreasuryGen} decimals={2} />{" "}
                  <span className="text-xl text-white/50">GEN</span>
                </div>
              </div>
              <div className="text-left md:text-center px-4 md:border-l border-zinc-800/50">
                <div className="text-sm text-zinc-400 font-medium mb-1 uppercase tracking-wider">
                  Active DAOs
                </div>
                <div className="text-3xl font-display font-bold text-white tabular-nums">
                  <AnimatedCounter value={totalDaos} />
                </div>
              </div>
              <div className="text-left md:text-center px-4 md:border-l border-zinc-800/50">
                <div className="text-sm text-zinc-400 font-medium mb-1 uppercase tracking-wider">
                  Total Proposals
                </div>
                <div className="text-3xl font-display font-bold text-green-500 tabular-nums">
                  <AnimatedCounter value={totalProposals} />
                </div>
              </div>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* How It Works */}
      <section className="px-6 pb-24 relative z-10">
        <ScrollReveal className="max-w-5xl mx-auto">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-display font-bold mb-4 tracking-tight">
              How It Works
            </h2>
            <p className="text-foreground/70 max-w-2xl mx-auto text-lg">
              A verifiable, milestone-driven process from pitch to payout.
            </p>
          </div>
          <div className="flex flex-col md:flex-row gap-6 relative">
            {/* Connecting line on desktop */}
            <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-[2px] bg-zinc-800/50 z-0" />

            {[
              {
                icon: Lightbulb,
                title: "Propose",
                desc: "Pitch what you'll build and exactly what 'done' looks like.",
              },
              {
                icon: Users,
                title: "Fund",
                desc: "The community votes. Approved proposals lock funds in escrow instantly.",
              },
              {
                icon: Package,
                title: "Deliver",
                desc: "Submit your finished work as a live link such as a deployed site or code repository.",
              },
              {
                icon: Search,
                title: "Verify",
                desc: "GenLayer's validators actually fetch what you submitted and judge it against your original criteria without any human gatekeepers.",
              },
              {
                icon: ArrowLeftRight,
                title: "Release",
                desc: "Passes? Funds release automatically. Fails? The community decides. If nobody acts, funds automatically return to protect the treasury.",
              },
            ].map((step, i) => (
              <div
                key={i}
                className="flex-1 relative z-10 flex flex-col items-center text-center group"
              >
                <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl group-hover:border-accent/50 group-hover:-translate-y-1 transition-all duration-300">
                  <step.icon className="w-7 h-7 text-accent" />
                </div>
                <h3 className="text-xl font-display font-semibold mb-3">
                  {step.title}
                </h3>
                <p className="text-foreground/60 text-sm leading-relaxed">
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* Why Covenant Escrow */}
      <section className="px-6 pb-24 relative z-10 bg-zinc-900/20 py-24 border-y border-zinc-800/50">
        <ScrollReveal className="max-w-5xl mx-auto">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-display font-bold mb-4 tracking-tight">
              Why Covenant Escrow
            </h2>
            <p className="text-foreground/70 max-w-2xl mx-auto text-lg">
              Built on GenLayer for trustless verification and automated
              execution.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                icon: Cpu,
                title: "AI-Verified, Not Rubber-Stamped",
                desc: "Validators independently fetch your deliverable and reach consensus on whether it matches what was promised.",
              },
              {
                icon: Lock,
                title: "Funds Can't Get Stuck",
                desc: "If a delivery fails and the community doesn't vote, escrowed funds automatically return to the treasury rather than sitting frozen forever.",
              },
              {
                icon: History,
                title: "Every Decision Is Logged",
                desc: "A full, permanent timeline on every proposal: screened, funded, delivered, verified. Nothing happens invisibly.",
              },
              {
                icon: Grid,
                title: "One Platform, Many DAOs",
                desc: "Any community can spin up its own DAO with its own funding rules, all secured by the same underlying consensus.",
              },
            ].map((feature, i) => (
              <Card
                key={i}
                className="hover:border-accent/30 hover:bg-zinc-800/30 hover:-translate-y-1 transition-all duration-300"
              >
                <CardContent className="p-8">
                  <feature.icon className="w-8 h-8 text-accent mb-5" />
                  <h3 className="text-xl font-display font-semibold mb-3">
                    {feature.title}
                  </h3>
                  <p className="text-foreground/60 leading-relaxed">
                    {feature.desc}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* DAOs Section */}
      <section id="daos" className="px-6 py-24 relative z-10">
        <ScrollReveal className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
            <div>
              <h2 className="text-3xl font-display font-bold mb-2">
                Featured DAOs
              </h2>
              <p className="text-zinc-400 text-lg">
                Top organizations utilizing Covenant for treasury security.
              </p>
            </div>
            <div className="hidden md:flex gap-2">
              <button
                aria-label="List View"
                className="p-2 rounded border border-zinc-700 hover:bg-zinc-800 text-zinc-400 transition-colors"
              >
                <Grid className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {daos.map((dao) => (
              <Card
                key={dao.dao_id}
                className="hover:border-accent hover:-translate-y-1 transition-all duration-300 group cursor-pointer h-full"
              >
                <Link href={`/dao/${dao.dao_id}`} className="block h-full">
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center border border-white/5 group-hover:border-accent/50 transition-colors">
                        <ShieldCheck className="text-accent w-7 h-7" />
                      </div>
                      <div className="px-2 py-1 rounded bg-green-500/15 border border-green-500/30 text-green-500 text-sm font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        {dao.proposal_count} Proposals
                      </div>
                    </div>
    
                    <h3 className="text-2xl font-display font-semibold mb-2 text-white group-hover:text-accent transition-colors">
                      {dao.name}
                    </h3>
                    <p className="text-zinc-400 text-sm mb-6 flex-grow line-clamp-2">
                      {dao.description}
                    </p>
    
                    <div className="mt-auto pt-4 border-t border-white/5 flex justify-between items-end">
                      <div>
                        <div className="text-zinc-400 mb-1 uppercase text-[11px] tracking-widest font-medium">
                          Treasury Size
                        </div>
                        <div className="text-white text-xl font-display font-semibold tracking-tight tabular-nums">
                          {formatGen(dao.total_balance)} GEN
                        </div>
                      </div>
                      <ArrowRight className="text-zinc-400 group-hover:text-accent transition-all duration-200 translate-x-0 group-hover:translate-x-1 w-5 h-5" />
                    </div>
                  </CardContent>
                </Link>
              </Card>
            ))}

            {daos.length === 0 && (
              <div className="col-span-full py-16 text-center text-foreground/50 bg-zinc-900/20 border border-zinc-800/50 rounded-2xl border-dashed">
                No active DAOs found.
              </div>
            )}
          </div>
        </ScrollReveal>
      </section>

      {/* Bottom CTA */}
      <section className="px-6 py-24 relative z-10 border-t border-zinc-800/50 bg-zinc-950">
        <ScrollReveal className="max-w-5xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-display font-bold mb-6 tracking-tight">
            Ready to put your treasury to work?
          </h2>
          <p className="text-xl text-foreground/70 mb-10 font-light">
            Join the ecosystem of AI-verified milestone delivery.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="#daos" className={cn(buttonVariants({ variant: "default" }), "w-full sm:w-auto bg-accent hover:bg-accent-hover text-white font-display font-medium px-8 py-6 rounded-full transition-all duration-300 hover:scale-105 shadow-[0_0_20px_rgba(167,139,250,0.3)]")}>
              Browse DAOs
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </div>
        </ScrollReveal>
      </section>

    </div>
  );
}
