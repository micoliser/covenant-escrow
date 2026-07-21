"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { Proposal, ProposalHistoryEvent } from '@/types';
import { formatGen } from '@/lib/formatGen';
import { SkeletonPageHeader, SkeletonCard } from '@/components/Skeletons';
import { StatusBadge, getStatusDetails } from '@/components/StatusBadge';
import { ProgressBar } from '@/components/ProgressBar';
import { ArrowLeft, Clock, History, ExternalLink, Activity } from 'lucide-react';

export default function ProposalDetail() {
  const params = useParams();
  const router = useRouter();
  const proposalId = params.proposalId as string;
  
  const { fetchApi } = useApi();
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [history, setHistory] = useState<ProposalHistoryEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!proposalId) return;
      try {
        setIsLoading(true);
        const [propRes, histRes] = await Promise.all([
          fetchApi(`/api/proposals/${proposalId}/`),
          fetchApi(`/api/proposals/${proposalId}/history/`)
        ]);

        if (propRes.ok) setProposal(await propRes.json());
        if (histRes.ok) {
          const histData = await histRes.json();
          // Endpoint returns { results: [] }
          setHistory(histData.results || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [proposalId, fetchApi]);

  if (isLoading || !proposal) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <SkeletonPageHeader />
        <SkeletonCard />
      </div>
    );
  }

  // Calculate countdown
  const now = new Date();
  const voteEndsAt = new Date(proposal.vote_ends_at);
  const isVoting = voteEndsAt > now;
  const timeDiff = Math.max(0, voteEndsAt.getTime() - now.getTime());
  const hoursLeft = Math.floor(timeDiff / (1000 * 60 * 60));
  const minsLeft = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <button 
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-zinc-500 hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      {/* Header section */}
      <div className="mb-10">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <StatusBadge status={proposal.status} />
          <span className="text-sm font-mono text-zinc-500 bg-zinc-900/50 px-2 py-1 rounded-md">
            ID: {proposal.proposal_id}
          </span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-4">{proposal.title}</h1>
        
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span>Proposed by:</span>
          <span className="font-mono bg-zinc-900/50 px-2 py-1 rounded-md">{proposal.contributor}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          {/* Details */}
          <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl p-6 md:p-8">
            <h3 className="text-lg font-display font-semibold mb-3">Description</h3>
            <p className="text-foreground/80 leading-relaxed mb-8 whitespace-pre-wrap">
              {proposal.description}
            </p>

            <h3 className="text-lg font-display font-semibold mb-3">Deliverable Criteria</h3>
            <div className="p-4 bg-zinc-900/80 rounded-xl border border-zinc-800/50 text-foreground/80 leading-relaxed">
              {proposal.deliverable_criteria}
            </div>

            {proposal.deliverable_url && (
              <div className="mt-8">
                <h3 className="text-lg font-display font-semibold mb-3">Submitted Deliverable</h3>
                <a 
                  href={proposal.deliverable_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-accent hover:text-accent-hover transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  View Deliverable
                </a>
                {proposal.delivery_notes && (
                  <p className="mt-3 text-sm text-zinc-400 p-4 bg-zinc-900/50 rounded-xl">
                    {proposal.delivery_notes}
                  </p>
                )}
              </div>
            )}
          </div>
          
          {/* History Collapsible */}
          <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-2xl overflow-hidden">
            <button 
              onClick={() => setHistoryOpen(!historyOpen)}
              className="w-full flex items-center justify-between p-6 hover:bg-zinc-800/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-zinc-400" />
                <h3 className="text-lg font-display font-semibold">History Timeline</h3>
              </div>
              <span className="text-xs text-zinc-500 font-medium">
                {historyOpen ? 'HIDE' : 'SHOW'}
              </span>
            </button>
            
            {historyOpen && (
              <div className="p-6 pt-0 border-t border-zinc-800/50">
                {history.length === 0 ? (
                  <p className="text-sm text-zinc-500 text-center py-4">No events found.</p>
                ) : (
                  <div className="space-y-6 pt-6">
                    {history.map((event, i) => (
                      <div key={event.id} className="relative pl-6">
                        {/* Line */}
                        {i !== history.length - 1 && (
                          <div className="absolute left-[11px] top-6 bottom-[-24px] w-px bg-zinc-800"></div>
                        )}
                        {/* Dot */}
                        <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-4 border-black ${getStatusDetails(event.to_status).colorClass.split(' ')[1]}`}></div>
                        
                        <div className="flex flex-col gap-1">
                          <p className="text-sm font-medium text-foreground">
                            Status changed to <span className={getStatusDetails(event.to_status).colorClass.split(' ')[0]}>{getStatusDetails(event.to_status).label}</span>
                          </p>
                          <p className="text-xs text-zinc-500 font-mono">
                            {new Date(event.observed_at).toLocaleString()}
                          </p>
                          {event.chain_tx_hash && (
                            <p className="text-xs text-zinc-500 font-mono break-all">
                              Tx: {event.chain_tx_hash}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Info Card */}
        <div className="space-y-6">
          <div className="bg-zinc-900/50 backdrop-blur-md border border-zinc-800 rounded-2xl p-6 sticky top-6">
            <div className="mb-6">
              <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium mb-1 block">
                Requested Amount
              </span>
              <span className="text-3xl font-display font-semibold text-foreground">
                {formatGen(proposal.requested_amount)} GEN
              </span>
            </div>

            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" /> Current Votes
                </span>
                {isVoting && (
                  <span className="text-xs text-accent flex items-center gap-1 font-medium bg-accent/10 px-2 py-0.5 rounded-full">
                    <Clock className="w-3 h-3" />
                    {hoursLeft}h {minsLeft}m left
                  </span>
                )}
              </div>
              
              <ProgressBar 
                yesWeight={proposal.yes_weight} 
                noWeight={proposal.no_weight} 
              />
            </div>

            <div className="pt-6 border-t border-zinc-800/50 space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">Deadline</span>
                <span className="font-medium text-foreground">{new Date(proposal.deadline).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Submitted</span>
                <span className="font-medium text-foreground">{new Date(proposal.submitted_at).toLocaleDateString()}</span>
              </div>
              {proposal.escrowed_amount !== "0" && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Escrowed</span>
                  <span className="font-medium text-foreground">{formatGen(proposal.escrowed_amount)} GEN</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
