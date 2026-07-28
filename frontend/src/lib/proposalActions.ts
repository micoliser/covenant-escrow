export interface ProposalStateParams {
  status: number;
  isVoting: boolean;
  hasMounted: boolean;
  isConnected: boolean;
  votingPower: string;
  hasVotedFund: boolean;
  hasVotedReclaim: boolean;
  isContributor: boolean;
  isPastDeadline: boolean;
  resubmissionCount: number;
  maxResubmissions: number;
  isReclaimVoting: boolean;
}

export interface ProposalActionState {
  fundVotingState?: 'CONNECT_WALLET' | 'ALREADY_VOTED' | 'NO_VOTING_POWER' | 'CAN_VOTE' | 'CAN_FINALIZE';
  deliveryState?: 'CAN_SUBMIT' | 'AWAITING_DELIVERY';
  canReclaimExpired?: boolean;
  resubmissionState?: 'CAN_RESUBMIT' | 'MAX_REACHED';
  reclaimVotingState?: 'CONNECT_WALLET' | 'ALREADY_VOTED' | 'NO_VOTING_POWER' | 'CAN_VOTE' | 'CAN_FINALIZE';
  claimState?: 'CAN_CLAIM' | 'AWAITING_CLAIM';
}

export function getProposalActionState(params: ProposalStateParams): ProposalActionState {
  const state: ProposalActionState = {};

  if (params.status === 1) {
    if (params.isVoting) {
      if (!params.hasMounted || !params.isConnected) {
        state.fundVotingState = 'CONNECT_WALLET';
      } else if (params.hasVotedFund) {
        state.fundVotingState = 'ALREADY_VOTED';
      } else if (params.votingPower === "0") {
        state.fundVotingState = 'NO_VOTING_POWER';
      } else {
        state.fundVotingState = 'CAN_VOTE';
      }
    } else {
      state.fundVotingState = 'CAN_FINALIZE';
    }
  }

  if (params.status === 3) {
    if (params.isContributor) {
      state.deliveryState = 'CAN_SUBMIT';
    } else {
      state.deliveryState = 'AWAITING_DELIVERY';
      
      if (params.isPastDeadline) {
        state.canReclaimExpired = true;
      }
    }
  }

  if (params.status === 4) {
    if (params.isContributor) {
      if (params.resubmissionCount < params.maxResubmissions) {
        state.resubmissionState = 'CAN_RESUBMIT';
      } else {
        state.resubmissionState = 'MAX_REACHED';
      }
    }

    if (params.isReclaimVoting) {
      if (!params.isContributor) {
        if (!params.hasMounted || !params.isConnected) {
          state.reclaimVotingState = 'CONNECT_WALLET';
        } else if (params.hasVotedReclaim) {
          state.reclaimVotingState = 'ALREADY_VOTED';
        } else if (params.votingPower === "0") {
          state.reclaimVotingState = 'NO_VOTING_POWER';
        } else {
          state.reclaimVotingState = 'CAN_VOTE';
        }
      }
    } else {
      state.reclaimVotingState = 'CAN_FINALIZE';
    }
  }

  if (params.status === 6) {
    if (params.isContributor) {
      state.claimState = 'CAN_CLAIM';
    } else {
      state.claimState = 'AWAITING_CLAIM';
    }
  }

  return state;
}
