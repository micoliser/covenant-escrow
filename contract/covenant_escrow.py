# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
import json


# ---------------------------------------------------------------------------
# Storage structs  (§1.1, §1.2)
#
# These use @allow_storage + @dataclass so they can live inside TreeMap
# values. Following the spec's hard-won lesson: no nested TreeMap/DynArray
# inside these structs — all collections stay flat at the contract level.
# ---------------------------------------------------------------------------

@allow_storage
@dataclass
class Dao:
    name: str
    description: str
    admin: Address
    quorum_bps: u256             # basis points — 100 = 1%
    approval_threshold_bps: u256
    voting_period_seconds: u256
    funding_cap_bps: u256
    max_resubmissions: u256
    min_criteria_length: u256
    total_balance: u256
    # Sum of all deposits ever into this DAO. Only increases on deposit —
    # never shrinks when funds are escrowed. Quorum denominator (not liquid balance).
    total_voting_power: u256
    proposal_count: u256


@allow_storage
@dataclass
class Proposal:
    dao_id: u256
    contributor: Address
    title: str
    description: str
    deliverable_criteria: str
    requested_amount: u256
    deadline: u256
    status: u256                  # enum code — see STATUS_* constants
    yes_weight: u256
    no_weight: u256
    reclaim_yes_weight: u256
    reclaim_no_weight: u256
    # Incremented each time we enter VerificationFailed so reclaim vote keys
    # are namespaced per reclaim round (old votes cannot block a new round).
    reclaim_round: u256
    escrowed_amount: u256
    deliverable_url: str
    delivery_notes: str
    verdict_summary: str
    # AI screening rejection only — never overwritten by reclaim outcomes.
    screening_rejection_reason: str
    # Why funds returned / reclaim resolved (quorum miss, DAO vote, deadline, …).
    reclaim_reason: str
    # Number of *failed verification outcomes* so far, including the first failure.
    # max_resubmissions is the max failed outcomes allowed before further
    # submit_deliverable calls are blocked (and before the reclaim safety valve).
    # Example: max_resubmissions=3 → three failed verifications may occur; a fourth
    # deliverable submission is rejected. max_resubmissions=0 → first failure ends
    # retry path (no resubmits).
    resubmission_count: u256
    submitted_at: u256
    vote_ends_at: u256
    reclaim_vote_ends_at: u256


@allow_storage
@dataclass
class VoteRecord:
    support: bool
    weight: u256
    voted_at: u256


# ---------------------------------------------------------------------------
# Status enum codes  (§1.1 / §5.7)
#
# Only the actually-persisted states. Submitted/Approved/DeliverySubmitted
# are conceptual-only and never written to storage.
# ---------------------------------------------------------------------------
STATUS_REJECTED = 0
STATUS_OPEN_FOR_VOTING = 1
STATUS_VOTE_FAILED = 2
STATUS_ESCROWED = 3
STATUS_VERIFICATION_FAILED = 4
STATUS_RECLAIMED = 5
STATUS_VERIFICATION_PASSED = 6
STATUS_RELEASED = 7

# Valid vote type strings
VOTE_TYPE_FUND = "fund"
VOTE_TYPE_RECLAIM = "reclaim"


# ---------------------------------------------------------------------------
# Contract  (§4)
# ---------------------------------------------------------------------------

