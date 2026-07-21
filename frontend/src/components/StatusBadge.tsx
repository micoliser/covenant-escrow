import { ProposalStatus } from '@/types';

export function getStatusDetails(status: ProposalStatus) {
  switch (status) {
    case ProposalStatus.REJECTED:
      return { label: 'Rejected', colorClass: 'text-red-400 bg-red-400/10 border-red-400/20' };
    case ProposalStatus.OPEN_FOR_VOTING:
      return { label: 'Voting Open', colorClass: 'text-accent bg-accent/10 border-accent/20' };
    case ProposalStatus.VOTE_FAILED:
      return { label: 'Vote Failed', colorClass: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20' };
    case ProposalStatus.ESCROWED:
      return { label: 'Escrowed', colorClass: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
    case ProposalStatus.VERIFICATION_FAILED:
      return { label: 'Verification Failed', colorClass: 'text-red-400 bg-red-400/10 border-red-400/20' };
    case ProposalStatus.RECLAIMED:
      return { label: 'Reclaimed', colorClass: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20' };
    case ProposalStatus.VERIFICATION_PASSED:
      return { label: 'Verified', colorClass: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' };
    case ProposalStatus.RELEASED:
      return { label: 'Released', colorClass: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' };
    default:
      return { label: 'Unknown', colorClass: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20' };
  }
}

export function StatusBadge({ status }: { status: ProposalStatus }) {
  const { label, colorClass } = getStatusDetails(status);

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${colorClass}`}>
      {label}
    </span>
  );
}
