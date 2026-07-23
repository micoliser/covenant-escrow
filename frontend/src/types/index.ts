export enum ProposalStatus {
  REJECTED = 0,
  OPEN_FOR_VOTING = 1,
  VOTE_FAILED = 2,
  ESCROWED = 3,
  VERIFICATION_FAILED = 4,
  RECLAIMED = 5,
  VERIFICATION_PASSED = 6,
  RELEASED = 7,
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface Dao {
  dao_id: number;
  name: string;
  description: string;
  admin: string;
  quorum_bps: number;
  approval_threshold_bps: number;
  voting_period_seconds: number;
  funding_cap_bps: number;
  max_resubmissions: number;
  min_criteria_length: number;
  total_balance: string; // u256
  total_voting_power: string; // u256
  proposal_count: number;
  active_proposal_count?: number;
  created_at: string;
  last_synced_at: string;
}

export interface Proposal {
  proposal_id: number;
  dao_id: number;
  dao_name?: string;
  contributor: string;
  title: string;
  description: string;
  deliverable_criteria: string;
  requested_amount: string; // u256
  deadline: string;
  status: ProposalStatus;
  yes_weight: string; // u256
  no_weight: string; // u256
  reclaim_yes_weight: string; // u256
  reclaim_no_weight: string; // u256
  reclaim_round: number;
  escrowed_amount: string; // u256
  deliverable_url: string;
  delivery_notes: string;
  verdict_summary: string;
  screening_rejection_reason: string;
  reclaim_reason: string;
  resubmission_count: number;
  submitted_at: string;
  vote_ends_at: string;
  reclaim_vote_ends_at: string | null;
  last_synced_at: string;
}

export interface ProposalHistoryEvent {
  id: number;
  proposal_id: number;
  from_status: ProposalStatus;
  to_status: ProposalStatus;
  observed_at: string;
  chain_tx_hash: string;
}
