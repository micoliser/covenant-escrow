import { Dao, PaginatedResponse } from '@/types';
import { formatGen } from '@/lib/formatGen';
import { 
  ArrowRight, Coins, Users, ShieldCheck, Activity,
  Lightbulb, Package, Search, ArrowLeftRight,
  Cpu, Lock, History, Grid
} from 'lucide-react';
import Link from 'next/link';
import { Navbar } from '@/components/Navbar';
import { ScrollReveal } from '@/components/ScrollReveal';
import { AnimatedCounter } from '@/components/AnimatedCounter';

async function getDaos() {
  let apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  if (typeof window === 'undefined') {
    apiUrl = apiUrl.replace('localhost', '127.0.0.1');
  }
  try {
    const res = await fetch(`${apiUrl}/api/daos/`, { cache: 'no-store' });
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

  const totalTreasuryBigInt = daos.reduce((sum, dao) => sum + BigInt(dao.total_balance || 0), BigInt(0));
  // Keep up to 2 decimals of GEN for the counter
  const totalTreasuryGen = Number(totalTreasuryBigInt / 10000000000000000n) / 100;
  const totalProposals = daos.reduce((sum, dao) => sum + (dao.proposal_count || 0), 0);
  const totalDaos = daos.length;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-950">
      <Navbar />
      {/* Hero Section */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        {/* Background gradient blur */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-accent/20 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-5xl mx-auto relative z-10 text-center">
          <ScrollReveal>
            <h1 className="text-5xl md:text-7xl font-display font-bold mb-6 tracking-tight text-foreground">
              Covenant <span className="text-accent">Escrow</span>
            </h1>
            <p className="text-xl md:text-2xl text-foreground/80 max-w-2xl mx-auto mb-10 font-light leading-relaxed">
              Secure, transparent funding powered by AI-verified milestone delivery. 
              Ensure accountability for every token spent.
            </p>
            <div className="flex justify-center">
              <Link 
                href="#daos"
                className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white font-display font-medium px-8 py-4 rounded-full transition-all duration-300 hover:scale-105 shadow-[0_0_20px_rgba(167,139,250,0.3)]"
              >
                Browse DAOs
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Stats Strip */}
      <section className="px-6 pb-24 relative z-10">
        <ScrollReveal delay={200} className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-3xl p-8 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-zinc-800/80 rounded-full flex items-center justify-center mb-4 shadow-inner border border-zinc-700/50">
                <Coins className="w-6 h-6 text-accent" />
              </div>
              <p className="text-sm text-foreground/60 font-medium uppercase tracking-wider mb-1">Total Treasury</p>
              <h3 className="text-3xl font-display font-bold text-foreground">
                <AnimatedCounter value={totalTreasuryGen} decimals={2} /> <span className="text-lg text-foreground/50">GEN</span>
              </h3>
            </div>
            
            <div className="flex flex-col items-center text-center border-t md:border-t-0 md:border-l border-zinc-800/50 pt-6 md:pt-0">
              <div className="w-12 h-12 bg-zinc-800/80 rounded-full flex items-center justify-center mb-4 shadow-inner border border-zinc-700/50">
                <Activity className="w-6 h-6 text-accent" />
              </div>
              <p className="text-sm text-foreground/60 font-medium uppercase tracking-wider mb-1">Total Proposals</p>
              <h3 className="text-3xl font-display font-bold text-foreground">
                <AnimatedCounter value={totalProposals} />
              </h3>
            </div>
            
            <div className="flex flex-col items-center text-center border-t md:border-t-0 md:border-l border-zinc-800/50 pt-6 md:pt-0">
              <div className="w-12 h-12 bg-zinc-800/80 rounded-full flex items-center justify-center mb-4 shadow-inner border border-zinc-700/50">
                <ShieldCheck className="w-6 h-6 text-accent" />
              </div>
              <p className="text-sm text-foreground/60 font-medium uppercase tracking-wider mb-1">Active DAOs</p>
              <h3 className="text-3xl font-display font-bold text-foreground">
                <AnimatedCounter value={totalDaos} />
              </h3>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* How It Works */}
      <section className="px-6 pb-24 relative z-10">
        <ScrollReveal className="max-w-6xl mx-auto">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-display font-bold mb-4 tracking-tight">How It Works</h2>
            <p className="text-foreground/70 max-w-2xl mx-auto text-lg">
              A verifiable, milestone-driven process from pitch to payout.
            </p>
          </div>
          <div className="flex flex-col md:flex-row gap-6 relative">
            {/* Connecting line on desktop */}
            <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-[2px] bg-zinc-800/50 z-0" />
            
            {[
              { icon: Lightbulb, title: "Propose", desc: "Pitch what you'll build and exactly what 'done' looks like." },
              { icon: Users, title: "Fund", desc: "The community votes. Approved proposals lock funds in escrow instantly." },
              { icon: Package, title: "Deliver", desc: "Submit your finished work as a live link such as a deployed site or code repository." },
              { icon: Search, title: "Verify", desc: "GenLayer's validators actually fetch what you submitted and judge it against your original criteria without any human gatekeepers." },
              { icon: ArrowLeftRight, title: "Release", desc: "Passes? Funds release automatically. Fails? The community decides. If nobody acts, funds automatically return to protect the treasury." }
            ].map((step, i) => (
              <div key={i} className="flex-1 relative z-10 flex flex-col items-center text-center group">
                <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center mb-6 shadow-xl group-hover:border-accent/50 group-hover:-translate-y-1 transition-all duration-300">
                  <step.icon className="w-7 h-7 text-accent" />
                </div>
                <h3 className="text-xl font-display font-semibold mb-3">{step.title}</h3>
                <p className="text-foreground/60 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* Why Covenant Escrow */}
      <section className="px-6 pb-24 relative z-10 bg-zinc-900/20 py-24 border-y border-zinc-800/50">
        <ScrollReveal className="max-w-5xl mx-auto">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-display font-bold mb-4 tracking-tight">Why Covenant Escrow</h2>
            <p className="text-foreground/70 max-w-2xl mx-auto text-lg">
              Built on GenLayer for trustless verification and automated execution.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { icon: Cpu, title: "AI-Verified, Not Rubber-Stamped", desc: "Validators independently fetch your deliverable and reach consensus on whether it matches what was promised." },
              { icon: Lock, title: "Funds Can't Get Stuck", desc: "If a delivery fails and the community doesn't vote, escrowed funds automatically return to the treasury rather than sitting frozen forever." },
              { icon: History, title: "Every Decision Is Logged", desc: "A full, permanent timeline on every proposal: screened, funded, delivered, verified. Nothing happens invisibly." },
              { icon: Grid, title: "One Platform, Many DAOs", desc: "Any community can spin up its own DAO with its own funding rules, all secured by the same underlying consensus." }
            ].map((feature, i) => (
              <div key={i} className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-2xl p-8 hover:border-accent/30 hover:bg-zinc-800/30 hover:-translate-y-1 transition-all duration-300">
                <feature.icon className="w-8 h-8 text-accent mb-5" />
                <h3 className="text-xl font-display font-semibold mb-3">{feature.title}</h3>
                <p className="text-foreground/60 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </section>

      {/* DAOs Section */}
      <section id="daos" className="px-6 py-24 relative z-10">
        <ScrollReveal className="max-w-5xl mx-auto">
          <div className="mb-10 text-center md:text-left">
            <h2 className="text-3xl font-display font-bold mb-4 tracking-tight">Active Ecosystems</h2>
            <p className="text-foreground/70 max-w-2xl text-lg mx-auto md:mx-0">
              Select a DAO to view proposals and participate in AI-verified grants.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {daos.map((dao) => (
              <Link 
                href={`/dao/${dao.dao_id}`}
                key={dao.dao_id}
                className="group block bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 hover:border-accent/50 hover:bg-zinc-800/50 hover:-translate-y-1 transition-all duration-300 relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 duration-300">
                  <ArrowRight className="w-5 h-5 text-accent" />
                </div>
                
                <h3 className="text-2xl font-display font-semibold mb-2 pr-8 text-foreground">{dao.name}</h3>
                <p className="text-foreground/60 text-sm line-clamp-2 mb-6">
                  {dao.description}
                </p>
                
                <div className="flex flex-col gap-3 pt-6 border-t border-zinc-800/50">
                  <div className="flex items-center gap-2 text-sm">
                    <Coins className="w-4 h-4 text-accent" />
                    <span className="text-foreground/60">Treasury:</span>
                    <span className="font-medium text-foreground">{formatGen(dao.total_balance)} GEN</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="w-4 h-4 text-accent" />
                    <span className="text-foreground/60">Proposals:</span>
                    <span className="font-medium text-foreground">{dao.proposal_count}</span>
                  </div>
                </div>
              </Link>
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
        <ScrollReveal className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-5xl font-display font-bold mb-6 tracking-tight">Ready to put your treasury to work?</h2>
          <p className="text-xl text-foreground/70 mb-10 font-light">
            Join the ecosystem of AI-verified milestone delivery.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              href="#daos"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white font-display font-medium px-8 py-4 rounded-full transition-all duration-300 hover:scale-105 shadow-[0_0_20px_rgba(167,139,250,0.3)]"
            >
              Browse DAOs
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </ScrollReveal>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-zinc-800/50 bg-zinc-950 text-center">
        <p className="text-foreground/50 text-sm flex items-center justify-center gap-2">
          <span>Powered by GenLayer</span>
          <span>&bull;</span>
          <a 
            href="https://github.com/micoliser/covenant-escrow" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:text-accent transition-colors"
          >
            GitHub Repository
          </a>
        </p>
      </footer>
    </div>
  );
}
