"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Dao, PaginatedResponse, Proposal, ProposalStatus } from '@/types';
import { formatGen } from '@/lib/formatGen';
import { SkeletonPageHeader, SkeletonCard } from '@/components/Skeletons';
import { StatusBadge } from '@/components/StatusBadge';
import { Search, Filter, Calendar, Coins } from 'lucide-react';

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

  useEffect(() => {
    async function loadData() {
      if (!daoId) return;
      try {
        setIsLoading(true);
        // Fetch DAO and Proposals concurrently
        let proposalsUrl = `/api/proposals/?dao_id=${daoId}`;
        if (search) proposalsUrl += `&search=${encodeURIComponent(search)}`;
        if (statusFilter !== 'ALL') proposalsUrl += `&status=${statusFilter}`;

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
  }, [daoId, fetchApi, search, statusFilter]);

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
    <div className="max-w-5xl mx-auto px-6 py-12">
      {/* Header */}
      {dao && (
        <div className="mb-12">
          <h1 className="text-4xl font-display font-bold mb-4 tracking-tight">{dao.name}</h1>
          <p className="text-foreground/70 max-w-3xl text-lg mb-8">
            {dao.description}
          </p>
          
          <div className="flex flex-wrap gap-4">
            <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-xl px-5 py-3 flex items-center gap-3">
              <div className="p-2 bg-accent/10 rounded-lg">
                <Coins className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-xs text-foreground/50 font-medium uppercase tracking-wider">Treasury Balance</p>
                <p className="text-xl font-display font-semibold">{formatGen(dao.total_balance)} GEN</p>
              </div>
            </div>
            
            <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-xl px-5 py-3 flex items-center gap-3">
              <div className="p-2 bg-zinc-800 rounded-lg">
                <Calendar className="w-5 h-5 text-zinc-400" />
              </div>
              <div>
                <p className="text-xs text-foreground/50 font-medium uppercase tracking-wider">Voting Period</p>
                <p className="text-xl font-display font-semibold">
                  {dao.voting_period_seconds / 60} mins
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-8">
        <h2 className="text-2xl font-display font-semibold">Proposals</h2>
        
        <div className="flex gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search proposals..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-zinc-900/50 border border-zinc-800 rounded-lg text-sm focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 w-full sm:w-64 transition-all"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-9 pr-8 py-2 bg-zinc-900/50 border border-zinc-800 rounded-lg text-sm focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 appearance-none cursor-pointer"
            >
              <option value="ALL">All Statuses</option>
              <option value={ProposalStatus.OPEN_FOR_VOTING}>Voting Open</option>
              <option value={ProposalStatus.ESCROWED}>Escrowed</option>
              <option value={ProposalStatus.RELEASED}>Released</option>
              <option value={ProposalStatus.VERIFICATION_FAILED}>Verification Failed</option>
              <option value={ProposalStatus.REJECTED}>Rejected</option>
            </select>
          </div>
        </div>
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
          proposals.map((prop) => (
            <div 
              key={prop.proposal_id}
              onClick={() => router.push(`/proposal/${prop.proposal_id}`)}
              className="group cursor-pointer bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 hover:border-accent/50 hover:bg-zinc-800/50 transition-all duration-300"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-xl font-display font-semibold group-hover:text-accent transition-colors mb-2">
                    {prop.title}
                  </h3>
                  <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
                    <span>ID: {prop.proposal_id}</span>
                    <span>•</span>
                    <span>By: {prop.contributor.slice(0,6)}...{prop.contributor.slice(-4)}</span>
                  </div>
                </div>
                <StatusBadge status={prop.status} />
              </div>
              
              <p className="text-foreground/70 text-sm line-clamp-2 mb-6">
                {prop.description}
              </p>
              
              <div className="flex items-center gap-6 pt-4 border-t border-zinc-800/50 text-sm">
                <div>
                  <span className="text-zinc-500 block text-xs mb-0.5">Requested</span>
                  <span className="font-medium">{formatGen(prop.requested_amount)} GEN</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-xs mb-0.5">Deadline</span>
                  <span className="font-medium">
                    {new Date(prop.deadline).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
