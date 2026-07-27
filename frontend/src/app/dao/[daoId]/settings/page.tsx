"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { useTransaction } from "@/hooks/useTransaction";
import { Dao } from "@/types";
import { SkeletonPageHeader, SkeletonCard } from "@/components/Skeletons";
import {
  ArrowLeft,
  AlertCircle,
  Settings,
  ShieldAlert,
  Check,
  Info,
} from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAccount } from "wagmi";
import { useHasMounted } from "@/hooks/useHasMounted";

export default function DaoSettings() {
  const params = useParams();
  const router = useRouter();
  const daoId = params.daoId as string;

  const { fetchApi } = useApi();
  const [dao, setDao] = useState<Dao | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { isConnected, address } = useAccount();
  const hasMounted = useHasMounted();
  const { execute, isLocked } = useTransaction();

  // Form state
  const [votingPeriodValue, setVotingPeriodValue] = useState<string>("1");
  const [votingPeriodUnit, setVotingPeriodUnit] = useState<string>("DAYS");
  const [quorumBps, setQuorumBps] = useState<number>(0);
  const [approvalThresholdBps, setApprovalThresholdBps] = useState<number>(0);
  const [fundingCapBps, setFundingCapBps] = useState<number>(0);
  const [quorumInput, setQuorumInput] = useState<string>("0");
  const [approvalInput, setApprovalInput] = useState<string>("0");
  const [fundingCapInput, setFundingCapInput] = useState<string>("0");
  const [maxResubmissions, setMaxResubmissions] = useState<string>("0");
  const [minCriteriaLength, setMinCriteriaLength] = useState<string>("0");
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuorumInput((quorumBps / 100).toString());
  }, [quorumBps]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setApprovalInput((approvalThresholdBps / 100).toString());
  }, [approvalThresholdBps]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFundingCapInput((fundingCapBps / 100).toString());
  }, [fundingCapBps]);

  useEffect(() => {
    async function loadData() {
      if (!daoId) return;
      try {
        setIsLoading(true);
        const daoRes = await fetchApi(`/api/daos/${daoId}/`);
        if (daoRes.ok) {
          const daoData: Dao = await daoRes.json();
          setDao(daoData);

          // Init form state
          setQuorumBps(daoData.quorum_bps);
          setApprovalThresholdBps(daoData.approval_threshold_bps);
          setFundingCapBps(daoData.funding_cap_bps);
          setMaxResubmissions(daoData.max_resubmissions.toString());
          setMinCriteriaLength(daoData.min_criteria_length.toString());

          // Calculate voting period
          const vp = daoData.voting_period_seconds;
          if (vp % 86400 === 0) {
            setVotingPeriodValue((vp / 86400).toString());
            setVotingPeriodUnit("DAYS");
          } else if (vp % 3600 === 0) {
            setVotingPeriodValue((vp / 3600).toString());
            setVotingPeriodUnit("HOURS");
          } else if (vp % 60 === 0) {
            setVotingPeriodValue((vp / 60).toString());
            setVotingPeriodUnit("MINUTES");
          } else {
            setVotingPeriodValue(vp.toString());
            setVotingPeriodUnit("SECONDS");
          }
        }
      } catch (err) {
        console.error("Error loading DAO", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [daoId, fetchApi]);

  if (!hasMounted) return null;

  if (isLoading && !dao) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 pt-24 lg:pt-32">
        <SkeletonPageHeader />
        <SkeletonCard />
      </div>
    );
  }

  if (!dao) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 pt-24 lg:pt-32 text-center text-zinc-400">
        DAO not found.
      </div>
    );
  }

  // Check if current user is admin
  const isAdmin =
    isConnected && address?.toLowerCase() === dao.admin.toLowerCase();

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 pt-24 lg:pt-32">
        <Link
          href={`/dao/${daoId}`}
          className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to DAO
        </Link>
        <Card className="bg-zinc-900/50 border-zinc-800 text-center py-12">
          <ShieldAlert className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Not Authorized</h2>
          <p className="text-zinc-400">
            Only the DAO administrator can access settings.
          </p>
        </Card>
      </div>
    );
  }

  const handleVotingPeriodValueChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    setVotingPeriodValue(e.target.value);
  };

  const calculateVotingPeriodSeconds = () => {
    const val = parseInt(votingPeriodValue) || 0;
    switch (votingPeriodUnit) {
      case "DAYS":
        return val * 86400;
      case "HOURS":
        return val * 3600;
      case "MINUTES":
        return val * 60;
      default:
        return val;
    }
  };

  const getDiffs = () => {
    const diffs = [];
    const newVpSeconds = calculateVotingPeriodSeconds();
    if (newVpSeconds !== dao.voting_period_seconds) {
      diffs.push({
        label: "Voting Period",
        old: `${dao.voting_period_seconds}s`,
        new: `${newVpSeconds}s`,
      });
    }
    if (quorumBps !== dao.quorum_bps) {
      diffs.push({
        label: "Quorum",
        old: `${(dao.quorum_bps / 100).toFixed(2)}%`,
        new: `${(quorumBps / 100).toFixed(2)}%`,
      });
    }
    if (approvalThresholdBps !== dao.approval_threshold_bps) {
      diffs.push({
        label: "Approval Threshold",
        old: `${(dao.approval_threshold_bps / 100).toFixed(2)}%`,
        new: `${(approvalThresholdBps / 100).toFixed(2)}%`,
      });
    }
    if (fundingCapBps !== dao.funding_cap_bps) {
      diffs.push({
        label: "Funding Cap",
        old: `${(dao.funding_cap_bps / 100).toFixed(2)}%`,
        new: `${(fundingCapBps / 100).toFixed(2)}%`,
      });
    }
    const newMaxResub = parseInt(maxResubmissions) || 0;
    if (newMaxResub !== dao.max_resubmissions) {
      diffs.push({
        label: "Max Resubmissions",
        old: dao.max_resubmissions.toString(),
        new: newMaxResub.toString(),
      });
    }
    const newMinCriteria = parseInt(minCriteriaLength) || 0;
    if (newMinCriteria !== dao.min_criteria_length) {
      diffs.push({
        label: "Min Criteria Length",
        old: dao.min_criteria_length.toString(),
        new: newMinCriteria.toString(),
      });
    }
    return diffs;
  };

  const diffs = getDiffs();
  const hasChanges = diffs.length > 0;

  const handleSubmit = async () => {
    setIsConfirmDialogOpen(false);
    const contractAddress = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
    if (!contractAddress) return;

    const newVpSeconds = calculateVotingPeriodSeconds();
    const newMaxResub = parseInt(maxResubmissions) || 0;
    const newMinCriteria = parseInt(minCriteriaLength) || 0;

    const args = [
      BigInt(daoId),
      BigInt(quorumBps),
      BigInt(approvalThresholdBps),
      BigInt(newVpSeconds),
      BigInt(fundingCapBps),
      BigInt(newMaxResub),
      BigInt(newMinCriteria),
    ];

    try {
      await execute(contractAddress, "update_dao_config", args, {
        confirmingMessage: "Please confirm the config update in your wallet...",
        submittedMessage: "Updating configuration, waiting for confirmation...",
        confirmedMessage: "Configuration updated successfully!",
        onConfirmed: async () => {
          // Trigger sync fast-path
          try {
            await fetchApi(`/api/daos/${daoId}/sync/`, { method: "POST" });
          } catch (e) {
            console.error("Failed to sync", e);
          }
          router.push(`/dao/${daoId}`);
          router.refresh();
        },
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 pt-24 lg:pt-32">
      <Link
        href={`/dao/${daoId}`}
        className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6 group"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Back to DAO
      </Link>

      <div className="flex items-center gap-3 mb-8">
        <Settings className="w-8 h-8 text-violet-400" />
        <h1 className="text-4xl font-display font-bold text-white tracking-tight">
          {dao.name} Settings
        </h1>
      </div>

      <Alert className="mb-8 border-yellow-500/50 bg-yellow-500/10 text-yellow-400">
        <AlertCircle className="h-4 w-4 text-yellow-400" />
        <AlertTitle className="text-yellow-400">Important</AlertTitle>
        <AlertDescription className="text-yellow-400">
          Changes apply immediately, including to proposals currently open for
          voting.
        </AlertDescription>
      </Alert>

      <Card className="bg-zinc-900/50 border-zinc-800 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Configuration Parameters</CardTitle>
          <CardDescription>
            Adjust the rules and thresholds for this DAO.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <Label
                htmlFor="votingPeriod"
                className="text-zinc-200 font-medium"
              >
                Voting Period
              </Label>
              <div className="flex gap-2">
                <Input
                  id="votingPeriod"
                  type="number"
                  min="1"
                  value={votingPeriodValue}
                  onChange={handleVotingPeriodValueChange}
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
                onChange={(e) => setMaxResubmissions(e.target.value)}
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
                  <Tooltip>
                    <TooltipTrigger className="bg-transparent border-0 p-0 hover:bg-transparent">
                      <Info className="w-4 h-4 text-zinc-400 hover:text-zinc-300 transition-colors cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-zinc-800 text-zinc-200 border-zinc-700 p-3">
                      The minimum percentage of total DAO voting weight that
                      must participate (vote For or Against) for a proposal to
                      be considered valid.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0.01}
                    max={100}
                    step={0.01}
                    value={quorumInput}
                    onChange={(e) => setQuorumInput(e.target.value)}
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
                onValueChange={(val) =>
                  setQuorumBps(Array.isArray(val) ? val[0] : (val as number))
                }
                min={1}
                max={10000}
                step={1}
                className="py-4"
              />
              <p className="text-sm text-zinc-500">
                Minimum percentage of total voting weight required to
                participate.
              </p>
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-800/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Label className="text-zinc-200 font-medium">
                    Approval Threshold
                  </Label>
                  <Tooltip>
                    <TooltipTrigger className="bg-transparent border-0 p-0 hover:bg-transparent">
                      <Info className="w-4 h-4 text-zinc-400 hover:text-zinc-300 transition-colors cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-zinc-800 text-zinc-200 border-zinc-700 p-3">
                      The percentage of participating weight that must vote
                      &quot;For&quot; in order to approve a proposal. This is
                      calculated relative only to those who actually voted.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0.01}
                    max={100}
                    step={0.01}
                    value={approvalInput}
                    onChange={(e) => setApprovalInput(e.target.value)}
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
                onValueChange={(val) =>
                  setApprovalThresholdBps(
                    Array.isArray(val) ? val[0] : (val as number),
                  )
                }
                min={1}
                max={10000}
                step={1}
                className="py-4"
              />
              <p className="text-sm text-zinc-500">
                Percentage of participating weight required to approve a
                proposal.
              </p>
            </div>

            <div className="space-y-4 pt-4 border-t border-zinc-800/50">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Label className="text-zinc-200 font-medium">
                    Funding Cap
                  </Label>
                  <Tooltip>
                    <TooltipTrigger className="bg-transparent border-0 p-0 hover:bg-transparent">
                      <Info className="w-4 h-4 text-zinc-400 hover:text-zinc-300 transition-colors cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs bg-zinc-800 text-zinc-200 border-zinc-700 p-3">
                      The maximum percentage of the DAO&apos;s treasury that a single proposal can request.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0.01}
                    max={100}
                    step={0.01}
                    value={fundingCapInput}
                    onChange={(e) => setFundingCapInput(e.target.value)}
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
                onValueChange={(val) =>
                  setFundingCapBps(
                    Array.isArray(val) ? val[0] : (val as number),
                  )
                }
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
              onChange={(e) => setMinCriteriaLength(e.target.value)}
              className="bg-zinc-950 border-zinc-800 text-white w-full max-w-[200px]"
            />
            <p className="text-sm text-zinc-500">
              Minimum character count required for deliverable criteria.
            </p>
          </div>
        </CardContent>
        <CardFooter className="bg-zinc-900/80 border-t border-zinc-800 py-6 px-6 rounded-b-xl flex justify-between items-center">
          <Dialog
            open={isConfirmDialogOpen}
            onOpenChange={setIsConfirmDialogOpen}
          >
            <Button
              className="w-full sm:w-auto bg-violet-600 hover:bg-violet-500 text-white"
              disabled={!hasChanges || isLocked}
              onClick={() => setIsConfirmDialogOpen(true)}
            >
              Review Changes
            </Button>
            <DialogContent className="bg-zinc-950 border-zinc-800 text-white">
              <DialogHeader>
                <DialogTitle>Confirm Configuration Update</DialogTitle>
                <DialogDescription className="text-zinc-400">
                  You are about to update the DAO configuration. These changes
                  apply immediately to all active and future proposals.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {diffs.map((diff, i) => (
                  <div
                    key={i}
                    className="flex justify-between items-center p-3 rounded-lg bg-zinc-900 border border-zinc-800"
                  >
                    <span className="text-sm font-medium text-zinc-200">
                      {diff.label}
                    </span>
                    <div className="flex items-center gap-2 text-sm font-mono">
                      <span className="text-zinc-500 line-through">
                        {diff.old}
                      </span>
                      <ArrowLeft className="w-3 h-3 text-zinc-600 rotate-180" />
                      <span className="text-green-400 font-bold">
                        {diff.new}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsConfirmDialogOpen(false)}
                  className="border-zinc-700 hover:bg-zinc-800 text-white"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isLocked}
                  className="bg-violet-600 hover:bg-violet-500 text-white"
                >
                  {isLocked ? "Confirming..." : "Confirm & Update"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {!hasChanges && (
            <p className="text-sm text-zinc-500 flex items-center gap-2">
              <Check className="w-4 h-4" /> No changes to save.
            </p>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
