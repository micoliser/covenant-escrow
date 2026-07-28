"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApi } from '@/hooks/useApi';
import { useTransaction } from '@/hooks/useTransaction';
import { useAccount } from 'wagmi';
import { ArrowLeft, CheckCircle2, Info, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useHasMounted } from '@/hooks/useHasMounted';

export default function CreateDaoPage() {
  const router = useRouter();
  const { fetchApi } = useApi();
  const { execute, isLocked, error: txError } = useTransaction();
  const { isConnected } = useAccount();
  const hasMounted = useHasMounted();

  const [step, setStep] = useState(1);

  // Basic Info
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Configuration - with defaults
  const [quorumBps, setQuorumBps] = useState<number>(1000); // 10%
  const [quorumInput, setQuorumInput] = useState<string>("10");
  
  const [approvalThresholdBps, setApprovalThresholdBps] = useState<number>(5000); // 50%
  const [approvalInput, setApprovalInput] = useState<string>("50");

  const [votingPeriodValue, setVotingPeriodValue] = useState<string>("3");
  const [votingPeriodUnit, setVotingPeriodUnit] = useState<string>("DAYS");

  const [fundingCapBps, setFundingCapBps] = useState<number>(1000); // 10%
  const [fundingCapInput, setFundingCapInput] = useState<string>("10");

  const [maxResubmissions, setMaxResubmissions] = useState<number>(3);
  const [minCriteriaLength, setMinCriteriaLength] = useState<number>(20);

  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load draft from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('createDaoDraft');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.step) setStep(parsed.step);
        if (parsed.name) setName(parsed.name);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.quorumBps !== undefined) setQuorumBps(parsed.quorumBps);
        if (parsed.quorumInput !== undefined) setQuorumInput(parsed.quorumInput);
        if (parsed.approvalThresholdBps !== undefined) setApprovalThresholdBps(parsed.approvalThresholdBps);
        if (parsed.approvalInput !== undefined) setApprovalInput(parsed.approvalInput);
        if (parsed.votingPeriodValue !== undefined) setVotingPeriodValue(parsed.votingPeriodValue);
        if (parsed.votingPeriodUnit !== undefined) setVotingPeriodUnit(parsed.votingPeriodUnit);
        if (parsed.fundingCapBps !== undefined) setFundingCapBps(parsed.fundingCapBps);
        if (parsed.fundingCapInput !== undefined) setFundingCapInput(parsed.fundingCapInput);
        if (parsed.maxResubmissions !== undefined) setMaxResubmissions(parsed.maxResubmissions);
        if (parsed.minCriteriaLength !== undefined) setMinCriteriaLength(parsed.minCriteriaLength);
      } catch (e) {
        console.error('Failed to parse saved draft', e);
      }
    }
  }, []);

  // Save draft to localStorage when state changes
  useEffect(() => {
    const draft = {
      step,
      name,
      description,
      quorumBps,
      quorumInput,
      approvalThresholdBps,
      approvalInput,
      votingPeriodValue,
      votingPeriodUnit,
      fundingCapBps,
      fundingCapInput,
      maxResubmissions,
      minCriteriaLength,
    };
    localStorage.setItem('createDaoDraft', JSON.stringify(draft));
  }, [step, name, description, quorumBps, quorumInput, approvalThresholdBps, approvalInput, votingPeriodValue, votingPeriodUnit, fundingCapBps, fundingCapInput, maxResubmissions, minCriteriaLength]);

  const handleStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("DAO Name is required.");
      return;
    }
    setError(null);
    setStep(2);
  };

  const handleStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    let val = parseInt(votingPeriodValue);
    if (isNaN(val) || val < 1) {
      setError("Voting period must be at least 1.");
      return;
    }
    setError(null);
    setStep(3);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isConnected) {
      setError("Please connect your wallet first.");
      return;
    }
    if (!isConfirmed) {
      setError("You must confirm that you understand the responsibilities of creating a DAO.");
      return;
    }

    const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
    if (!contractAddress) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Calculate voting period in seconds
      let multiplier = 1;
      if (votingPeriodUnit === "MINUTES") multiplier = 60;
      else if (votingPeriodUnit === "HOURS") multiplier = 3600;
      else if (votingPeriodUnit === "DAYS") multiplier = 86400;
      
      const votingPeriodSeconds = Math.max(1, parseInt(votingPeriodValue) * multiplier);

      const payload = {
        name: name.trim(),
        description: description.trim(),
        quorum_bps: quorumBps,
        approval_threshold_bps: approvalThresholdBps,
        voting_period_seconds: votingPeriodSeconds,
        funding_cap_bps: fundingCapBps,
        max_resubmissions: maxResubmissions,
        min_criteria_length: minCriteriaLength
      };

      const prepRes = await fetchApi('/api/daos/prepare-create/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!prepRes.ok) {
        const errorData = await prepRes.json();
        throw new Error(errorData.detail || errorData.error || "Failed to prepare submission");
      }
      
      const prepData = await prepRes.json();
      const args = prepData.args;

      // Ensure proper BigInt formatting for u256 fields
      args[2] = BigInt(args[2]); // quorum_bps
      args[3] = BigInt(args[3]); // approval_threshold_bps
      args[4] = BigInt(args[4]); // voting_period_seconds
      args[5] = BigInt(args[5]); // funding_cap_bps
      args[6] = BigInt(args[6]); // max_resubmissions
      args[7] = BigInt(args[7]); // min_criteria_length

      await execute(
        contractAddress,
        'create_dao',
        args,
        {
          confirmingMessage: "Please confirm DAO creation in your wallet...",
          submittedMessage: "DAO creation transaction submitted, waiting for confirmation...",
          confirmedMessage: "DAO created successfully!",
          onConfirmed: async () => {
            let latestId = null;
            try {
              const res = await fetchApi('/api/daos/latest/', { method: 'POST' });
              if (res.ok) {
                const data = await res.json();
                latestId = data.dao_id;
              }
            } catch (e) {
              console.error("Failed to fetch latest DAO ID", e);
            }

            if (latestId !== null) {
              router.push(`/dao/${latestId}`);
            } else {
              router.push('/daos');
            }
            router.refresh();
          }
        }
      );
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : "Failed to create DAO");
      setIsSubmitting(false);
    }
  };

  const isSaving = isSubmitting || isLocked;

  if (!hasMounted) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-24 mt-24 px-4 sm:px-6">
      <Link 
        href="/daos" 
        className="inline-flex items-center text-sm font-medium text-zinc-400 hover:text-white transition-colors mb-2"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to DAOs
      </Link>

      <div className="space-y-2 mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Create a New DAO</h1>
        <p className="text-zinc-400">Initialize a new decentralized autonomous organization on Covenant Escrow.</p>
      </div>

      {!isConnected ? (
        <Card className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center">
            <h3 className="text-xl font-display font-medium text-white mb-2">Wallet Required</h3>
            <p className="text-zinc-400 mb-6">
              You must connect your wallet to create a DAO.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between mb-8 px-2 relative max-w-[400px] mx-auto">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-zinc-800 -z-10 -translate-y-1/2"></div>
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex flex-col items-center relative z-10">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-300 ring-4 ring-zinc-950",
                    s < step 
                      ? "bg-violet-600 text-white" 
                      : s === step 
                        ? "bg-zinc-800 border-2 border-violet-600 text-white" 
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
                  {s === 2 && "Configuration"}
                  {s === 3 && "Review"}
                </span>
              </div>
            ))}
          </div>

          {(error || txError) && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm mt-8">
              {error || txError}
            </div>
          )}

          <div className="mt-12">
            {step === 1 && (
              <Card className="bg-zinc-900/50 backdrop-blur-md border-zinc-800/50">
                <CardHeader>
                  <CardTitle>General Information</CardTitle>
                  <CardDescription>What is the high-level purpose of this DAO?</CardDescription>
                </CardHeader>
                <form onSubmit={handleStep1}>
                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      <Label htmlFor="name" className="text-zinc-200 font-medium">DAO Name *</Label>
                      <Input 
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Protocol Grants Council"
                        className="bg-zinc-950/50 border-zinc-800 text-white"
                        required
                      />
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="description" className="text-zinc-200 font-medium">Description</Label>
                      <Textarea 
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What is the purpose of this DAO?"
                        className="bg-zinc-950/50 border-zinc-800 text-white min-h-[150px]"
                      />
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-end border-t border-zinc-800/50 pt-6 mt-6">
                    <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white min-w-32">
                      Next Step
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            )}

            {step === 2 && (
              <Card className="bg-zinc-900/50 backdrop-blur-md border-zinc-800/50">
                <CardHeader>
                  <CardTitle>Governance Configuration</CardTitle>
                  <CardDescription>Configure the rules and thresholds for this DAO.</CardDescription>
                </CardHeader>
                <form onSubmit={handleStep2}>
                  <CardContent className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <Label htmlFor="votingPeriod" className="text-zinc-200 font-medium">
                          Voting Period
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id="votingPeriod"
                            type="number"
                            min="1"
                            value={votingPeriodValue}
                            onChange={(e) => setVotingPeriodValue(e.target.value)}
                            onBlur={() => {
                              let val = parseInt(votingPeriodValue);
                              if (isNaN(val) || val < 1) setVotingPeriodValue("1");
                            }}
                            className="bg-zinc-950 border-zinc-800 text-white flex-1"
                          />
                          <Select
                            value={votingPeriodUnit}
                            onValueChange={(val) => {
                              if (val) setVotingPeriodUnit(val);
                            }}
                          >
                            <SelectTrigger className="w-[120px] bg-zinc-950 border-zinc-800 text-white">
                              <SelectValue placeholder="Unit" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800 text-white">
                              <SelectItem value="SECONDS">Seconds</SelectItem>
                              <SelectItem value="MINUTES">Minutes</SelectItem>
                              <SelectItem value="HOURS">Hours</SelectItem>
                              <SelectItem value="DAYS">Days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <p className="text-sm text-zinc-500">
                          Duration a proposal remains open for voting.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <Label htmlFor="maxResub" className="text-zinc-200 font-medium">
                          Max Resubmissions
                        </Label>
                        <Input
                          id="maxResub"
                          type="number"
                          min="0"
                          value={maxResubmissions}
                          onChange={(e) => setMaxResubmissions(parseInt(e.target.value) || 0)}
                          className="bg-zinc-950 border-zinc-800 text-white w-full"
                        />
                        <p className="text-sm text-zinc-500">
                          Maximum times a rejected proposal can be resubmitted.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-6 pt-4 border-t border-zinc-800/50">
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Label className="text-zinc-200 font-medium">Quorum</Label>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger type="button" className="bg-transparent border-0 p-0 hover:bg-transparent">
                                  <Info className="w-4 h-4 text-zinc-400 hover:text-zinc-300 transition-colors cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-zinc-800 text-zinc-200 border-zinc-700 p-3">
                                  The minimum percentage of total DAO voting weight that
                                  must participate (vote For or Against) for a proposal to
                                  be considered valid.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0.01}
                              max={100}
                              step={0.01}
                              value={quorumInput}
                              onChange={(e) => {
                                setQuorumInput(e.target.value);
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0.01 && val <= 100) {
                                  setQuorumBps(Math.round(val * 100));
                                }
                              }}
                              onBlur={() => {
                                let val = parseFloat(quorumInput);
                                if (isNaN(val) || val < 0.01) val = 0.01;
                                if (val > 100) val = 100;
                                setQuorumBps(Math.round(val * 100));
                                setQuorumInput(val.toString());
                              }}
                              className="w-20 h-8 px-2 text-right font-mono text-violet-400 bg-violet-400/10 border-transparent focus-visible:ring-violet-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-sm font-mono text-violet-400">%</span>
                          </div>
                        </div>
                        <Slider
                          value={[quorumBps]}
                          onValueChange={(val) => {
                            const newBps = Array.isArray(val) ? val[0] : (val as number);
                            setQuorumBps(newBps);
                            setQuorumInput((newBps / 100).toString());
                          }}
                          min={1}
                          max={10000}
                          step={1}
                          className="py-4"
                        />
                        <p className="text-sm text-zinc-500">
                          Minimum percentage of total voting weight required to participate.
                        </p>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-zinc-800/50">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Label className="text-zinc-200 font-medium">Approval Threshold</Label>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger type="button" className="bg-transparent border-0 p-0 hover:bg-transparent">
                                  <Info className="w-4 h-4 text-zinc-400 hover:text-zinc-300 transition-colors cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-zinc-800 text-zinc-200 border-zinc-700 p-3">
                                  The percentage of participating weight that must vote
                                  &quot;For&quot; in order to approve a proposal.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0.01}
                              max={100}
                              step={0.01}
                              value={approvalInput}
                              onChange={(e) => {
                                setApprovalInput(e.target.value);
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0.01 && val <= 100) {
                                  setApprovalThresholdBps(Math.round(val * 100));
                                }
                              }}
                              onBlur={() => {
                                let val = parseFloat(approvalInput);
                                if (isNaN(val) || val < 0.01) val = 0.01;
                                if (val > 100) val = 100;
                                setApprovalThresholdBps(Math.round(val * 100));
                                setApprovalInput(val.toString());
                              }}
                              className="w-20 h-8 px-2 text-right font-mono text-violet-400 bg-violet-400/10 border-transparent focus-visible:ring-violet-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-sm font-mono text-violet-400">%</span>
                          </div>
                        </div>
                        <Slider
                          value={[approvalThresholdBps]}
                          onValueChange={(val) => {
                            const newBps = Array.isArray(val) ? val[0] : (val as number);
                            setApprovalThresholdBps(newBps);
                            setApprovalInput((newBps / 100).toString());
                          }}
                          min={1}
                          max={10000}
                          step={1}
                          className="py-4"
                        />
                        <p className="text-sm text-zinc-500">
                          Percentage of participating weight required to approve a proposal.
                        </p>
                      </div>

                      <div className="space-y-4 pt-4 border-t border-zinc-800/50">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <Label className="text-zinc-200 font-medium">Funding Cap</Label>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger type="button" className="bg-transparent border-0 p-0 hover:bg-transparent">
                                  <Info className="w-4 h-4 text-zinc-400 hover:text-zinc-300 transition-colors cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs bg-zinc-800 text-zinc-200 border-zinc-700 p-3">
                                  The maximum percentage of the DAO&apos;s treasury that a single proposal can request.
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              min={0.01}
                              max={100}
                              step={0.01}
                              value={fundingCapInput}
                              onChange={(e) => {
                                setFundingCapInput(e.target.value);
                                const val = parseFloat(e.target.value);
                                if (!isNaN(val) && val >= 0.01 && val <= 100) {
                                  setFundingCapBps(Math.round(val * 100));
                                }
                              }}
                              onBlur={() => {
                                let val = parseFloat(fundingCapInput);
                                if (isNaN(val) || val < 0.01) val = 0.01;
                                if (val > 100) val = 100;
                                setFundingCapBps(Math.round(val * 100));
                                setFundingCapInput(val.toString());
                              }}
                              className="w-20 h-8 px-2 text-right font-mono text-violet-400 bg-violet-400/10 border-transparent focus-visible:ring-violet-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <span className="text-sm font-mono text-violet-400">%</span>
                          </div>
                        </div>
                        <Slider
                          value={[fundingCapBps]}
                          onValueChange={(val) => {
                            const newBps = Array.isArray(val) ? val[0] : (val as number);
                            setFundingCapBps(newBps);
                            setFundingCapInput((newBps / 100).toString());
                          }}
                          min={1}
                          max={10000}
                          step={1}
                          className="py-4"
                        />
                        <p className="text-sm text-zinc-500">
                          Maximum percentage of the treasury a proposal can request.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3 pt-4 border-t border-zinc-800/50">
                      <Label htmlFor="minCriteria" className="text-zinc-200 font-medium">
                        Minimum Criteria Length
                      </Label>
                      <Input
                        id="minCriteria"
                        type="number"
                        min="0"
                        value={minCriteriaLength}
                        onChange={(e) => setMinCriteriaLength(parseInt(e.target.value) || 0)}
                        className="bg-zinc-950 border-zinc-800 text-white w-full"
                      />
                      <p className="text-sm text-zinc-500">
                        Minimum character length for proposal deliverable criteria (0 to disable).
                      </p>
                    </div>

                  </CardContent>
                  <CardFooter className="flex justify-between border-t border-zinc-800/50 pt-6 mt-6">
                    <Button type="button" variant="ghost" onClick={() => setStep(1)} className="text-zinc-400 hover:text-white">
                      Back
                    </Button>
                    <Button type="submit" className="bg-violet-600 hover:bg-violet-700 text-white min-w-32">
                      Next Step
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            )}

            {step === 3 && (
              <Card className="bg-zinc-900/50 backdrop-blur-md border-zinc-800/50">
                <CardHeader>
                  <CardTitle>Review & Submit</CardTitle>
                  <CardDescription>Review your DAO details before submitting on-chain.</CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                  <CardContent className="space-y-6">
                    <div className="space-y-6">
                      <div>
                        <h3 className="text-sm font-medium text-zinc-400 mb-1">DAO Name</h3>
                        <p className="text-lg font-medium text-white">{name}</p>
                      </div>
                      
                      <div>
                        <h3 className="text-sm font-medium text-zinc-400 mb-1">Description</h3>
                        <p className="text-zinc-300 whitespace-pre-wrap">{description || "No description provided."}</p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800/50">
                          <h3 className="text-sm font-medium text-zinc-400 mb-1">Voting Period</h3>
                          <p className="text-lg font-medium text-white">{votingPeriodValue} {votingPeriodUnit.toLowerCase()}</p>
                        </div>
                        <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800/50">
                          <h3 className="text-sm font-medium text-zinc-400 mb-1">Max Resubmissions</h3>
                          <p className="text-lg font-medium text-white">{maxResubmissions}</p>
                        </div>
                        <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800/50">
                          <h3 className="text-sm font-medium text-zinc-400 mb-1">Quorum</h3>
                          <p className="text-lg font-medium text-white">{(quorumBps / 100).toFixed(2)}%</p>
                        </div>
                        <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800/50">
                          <h3 className="text-sm font-medium text-zinc-400 mb-1">Approval Threshold</h3>
                          <p className="text-lg font-medium text-white">{(approvalThresholdBps / 100).toFixed(2)}%</p>
                        </div>
                        <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800/50">
                          <h3 className="text-sm font-medium text-zinc-400 mb-1">Funding Cap</h3>
                          <p className="text-lg font-medium text-white">{(fundingCapBps / 100).toFixed(2)}%</p>
                        </div>
                        <div className="bg-zinc-950/50 rounded-xl p-4 border border-zinc-800/50">
                          <h3 className="text-sm font-medium text-zinc-400 mb-1">Min Criteria Length</h3>
                          <p className="text-lg font-medium text-white">{minCriteriaLength} chars</p>
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
                          I understand I will become this DAO&apos;s admin, responsible for its governance rules, and that creating a DAO is a permanent on-chain action.
                        </span>
                      </label>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-between border-t border-zinc-800/50 pt-6 mt-6">
                    <Button type="button" variant="ghost" onClick={() => setStep(2)} disabled={isSaving} className="text-zinc-400 hover:text-white">
                      Back
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={!isConfirmed || isSaving}
                      className="bg-violet-600 hover:bg-violet-700 text-white min-w-32"
                    >
                      {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      Submit to Blockchain
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
