"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Dao, PaginatedResponse, Proposal, ProposalStatus } from '@/types';
import { formatGen } from '@/lib/formatGen';
import { SkeletonPageHeader, SkeletonCard } from '@/components/Skeletons';
import { StatusBadge } from '@/components/StatusBadge';
import { 
  Search, Filter, Calendar, Coins, Plus, ChevronDown, 
  User, Clock, CheckCircle, AlertCircle, History, Lock 
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAccount } from 'wagmi';

export default function DaoFeed() {
  const params = useParams();
  const router = useRouter();
  const daoId = params.daoId as string;
  
  const { fetchApi } = useApi();
  const [dao, setDao] = useState<Dao | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [ordering, setOrdering] = useState<string>('-submitted_at');
  const [myProposals, setMyProposals] = useState(false);
  const { isConnected } = useAccount();

  useEffect(() => {
    async function loadData() {
      if (!daoId) return;
      try {
        setIsLoading(true);
        // Fetch DAO and Proposals concurrently
        let proposalsUrl = `/api/proposals/?dao_id=${daoId}`;
        if (search) proposalsUrl += `&search=${encodeURIComponent(search)}`;
        if (statusFilter !== 'ALL') proposalsUrl += `&status=${statusFilter}`;
        if (ordering) proposalsUrl += `&ordering=${ordering}`;
        if (myProposals && isConnected) proposalsUrl += `&my_proposals=true`;

        const [daoRes, propRes] = await Promise.all([
          fetchApi(`/api/daos/${daoId}/`),
          fetchApi(proposalsUrl)
        ]);

        if (daoRes.ok) setDao(await daoRes.json());
        if (propRes.ok) {
          const propData: PaginatedResponse<Proposal> = await propRes.json();
          setProposals(propData.results);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    
    // Add debounce for search in a real app, keeping it simple here
    const timer = setTimeout(loadData, 300);
    return () => clearTimeout(timer);
  }, [daoId, fetchApi, search, statusFilter, ordering, myProposals, isConnected]);

  if (isLoading && !dao) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12">
        <SkeletonPageHeader />
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 pt-24 lg:pt-32">
      {/* Header */}
      {dao && (
        <>
          <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-5xl font-display font-bold text-white mb-2 tracking-tight">{dao.name}</h2>
              <p className="text-lg text-zinc-400">{dao.description}</p>
            </div>
            <Button
              onClick={() => router.push(`/dao/${daoId}/proposal/create`)}
              className="bg-accent hover:bg-accent-hover text-white flex items-center gap-2 px-6 py-6 rounded-xl text-sm font-medium shadow-[0_0_15px_rgba(139,92,246,0.3)] transition-colors w-full md:w-auto justify-center"
            >
              <Plus className="w-5 h-5" />
              Create Proposal
            </Button>
          </header>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
            <Card>
              <CardContent className="p-4">
                <p className="text-zinc-400 text-xs uppercase tracking-wider font-medium mb-1">Treasury Balance</p>
                <p className="text-xl font-display font-semibold text-white tabular-nums">{formatGen(dao.total_balance)} GEN</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-zinc-400 text-xs uppercase tracking-wider font-medium mb-1">Total / Active</p>
                <p className="text-xl font-display font-semibold text-white tabular-nums">
                  {dao.proposal_count} <span className="text-zinc-500 text-base font-normal">/ {dao.active_proposal_count || 0}</span>
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-zinc-400 text-xs uppercase tracking-wider font-medium mb-1">Voting Period</p>
                <p className="text-xl font-display font-semibold text-white tabular-nums">
                  {dao.voting_period_seconds / 60} mins
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-zinc-400 text-xs uppercase tracking-wider font-medium mb-1">Quorum</p>
                <p className="text-xl font-display font-semibold text-white tabular-nums">
                  {Number(dao.quorum_bps) / 100}%
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

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
        <div className="relative w-full md:w-64">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl py-3 pl-4 pr-10 text-white text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors appearance-none cursor-pointer"
          >
            <option value="ALL">All Proposals</option>
            <option value={ProposalStatus.OPEN_FOR_VOTING}>Open for Voting</option>
            <option value={ProposalStatus.ESCROWED}>Escrowed</option>
            <option value={ProposalStatus.RELEASED}>Released</option>
            <option value={ProposalStatus.VERIFICATION_FAILED}>Verification Failed</option>
            <option value={ProposalStatus.REJECTED}>Rejected</option>
          </select>
          <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none w-5 h-5" />
        </div>
        
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

        {isConnected && (
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
            
            // Map statuses to Stitch classes
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
              // Draft / Submitted / Unknown
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
                    <div className="flex items-start gap-4 flex-col md:flex-row">
                      {statusBadge}
                      <div>
                        <h3 className="text-2xl font-display font-semibold text-white">{prop.title}</h3>
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
                      <Coins className="w-4 h-4 text-zinc-400" />
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
