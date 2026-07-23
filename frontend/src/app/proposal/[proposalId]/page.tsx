"use client";

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { useAccount } from 'wagmi';
import { useTransaction } from '@/hooks/useTransaction';
import { Proposal, ProposalHistoryEvent, ProposalStatus } from '@/types';
import { formatGen } from '@/lib/formatGen';
import { SkeletonPageHeader, SkeletonCard } from '@/components/Skeletons';
import { StatusBadge, getStatusDetails } from '@/components/StatusBadge';
import { ProgressBar } from '@/components/ProgressBar';
import { ArrowLeft, Clock, History, ExternalLink, Activity, User, CheckCircle, UploadCloud, Wallet, Vote, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function ProposalDetail() {
  const params = useParams();
  const router = useRouter();
  const proposalId = params.proposalId as string;
  
  const { fetchApi } = useApi();
  const { address, isConnected } = useAccount();
  const { execute, isLocked, error: txError } = useTransaction();
  const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [history, setHistory] = useState<ProposalHistoryEvent[]>([]);
  const [allVotes, setAllVotes] = useState<any[]>([]);
  const [myVotes, setMyVotes] = useState<any[]>([]);
  const [votingPower, setVotingPower] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deliverableUrl, setDeliverableUrl] = useState('');
  const [deliverableNotes, setDeliverableNotes] = useState('');

  const loadData = async () => {
    if (!proposalId) return;
    try {
      setIsLoading(true);
      const promises = [
        fetchApi(`/api/proposals/${proposalId}/`),
        fetchApi(`/api/proposals/${proposalId}/history/`),
        fetchApi(`/api/proposals/${proposalId}/votes/`)
      ];

      if (isConnected) {
        promises.push(fetchApi(`/api/proposals/${proposalId}/votes/me/`));
      }

      const results = await Promise.all(promises);
      const propRes = results[0];
      const histRes = results[1];
      const allVotesRes = results[2];

      let propData = null;
      if (propRes.ok) {
        propData = await propRes.json();
        setProposal(propData);
      }
      if (histRes.ok) {
        const histData = await histRes.json();
        setHistory(histData.results || []);
      }
      if (allVotesRes.ok) {
        const allVotesData = await allVotesRes.json();
        setAllVotes(Array.isArray(allVotesData) ? allVotesData : (allVotesData.results || []));
      }
      if (isConnected && results[3] && results[3].ok) {
        const voteData = await results[3].json();
        setMyVotes(Array.isArray(voteData) ? voteData : (voteData.results || []));
      }

      // Fetch voting power if proposal is open for voting or reclaim voting
      if (isConnected && propData && (propData.status === 1 || propData.status === 4)) {
        const vpRes = await fetchApi(`/api/daos/${propData.dao_id}/voting-power/me/`);
        if (vpRes.ok) {
          const vpData = await vpRes.json();
          setVotingPower(vpData.voting_power);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [proposalId, fetchApi, isConnected, address]);

  if (isLoading || !proposal) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <SkeletonPageHeader />
        <SkeletonCard />
      </div>
    );
  }

  const isContributor = address?.toLowerCase() === proposal.contributor.toLowerCase();
  const now = new Date();
  
  // Funding voting
  const voteEndsAt = new Date(proposal.vote_ends_at);
  const isVoting = voteEndsAt > now;
  const timeDiff = Math.max(0, voteEndsAt.getTime() - now.getTime());
  const hoursLeft = Math.floor(timeDiff / (1000 * 60 * 60));
  const minsLeft = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

  // Escrow Deadline
  const deadline = new Date(proposal.deadline);
  const isPastDeadline = now > deadline;
  const deadlineDiff = Math.max(0, deadline.getTime() - now.getTime());
  const dHoursLeft = Math.floor(deadlineDiff / (1000 * 60 * 60));
  const dMinsLeft = Math.floor((deadlineDiff % (1000 * 60 * 60)) / (1000 * 60));

  // Reclaim voting
  const reclaimVoteEndsAt = new Date(proposal.reclaim_vote_ends_at || 0);
  const isReclaimVoting = reclaimVoteEndsAt > now;
  const reclaimTimeDiff = Math.max(0, reclaimVoteEndsAt.getTime() - now.getTime());
  const reclaimHoursLeft = Math.floor(reclaimTimeDiff / (1000 * 60 * 60));
  const reclaimMinsLeft = Math.floor((reclaimTimeDiff % (1000 * 60 * 60)) / (1000 * 60));

  const currentFundVote = myVotes.find(v => v.vote_type === 'fund');
  const currentReclaimVote = myVotes.find(v => v.vote_type === 'reclaim' && v.reclaim_round === proposal.reclaim_round);

  const handleTx = async (funcName: string, args: any[]) => {
    if (!contractAddress) return;
    await execute(contractAddress, funcName, args, {
      syncRequests: [{ entityType: 'proposal', entityId: proposal.proposal_id }],
      onConfirmed: async () => {
        loadData();
      }
    });
  };

  type TimelineEvent = 
    | {
        id: string;
        type: 'status_change';
        timestamp: number;
        observed_at: string;
        from_status: number | null;
        to_status: number;
        txHash: string;
      }
    | {
        id: string;
        type: 'vote';
        timestamp: number;
        observed_at: string;
        voter_address: string;
        support: boolean;
        weight: string;
        vote_type: string;
      };

  // Combine history and allVotes into a single timeline
  const timelineEvents: TimelineEvent[] = proposal ? [
    {
      id: 'creation',
      type: 'status_change' as const,
      timestamp: new Date(proposal.submitted_at).getTime(),
      observed_at: proposal.submitted_at,
      from_status: null,
      to_status: proposal.status === 0 ? 0 : 1,
      txHash: ''
    },
    ...history.map(h => ({
      id: `hist_${h.id}`,
      type: 'status_change' as const,
      timestamp: new Date(h.observed_at).getTime(),
      observed_at: h.observed_at,
      from_status: h.from_status,
      to_status: h.to_status,
      txHash: h.chain_tx_hash
    })),
    ...allVotes.map(v => ({
      id: `vote_${v.id}`,
      type: 'vote' as const,
      timestamp: new Date(v.voted_at).getTime(),
      observed_at: v.voted_at,
      voter_address: v.voter_address,
      support: v.support,
      weight: v.weight,
      vote_type: v.vote_type
    }))
  ].sort((a, b) => a.timestamp - b.timestamp) : [];

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 pt-24 lg:pt-32">
      <button 
        onClick={() => router.back()}
        className="inline-flex items-center gap-2 text-zinc-400 hover:text-accent transition-colors mb-8 text-sm font-medium"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Proposals
      </button>

      {/* 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Content Column (2/3) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Header */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusBadge status={proposal.status} />
              <a href={`/dao/${proposal.dao_id}`} className="bg-zinc-800 px-2 py-0.5 rounded text-xs text-zinc-300 hover:text-accent font-medium">
                {(proposal as any).dao_name || `DAO #${proposal.dao_id}`}
              </a>
              <span className="text-zinc-400 font-medium text-sm flex items-center gap-1">
                <User className="w-4 h-4" />
                {proposal.contributor.slice(0,6)}...{proposal.contributor.slice(-4)}
              </span>
              <span className="text-zinc-400 font-medium text-sm flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {new Date(proposal.submitted_at).toLocaleDateString()}
              </span>
            </div>
            <h1 className="text-4xl lg:text-5xl font-display font-bold text-white tracking-tight">
              {proposal.title}
            </h1>
          </div>

          {/* Conditional Alerts for Statuses */}
          {proposal.status === 0 && proposal.screening_rejection_reason && (
            <Card className="bg-red-500/10 border-red-500/50">
              <CardContent className="p-6">
                <h3 className="text-red-400 font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> Screening Rejected
                </h3>
                <p className="text-zinc-300 whitespace-pre-wrap">{proposal.screening_rejection_reason}</p>
              </CardContent>
            </Card>
          )}

          {[4, 6, 7].includes(proposal.status) && proposal.verdict_summary && (
            <Card className={proposal.status === 4 ? "bg-red-500/10 border-red-500/50" : "bg-green-500/10 border-green-500/50"}>
              <CardContent className="p-6">
                <h3 className={`font-semibold mb-2 flex items-center gap-2 ${proposal.status === 4 ? 'text-red-400' : 'text-green-400'}`}>
                  {proposal.status === 4 ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                  AI Verification Verdict
                </h3>
                <p className="text-zinc-300 whitespace-pre-wrap">{proposal.verdict_summary}</p>
              </CardContent>
            </Card>
          )}
          
          {proposal.status === 5 && proposal.reclaim_reason && (
            <Card className="bg-amber-500/10 border-amber-500/50">
              <CardContent className="p-6">
                <h3 className="text-amber-400 font-semibold mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" /> Escrow Reclaimed
                </h3>
                <p className="text-zinc-300 whitespace-pre-wrap">{proposal.reclaim_reason}</p>
              </CardContent>
            </Card>
          )}

          {/* Description */}
          <section className="space-y-4">
            <h2 className="text-2xl font-display font-semibold text-white">Description</h2>
            <div className="text-zinc-300 text-lg space-y-4 leading-relaxed whitespace-pre-wrap">
              {proposal.description}
            </div>
          </section>

          {/* Deliverable Criteria Box */}
          <Card className="border-l-4 border-l-accent">
            <CardContent className="p-6">
              <h3 className="text-lg font-display font-semibold text-white mb-3 flex items-center gap-2">
                <CheckCircle className="text-accent w-5 h-5" />
                Deliverable Criteria
              </h3>
              <div className="text-zinc-300 space-y-2 leading-relaxed">
                {proposal.deliverable_criteria}
              </div>
            </CardContent>
          </Card>

          {/* Submitted Deliverable */}
          {proposal.deliverable_url && (
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-display font-semibold text-white mb-3 flex items-center gap-2">
                  <ExternalLink className="text-accent w-5 h-5" />
                  Submitted Deliverable
                </h3>
                <a 
                  href={proposal.deliverable_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-accent hover:text-accent/80 transition-colors mb-4"
                >
                  View Deliverable Link
                </a>
                {proposal.delivery_notes && (
                  <div className="p-4 bg-zinc-900 rounded-lg text-zinc-400 text-sm">
                    {proposal.delivery_notes}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Timeline / History */}
          <section>
            <Card>
              <details className="group" open>
                <summary className="flex items-center justify-between p-4 cursor-pointer select-none">
                  <h2 className="text-lg font-display font-semibold text-white flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Proposal History
                  </h2>
                  <Clock className="w-5 h-5 text-zinc-500 group-open:rotate-180 transition-transform" />
                </summary>
                <div className="p-4 pt-0 border-t border-white/5 mt-2 space-y-6">
                  {timelineEvents.length === 0 ? (
                    <p className="text-sm text-zinc-500 text-center py-4">No events found.</p>
                  ) : (
                    <div className="space-y-6 pt-6">
                      {timelineEvents.map((event, i) => {
                        const isLast = i === timelineEvents.length - 1;
                        let colorBadge = 'text-zinc-500';
                        let eventText = '';
                        let txHash = '';
                        
                        if (event.type === 'vote') {
                          colorBadge = event.support ? 'text-green-400' : 'text-red-400';
                          eventText = `${event.voter_address.slice(0, 6)}...${event.voter_address.slice(-4)} voted ${event.support ? 'Yes' : 'No'}${event.vote_type === 'reclaim' ? ' (Reclaim)' : ''} (Weight: ${formatGen(event.weight)} GEN)`;
                        } else {
                          const details = getStatusDetails(event.to_status as number);
                          colorBadge = details.colorClass.split(' ')[0] || 'text-zinc-500';
                          txHash = event.txHash;
                          
                          if (event.from_status === null && event.to_status === 0) {
                            eventText = "Proposal created. AI Screening Failed.";
                          } else if (event.from_status === null && event.to_status === 1) {
                            eventText = "Proposal created. AI Screening Passed: Proposal opened for voting.";
                          } else if (event.from_status === 1 && event.to_status === 3) {
                            eventText = "Funding vote finalized. Goal reached! Funds are now securely escrowed.";
                          } else if (event.from_status === 1 && event.to_status === 2) {
                            eventText = "Funding vote finalized. Proposal rejected.";
                          } else if ((event.from_status === 3 || event.from_status === 4) && event.to_status === 6) {
                            eventText = "Contributor submitted deliverable. AI Verification Passed! Deliverable meets all criteria.";
                          } else if ((event.from_status === 3 || event.from_status === 4) && event.to_status === 4) {
                            eventText = `Contributor submitted deliverable. AI Verification Failed.${proposal?.verdict_summary ? ' Reason: ' + proposal.verdict_summary : ''}`;
                          } else if (event.from_status === 4 && event.to_status === 3) {
                            eventText = "Reclaim vote finalized. DAO voted to keep funds in escrow. Contributor can resubmit.";
                          } else if (event.from_status === 4 && event.to_status === 5) {
                            eventText = "Reclaim vote finalized. Funds successfully reclaimed to the DAO Treasury.";
                          } else if (event.from_status === 3 && event.to_status === 5) {
                            eventText = "Deadline expired. Escrowed funds were forcefully reclaimed to the DAO Treasury.";
                          } else if (event.from_status === 6 && event.to_status === 7) {
                            eventText = "Contributor successfully claimed the escrowed funds. Proposal complete!";
                          } else {
                            eventText = `Status changed to ${details.label}`;
                          }
                        }

                        const bgBadge = colorBadge.replace('text-', 'bg-');
                        
                        return (
                          <div key={event.id} className="flex gap-4 relative">
                            <div className="flex flex-col items-center">
                              <div className={`w-3 h-3 ${bgBadge} rounded-full mt-1.5 z-10 shadow-[0_0_10px_currentColor]`}></div>
                              {!isLast && <div className="w-px h-full bg-white/10 absolute top-3 bottom-0 left-[5.5px]"></div>}
                            </div>
                            <div className="pb-6">
                              <p className="text-sm text-zinc-500 mb-1 font-mono">
                                {new Date(event.observed_at).toLocaleString()}
                              </p>
                              <p className={`text-base font-medium ${colorBadge}`}>
                                {eventText}
                              </p>
                              {txHash && (
                                <p className="text-xs text-zinc-500 font-mono break-all mt-1">
                                  Tx: {txHash}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </details>
            </Card>
          </section>
        </div>

        {/* Sidebar Column (1/3) */}
        <aside className="lg:col-span-1 space-y-6">
          
          <Card>
            <CardContent className="p-6">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <p className="text-zinc-400 text-xs uppercase tracking-wider font-medium mb-1">Requested Amount</p>
                  <p className="text-3xl font-display font-bold text-white tabular-nums">
                    {formatGen(proposal.requested_amount)} <span className="text-xl text-zinc-400">GEN</span>
                  </p>
                </div>
                <Wallet className="w-8 h-8 text-accent opacity-80" />
              </div>
              
              {/* Status 1 & 2: Funding Vote Progress */}
              {[1, 2].includes(proposal.status) && (
                <>
                  <div className="mb-6">
                    <ProgressBar yesWeight={proposal.yes_weight} noWeight={proposal.no_weight} />
                  </div>
                  {proposal.status === 1 ? (
                    isVoting ? (
                      <div className="bg-zinc-900 rounded-lg p-4 border border-white/5 flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2 text-white">
                          <Clock className="w-5 h-5 text-zinc-400" />
                          <span className="text-sm font-medium">Voting Ends in</span>
                        </div>
                        <span className="text-lg font-medium text-accent tabular-nums">
                          {hoursLeft}h {minsLeft}m
                        </span>
                      </div>
                    ) : (
                      <div className="bg-zinc-900 rounded-lg p-4 border border-white/5 flex items-center justify-between mb-4">
                        <span className="text-sm font-medium text-zinc-400">Voting Closed</span>
                      </div>
                    )
                  ) : (
                    <div className="bg-zinc-900 rounded-lg p-4 border border-white/5 flex items-center justify-between mb-4">
                      <span className="text-sm font-medium text-red-400">Vote Failed</span>
                    </div>
                  )}
                </>
              )}

              {/* Status 4: Reclaim Vote Progress */}
              {proposal.status === 4 && (
                <>
                  <p className="text-zinc-400 text-xs uppercase mb-2">Reclaim Vote</p>
                  <div className="mb-6">
                    <ProgressBar yesWeight={proposal.reclaim_yes_weight} noWeight={proposal.reclaim_no_weight} />
                  </div>
                  {isReclaimVoting ? (
                    <div className="bg-zinc-900 rounded-lg p-4 border border-white/5 flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 text-white">
                        <Clock className="w-5 h-5 text-zinc-400" />
                        <span className="text-sm font-medium">Reclaim Ends in</span>
                      </div>
                      <span className="text-lg font-medium text-amber-400 tabular-nums">
                        {reclaimHoursLeft}h {reclaimMinsLeft}m
                      </span>
                    </div>
                  ) : (
                    <div className="bg-zinc-900 rounded-lg p-4 border border-white/5 flex items-center justify-between mb-4">
                      <span className="text-sm font-medium text-zinc-400">Reclaim Voting Closed</span>
                    </div>
                  )}
                </>
              )}

              {/* Action Buttons Logic */}
              <div className="space-y-3">
                {txError && <p className="text-red-400 text-sm mb-4">{txError}</p>}
                
                {/* Status 1: Open For Voting Actions */}
                {proposal.status === 1 && (
                  <>
                    {isVoting ? (
                      !isConnected ? (
                        <div className="text-center p-3 bg-zinc-900 rounded-lg text-sm text-zinc-400">Connect Wallet to Vote</div>
                      ) : currentFundVote ? (
                        <div className="text-center p-3 bg-accent/20 border border-accent/30 rounded-lg text-sm text-accent-light">
                          You voted: {currentFundVote.support ? 'Yes' : 'No'}
                        </div>
                      ) : votingPower === "0" ? (
                        <div className="text-center p-3 bg-zinc-900 rounded-lg text-sm text-zinc-400">You have no voting power in this DAO</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <Button disabled={isLocked} onClick={() => handleTx('cast_vote', [proposal.proposal_id, 'fund', true])} className="bg-accent text-white py-6 hover:bg-accent-hover">Vote Yes</Button>
                          <Button disabled={isLocked} onClick={() => handleTx('cast_vote', [proposal.proposal_id, 'fund', false])} variant="outline" className="text-white border-zinc-700 py-6 hover:bg-zinc-800">Vote No</Button>
                        </div>
                      )
                    ) : (
                      <Button disabled={isLocked} onClick={() => handleTx('finalize_vote', [proposal.proposal_id])} className="w-full bg-accent text-white">Finalize Vote</Button>
                    )}
                  </>
                )}

                {/* Status 3: Escrowed Actions */}
                {proposal.status === 3 && (
                  <>
                    <div className="bg-zinc-900 rounded-lg p-4 border border-white/5 flex items-center justify-between mb-4">
                       <span className="text-sm text-zinc-400">Deadline in:</span>
                       <span className="text-accent">{isPastDeadline ? 'Expired' : `${dHoursLeft}h ${dMinsLeft}m`}</span>
                    </div>
                    {isContributor ? (
                      <div className="space-y-3">
                        <Input placeholder="Deliverable URL" value={deliverableUrl} onChange={e => setDeliverableUrl(e.target.value)} />
                        <Textarea placeholder="Notes (optional)" value={deliverableNotes} onChange={e => setDeliverableNotes(e.target.value)} />
                        <Button disabled={isLocked || !deliverableUrl} onClick={() => handleTx('submit_deliverable', [proposal.proposal_id, deliverableUrl, deliverableNotes])} className="w-full bg-accent text-white">Submit Deliverable</Button>
                      </div>
                    ) : (
                      <div className="text-center p-3 bg-zinc-900 rounded-lg text-sm text-zinc-400">Awaiting delivery from contributor</div>
                    )}
                    {isPastDeadline && !isContributor && (
                      <Button disabled={isLocked} onClick={() => handleTx('reclaim_expired_escrow', [proposal.proposal_id])} className="w-full bg-amber-500 hover:bg-amber-600 text-white mt-4">Reclaim Expired Escrow</Button>
                    )}
                  </>
                )}

                {/* Status 4: VerificationFailed Actions */}
                {proposal.status === 4 && (
                  <>
                    {isContributor && (
                      <div className="mb-6 p-4 border border-white/10 rounded-lg">
                        <p className="text-sm font-medium mb-2">Resubmit ({proposal.resubmission_count}/3)</p>
                        {proposal.resubmission_count < 3 /* Assume max_resubmissions = 3, though it's on DAO */ ? (
                          <div className="space-y-3">
                            <Input placeholder="New Deliverable URL" value={deliverableUrl} onChange={e => setDeliverableUrl(e.target.value)} />
                            <Textarea placeholder="Notes" value={deliverableNotes} onChange={e => setDeliverableNotes(e.target.value)} />
                            <Button disabled={isLocked || !deliverableUrl} onClick={() => handleTx('submit_deliverable', [proposal.proposal_id, deliverableUrl, deliverableNotes])} className="w-full bg-accent text-white">Resubmit Deliverable</Button>
                          </div>
                        ) : (
                          <p className="text-red-400 text-sm text-center">Maximum resubmission attempts reached</p>
                        )}
                      </div>
                    )}

                    {!isContributor && isReclaimVoting && (
                      !isConnected ? (
                        <div className="text-center p-3 bg-zinc-900 rounded-lg text-sm text-zinc-400">Connect Wallet to Vote</div>
                      ) : currentReclaimVote ? (
                        <div className="text-center p-3 bg-accent/20 border border-accent/30 rounded-lg text-sm text-accent-light">
                          You voted: {currentReclaimVote.support ? 'Yes' : 'No'}
                        </div>
                      ) : votingPower === "0" ? (
                        <div className="text-center p-3 bg-zinc-900 rounded-lg text-sm text-zinc-400">You have no voting power in this DAO</div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          <Button disabled={isLocked} onClick={() => handleTx('cast_vote', [proposal.proposal_id, 'reclaim', true])} className="bg-amber-500 text-white py-6 hover:bg-amber-600">Vote Yes (Reclaim)</Button>
                          <Button disabled={isLocked} onClick={() => handleTx('cast_vote', [proposal.proposal_id, 'reclaim', false])} variant="outline" className="text-white border-zinc-700 py-6 hover:bg-zinc-800">Vote No (Keep)</Button>
                        </div>
                      )
                    )}
                    
                    {!isReclaimVoting && (
                      <Button disabled={isLocked} onClick={() => handleTx('finalize_reclaim', [proposal.proposal_id])} className="w-full bg-amber-500 hover:bg-amber-600 text-white">Finalize Reclaim</Button>
                    )}
                  </>
                )}

                {/* Status 6: VerificationPassed Actions */}
                {proposal.status === 6 && (
                  isContributor ? (
                    <Button disabled={isLocked} onClick={() => handleTx('claim_funds', [proposal.proposal_id])} className="w-full bg-green-500 hover:bg-green-600 text-white py-6">
                      <Wallet className="w-5 h-5 mr-2" /> Claim Funds
                    </Button>
                  ) : (
                    <div className="text-center p-3 bg-zinc-900 rounded-lg text-sm text-zinc-400">Verified -- awaiting contributor claim.</div>
                  )
                )}

              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