class CovenantEscrow(gl.Contract):
    # --- Global counters (§1.3) ---
    dao_count: u256
    proposal_count: u256

    # --- Core storage ---
    daos: TreeMap[u256, Dao]
    proposals: TreeMap[u256, Proposal]

    # --- Flat namespaced maps (§1.3) ---
    # voting_power keyed by "{dao_id}:{address_hex}"
    voting_power: TreeMap[str, u256]
    # votes keyed by "{proposal_id}:{vote_type}:{address_hex}"
    votes: TreeMap[str, VoteRecord]

    # ===================================================================
    # Constructor  (§4 — Setup)
    # ===================================================================

    def __init__(
        self,
        name: str,
        description: str,
        quorum_bps: u256,
        approval_threshold_bps: u256,
        voting_period_seconds: u256,
        funding_cap_bps: u256,
        max_resubmissions: u256,
        min_criteria_length: u256,
    ):
        """
        Deploy-time constructor. Initializes counters and bootstraps DAO #0
        (the single launch DAO) using the same validation/storage path as
        create_dao — so launch is usable without a separate create_dao call.
        Admin of the bootstrap DAO is the deployer (tx sender).
        """
        self.dao_count = 0
        self.proposal_count = 0
        self._create_dao(
            name,
            description,
            quorum_bps,
            approval_threshold_bps,
            voting_period_seconds,
            funding_cap_bps,
            max_resubmissions,
            min_criteria_length,
        )

    # ===================================================================
    # DAO management  (§4 — DAOs)
    # ===================================================================

    def _create_dao(
        self,
        name: str,
        description: str,
        quorum_bps: u256,
        approval_threshold_bps: u256,
        voting_period_seconds: u256,
        funding_cap_bps: u256,
        max_resubmissions: u256,
        min_criteria_length: u256,
    ) -> u256:
        """
        Shared create-DAO implementation used by __init__ and create_dao.
        Admin is always gl.message.sender_address (deployer at bootstrap).
        """
        if not name:
            raise gl.vm.UserError("name is required")
        if quorum_bps == 0 or quorum_bps > 10000:
            raise gl.vm.UserError("quorum_bps must be 1-10000")
        if approval_threshold_bps == 0 or approval_threshold_bps > 10000:
            raise gl.vm.UserError("approval_threshold_bps must be 1-10000")
        if voting_period_seconds == 0:
            raise gl.vm.UserError("voting_period_seconds must be > 0")
        if funding_cap_bps == 0 or funding_cap_bps > 10000:
            raise gl.vm.UserError("funding_cap_bps must be 1-10000")

        dao_id = self.dao_count
        self.dao_count = dao_id + 1

        self.daos[dao_id] = Dao(
            name=name,
            description=description,
            admin=gl.message.sender_address,
            quorum_bps=quorum_bps,
            approval_threshold_bps=approval_threshold_bps,
            voting_period_seconds=voting_period_seconds,
            funding_cap_bps=funding_cap_bps,
            max_resubmissions=max_resubmissions,
            min_criteria_length=min_criteria_length,
            total_balance=0,
            total_voting_power=0,
            proposal_count=0,
        )

        return dao_id

    @gl.public.write
    def create_dao(
        self,
        name: str,
        description: str,
        quorum_bps: u256,
        approval_threshold_bps: u256,
        voting_period_seconds: u256,
        funding_cap_bps: u256,
        max_resubmissions: u256,
        min_criteria_length: u256,
    ) -> u256:
        """
        Create a new DAO. Anyone can call this. Admin is set to sender.
        Returns the new dao_id.

        max_resubmissions=0 is valid (no retries after the first failed
        verification — see Proposal.resubmission_count semantics).
        min_criteria_length=0 is valid (disables the length pre-check).
        """
        return self._create_dao(
            name,
            description,
            quorum_bps,
            approval_threshold_bps,
            voting_period_seconds,
            funding_cap_bps,
            max_resubmissions,
            min_criteria_length,
        )

    # ===================================================================
    # Admin  (§4 — Admin)
    # ===================================================================

    @gl.public.write
    def update_dao_config(
        self,
        dao_id: u256,
        quorum_bps: u256,
        approval_threshold_bps: u256,
        voting_period_seconds: u256,
        funding_cap_bps: u256,
        max_resubmissions: u256,
        min_criteria_length: u256,
    ) -> None:
        """
        Update governance parameters for a DAO. Admin-only.
        Does not change name, description, or admin — those are identity fields.
        """
        dao = self.daos.get(dao_id, None)
        if dao is None:
            raise gl.vm.UserError("dao does not exist")
        if gl.message.sender_address != dao.admin:
            raise gl.vm.UserError("caller is not the DAO admin")

        # Same validation rules as create_dao
        if quorum_bps == 0 or quorum_bps > 10000:
            raise gl.vm.UserError("quorum_bps must be 1-10000")
        if approval_threshold_bps == 0 or approval_threshold_bps > 10000:
            raise gl.vm.UserError("approval_threshold_bps must be 1-10000")
        if voting_period_seconds == 0:
            raise gl.vm.UserError("voting_period_seconds must be > 0")
        if funding_cap_bps == 0 or funding_cap_bps > 10000:
            raise gl.vm.UserError("funding_cap_bps must be 1-10000")

        dao.quorum_bps = quorum_bps
        dao.approval_threshold_bps = approval_threshold_bps
        dao.voting_period_seconds = voting_period_seconds
        dao.funding_cap_bps = funding_cap_bps
        dao.max_resubmissions = max_resubmissions
        dao.min_criteria_length = min_criteria_length
        self.daos[dao_id] = dao

    # ===================================================================
    # Treasury  (§4 — Treasury)
    # ===================================================================

    @gl.public.write.payable
    def deposit_treasury(self, dao_id: u256) -> None:
        """
        Deposit funds into a specific DAO's treasury.
        Increases sender's voting power in that DAO proportionally.
        Depositing into one DAO does not grant power in any other.
        Deposits are one-way (§5.3) — no withdrawal path exists.

        Must be @gl.public.write.payable: gl.message.value is only available
        on payable methods (docs.genlayer.com — Value transfers / Messages).
        """
        amount = gl.message.value
        if amount == 0:
            raise gl.vm.UserError("must send a non-zero amount")

        # Verify DAO exists
        dao = self.daos.get(dao_id, None)
        if dao is None:
            raise gl.vm.UserError("dao does not exist")

        # Update DAO treasury balance and permanent voting-power total
        dao.total_balance = dao.total_balance + amount
        dao.total_voting_power = dao.total_voting_power + amount
        self.daos[dao_id] = dao

        # Update sender's voting power for this DAO
        key = self._voting_power_key(dao_id, gl.message.sender_address)
        current_power = self.voting_power.get(key, 0)
        self.voting_power[key] = current_power + amount

    # ===================================================================
    # Proposal lifecycle  (§4 — Proposal lifecycle)
    # ===================================================================

    @gl.public.write
    def submit_proposal(
        self,
        dao_id: u256,
        title: str,
        description: str,
        deliverable_criteria: str,
        requested_amount: u256,
        deadline: u256,
    ) -> u256:
        """
        Submit a grant proposal to a specific DAO.

        Non-deterministic (eq_principle.prompt_non_comparative):
        validators independently judge whether the proposal text meets the
        DAO's screening rules. Writes straight to Rejected or OpenForVoting —
        no intermediate Submitted state is ever persisted (§5.7).

        Returns the new proposal_id.
        """
        dao = self.daos.get(dao_id, None)
        if dao is None:
            raise gl.vm.UserError("dao does not exist")

        if not title:
            raise gl.vm.UserError("title is required")

        # Cheap deterministic pre-checks before spending an LLM call
        if dao.min_criteria_length > 0 and len(deliverable_criteria) < dao.min_criteria_length:
            raise gl.vm.UserError(
                f"deliverable_criteria must be at least {dao.min_criteria_length} characters"
            )

        # funding_cap_bps check: requested_amount <= dao.total_balance * funding_cap_bps / 10000
        if dao.total_balance > 0:
            cap = dao.total_balance * dao.funding_cap_bps // 10000
            if requested_amount > cap:
                raise gl.vm.UserError(
                    "requested_amount exceeds this DAO's per-proposal funding cap"
                )
        elif requested_amount > 0:
            # Empty treasury — can't fund anything
            raise gl.vm.UserError(
                "requested_amount exceeds this DAO's per-proposal funding cap"
            )

        # Deadline must be strictly after this transaction's timestamp
        # (docs: use datetime.now, NOT gl.message.timestamp — that field does not exist).
        now = self._tx_timestamp()
        if deadline <= now:
            raise gl.vm.UserError("deadline must be strictly greater than the current timestamp")

        # Non-deterministic screening via prompt_non_comparative:
        # fn supplies fixed input (proposal text already known); leader LLM
        # screens against task/criteria; validators judge the leader output
        # against the same input + criteria (no second independent answer).
        # Storage is not accessible inside the nondet block — copy to locals.
        dao_name = dao.name
        dao_description = dao.description
        proposal_title = title
        proposal_description = description
        proposal_criteria = deliverable_criteria

        def screening_input() -> str:
            return (
                f'DAO name: "{dao_name}"\n'
                f"DAO focus: {dao_description}\n"
                f"Proposal title: {proposal_title}\n"
                f"Proposal description: {proposal_description}\n"
                f'Deliverable criteria (what "done" means): {proposal_criteria}\n'
            )

        screening_raw = gl.eq_principle.prompt_non_comparative(
            screening_input,
            task=(
                "Screen this grant proposal for whether it meets a basic quality "
                "bar for proceeding to a community vote. Respond ONLY with a JSON "
                'object of the form: {"approved": true or false, "reason": '
                '"brief explanation"} — no markdown fences, no other text.'
            ),
            criteria=(
                "approved must be true only if: (1) the proposal is coherent and "
                "relevant to the DAO's focus area; (2) the deliverable criteria "
                "are specific and verifiable, not vague; (3) the proposal appears "
                "to be a genuine grant request, not spam or nonsense. Otherwise "
                "approved must be false and reason must explain why. Output must "
                "be valid JSON with exactly the keys approved and reason."
            ),
        )
        screening_result = json.loads(screening_raw)
        approved = screening_result.get("approved", False)
        reason = screening_result.get("reason", "")

        proposal_id = self.proposal_count
        self.proposal_count = proposal_id + 1

        if approved:
            status = STATUS_OPEN_FOR_VOTING
            screening_rejection_reason = ""
            vote_ends_at = now + dao.voting_period_seconds
            # Increment this DAO's proposal count (stat only — not used for ID)
            dao.proposal_count = dao.proposal_count + 1
            self.daos[dao_id] = dao
        else:
            status = STATUS_REJECTED
            screening_rejection_reason = reason
            vote_ends_at = 0

        self.proposals[proposal_id] = Proposal(
            dao_id=dao_id,
            contributor=gl.message.sender_address,
            title=title,
            description=description,
            deliverable_criteria=deliverable_criteria,
            requested_amount=requested_amount,
            deadline=deadline,
            status=status,
            yes_weight=0,
            no_weight=0,
            reclaim_yes_weight=0,
            reclaim_no_weight=0,
            reclaim_round=0,
            escrowed_amount=0,
            deliverable_url="",
            delivery_notes="",
            verdict_summary="",
            screening_rejection_reason=screening_rejection_reason,
            reclaim_reason="",
            resubmission_count=0,
            submitted_at=now,
            vote_ends_at=vote_ends_at,
            reclaim_vote_ends_at=0,
        )

        return proposal_id

    @gl.public.write
    def cast_vote(
        self,
        proposal_id: u256,
        vote_type: str,
        support: bool,
    ) -> None:
        """
        Cast a funding or reclaim vote on a proposal.

        vote_type must be 'fund' or 'reclaim'.
        Reads proposal.dao_id to look up the sender's voting power in the
        correct DAO — no dao_id parameter needed.
        Writes into the flat votes map; updates the tally on the Proposal.
        """
        if vote_type not in (VOTE_TYPE_FUND, VOTE_TYPE_RECLAIM):
            raise gl.vm.UserError("vote_type must be 'fund' or 'reclaim'")

        proposal = self.proposals.get(proposal_id, None)
        if proposal is None:
            raise gl.vm.UserError("proposal does not exist")

        sender = gl.message.sender_address

        now = self._tx_timestamp()
        if vote_type == VOTE_TYPE_FUND:
            if proposal.status != STATUS_OPEN_FOR_VOTING:
                raise gl.vm.UserError("proposal is not open for voting")
            if now > proposal.vote_ends_at:
                raise gl.vm.UserError("voting period has ended")
        else:  # VOTE_TYPE_RECLAIM
            if proposal.status != STATUS_VERIFICATION_FAILED:
                raise gl.vm.UserError("proposal is not in VerificationFailed status")
            if now > proposal.reclaim_vote_ends_at:
                raise gl.vm.UserError("reclaim voting period has ended")

        # Check sender has voting power in this DAO
        vp_key = self._voting_power_key(proposal.dao_id, sender)
        weight = self.voting_power.get(vp_key, 0)
        if weight == 0:
            raise gl.vm.UserError("no voting power in this DAO")

        # Check not already voted on this proposal+vote_type(+reclaim_round)
        vote_key = self._vote_key(
            proposal_id, vote_type, sender, proposal.reclaim_round
        )
        existing = self.votes.get(vote_key, None)
        if existing is not None:
            raise gl.vm.UserError("already voted on this proposal")

        # Record the vote
        self.votes[vote_key] = VoteRecord(
            support=support,
            weight=weight,
            voted_at=now,
        )

        # Update the tally on the proposal
        if vote_type == VOTE_TYPE_FUND:
            if support:
                proposal.yes_weight = proposal.yes_weight + weight
            else:
                proposal.no_weight = proposal.no_weight + weight
        else:  # VOTE_TYPE_RECLAIM
            if support:
                proposal.reclaim_yes_weight = proposal.reclaim_yes_weight + weight
            else:
                proposal.reclaim_no_weight = proposal.reclaim_no_weight + weight

        self.proposals[proposal_id] = proposal

    @gl.public.write
    def finalize_vote(self, proposal_id: u256) -> None:
        """
        Finalize a funding vote. Callable by anyone once vote_ends_at has passed.

        Loads the proposal's dao_id, checks quorum and threshold against that
        DAO's rules. On pass: moves requested_amount from Dao.total_balance
        into Proposal.escrowed_amount, status → Escrowed. On fail: VoteFailed.
        """
        proposal = self.proposals.get(proposal_id, None)
        if proposal is None:
            raise gl.vm.UserError("proposal does not exist")
        if proposal.status != STATUS_OPEN_FOR_VOTING:
            raise gl.vm.UserError("proposal is not open for voting")

        now = self._tx_timestamp()
        if now <= proposal.vote_ends_at:
            raise gl.vm.UserError("voting period has not ended yet")

        dao = self.daos.get(proposal.dao_id, None)
        if dao is None:
            raise gl.vm.UserError("dao does not exist")  # should never happen

        # Quorum denominator is total_voting_power (deposit total), NOT liquid
        # total_balance — escrow must not make quorum easier.
        total_weight = dao.total_voting_power
        participating_weight = proposal.yes_weight + proposal.no_weight

        # Quorum check: participating / total >= quorum_bps / 10000
        quorum_met = (
            total_weight > 0
            and participating_weight * 10000 >= total_weight * dao.quorum_bps
        )

        if not quorum_met:
            proposal.status = STATUS_VOTE_FAILED
            self.proposals[proposal_id] = proposal
            return

        # Approval threshold check: yes_weight / participating >= threshold_bps / 10000
        threshold_met = (
            participating_weight > 0
            and proposal.yes_weight * 10000
            >= participating_weight * dao.approval_threshold_bps
        )

        if threshold_met:
            # Re-check liquid treasury at finalize time. Concurrent proposals may
            # have already escrowed funds since this one opened — fail gracefully
            # to VoteFailed instead of hard-erroring.
            if dao.total_balance < proposal.requested_amount:
                proposal.status = STATUS_VOTE_FAILED
            else:
                dao.total_balance = dao.total_balance - proposal.requested_amount
                proposal.escrowed_amount = proposal.requested_amount
                proposal.status = STATUS_ESCROWED
                self.daos[proposal.dao_id] = dao
        else:
            proposal.status = STATUS_VOTE_FAILED

        self.proposals[proposal_id] = proposal

    @gl.public.write
    def submit_deliverable(
        self,
        proposal_id: u256,
        evidence_url: str,
        notes: str,
    ) -> None:
        """
        Submit or resubmit delivery evidence for an escrowed proposal.

        Non-deterministic (eq_principle.prompt_comparative): two validators
        independently fetch the evidence_url — live content may differ slightly,
        hence comparative rather than non-comparative (§4).

        Valid from Escrowed or VerificationFailed (resubmission) status.
        resubmission_count = failed verification outcomes so far (incl. first);
        blocked once resubmission_count >= dao.max_resubmissions.
        After the proposal deadline, deliveries are rejected outright.
        Writes straight to VerificationPassed or VerificationFailed (§5.7).
        """
        proposal = self.proposals.get(proposal_id, None)
        if proposal is None:
            raise gl.vm.UserError("proposal does not exist")

        if proposal.status not in (STATUS_ESCROWED, STATUS_VERIFICATION_FAILED):
            raise gl.vm.UserError(
                "proposal must be Escrowed or VerificationFailed to submit deliverable"
            )

        if gl.message.sender_address != proposal.contributor:
            raise gl.vm.UserError("only the contributor can submit a deliverable")

        if not evidence_url:
            raise gl.vm.UserError("evidence_url is required")

        now = self._tx_timestamp()
        if now > proposal.deadline:
            raise gl.vm.UserError(
                "deadline has passed; deliverable submissions are no longer accepted"
            )

        dao = self.daos.get(proposal.dao_id, None)
        if dao is None:
            raise gl.vm.UserError("dao does not exist")  # should never happen

        # Failed-verification cap (includes first failure — see Proposal field comment).
        # count==0 always allows the first attempt; after failures, block when
        # count >= max_resubmissions (max=0 → no retries after first fail).
        if (
            proposal.resubmission_count > 0
            and proposal.resubmission_count >= dao.max_resubmissions
        ):
            raise gl.vm.UserError(
                "maximum failed verification attempts reached for this proposal"
            )

        # Non-deterministic verification via prompt_comparative:
        # each node independently fetches the live URL then LLM-judges the
        # FETCHED page text against pinned deliverable_criteria. Comparative
        # because live content can differ slightly between validators.
        # Copy everything needed out of storage before defining the fn.
        pinned_criteria = proposal.deliverable_criteria
        evidence_url_local = evidence_url
        notes_local = notes

        def verify_deliverable() -> str:
            # Actual live fetch — required; judging a bare URL string is not enough.
            page_text = gl.nondet.web.render(evidence_url_local, mode="text")
            prompt = f"""You are verifying whether a grant deliverable meets the agreed criteria.

Agreed criteria (pinned at proposal time):
{pinned_criteria}

Contributor notes:
{notes_local}

Evidence URL (already fetched for you):
{evidence_url_local}

FETCHED PAGE CONTENT:
{page_text}

Evaluate whether the fetched evidence demonstrates that the deliverable
criteria have been met. Respond ONLY with JSON in exactly this shape,
nothing else:
{{"passed": true or false, "summary": "brief explanation of your verdict"}}
"""
            raw = gl.nondet.exec_prompt(prompt)
            raw = raw.strip().replace("```json", "").replace("```", "").strip()
            try:
                parsed = json.loads(raw)
            except Exception:
                return json.dumps(
                    {
                        "passed": False,
                        "summary": "could not parse verification response",
                    }
                )
            return json.dumps(
                {
                    "passed": bool(parsed.get("passed", False)),
                    "summary": str(parsed.get("summary", "")),
                }
            )

        principle = (
            "Both answers are JSON objects with boolean `passed` and string "
            "`summary`. Treat them as equivalent if and only if the `passed` "
            "fields match exactly. Summary wording may differ."
        )
        verification_raw = gl.eq_principle.prompt_comparative(
            verify_deliverable, principle
        )
        verification_result = json.loads(verification_raw)

        passed = verification_result.get("passed", False)
        summary = verification_result.get("summary", "")

        proposal.deliverable_url = evidence_url
        proposal.delivery_notes = notes
        proposal.verdict_summary = summary

        if passed:
            proposal.status = STATUS_VERIFICATION_PASSED
        else:
            # Enter / re-enter VerificationFailed: reset reclaim tallies and
            # advance reclaim_round so prior reclaim vote keys no longer apply.
            proposal.status = STATUS_VERIFICATION_FAILED
            proposal.resubmission_count = proposal.resubmission_count + 1
            proposal.reclaim_yes_weight = 0
            proposal.reclaim_no_weight = 0
            proposal.reclaim_round = proposal.reclaim_round + 1
            # Auto-start the reclaim vote clock (§5.1, §5.6)
            proposal.reclaim_vote_ends_at = now + dao.voting_period_seconds

        self.proposals[proposal_id] = proposal

    @gl.public.write
    def finalize_reclaim(self, proposal_id: u256) -> None:
        """
        Finalize a reclaim vote. Callable by anyone once reclaim_vote_ends_at passed.

        Resolution logic (§4):
        - Quorum not met → auto-return funds to treasury (Reclaimed)
        - Quorum met, reclaim vote passes → funds return to treasury (Reclaimed)
        - Quorum met, reclaim vote fails → revert to Escrowed for resubmission
          UNLESS resubmission_count >= max_resubmissions → safety valve forces Reclaimed
        """
        proposal = self.proposals.get(proposal_id, None)
        if proposal is None:
            raise gl.vm.UserError("proposal does not exist")
        if proposal.status != STATUS_VERIFICATION_FAILED:
            raise gl.vm.UserError("proposal is not in VerificationFailed status")

        now = self._tx_timestamp()
        if now <= proposal.reclaim_vote_ends_at:
            raise gl.vm.UserError("reclaim voting period has not ended yet")

        dao = self.daos.get(proposal.dao_id, None)
        if dao is None:
            raise gl.vm.UserError("dao does not exist")  # should never happen

        # Same quorum denominator as funding votes: permanent deposit total.
        total_weight = dao.total_voting_power
        participating_weight = (
            proposal.reclaim_yes_weight + proposal.reclaim_no_weight
        )

        quorum_met = (
            total_weight > 0
            and participating_weight * 10000 >= total_weight * dao.quorum_bps
        )

        def _do_reclaim(reason: str) -> None:
            dao.total_balance = dao.total_balance + proposal.escrowed_amount
            proposal.escrowed_amount = 0
            proposal.status = STATUS_RECLAIMED
            proposal.reclaim_reason = reason
            self.daos[proposal.dao_id] = dao
            self.proposals[proposal_id] = proposal

        if not quorum_met:
            _do_reclaim("quorum not met, auto-returned")
            return

        # Quorum met — check if reclaim vote passed
        reclaim_passed = (
            participating_weight > 0
            and proposal.reclaim_yes_weight * 10000
            >= participating_weight * dao.approval_threshold_bps
        )

        if reclaim_passed:
            _do_reclaim("dao voted to reclaim")
        else:
            # DAO voted to keep backing the contributor
            # Safety valve: if failed-verification cap exhausted, reclaim anyway
            if (
                proposal.resubmission_count > 0
                and proposal.resubmission_count >= dao.max_resubmissions
            ):
                _do_reclaim("max failed verification attempts reached")
            else:
                # Revert to Escrowed — contributor gets another attempt
                proposal.status = STATUS_ESCROWED
                proposal.reclaim_vote_ends_at = 0
                self.proposals[proposal_id] = proposal

    @gl.public.write
    def claim_funds(self, proposal_id: u256) -> None:
        """
        Contributor-only. Valid only from VerificationPassed.
        Transfers escrowed_amount to the contributor and sets status to Released.
        """
        proposal = self.proposals.get(proposal_id, None)
        if proposal is None:
            raise gl.vm.UserError("proposal does not exist")
        if proposal.status != STATUS_VERIFICATION_PASSED:
            raise gl.vm.UserError("proposal has not passed verification")
        if gl.message.sender_address != proposal.contributor:
            raise gl.vm.UserError("only the contributor can claim funds")

        amount = proposal.escrowed_amount
        if amount == 0:
            raise gl.vm.UserError("no funds to claim")

        proposal.escrowed_amount = 0
        proposal.status = STATUS_RELEASED
        self.proposals[proposal_id] = proposal

        # Transfer funds to the contributor
        gl.message.sender_address.transfer(amount)

    @gl.public.write
    def reclaim_expired_escrow(self, proposal_id: u256) -> None:
        """
        Permissionless. Valid only from Escrowed status once current_time > deadline.

        A missed deadline is an objective timestamp check — no vote required (§5.6).
        Returns escrowed_amount to the proposal's DAO treasury and sets Reclaimed.
        """
        proposal = self.proposals.get(proposal_id, None)
        if proposal is None:
            raise gl.vm.UserError("proposal does not exist")
        if proposal.status != STATUS_ESCROWED:
            raise gl.vm.UserError("proposal is not in Escrowed status")

        now = self._tx_timestamp()
        if now <= proposal.deadline:
            raise gl.vm.UserError("proposal deadline has not passed yet")

        dao = self.daos.get(proposal.dao_id, None)
        if dao is None:
            raise gl.vm.UserError("dao does not exist")  # should never happen

        dao.total_balance = dao.total_balance + proposal.escrowed_amount
        proposal.escrowed_amount = 0
        proposal.status = STATUS_RECLAIMED
        proposal.reclaim_reason = "deadline passed without delivery"

        self.daos[proposal.dao_id] = dao
        self.proposals[proposal_id] = proposal

    # ===================================================================
    # Views  (§4 — Views)
    # ===================================================================

    @gl.public.view
    def get_dao(self, dao_id: u256) -> dict:
        """Return full DAO details as a plain dict."""
        dao = self.daos.get(dao_id, None)
        if dao is None:
            raise gl.vm.UserError("dao does not exist")

        return {
            "dao_id": dao_id,
            "name": dao.name,
            "description": dao.description,
            "admin": hex(dao.admin.as_int),
            "quorum_bps": dao.quorum_bps,
            "approval_threshold_bps": dao.approval_threshold_bps,
            "voting_period_seconds": dao.voting_period_seconds,
            "funding_cap_bps": dao.funding_cap_bps,
            "max_resubmissions": dao.max_resubmissions,
            "min_criteria_length": dao.min_criteria_length,
            "total_balance": dao.total_balance,
            "total_voting_power": dao.total_voting_power,
            "proposal_count": dao.proposal_count,
        }

    @gl.public.view
    def get_dao_count(self) -> u256:
        """Return the total number of DAOs on this contract."""
        return self.dao_count

    @gl.public.view
    def get_proposal_count(self) -> u256:
        """Return the global proposal count across all DAOs."""
        return self.proposal_count

    @gl.public.view
    def get_proposal(self, proposal_id: u256) -> dict:
        """
        Return full proposal details as a plain dict.
        Return payload includes dao_id per spec §4.
        """
        proposal = self.proposals.get(proposal_id, None)
        if proposal is None:
            raise gl.vm.UserError("proposal does not exist")

        return {
            "proposal_id": proposal_id,
            "dao_id": proposal.dao_id,
            "contributor": hex(proposal.contributor.as_int),
            "title": proposal.title,
            "description": proposal.description,
            "deliverable_criteria": proposal.deliverable_criteria,
            "requested_amount": proposal.requested_amount,
            "deadline": proposal.deadline,
            "status": proposal.status,
            "yes_weight": proposal.yes_weight,
            "no_weight": proposal.no_weight,
            "reclaim_yes_weight": proposal.reclaim_yes_weight,
            "reclaim_no_weight": proposal.reclaim_no_weight,
            "reclaim_round": proposal.reclaim_round,
            "escrowed_amount": proposal.escrowed_amount,
            "deliverable_url": proposal.deliverable_url,
            "delivery_notes": proposal.delivery_notes,
            "verdict_summary": proposal.verdict_summary,
            "screening_rejection_reason": proposal.screening_rejection_reason,
            "reclaim_reason": proposal.reclaim_reason,
            "resubmission_count": proposal.resubmission_count,
            "submitted_at": proposal.submitted_at,
            "vote_ends_at": proposal.vote_ends_at,
            "reclaim_vote_ends_at": proposal.reclaim_vote_ends_at,
        }

    @gl.public.view
    def get_treasury_balance(self, dao_id: u256) -> u256:
        """Return a specific DAO's treasury balance."""
        dao = self.daos.get(dao_id, None)
        if dao is None:
            raise gl.vm.UserError("dao does not exist")
        return dao.total_balance

    @gl.public.view
    def get_voting_power(self, dao_id: u256, address: Address) -> u256:
        """Return an address's voting power in a specific DAO."""
        key = self._voting_power_key(dao_id, address)
        return self.voting_power.get(key, 0)

    @gl.public.view
    def get_vote(self, proposal_id: u256, vote_type: str, address: Address) -> dict:
        """
        Return a VoteRecord as a dict, or None if the address has not voted.
        Fund keys: '{proposal_id}:fund:{address_hex}'
        Reclaim keys: '{proposal_id}:reclaim:{reclaim_round}:{address_hex}'
        (uses the proposal's current reclaim_round).
        """
        reclaim_round = 0
        if vote_type == VOTE_TYPE_RECLAIM:
            proposal = self.proposals.get(proposal_id, None)
            if proposal is not None:
                reclaim_round = proposal.reclaim_round
        key = self._vote_key(proposal_id, vote_type, address, reclaim_round)
        record = self.votes.get(key, None)
        if record is None:
            return None
        return {
            "support": record.support,
            "weight": record.weight,
            "voted_at": record.voted_at,
        }

    # ===================================================================
    # Internal helpers
    # ===================================================================

    def _tx_timestamp(self) -> u256:
        """
        Deterministic transaction timestamp in Unix seconds.

        Confirmed against docs.genlayer.com Transaction Context:
        gl.message has no `.timestamp` field. Use datetime.now wired to the
        tx datetime (or int(time.time()) — same source).
        """
        return u256(int(datetime.now(timezone.utc).timestamp()))

    def _voting_power_key(self, dao_id: u256, address: Address) -> str:
        """Build the flat namespaced key for voting_power: '{dao_id}:{address_hex}'"""
        return f"{dao_id}:{hex(address.as_int)}"

    def _vote_key(
        self,
        proposal_id: u256,
        vote_type: str,
        address: Address,
        reclaim_round: u256 = 0,
    ) -> str:
        """
        Vote map key.
        fund:    '{proposal_id}:fund:{address_hex}'
        reclaim: '{proposal_id}:reclaim:{reclaim_round}:{address_hex}'
        """
        if vote_type == VOTE_TYPE_RECLAIM:
            return (
                f"{proposal_id}:{vote_type}:{reclaim_round}:{hex(address.as_int)}"
            )
        return f"{proposal_id}:{vote_type}:{hex(address.as_int)}"
