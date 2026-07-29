import { describe, it, expect } from 'vitest';
import { getProposalActionState, ProposalStateParams } from '@/lib/proposalActions';

const defaultParams: ProposalStateParams = {
  status: 0,
  isVoting: false,
  hasMounted: true,
  isConnected: true,
  votingPower: "100",
  hasVotedFund: false,
  hasVotedReclaim: false,
  isContributor: false,
  isPastDeadline: false,
  resubmissionCount: 0,
  maxResubmissions: 3,
  isReclaimVoting: false
};

describe('getProposalActionState', () => {
  it('returns empty object for statuses with no actions (0, 2, 5, 7)', () => {
    [0, 2, 5, 7].forEach(status => {
      expect(getProposalActionState({ ...defaultParams, status })).toEqual({});
    });
  });

  describe('Status 1: Open For Voting', () => {
    it('shows CONNECT_WALLET if not connected', () => {
      expect(getProposalActionState({ ...defaultParams, status: 1, isVoting: true, isConnected: false }))
        .toEqual({ fundVotingState: 'CONNECT_WALLET' });
    });

    it('shows ALREADY_VOTED if user already voted', () => {
      expect(getProposalActionState({ ...defaultParams, status: 1, isVoting: true, hasVotedFund: true }))
        .toEqual({ fundVotingState: 'ALREADY_VOTED' });
    });

    it('shows NO_VOTING_POWER if voting power is 0', () => {
      expect(getProposalActionState({ ...defaultParams, status: 1, isVoting: true, votingPower: "0" }))
        .toEqual({ fundVotingState: 'NO_VOTING_POWER' });
    });

    it('shows CAN_VOTE if connected, hasn\'t voted, and has power', () => {
      expect(getProposalActionState({ ...defaultParams, status: 1, isVoting: true }))
        .toEqual({ fundVotingState: 'CAN_VOTE' });
    });

    it('shows CAN_FINALIZE if voting period has ended', () => {
      expect(getProposalActionState({ ...defaultParams, status: 1, isVoting: false }))
        .toEqual({ fundVotingState: 'CAN_FINALIZE' });
    });
  });

  describe('Status 3: Escrowed', () => {
    it('shows CAN_SUBMIT for contributor', () => {
      expect(getProposalActionState({ ...defaultParams, status: 3, isContributor: true }))
        .toEqual({ deliveryState: 'CAN_SUBMIT' });
    });

    it('shows AWAITING_DELIVERY for non-contributor before deadline', () => {
      expect(getProposalActionState({ ...defaultParams, status: 3, isContributor: false, isPastDeadline: false }))
        .toEqual({ deliveryState: 'AWAITING_DELIVERY' });
    });

    it('shows CAN_RECLAIM_EXPIRED for non-contributor after deadline', () => {
      expect(getProposalActionState({ ...defaultParams, status: 3, isContributor: false, isPastDeadline: true }))
        .toEqual({ deliveryState: 'AWAITING_DELIVERY', canReclaimExpired: true });
    });
  });

  describe('Status 4: VerificationFailed', () => {
    describe('Contributor actions', () => {
      it('shows CAN_RESUBMIT if under max resubmissions', () => {
        expect(getProposalActionState({ ...defaultParams, status: 4, isContributor: true, resubmissionCount: 1 }))
          .toMatchObject({ resubmissionState: 'CAN_RESUBMIT' });
      });

      it('shows MAX_REACHED if at or over max resubmissions', () => {
        expect(getProposalActionState({ ...defaultParams, status: 4, isContributor: true, resubmissionCount: 3 }))
          .toMatchObject({ resubmissionState: 'MAX_REACHED' });
      });

      it('respects non-default maxResubmissions configured by DAO', () => {
        // Here the max limit is 5 instead of default 3.
        // At 3, they can still resubmit.
        expect(getProposalActionState({ ...defaultParams, status: 4, isContributor: true, resubmissionCount: 3, maxResubmissions: 5 }))
          .toMatchObject({ resubmissionState: 'CAN_RESUBMIT' });

        // At 5, they hit the max limit.
        expect(getProposalActionState({ ...defaultParams, status: 4, isContributor: true, resubmissionCount: 5, maxResubmissions: 5 }))
          .toMatchObject({ resubmissionState: 'MAX_REACHED' });
      });
    });

    describe('Non-contributor reclaim voting (active)', () => {
      const activeReclaim = { ...defaultParams, status: 4, isContributor: false, isReclaimVoting: true };

      it('shows CONNECT_WALLET if not connected', () => {
        expect(getProposalActionState({ ...activeReclaim, isConnected: false }))
          .toEqual({ reclaimVotingState: 'CONNECT_WALLET' });
      });

      it('shows ALREADY_VOTED if user already voted', () => {
        expect(getProposalActionState({ ...activeReclaim, hasVotedReclaim: true }))
          .toEqual({ reclaimVotingState: 'ALREADY_VOTED' });
      });

      it('shows NO_VOTING_POWER if voting power is 0', () => {
        expect(getProposalActionState({ ...activeReclaim, votingPower: "0" }))
          .toEqual({ reclaimVotingState: 'NO_VOTING_POWER' });
      });

      it('shows CAN_VOTE if valid non-contributor voter', () => {
        expect(getProposalActionState(activeReclaim))
          .toEqual({ reclaimVotingState: 'CAN_VOTE' });
      });
    });

    describe('Reclaim voting (closed)', () => {
      it('shows CAN_FINALIZE for anyone (contributor)', () => {
        expect(getProposalActionState({ ...defaultParams, status: 4, isContributor: true, isReclaimVoting: false }))
          .toMatchObject({ reclaimVotingState: 'CAN_FINALIZE' });
      });

      it('shows CAN_FINALIZE for anyone (non-contributor)', () => {
        expect(getProposalActionState({ ...defaultParams, status: 4, isContributor: false, isReclaimVoting: false }))
          .toMatchObject({ reclaimVotingState: 'CAN_FINALIZE' });
      });
    });
  });

  describe('Status 6: VerificationPassed', () => {
    it('shows CAN_CLAIM for contributor', () => {
      expect(getProposalActionState({ ...defaultParams, status: 6, isContributor: true }))
        .toEqual({ claimState: 'CAN_CLAIM' });
    });

    it('shows AWAITING_CLAIM for non-contributor', () => {
      expect(getProposalActionState({ ...defaultParams, status: 6, isContributor: false }))
        .toEqual({ claimState: 'AWAITING_CLAIM' });
    });
  });
});
