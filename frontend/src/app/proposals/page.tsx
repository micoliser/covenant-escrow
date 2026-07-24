"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useApi } from '@/hooks/useApi';
import { Dao, PaginatedResponse, Proposal, ProposalStatus, GlobalStats } from '@/types';
import { formatGen } from '@/lib/formatGen';
import { SkeletonCard } from '@/components/Skeletons';
import { 
  Search, ChevronDown, User, Clock, CheckCircle, AlertCircle, History, Lock, Shield,
  FileText, Activity, BarChart, Send
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAccount } from 'wagmi';
import { useHasMounted } from '@/hooks/useHasMounted';

export default function ProposalsGlobalFeed() {
  const router = useRouter();
  const { fetchApi } = useApi();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [daos, setDaos] = useState<Dao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedDaoId, setSelectedDaoId] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [ordering, setOrdering] = useState<string>('-submitted_at');
  const [myProposals, setMyProposals] = useState(false);
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const { isConnected } = useAccount();
  const hasMounted = useHasMounted();

  // Load DAOs for dropdown filter on mount
  useEffect(() => {
    async function loadDaos() {
      try {
        const res = await fetchApi('/api/daos/');
        if (res.ok) {
          const data: PaginatedResponse<Dao> = await res.json();
          setDaos(data.results);
        }
      } catch (err) {
        console.error("Failed to load DAOs:", err);
      }
    }
    loadDaos();
  }, [fetchApi]);

  // Fetch proposals based on filters
  useEffect(() => {
    async function loadProposals() {
      try {
        setIsLoading(true);
        let proposalsUrl = `/api/proposals/?ordering=${ordering}`;
        if (selectedDaoId !== 'ALL') proposalsUrl += `&dao_id=${selectedDaoId}`;
        if (search) proposalsUrl += `&search=${encodeURIComponent(search)}`;
        if (statusFilter !== 'ALL') proposalsUrl += `&status=${statusFilter}`;
        if (myProposals && isConnected) proposalsUrl += `&my_proposals=true`;

        const res = await fetchApi(proposalsUrl);
        if (res.ok) {
          const propData: PaginatedResponse<Proposal> = await res.json();
          setProposals(propData.results);
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
    
    const timer = setTimeout(loadProposals, 300);
    return () => clearTimeout(timer);
  }, [selectedDaoId, fetchApi, search, statusFilter, ordering, myProposals, isConnected]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 pt-24 lg:pt-32">
      {/* Header */}
      <header className="mb-12">
        <h1 className="text-4xl lg:text-5xl font-display font-bold text-white mb-3 tracking-tight">
          All Proposals
        </h1>
        <p className="text-lg text-zinc-400">
          Explore and vote on proposals across all ecosystem DAOs.
        </p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card className="bg-zinc-900/50 border-white/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-zinc-400 font-medium">Total Proposals</h3>
            </div>
            <div className="text-3xl font-display font-bold text-white mt-1">
              {stats ? stats.total_proposals : "-"}
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-zinc-900/50 border-white/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-emerald-400" />
              </div>
              <h3 className="text-zinc-400 font-medium">Active Proposals</h3>
            </div>
            <div className="text-3xl font-display font-bold text-white mt-1">
              {stats ? stats.active_proposals : "-"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-white/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <BarChart className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="text-zinc-400 font-medium whitespace-nowrap overflow-hidden text-ellipsis">Avg. Proposals/DAO</h3>
            </div>
            <div className="text-3xl font-display font-bold text-white mt-1">
              {stats && stats.total_ecosystems > 0 ? (stats.total_proposals / stats.total_ecosystems).toFixed(1) : "-"}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/50 border-white/5">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                <Send className="w-5 h-5 text-orange-400" />
              </div>
              <h3 className="text-zinc-400 font-medium whitespace-nowrap overflow-hidden text-ellipsis">Value Distributed</h3>
            </div>
            <div className="text-3xl font-display font-bold text-white mt-1 truncate">
              {stats ? formatGen(stats.total_funding_released) : "-"} GEN
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
            placeholder="Search proposals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl py-3 pl-12 pr-4 text-white text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent placeholder:text-zinc-500 transition-colors"
          />
        </div>

        {/* DAO Filter */}
        <div className="relative w-full md:w-56">
          <select
            value={selectedDaoId}
            onChange={(e) => setSelectedDaoId(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl py-3 pl-4 pr-10 text-white text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors appearance-none cursor-pointer"
          >
            <option value="ALL">All DAOs</option>
            {daos.map((d) => (
              <option key={d.dao_id} value={d.dao_id.toString()}>
                {d.name}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none w-5 h-5" />
        </div>

        {/* Status Filter */}
        <div className="relative w-full md:w-56">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl py-3 pl-4 pr-10 text-white text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors appearance-none cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value={ProposalStatus.OPEN_FOR_VOTING}>Open for Voting</option>
            <option value={ProposalStatus.ESCROWED}>Escrowed</option>
            <option value={ProposalStatus.RELEASED}>Released</option>
            <option value={ProposalStatus.VERIFICATION_FAILED}>Verification Failed</option>
            <option value={ProposalStatus.REJECTED}>Rejected</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none w-5 h-5" />
        </div>
        
        {/* Sort Order */}
        <div className="relative w-full md:w-48">
          <select
            value={ordering}
            onChange={(e) => setOrdering(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl py-3 pl-4 pr-10 text-white text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors appearance-none cursor-pointer"
          >
            <option value="-submitted_at">Most Recent</option>
            <option value="submitted_at">Oldest First</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none w-5 h-5" />
        </div>

        {/* My Proposals Toggle */}
        {hasMounted && isConnected && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMyProposals(!myProposals)}
              className={`px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                myProposals 
                  ? 'bg-accent/20 border-accent/50 text-accent-light' 
                  : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              My Proposals
            </button>
          </div>
        )}
      </div>

      {/* Proposals List */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="space-y-4"><SkeletonCard /><SkeletonCard /></div>
        ) : proposals.length === 0 ? (
          <div className="text-center py-16 bg-zinc-900/30 border border-zinc-800/50 rounded-2xl border-dashed">
            <p className="text-zinc-500">No proposals found matching your criteria.</p>
          </div>
        ) : (
          proposals.map((prop) => {
            let borderColor = "border-white/5 border-l-4 border-l-zinc-700";
            let statusBadge = null;
            let statusTextAccent = "text-zinc-500";
            
            if (prop.status === ProposalStatus.OPEN_FOR_VOTING) {
              borderColor = "border-white/5 border-l-4 border-l-accent";
              statusTextAccent = "text-accent";
              statusBadge = (
                <Badge variant="outline" className="bg-accent/15 text-accent border-accent/30 gap-1.5 uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
                  Open for Voting
                </Badge>
              );
            } else if (prop.status === ProposalStatus.ESCROWED) {
              borderColor = "border-white/5 border-l-4 border-l-amber-500";
              statusTextAccent = "text-amber-500";
              statusBadge = (
                <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1.5 uppercase tracking-wider">
                  <Lock className="w-3.5 h-3.5" />
                  Escrowed
                </Badge>
              );
            } else if (prop.status === ProposalStatus.VERIFICATION_FAILED) {
              borderColor = "border-white/5 border-l-4 border-l-red-500";
              statusTextAccent = "text-red-500";
              statusBadge = (
                <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30 gap-1.5 uppercase tracking-wider">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Verification Failed
                </Badge>
              );
            } else if (prop.status === ProposalStatus.RELEASED) {
              borderColor = "border-white/5 border-l-4 border-l-green-500";
              statusTextAccent = "text-green-500";
              statusBadge = (
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 gap-1.5 uppercase tracking-wider">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Released
                </Badge>
              );
            } else if (prop.status === ProposalStatus.RECLAIMED) {
              borderColor = "border-white/5 border-l-4 border-l-zinc-500";
              statusTextAccent = "text-zinc-500";
              statusBadge = (
                <Badge variant="outline" className="bg-zinc-800 text-zinc-400 border-zinc-700 gap-1.5 uppercase tracking-wider">
                  <History className="w-3.5 h-3.5" />
                  Reclaimed
                </Badge>
              );
            } else if (prop.status === ProposalStatus.REJECTED) {
              borderColor = "border-white/5 border-l-4 border-l-red-500";
              statusTextAccent = "text-red-500";
              statusBadge = (
                <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30 gap-1.5 uppercase tracking-wider">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Rejected
                </Badge>
              );
            } else if (prop.status === ProposalStatus.VOTE_FAILED) {
              borderColor = "border-white/5 border-l-4 border-l-zinc-500";
              statusTextAccent = "text-zinc-500";
              statusBadge = (
                <Badge variant="outline" className="bg-zinc-800 text-zinc-400 border-zinc-700 gap-1.5 uppercase tracking-wider">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Vote Failed
                </Badge>
              );
            } else if (prop.status === ProposalStatus.VERIFICATION_PASSED) {
              borderColor = "border-white/5 border-l-4 border-l-green-500";
              statusTextAccent = "text-green-500";
              statusBadge = (
                <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30 gap-1.5 uppercase tracking-wider">
                  <CheckCircle className="w-3.5 h-3.5" />
                  Verified
                </Badge>
              );
            } else {
              statusBadge = (
                <Badge variant="outline" className="bg-zinc-800 text-zinc-400 border-zinc-700 gap-1.5 uppercase tracking-wider">
                  <Clock className="w-3.5 h-3.5" />
                  {prop.status}
                </Badge>
              );
            }

            return (
              <Card 
                key={prop.proposal_id}
                onClick={() => router.push(`/proposal/${prop.proposal_id}`)}
                className={`transition-transform hover:-translate-y-1 duration-200 cursor-pointer border ${borderColor} hover:bg-zinc-800/50`}
              >
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row justify-between gap-4 mb-4">
                    <div className="flex items-start gap-3 flex-wrap">
                      {statusBadge}
                      
                      {/* DAO Badge */}
                      <Link 
                        href={`/dao/${prop.dao_id}`}
                        onClick={(e) => e.stopPropagation()} 
                        className="inline-flex items-center gap-1.5 bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700/50 px-2.5 py-1 rounded text-xs text-zinc-300 hover:text-white font-medium transition-colors"
                      >
                        <Shield className="w-3.5 h-3.5 text-accent" />
                        {prop.dao_name || `DAO #${prop.dao_id}`}
                      </Link>

                      <div className="w-full mt-2">
                        <h2 className="text-2xl font-display font-semibold text-white">{prop.title}</h2>
                        {prop.description && (
                          <p className="text-zinc-400 text-sm line-clamp-2 mt-1 pr-4">{prop.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap items-center gap-x-8 gap-y-4 mt-6 pt-4 border-t border-zinc-800">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center overflow-hidden">
                        <User className="w-3.5 h-3.5 text-zinc-400" />
                      </div>
                      <span className="text-sm text-zinc-400 font-mono">
                        {prop.contributor.slice(0,6)}...{prop.contributor.slice(-4)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-display font-semibold text-white tabular-nums">
                        {formatGen(prop.requested_amount)} GEN
                      </span>
                    </div>
                    
                    <div className={`flex items-center gap-2 ml-auto ${statusTextAccent}`}>
                      <Clock className="w-4 h-4" />
                      <span className="text-sm font-medium">Ends in {Math.max(0, Math.floor((new Date(prop.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))}d</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
