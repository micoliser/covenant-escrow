"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { useTransaction } from '@/hooks/useTransaction';
import { Dao } from '@/types';
import { ArrowLeft, CheckCircle2, Loader2, Info } from 'lucide-react';
import Link from 'next/link';
import { parseGen } from '@/lib/parseGen';
import { formatUnits } from 'viem';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

export default function CreateProposal() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const daoId = params.daoId as string;
  const initialDraftId = searchParams.get('draftId');
  const { fetchApi } = useApi();
  const { execute, isLocked, error: txError } = useTransaction();

  const [dao, setDao] = useState<Dao | null>(null);
  const [step, setStep] = useState(1);
  const [draftId, setDraftId] = useState<number | null>(initialDraftId ? parseInt(initialDraftId) : null);
  
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deliverableCriteria, setDeliverableCriteria] = useState('');
  const [requestedAmount, setRequestedAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [isConfirmed, setIsConfirmed] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successStatus, setSuccessStatus] = useState<string | null>(null);

  useEffect(() => {
    async function loadDao() {
      try {
        const res = await fetchApi(`/api/daos/${daoId}/`);
        if (!res.ok) throw new Error("Failed to load DAO");
        const data = await res.json();
        setDao(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load DAO");
      } finally {
        setIsLoading(false);
      }
    }
    if (daoId) loadDao();
  }, [daoId, fetchApi]);

  useEffect(() => {
    let mounted = true;
    async function loadDraft() {
      try {
        const res = await fetchApi(`/api/proposals/drafts/${initialDraftId}/`);
        if (!res.ok) throw new Error("Failed to load draft");
        const data = await res.json();
        if (!mounted) return;
        
        setTitle(data.title || '');
        setDescription(data.description || '');
        
        if (data.deliverable_criteria) {
          setDeliverableCriteria(data.deliverable_criteria);
          if (data.requested_amount && data.deadline) {
            const genAmount = formatUnits(BigInt(data.requested_amount), 18);
            setRequestedAmount(genAmount);
            
            const dateObj = new Date(data.deadline);
            const formattedDeadline = dateObj.toISOString().slice(0, 16);
            setDeadline(formattedDeadline);
            setStep(4);
          } else {
            setStep(3);
          }
        } else {
          setStep(2);
        }
      } catch (err) {
        console.error("Failed to load draft:", err);
      }
    }
    if (initialDraftId) loadDraft();
    return () => { mounted = false; };
  }, [initialDraftId, fetchApi]);

  const maxAmountGen = dao ? (parseFloat(formatUnits(BigInt(dao.total_balance), 18)) * (dao.funding_cap_bps / 10000)) : 0;

  const handleStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description) {
      setError("Title and description are required.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      if (!draftId) {
        const res = await fetchApi(`/api/daos/${daoId}/proposals/drafts/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description, dao_id: parseInt(daoId) })
        });
        if (!res.ok) throw new Error("Failed to create draft");
        const data = await res.json();
        setDraftId(data.id);
        router.replace(`/dao/${daoId}/proposal/create?draftId=${data.id}`);
      } else {
        const res = await fetchApi(`/api/proposals/drafts/${draftId}/`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description })
        });
        if (!res.ok) throw new Error("Failed to update draft");
      }
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (dao && deliverableCriteria.length < dao.min_criteria_length) {
      setError(`Deliverable criteria must be at least ${dao.min_criteria_length} characters.`);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetchApi(`/api/proposals/drafts/${draftId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliverable_criteria: deliverableCriteria })
      });
      if (!res.ok) throw new Error("Failed to update draft");
      setStep(3);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStep3 = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(requestedAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Please enter a valid requested amount.");
      return;
    }
    if (dao && amountNum > maxAmountGen) {
      setError(`Requested amount exceeds DAO funding cap of ${maxAmountGen.toFixed(2)} GEN.`);
      return;
    }
    if (!deadline) {
      setError("Please select a target deadline.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const parsedAmount = parseGen(requestedAmount);
      const deadlineDate = new Date(deadline);
      const res = await fetchApi(`/api/proposals/drafts/${draftId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          requested_amount: parsedAmount,
          deadline: deadlineDate.toISOString() 
        })
      });
      if (!res.ok) throw new Error("Failed to update draft");
      setStep(4);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save draft");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConfirmed) {
      setError("You must confirm before submitting.");
      return;
    }
    const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
    if (!contractAddress) return;
    
    setIsSubmitting(true);
    setError(null);

    try {
      const prepRes = await fetchApi(`/api/proposals/drafts/${draftId}/prepare-submit/`, {
        method: 'POST'
      });
      if (!prepRes.ok) {
        const errorData = await prepRes.json();
        throw new Error(errorData.detail || errorData.error || "Failed to prepare submission");
      }
      const prepData = await prepRes.json();
      
      const args = prepData.args;
      args[4] = BigInt(args[4]);

      await execute(
        contractAddress, 
        'submit_proposal', 
        args, 
        {
          confirmingMessage: "Please confirm the proposal creation in your wallet...",
          submittedMessage: "Proposal submitted, waiting for confirmation...",
          confirmedMessage: "Proposal created successfully!",
          onConfirmed: async () => {
            let latestId = null;
            try {
              const res = await fetchApi(`/api/daos/${daoId}/proposals/latest/`, { method: 'POST' });
              if (res.ok) {
                const data = await res.json();
                latestId = data.proposal_id;
              }
            } catch (e) {
              console.error("Failed to fetch latest proposal ID", e);
            }

            if (latestId) {
              router.push(`/proposal/${latestId}`);
            } else {
              router.push(`/dao/${daoId}`);
            }
            router.refresh();
          }
        }
      );
    } catch (e) {
      console.error(e);
      setError("Failed to create proposal");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isSaving = isSubmitting || isLocked;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-24 mt-24">
      <Link
        href={`/dao/${daoId}`}
        className="inline-flex items-center text-sm font-medium text-zinc-400 hover:text-white transition-colors mb-2"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to {dao?.name || 'DAO'}
      </Link>

      <div className="space-y-2 mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Create Proposal</h1>
        <p className="text-zinc-400">Request funding for a deliverable</p>
      </div>

      <div className="flex items-center justify-between mb-8 px-2 relative">
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-zinc-800 -z-10 -translate-y-1/2"></div>
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex flex-col items-center">
            <div
              className={cn(
                "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ring-4 ring-zinc-950",
                s < step 
                  ? "bg-accent text-white" 
                  : s === step 
                    ? "bg-zinc-800 border-2 border-accent text-white" 
                    : "bg-zinc-900 border-2 border-zinc-800 text-zinc-500"
              )}
            >
              {s < step ? <CheckCircle2 className="h-6 w-6" /> : s}
            </div>
            <span className={cn(
              "absolute -bottom-6 text-xs font-medium whitespace-nowrap",
              s <= step ? "text-zinc-300" : "text-zinc-600"
            )}>
              {s === 1 && "Basic Info"}
              {s === 2 && "Deliverables"}
              {s === 3 && "Funding"}
              {s === 4 && "Review"}
            </span>
          </div>
        ))}
      </div>

      {(error || txError) && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm mt-8">
          {error || txError}
        </div>
      )}
      
      {successStatus && (
        <div className="bg-accent/10 border border-accent/20 text-accent px-4 py-3 rounded-xl text-sm flex items-center mt-8">
          <Loader2 className="h-4 w-4 animate-spin mr-3" />
          {successStatus}
        </div>
      )}

      <div className="mt-12">
        {step === 1 && (
          <Card className="bg-zinc-900/50 backdrop-blur-md border-zinc-800/50">
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>What is the high-level idea of your proposal?</CardDescription>
            </CardHeader>
            <form onSubmit={handleStep1}>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Proposal Title</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Redesign DAO Landing Page"
                    required
                    className="bg-zinc-950/50 border-zinc-800"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Detailed Description</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Explain the problem you are solving and why it benefits the DAO..."
                    required
                    className="min-h-[150px] bg-zinc-950/50 border-zinc-800"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end border-t border-zinc-800/50 pt-6 mt-6">
                <Button type="submit" disabled={isSaving} className="bg-accent hover:bg-accent/90 text-white min-w-32">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Next Step
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {step === 2 && (
          <Card className="bg-zinc-900/50 backdrop-blur-md border-zinc-800/50">
            <CardHeader>
              <CardTitle>Deliverable Criteria</CardTitle>
              <CardDescription>How will validators know the work is complete?</CardDescription>
            </CardHeader>
            <form onSubmit={handleStep2}>
              <CardContent className="space-y-6">
                <div className="bg-accent/10 border border-accent/20 p-4 rounded-xl flex gap-3 text-accent text-sm">
                  <Info className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <p>Be extremely specific. Your funds will be locked in escrow and only released if AI validators confirm you met these exact criteria.</p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Acceptance Criteria</label>
                  <Textarea
                    value={deliverableCriteria}
                    onChange={(e) => setDeliverableCriteria(e.target.value)}
                    placeholder="1. Provide a Figma link with the new designs.&#10;2. Implement responsive HTML/Tailwind templates.&#10;3. Deploy to a Vercel preview environment."
                    required
                    className="min-h-[200px] bg-zinc-950/50 border-zinc-800 font-mono text-sm"
                  />
                  <div className="flex justify-end mt-2">
                    <span className={cn(
                      "text-xs font-medium",
                      deliverableCriteria.length < (dao?.min_criteria_length || 0) ? "text-red-400" : "text-emerald-500"
                    )}>
                      {deliverableCriteria.length} / {dao?.min_criteria_length} min characters
                    </span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t border-zinc-800/50 pt-6 mt-6">
                <Button type="button" variant="ghost" onClick={() => setStep(1)} className="text-zinc-400 hover:text-white">
                  Back
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSaving || (dao && deliverableCriteria.length < dao.min_criteria_length) || false} 
                  className="bg-accent hover:bg-accent/90 text-white min-w-32"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Next Step
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {step === 3 && (
          <Card className="bg-zinc-900/50 backdrop-blur-md border-zinc-800/50">
            <CardHeader>
              <CardTitle>Funding & Timeline</CardTitle>
              <CardDescription>How much are you requesting and when will it be done?</CardDescription>
            </CardHeader>
            <form onSubmit={handleStep3}>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Requested Amount (GEN)</label>
                  <div className="relative">
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      value={requestedAmount}
                      onChange={(e) => setRequestedAmount(e.target.value)}
                      placeholder="0.00"
                      required
                      className="pl-4 pr-16 py-6 text-xl bg-zinc-950/50 border-zinc-800"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none">
                      <span className="text-zinc-400 font-medium">GEN</span>
                    </div>
                  </div>
                  {dao && (
                    <div className="mt-3 p-4 bg-zinc-950/30 rounded-lg border border-zinc-800/50 flex flex-col sm:flex-row justify-between gap-2 text-sm">
                      <div className="text-zinc-400">
                        Available Treasury: <span className="text-white font-medium">{parseFloat(formatUnits(BigInt(dao.total_balance), 18)).toFixed(2)} GEN</span>
                      </div>
                      <div className={cn(
                        "font-medium",
                        parseFloat(requestedAmount || '0') > maxAmountGen ? "text-red-400" : "text-emerald-500"
                      )}>
                        Max Funding Cap: {maxAmountGen.toFixed(2)} GEN
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-300">Target Deadline</label>
                  <Input
                    type="datetime-local"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    required
                    className="bg-zinc-950/50 border-zinc-800 py-6"
                  />
                  <p className="text-xs text-zinc-500 mt-2">
                    If you do not deliver by this date, the DAO may initiate a reclaim process to recover the escrowed funds.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t border-zinc-800/50 pt-6 mt-6">
                <Button type="button" variant="ghost" onClick={() => setStep(2)} className="text-zinc-400 hover:text-white">
                  Back
                </Button>
                <Button type="submit" disabled={isSaving} className="bg-accent hover:bg-accent/90 text-white min-w-32">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Next Step
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}

        {step === 4 && (
          <Card className="bg-zinc-900/50 backdrop-blur-md border-zinc-800/50">
            <CardHeader>
              <CardTitle>Review & Submit</CardTitle>
              <CardDescription>Review your proposal details before submitting on-chain.</CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-400 mb-1">Proposal Title</h3>
                    <p className="text-lg font-medium text-white">{title}</p>
                  </div>
                  
                  <div>
                    <h3 className="text-sm font-medium text-zinc-400 mb-1">Description</h3>
                    <p className="text-zinc-300 whitespace-pre-wrap">{description}</p>
                  </div>

                  <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800/50">
                    <h3 className="text-sm font-medium text-zinc-400 mb-3">Deliverable Criteria</h3>
                    <p className="text-zinc-300 font-mono text-sm whitespace-pre-wrap">{deliverableCriteria}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800/50">
                      <h3 className="text-sm font-medium text-zinc-400 mb-1">Requested Amount</h3>
                      <p className="text-xl font-bold text-accent">{requestedAmount} GEN</p>
                    </div>
                    <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800/50">
                      <h3 className="text-sm font-medium text-zinc-400 mb-1">Target Deadline</h3>
                      <p className="text-lg font-medium text-white">
                        {new Date(deadline).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox 
                      checked={isConfirmed} 
                      onCheckedChange={(c) => setIsConfirmed(c as boolean)} 
                      className="mt-1 border-amber-500/50 data-[state=checked]:bg-amber-500 data-[state=checked]:text-zinc-950"
                    />
                    <span className="text-sm text-amber-200/90 leading-relaxed">
                      I understand that this proposal will be submitted on-chain. If approved, my requested funds will be locked in an intelligent escrow and will only be released if AI validators determine that I have met the exact deliverable criteria specified above.
                    </span>
                  </label>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t border-zinc-800/50 pt-6 mt-6">
                <Button type="button" variant="ghost" onClick={() => setStep(3)} disabled={isSaving || isLocked} className="text-zinc-400 hover:text-white">
                  Back
                </Button>
                <Button 
                  onClick={handleSubmit} 
                  disabled={!isConfirmed || isSaving || isLocked}
                  className="bg-accent hover:bg-accent-hover text-white flex-1"
                >
                  {(isSaving || isLocked) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Submit to Blockchain
                </Button>
              </CardFooter>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
