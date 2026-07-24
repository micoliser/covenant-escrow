"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApi } from '@/hooks/useApi';
import { Dao, PaginatedResponse, GlobalStats } from '@/types';
import { formatGen } from '@/lib/formatGen';
import { SkeletonCard } from '@/components/Skeletons';
import { Search, ChevronDown, ShieldCheck, ArrowRight, Vault, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useAccount } from 'wagmi';
import { useHasMounted } from '@/hooks/useHasMounted';
import { ScrollReveal } from '@/components/ScrollReveal';

export default function DaosPage() {
  const router = useRouter();
  const { fetchApi } = useApi();
  const [daos, setDaos] = useState<Dao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ordering, setOrdering] = useState<string>('-created_at');
  const [myDaos, setMyDaos] = useState(false);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const { isConnected } = useAccount();
  const hasMounted = useHasMounted();

  // Fetch daos based on filters
  useEffect(() => {
    async function loadDaos() {
      try {
        setIsLoading(true);
        let daosUrl = `/api/daos/?ordering=${ordering}`;
        if (search) daosUrl += `&search=${encodeURIComponent(search)}`;
        if (myDaos && isConnected) daosUrl += `&my_daos=true`;

        const res = await fetchApi(daosUrl);
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
        console.error("Failed to load DAOs:", err);
      } finally {
        setIsLoading(false);
      }
    }
    
    const timer = setTimeout(loadDaos, 300);
    return () => clearTimeout(timer);
  }, [fetchApi, search, ordering, myDaos, isConnected]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 pt-24 lg:pt-32">
      {/* Header */}
      <header className="mb-12">
        <h1 className="text-4xl lg:text-5xl font-display font-bold text-white mb-3 tracking-tight">
          All DAOs
        </h1>
        <p className="text-lg text-zinc-400">
          Browse active communities and ecosystems secured by Covenant Escrow.
        </p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="bg-zinc-900/50 border-white/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-indigo-400" />
              </div>
              <h3 className="text-zinc-400 font-medium">Active Ecosystems</h3>
            </div>
            <div className="text-3xl font-display font-bold text-white mt-1">
              {stats ? stats.total_ecosystems : "-"}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900/50 border-white/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-zinc-400 font-medium">Total Members</h3>
            </div>
            <div className="text-3xl font-display font-bold text-white mt-1">
              {stats?.total_members !== undefined ? stats.total_members : "-"}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900/50 border-white/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <Vault className="w-5 h-5 text-green-400" />
              </div>
              <h3 className="text-zinc-400 font-medium">Platform TVL</h3>
            </div>
            <div className="text-3xl font-display font-bold text-white mt-1">
              {stats ? formatGen(stats.total_tvl) : "-"} GEN
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Search DAOs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl py-3 pl-12 pr-4 text-white text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent placeholder:text-zinc-500 transition-colors"
          />
        </div>

        {/* Sort Order */}
        <div className="relative w-full md:w-48">
          <select
            value={ordering}
            onChange={(e) => setOrdering(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl py-3 pl-4 pr-10 text-white text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors appearance-none cursor-pointer"
          >
            <option value="-created_at">Most Recent</option>
            <option value="created_at">Oldest First</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none w-5 h-5" />
        </div>

        {/* My DAOs Toggle */}
        {hasMounted && isConnected && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMyDaos(!myDaos)}
              className={`px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                myDaos 
                  ? 'bg-accent/20 border-accent/50 text-accent-light' 
                  : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              My DAOs
            </button>
          </div>
        )}
      </div>

      {/* DAOs List */}
      <ScrollReveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {isLoading ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : daos.length === 0 ? (
            <div className="col-span-full py-16 text-center text-zinc-500 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl border-dashed">
              No DAOs found matching your criteria.
            </div>
          ) : (
            daos.map((dao) => (
              <Card
                key={dao.dao_id}
                className="hover:border-accent hover:-translate-y-1 transition-all duration-300 group cursor-pointer h-full border-white/5 bg-zinc-900/50"
              >
                <Link href={`/dao/${dao.dao_id}`} className="block h-full">
                  <CardContent className="p-6 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center border border-white/5 group-hover:border-accent/50 transition-colors">
                        <ShieldCheck className="text-accent w-7 h-7" />
                      </div>
                      <div className="px-2.5 py-1 rounded bg-green-500/15 border border-green-500/30 text-green-500 text-sm font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                        {dao.proposal_count} Proposals
                      </div>
                    </div>

                    <h2 className="text-2xl font-display font-semibold mb-2 text-white group-hover:text-accent transition-colors">
                      {dao.name}
                    </h2>
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
                      <div className="flex items-center text-xs font-medium text-zinc-400 group-hover:text-accent transition-colors gap-1">
                        <span>Browse Proposals</span>
                        <ArrowRight className="transition-all duration-200 translate-x-0 group-hover:translate-x-1 w-4 h-4" />
                      </div>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            ))
          )}
        </div>
      </ScrollReveal>
    </div>
  );
}
