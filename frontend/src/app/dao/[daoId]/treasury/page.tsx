"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useApi } from "@/hooks/useApi";
import { Dao, DetailedStats } from "@/types";
import { formatGen } from "@/lib/formatGen";
import { parseGen } from "@/lib/parseGen";
import { SkeletonPageHeader, SkeletonCard } from "@/components/Skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAccount } from "wagmi";
import { useHasMounted } from "@/hooks/useHasMounted";
import { useTransaction } from "@/hooks/useTransaction";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function DaoTreasury() {
  const params = useParams();
  const daoId = params.daoId as string;

  const { fetchApi } = useApi();
  const [dao, setDao] = useState<Dao | null>(null);
  const [stats, setStats] = useState<DetailedStats | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [votingPower, setVotingPower] = useState<string>("0");
  const [isLoading, setIsLoading] = useState(true);
  
  const [depositAmount, setDepositAmount] = useState("");

  const { isConnected } = useAccount();
  const hasMounted = useHasMounted();
  const { execute, isLocked } = useTransaction();

  // Load DAO and Treasury Data
  useEffect(() => {
    async function loadData() {
      if (!daoId) return;
      try {
        setIsLoading(true);
        const [daoRes, historyRes, statsRes] = await Promise.all([
          fetchApi(`/api/daos/${daoId}/`),
          fetchApi(`/api/daos/${daoId}/treasury/history/?days=30`),
          fetchApi(`/api/daos/${daoId}/detailed_stats/`)
        ]);

        if (daoRes.ok) setDao(await daoRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
        if (historyRes.ok) {
          const historyData = await historyRes.json();
          // Endpoint returns descending. Reverse to ascending for the chart.
          const ascendingHistory = (historyData.results || []).reverse();
          
          // Sample to ~30 points to avoid overplotting
          if (ascendingHistory.length > 30) {
            const step = Math.floor(ascendingHistory.length / 30);
            const sampled = ascendingHistory.filter((_: any, i: any) => i % step === 0);
            // Ensure we always have the latest point
            if (sampled[sampled.length - 1] !== ascendingHistory[ascendingHistory.length - 1]) {
              sampled.push(ascendingHistory[ascendingHistory.length - 1]);
            }
            setHistory(sampled);
          } else {
            setHistory(ascendingHistory);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [daoId, fetchApi]);

  // Load Voting Power separately since it depends on auth
  useEffect(() => {
    async function loadVotingPower() {
      if (!daoId || !isConnected || !hasMounted) return;
      try {
        const res = await fetchApi(`/api/daos/${daoId}/voting-power/me/`);
        if (res.ok) {
          const data = await res.json();
          setVotingPower(data.voting_power);
        }
      } catch (err) {
        console.error("Failed to load voting power", err);
      }
    }
    loadVotingPower();
  }, [daoId, isConnected, hasMounted, fetchApi]);

  const handleDeposit = async () => {
    if (!depositAmount || isNaN(Number(depositAmount)) || Number(depositAmount) <= 0) return;
    
    try {
      const amountWei = parseGen(depositAmount);
      await execute(
        process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as string,
        "deposit_treasury",
        [parseInt(daoId)],
        {
          confirmingMessage: "Please confirm deposit in your wallet...",
          submittedMessage: "Deposit submitted, waiting for confirmation...",
          confirmedMessage: "Deposit successful!",
          syncRequests: [{ entityType: 'dao', entityId: daoId }],
          onConfirmed: () => {
            setDepositAmount("");
            // Optimistically update DAO balance (a bit hacky but works for UI feel)
            // Real sync will happen via the syncRequest
            setTimeout(() => window.location.reload(), 2000); // Temporary reload for data freshness
          }
        },
        BigInt(amountWei)
      );
    } catch (e) {
      console.error(e);
    }
  };

  const chartData = useMemo(() => {
    return history.map((item) => ({
      date: new Date(item.snapshot_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      balance: parseFloat(formatGen(item.total_balance.toString())),
    }));
  }, [history]);

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

  if (!dao) {
    return <div className="text-center py-20 text-zinc-400">DAO not found</div>;
  }

  const maxGenFunding = parseFloat(formatGen(dao.total_balance)) * (dao.funding_cap_bps / 10000);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 pt-24 lg:pt-32">
      {/* Header */}
      <header className="mb-12">
        <h2 className="text-5xl font-display font-bold text-white mb-2 tracking-tight">{dao.name}</h2>
        <p className="text-lg text-zinc-400">Treasury Overview & Governance Rules</p>
      </header>

      {/* Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-12">
        <Card className="col-span-1 lg:col-span-1">
          <CardContent className="p-6">
            <p className="text-zinc-400 text-xs uppercase tracking-wider font-medium mb-2">All Time Balance</p>
            <p className="text-2xl font-display font-semibold text-white tabular-nums">
              {stats ? formatGen(stats.all_time_inflows) : "-"}
            </p>
            <p className="text-xs text-zinc-500 mt-1">GEN</p>
          </CardContent>
        </Card>
        <Card className="col-span-1 lg:col-span-1">
          <CardContent className="p-6">
            <p className="text-zinc-400 text-xs uppercase tracking-wider font-medium mb-2">Current Balance</p>
            <p className="text-2xl font-display font-semibold text-white tabular-nums">
              {formatGen(dao.total_balance)}
            </p>
            <p className="text-xs text-zinc-500 mt-1">GEN</p>
          </CardContent>
        </Card>
        <Card className="col-span-1 lg:col-span-1">
          <CardContent className="p-6">
            <p className="text-zinc-400 text-xs uppercase tracking-wider font-medium mb-2">Value Distributed</p>
            <p className="text-2xl font-display font-semibold text-white tabular-nums">
              {stats ? formatGen(stats.total_funding_released) : "-"}
            </p>
            <p className="text-xs text-zinc-500 mt-1">GEN</p>
          </CardContent>
        </Card>
        <Card className="col-span-1 lg:col-span-1">
          <CardContent className="p-6">
            <p className="text-zinc-400 text-xs uppercase tracking-wider font-medium mb-2">Total Members</p>
            <p className="text-2xl font-display font-semibold text-white tabular-nums">{dao.member_count !== undefined ? dao.member_count : "-"}</p>
          </CardContent>
        </Card>
        <Card className="col-span-1 lg:col-span-1">
          <CardContent className="p-6">
            <p className="text-zinc-400 text-xs uppercase tracking-wider font-medium mb-2">Total Proposals</p>
            <p className="text-2xl font-display font-semibold text-white tabular-nums">{dao.proposal_count}</p>
          </CardContent>
        </Card>
        <Card className="col-span-1 lg:col-span-1">
          <CardContent className="p-6">
            <p className="text-zinc-400 text-xs uppercase tracking-wider font-medium mb-2">Active Proposals</p>
            <p className="text-2xl font-display font-semibold text-white tabular-nums">{dao.active_proposal_count || 0}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column - Chart */}
        <div className="lg:col-span-2">
          <Card className="h-full min-h-[400px]">
            <CardHeader>
              <CardTitle>Historical Treasury Balance</CardTitle>
            </CardHeader>
            <CardContent>
              {chartData.length < 2 ? (
                <div className="h-[300px] flex items-center justify-center text-zinc-500 flex-col gap-2">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                    <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                    </svg>
                  </div>
                  <p>Not enough data points yet.</p>
                </div>
              ) : (
                <div className="h-[350px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#52525b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                        itemStyle={{ color: '#fff' }}
                        labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
                      />
                      <Area type="monotone" dataKey="balance" stroke="#8b5cf6" strokeWidth={2} fillOpacity={1} fill="url(#colorBalance)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Deposit Funds */}
          <Card>
            <CardHeader>
              <CardTitle>Deposit Funds</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-sm text-zinc-400">
                  Depositing GEN increases the DAO's treasury and grants you voting power proportionally.
                </p>
                
                <div className="relative">
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="Amount to deposit"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl py-3 pl-4 pr-16 text-white text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-colors"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <span className="bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded-md font-medium">GEN</span>
                  </div>
                </div>

                {!hasMounted || !isConnected ? (
                  <Button disabled className="w-full bg-zinc-800 text-zinc-400 py-6 rounded-xl">
                    Connect Wallet to Deposit
                  </Button>
                ) : (
                  <Button 
                    onClick={handleDeposit}
                    disabled={isLocked || !depositAmount}
                    className="w-full bg-accent hover:bg-accent-hover text-white py-6 rounded-xl font-medium shadow-[0_0_15px_rgba(139,92,246,0.2)] transition-all"
                  >
                    {isLocked ? "Confirming..." : "Deposit into Treasury"}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Voting Power */}
          <Card>
            <CardHeader>
              <CardTitle>Your Voting Power</CardTitle>
            </CardHeader>
            <CardContent>
              {!hasMounted || !isConnected ? (
                <p className="text-zinc-500 text-sm">Connect wallet to see your voting power.</p>
              ) : (
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-display font-semibold text-white tabular-nums">{formatGen(votingPower)}</span>
                  <span className="text-zinc-500 font-medium">GEN</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* DAO Rules */}
          <Card>
            <CardHeader>
              <CardTitle>Governance Rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-zinc-800/50">
                <span className="text-zinc-400 text-sm">Quorum</span>
                <span className="text-white font-medium">{Number(dao.quorum_bps) / 100}%</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-zinc-800/50">
                <span className="text-zinc-400 text-sm">Approval Threshold</span>
                <span className="text-white font-medium">{Number(dao.approval_threshold_bps) / 100}%</span>
              </div>
              <div className="flex justify-between items-start py-2 border-b border-zinc-800/50">
                <span className="text-zinc-400 text-sm">Funding Cap</span>
                <div className="text-right">
                  <div className="text-white font-medium">{Number(dao.funding_cap_bps) / 100}% per proposal</div>
                  <div className="text-zinc-500 text-xs mt-1">(Max ~{maxGenFunding.toLocaleString(undefined, { maximumFractionDigits: 2 })} GEN)</div>
                </div>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-zinc-400 text-sm">Voting Period</span>
                <span className="text-white font-medium">{dao.voting_period_seconds / 60} minutes</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
