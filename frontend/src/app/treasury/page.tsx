"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { Dao, PaginatedResponse, GlobalStats } from "@/types";
import { formatGen } from "@/lib/formatGen";
import { SkeletonPageHeader, SkeletonCard } from "@/components/Skeletons";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, ArrowRight, Coins, Vault, ArrowUpRight, CheckCircle2, Users } from "lucide-react";

export default function GlobalTreasury() {
  const router = useRouter();
  const { fetchApi } = useApi();
  const [daos, setDaos] = useState<Dao[]>([]);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        setIsLoading(true);
        // Fetch all DAOs sorted by highest total_balance
        const res = await fetchApi('/api/daos/?ordering=-total_balance');
        if (res.ok) {
          const data: PaginatedResponse<Dao> = await res.json();
          setDaos(data.results);
        }

        const statsRes = await fetchApi('/api/daos/global_stats/');
        if (statsRes.ok) {
          const statsData: GlobalStats = await statsRes.json();
          setStats(statsData);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadData();
  }, [fetchApi]);

  // Calculate Total Value Locked (TVL)
  const totalValueLocked = daos.reduce((acc, dao) => acc + BigInt(dao.total_balance), BigInt(0));

  if (isLoading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <SkeletonPageHeader />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 pt-24 lg:pt-32">
      {/* Header */}
      <header className="mb-16 text-center">
        <h2 className="text-5xl md:text-6xl font-display font-bold text-white mb-6 tracking-tight">Platform Treasury</h2>
        <div className="inline-flex flex-col items-center justify-center p-8 rounded-3xl bg-zinc-900/50 border border-zinc-800/50 backdrop-blur-sm">
          <p className="text-zinc-400 text-sm uppercase tracking-wider font-medium mb-2">Total Value Locked</p>
          <div className="flex items-baseline gap-3">
            <span className="text-6xl md:text-7xl font-display font-bold text-transparent bg-clip-text bg-gradient-to-r from-accent-light to-accent">
              {formatGen(totalValueLocked.toString())}
            </span>
            <span className="text-2xl text-zinc-400 font-medium">GEN</span>
          </div>
        </div>
      </header>

      {/* Global Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-16">
        <Card className="bg-zinc-900/50 border-white/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <ArrowUpRight className="w-5 h-5 text-green-400" aria-hidden="true" />
              </div>
              <h3 className="text-zinc-400 font-medium">All Time Balance</h3>
            </div>
            <div className="text-3xl font-display font-bold text-white mt-1">
              {stats ? formatGen((BigInt(stats.total_tvl) + BigInt(stats.total_escrowed) + BigInt(stats.total_funding_released)).toString()) : "-"} GEN
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900/50 border-white/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <Vault className="w-5 h-5 text-indigo-400" aria-hidden="true" />
              </div>
              <h3 className="text-zinc-400 font-medium">Current Balance</h3>
            </div>
            <div className="text-3xl font-display font-bold text-white mt-1">
              {stats ? formatGen(stats.total_tvl) : "-"} GEN
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-white/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-orange-400" aria-hidden="true" />
              </div>
              <h3 className="text-zinc-400 font-medium whitespace-nowrap overflow-hidden text-ellipsis">Value Distributed</h3>
            </div>
            <div className="text-3xl font-display font-bold text-white mt-1">
              {stats ? formatGen(stats.total_funding_released) : "-"} GEN
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900/50 border-white/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-400" aria-hidden="true" />
              </div>
              <h3 className="text-zinc-400 font-medium">Total Members</h3>
            </div>
            <div className="text-3xl font-display font-bold text-white mt-1">
              {stats?.total_members !== undefined ? stats.total_members : "-"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* DAOs Grid */}
      <div className="mb-12">
        <h3 className="text-2xl font-display font-semibold text-white mb-6">Treasuries by Ecosystem</h3>
        
        {daos.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl border-dashed">
            <p className="text-zinc-400">No active DAOs found.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {daos.map((dao) => (
              <Card 
                key={dao.dao_id}
                className="group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_8px_30px_rgb(0,0,0,0.12)] border-zinc-800/50 hover:border-zinc-700/50 bg-zinc-900/40 backdrop-blur-sm"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-accent/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                
                <CardContent className="p-8 relative z-10">
                  <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 border border-zinc-700/50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <ShieldCheck className="w-6 h-6 text-accent" aria-hidden="true" />
                  </div>
                  
                  <h3 className="text-2xl font-display font-bold text-white mb-3 group-hover:text-accent-light transition-colors">
                    {dao.name}
                  </h3>
                  
                  <p className="text-zinc-400 text-sm mb-8 line-clamp-2">
                    {dao.description}
                  </p>
                  
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center justify-between py-2 border-b border-zinc-800/50">
                      <span className="text-zinc-400 text-sm">Treasury</span>
                      <div className="flex items-center gap-1.5 text-white font-medium">
                        <Coins className="w-4 h-4 text-zinc-400" aria-hidden="true" />
                        {formatGen(dao.total_balance)} GEN
                      </div>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-zinc-800/50">
                      <span className="text-zinc-400 text-sm">Proposals</span>
                      <span className="text-white font-medium">{dao.proposal_count}</span>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-zinc-800/50">
                      <span className="text-zinc-400 text-sm">Members</span>
                      <span className="text-white font-medium">{dao.member_count !== undefined ? dao.member_count : "-"}</span>
                    </div>
                  </div>
                  
                  <Button 
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-white border-0 group-hover:bg-accent group-hover:text-white transition-all duration-300"
                    onClick={() => router.push(`/dao/${dao.dao_id}/treasury`)}
                  >
                    View Treasury
                    <ArrowRight className="w-4 h-4 ml-2 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 transition-all" aria-hidden="true" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
