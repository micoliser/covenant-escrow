"""
CovenantEscrow contract test suite.

STATUS: Written test-first per spec; deterministic paths and MockedLLMResponse
paths are real runnable tests when localnet/glsim is available. A small set of
tests remain @xfail only where fixtures need unavailable tooling (not for
missing mock support — genlayer-test 0.29 provides MockedLLMResponse).

Mocking (confirmed in gltest.types + METADATA for v0.29):
  MockedLLMResponse with:
    - nondet_exec_prompt: substring → raw response string
    - eq_principle_prompt_comparative: substring → bool
    - eq_principle_prompt_non_comparative: substring → bool
  MockedWebResponse with nondet_web_request for gl.nondet.web.render

Run from contract/:
    pytest tests/test_contract.py
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import pytest
from gltest import (
    create_accounts,
    get_contract_factory,
    get_default_account,
    get_validator_factory,
)
from gltest.assertions import tx_execution_succeeded
from gltest.types import MockedLLMResponse, MockedWebResponse

accounts = create_accounts(4)
# Studio often funds/uses the configured default account as the primary deployer.
default_account = get_default_account()


def _addr_hex(value) -> str:
    """Normalize account address or hex string for comparison."""
    if hasattr(value, "address"):
        value = value.address
    s = str(value)
    if s.startswith("0x") or s.startswith("0X"):
        return hex(int(s, 16)).lower()
    return hex(int(s, 16)).lower()

# Fixed datetime used for warpable deterministic checks
GENVM_T0 = "2024-06-01T12:00:00Z"
GENVM_T0_UNIX = 1717243200  # 2024-06-01 12:00:00 UTC
VOTING_PERIOD = 86400
MIN_CRITERIA = 50
DEFAULT_QUORUM_BPS = 2000  # 20%
DEFAULT_THRESHOLD_BPS = 5100  # 51%
DEFAULT_FUNDING_CAP_BPS = 2500  # 25%


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _default_dao_args(
    *,
    name: str = "Test DAO",
    description: str = "A DAO for testing",
    quorum_bps: int = DEFAULT_QUORUM_BPS,
    approval_threshold_bps: int = DEFAULT_THRESHOLD_BPS,
    voting_period_seconds: int = VOTING_PERIOD,
    funding_cap_bps: int = DEFAULT_FUNDING_CAP_BPS,
    max_resubmissions: int = 3,
    min_criteria_length: int = MIN_CRITERIA,
) -> List[Any]:
    return [
        name,
        description,
        quorum_bps,
        approval_threshold_bps,
        voting_period_seconds,
        funding_cap_bps,
        max_resubmissions,
        min_criteria_length,
    ]


def _mock_tx_context(
    mock_llm: Optional[MockedLLMResponse] = None,
    mock_web: Optional[MockedWebResponse] = None,
    genvm_datetime: str = GENVM_T0,
    count: int = 5,
) -> Dict[str, Any]:
    """Build transaction_context with mock validators when mocks are provided."""
    ctx: Dict[str, Any] = {"genvm_datetime": genvm_datetime}
    if mock_llm is None and mock_web is None:
        return ctx
    vf = get_validator_factory()
    validators = vf.batch_create_mock_validators(
        count=count,
        mock_llm_response=mock_llm,
        mock_web_response=mock_web,
    )
    ctx["validators"] = [v.to_dict() for v in validators]
    return ctx


def deploy_contract(
    account=None,
    tx_ctx: Optional[Dict[str, Any]] = None,
    **dao_kw,
):
    """Deploy with bootstrap DAO #0. Pass tx_ctx for mocks / genvm_datetime."""
    factory = get_contract_factory("CovenantEscrow")
    return factory.deploy(
        args=_default_dao_args(**dao_kw),
        account=account or accounts[0],
        transaction_context=tx_ctx,
    )


def deposit(contract, account, dao_id: int, amount: int, tx_ctx=None):
    c = contract.connect(account)
    receipt = c.deposit_treasury(args=[dao_id]).transact(
        value=amount, transaction_context=tx_ctx
    )
    assert tx_execution_succeeded(receipt), f"deposit failed: {receipt}"


def criteria_ok(n: int = MIN_CRITERIA) -> str:
    return "x" * n


def future_deadline(offset: int = 30 * 86400) -> int:
    return GENVM_T0_UNIX + offset


def screening_mocks(*, approved: bool, reason: str = "ok") -> MockedLLMResponse:
    """
    Mock keys are substrings of the screening task/criteria text
    (substring matching per genlayer-test docs).
    """
    body = json.dumps({"approved": approved, "reason": reason})
    return {
        "nondet_exec_prompt": {
            "Screen this grant proposal": body,
            "basic quality bar": body,
        },
        "eq_principle_prompt_non_comparative": {
            "approved must be true only if": True,
            "Screen this grant proposal": True,
        },
    }


def verification_mocks(
    *,
    passed: bool,
    summary: str = "meets criteria",
    evidence_url: str = "https://example.com/evidence",
    page_body: str = "Deliverable complete with all required artifacts.",
) -> tuple[MockedLLMResponse, MockedWebResponse]:
    body = json.dumps({"passed": passed, "summary": summary})
    llm: MockedLLMResponse = {
        "nondet_exec_prompt": {
            "verifying whether a grant deliverable": body,
            "FETCHED PAGE CONTENT": body,
        },
        "eq_principle_prompt_comparative": {
            "passed fields match": True,
            "boolean `passed`": True,
        },
    }
    web: MockedWebResponse = {
        "nondet_web_request": {
            evidence_url: {
                "method": "GET",
                "status": 200,
                "body": page_body,
            }
        }
    }
    return llm, web


def open_proposal(
    contract,
    contributor,
    dao_id: int = 0,
    amount: int = 1000,
    deadline: Optional[int] = None,
    tx_ctx: Optional[Dict[str, Any]] = None,
    title: str = "Good proposal",
    description: str = "A coherent grant request for the DAO focus.",
) -> int:
    """Submit a proposal expected to pass AI screening (uses mocks in tx_ctx)."""
    if tx_ctx is None:
        tx_ctx = _mock_tx_context(screening_mocks(approved=True, reason="solid"))
    c = contract.connect(contributor)
    receipt = c.submit_proposal(
        args=[
            dao_id,
            title,
            description,
            criteria_ok(),
            amount,
            deadline if deadline is not None else future_deadline(),
        ]
    ).transact(transaction_context=tx_ctx)
    assert tx_execution_succeeded(receipt), f"submit_proposal failed: {receipt}"
    count = contract.get_proposal_count(args=[]).call()
    return int(count) - 1


# ---------------------------------------------------------------------------
# Constructor / bootstrap DAO
# ---------------------------------------------------------------------------

class TestBootstrapDao:
    def test_deploy_bootstraps_dao_zero(self):
        contract = deploy_contract()
        assert contract.get_dao_count(args=[]).call() == 1
        dao = contract.get_dao(args=[0]).call()
        assert dao["dao_id"] == 0
        assert dao["name"] == "Test DAO"
        assert dao["total_balance"] == 0
        assert dao["total_voting_power"] == 0

    def test_bootstrap_admin_is_deployer(self):
        # Deployer is the account passed to deploy; admin must match sender.
        deployer = accounts[0]
        contract = deploy_contract(account=deployer)
        dao = contract.get_dao(args=[0]).call()
        assert _addr_hex(dao["admin"]) == _addr_hex(deployer)

    def test_initial_proposal_count_is_zero(self):
        contract = deploy_contract()
        assert contract.get_proposal_count(args=[]).call() == 0

    def test_create_dao_after_bootstrap_returns_id_one(self):
        contract = deploy_contract()
        c = contract.connect(accounts[1])
        receipt = c.create_dao(args=_default_dao_args(name="Second")).transact()
        assert tx_execution_succeeded(receipt)
        assert contract.get_dao_count(args=[]).call() == 2
        assert contract.get_dao(args=[1]).call()["name"] == "Second"


# ---------------------------------------------------------------------------
# create_dao validation (additional DAOs)
# ---------------------------------------------------------------------------

class TestCreateDao:
    def test_empty_name_raises(self):
        contract = deploy_contract()
        c = contract.connect(accounts[0])
        receipt = c.create_dao(args=_default_dao_args(name="")).transact()
        assert not tx_execution_succeeded(receipt)

    def test_quorum_bps_zero_raises(self):
        contract = deploy_contract()
        c = contract.connect(accounts[0])
        receipt = c.create_dao(args=_default_dao_args(quorum_bps=0)).transact()
        assert not tx_execution_succeeded(receipt)

    def test_max_resubmissions_zero_allowed(self):
        contract = deploy_contract()
        c = contract.connect(accounts[0])
        receipt = c.create_dao(args=_default_dao_args(max_resubmissions=0)).transact()
        assert tx_execution_succeeded(receipt)


# ---------------------------------------------------------------------------
# deposit + total_voting_power
# ---------------------------------------------------------------------------

class TestDepositTreasury:
    def test_deposit_increases_balance_and_total_voting_power(self):
        # Use accounts[0] for value transfers — create_accounts() keys may be
        # unfunded on studionet; the deployer key is accepted for txs.
        contract = deploy_contract(account=accounts[0])
        deposit(contract, accounts[0], 0, 1000)
        deposit(contract, accounts[0], 0, 500)
        dao = contract.get_dao(args=[0]).call()
        assert dao["total_balance"] == 1500
        assert dao["total_voting_power"] == 1500
        assert contract.get_voting_power(args=[0, accounts[0].address]).call() == 1500

    def test_zero_amount_raises(self):
        contract = deploy_contract()
        c = contract.connect(accounts[1])
        receipt = c.deposit_treasury(args=[0]).transact(value=0)
        assert not tx_execution_succeeded(receipt)

    def test_voting_power_not_shared_across_daos(self):
        contract = deploy_contract(account=accounts[0])
        c = contract.connect(accounts[0])
        c.create_dao(args=_default_dao_args(name="B")).transact()
        deposit(contract, accounts[0], 0, 500)
        deposit(contract, accounts[0], 1, 2000)
        assert contract.get_voting_power(args=[0, accounts[0].address]).call() == 500
        assert contract.get_voting_power(args=[1, accounts[0].address]).call() == 2000


# ---------------------------------------------------------------------------
# A. Deterministic pre-checks — NO AI mock required
# ---------------------------------------------------------------------------

class TestSubmitProposalDeterministicGuards:
    """
    These run BEFORE eq_principle.prompt_non_comparative — confirmed by reading
    submit_proposal source order. Failures never need LLM mocks.
    """

    def test_past_deadline_rejected_without_ai(self):
        contract = deploy_contract(tx_ctx=_mock_tx_context())
        deposit(contract, accounts[0], 0, 10_000)
        c = contract.connect(accounts[1])
        # No validators/mocks — if AI ran, this would hang or fail unpredictably;
        # deterministic path must reject first.
        receipt = c.submit_proposal(
            args=[0, "T", "desc", criteria_ok(), 100, GENVM_T0_UNIX - 1]
        ).transact(transaction_context=_mock_tx_context(genvm_datetime=GENVM_T0))
        assert not tx_execution_succeeded(receipt)

    def test_deadline_equal_to_now_rejected(self):
        contract = deploy_contract()
        deposit(contract, accounts[0], 0, 10_000)
        c = contract.connect(accounts[1])
        receipt = c.submit_proposal(
            args=[0, "T", "desc", criteria_ok(), 100, GENVM_T0_UNIX]
        ).transact(transaction_context=_mock_tx_context(genvm_datetime=GENVM_T0))
        assert not tx_execution_succeeded(receipt)

    def test_short_criteria_rejected_without_ai(self):
        contract = deploy_contract(min_criteria_length=50)
        deposit(contract, accounts[0], 0, 10_000)
        c = contract.connect(accounts[1])
        receipt = c.submit_proposal(
            args=[0, "T", "desc", "too-short", 100, future_deadline()]
        ).transact(transaction_context=_mock_tx_context(genvm_datetime=GENVM_T0))
        assert not tx_execution_succeeded(receipt)

    def test_over_cap_amount_rejected_without_ai(self):
        # funding_cap 25% of 10_000 = 2500
        contract = deploy_contract()
        deposit(contract, accounts[0], 0, 10_000)
        c = contract.connect(accounts[1])
        receipt = c.submit_proposal(
            args=[0, "T", "desc", criteria_ok(), 2501, future_deadline()]
        ).transact(transaction_context=_mock_tx_context(genvm_datetime=GENVM_T0))
        assert not tx_execution_succeeded(receipt)

    def test_empty_title_rejected_without_ai(self):
        contract = deploy_contract()
        deposit(contract, accounts[0], 0, 10_000)
        c = contract.connect(accounts[1])
        receipt = c.submit_proposal(
            args=[0, "", "desc", criteria_ok(), 100, future_deadline()]
        ).transact(transaction_context=_mock_tx_context(genvm_datetime=GENVM_T0))
        assert not tx_execution_succeeded(receipt)

    def test_request_against_empty_treasury_rejected(self):
        contract = deploy_contract()
        # no deposit
        c = contract.connect(accounts[1])
        receipt = c.submit_proposal(
            args=[0, "T", "desc", criteria_ok(), 1, future_deadline()]
        ).transact(transaction_context=_mock_tx_context(genvm_datetime=GENVM_T0))
        assert not tx_execution_succeeded(receipt)


class TestSubmitDeliverableDeterministicGuards:
    """
    Deadline / auth / empty URL / status checks precede the comparative EP call.
    Tests that only need deterministic rejection can use a pre-escrowed path
    with mocks only for the setup that creates Escrowed status.
    """

    def test_empty_evidence_url_rejected(self):
        """Uses full mock path to reach Escrowed, then deterministic empty-url fail."""
        ctx_screen = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx_screen)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx_screen)
        # Heavy setup for one deterministic assertion — if open_proposal fails
        # in environment without network, this test is environment-blocked.
        pid = open_proposal(contract, accounts[1], amount=1000, tx_ctx=ctx_screen)
        # Vote + finalize to Escrowed
        deposit(contract, accounts[0], 0, 5000, tx_ctx=ctx_screen)  # more voters
        c2 = contract.connect(accounts[0])
        c2.cast_vote(args=[pid, "fund", True]).transact(transaction_context=ctx_screen)
        # Warp past voting period
        later = _mock_tx_context(
            screening_mocks(approved=True),
            genvm_datetime="2024-06-03T12:00:00Z",
        )
        contract.connect(accounts[0]).finalize_vote(args=[pid]).transact(
            transaction_context=later
        )
        prop = contract.get_proposal(args=[pid]).call()
        assert prop["status"] == 3  # ESCROWED

        empty_url_ctx = _mock_tx_context(genvm_datetime=GENVM_T0)
        receipt = (
            contract.connect(accounts[1])
            .submit_deliverable(args=[pid, "", "notes"])
            .transact(transaction_context=empty_url_ctx)
        )
        assert not tx_execution_succeeded(receipt)


# ---------------------------------------------------------------------------
# B. AI screening / verification with MockedLLMResponse
# ---------------------------------------------------------------------------

class TestScreeningWithMocks:
    def test_screening_approval_opens_voting(self):
        ctx = _mock_tx_context(screening_mocks(approved=True, reason="good"))
        contract = deploy_contract(tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        pid = open_proposal(contract, accounts[1], amount=1000, tx_ctx=ctx)
        prop = contract.get_proposal(args=[pid]).call()
        assert prop["status"] == 1  # OPEN_FOR_VOTING
        assert prop["screening_rejection_reason"] == ""
        assert prop["vote_ends_at"] > 0

    def test_screening_rejection_sets_reason(self):
        ctx = _mock_tx_context(
            screening_mocks(approved=False, reason="spam not a grant")
        )
        contract = deploy_contract(tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        c = contract.connect(accounts[1])
        receipt = c.submit_proposal(
            args=[
                0,
                "Spam",
                "buy my tokens",
                criteria_ok(),
                100,
                future_deadline(),
            ]
        ).transact(transaction_context=ctx)
        assert tx_execution_succeeded(receipt)
        pid = int(contract.get_proposal_count(args=[]).call()) - 1
        prop = contract.get_proposal(args=[pid]).call()
        assert prop["status"] == 0  # REJECTED
        assert "spam" in prop["screening_rejection_reason"].lower() or prop[
            "screening_rejection_reason"
        ]


class TestVerificationWithMocks:
    def _escrowed_setup(self, amount: int = 1000):
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 5_000, tx_ctx=ctx)
        pid = open_proposal(contract, accounts[1], amount=amount, tx_ctx=ctx)
        contract.connect(accounts[0]).cast_vote(args=[pid, "fund", True]).transact(
            transaction_context=ctx
        )
        later = _mock_tx_context(
            screening_mocks(approved=True),
            genvm_datetime="2024-06-03T12:00:00Z",
        )
        contract.connect(accounts[0]).finalize_vote(args=[pid]).transact(
            transaction_context=later
        )
        assert contract.get_proposal(args=[pid]).call()["status"] == 3
        return contract, pid

    def test_verification_pass(self):
        contract, pid = self._escrowed_setup()
        url = "https://example.com/evidence"
        llm, web = verification_mocks(passed=True, evidence_url=url)
        ctx = _mock_tx_context(llm, web, genvm_datetime=GENVM_T0)
        receipt = (
            contract.connect(accounts[1])
            .submit_deliverable(args=[pid, url, "done"])
            .transact(transaction_context=ctx)
        )
        assert tx_execution_succeeded(receipt)
        prop = contract.get_proposal(args=[pid]).call()
        assert prop["status"] == 6  # VERIFICATION_PASSED
        assert prop["verdict_summary"] != ""

    def test_verification_fail_starts_reclaim_round(self):
        contract, pid = self._escrowed_setup()
        url = "https://example.com/evidence"
        llm, web = verification_mocks(
            passed=False, summary="incomplete", evidence_url=url
        )
        ctx = _mock_tx_context(llm, web, genvm_datetime=GENVM_T0)
        receipt = (
            contract.connect(accounts[1])
            .submit_deliverable(args=[pid, url, "try1"])
            .transact(transaction_context=ctx)
        )
        assert tx_execution_succeeded(receipt)
        prop = contract.get_proposal(args=[pid]).call()
        assert prop["status"] == 4  # VERIFICATION_FAILED
        assert prop["resubmission_count"] == 1
        assert prop["reclaim_round"] == 1
        assert prop["reclaim_yes_weight"] == 0
        assert prop["reclaim_no_weight"] == 0
        assert prop["reclaim_vote_ends_at"] > 0


# ---------------------------------------------------------------------------
# C. Lifecycle: vote / finalize / reclaim / claim
# ---------------------------------------------------------------------------

class TestCastVote:
    def test_member_can_cast_fund_vote(self):
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        pid = open_proposal(contract, accounts[1], amount=1000, tx_ctx=ctx)
        receipt = (
            contract.connect(accounts[0])
            .cast_vote(args=[pid, "fund", True])
            .transact(transaction_context=ctx)
        )
        assert tx_execution_succeeded(receipt)
        prop = contract.get_proposal(args=[pid]).call()
        assert prop["yes_weight"] == 10_000
        vote = contract.get_vote(args=[pid, "fund", accounts[0].address]).call()
        assert vote["support"] is True

    def test_double_vote_rejected(self):
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        pid = open_proposal(contract, accounts[1], amount=1000, tx_ctx=ctx)
        c = contract.connect(accounts[0])
        c.cast_vote(args=[pid, "fund", True]).transact(transaction_context=ctx)
        receipt = c.cast_vote(args=[pid, "fund", False]).transact(
            transaction_context=ctx
        )
        assert not tx_execution_succeeded(receipt)

    def test_zero_power_cannot_vote(self):
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        pid = open_proposal(contract, accounts[1], amount=1000, tx_ctx=ctx)
        # accounts[3] never deposited
        receipt = (
            contract.connect(accounts[3])
            .cast_vote(args=[pid, "fund", True])
            .transact(transaction_context=ctx)
        )
        assert not tx_execution_succeeded(receipt)

    def test_invalid_vote_type_rejected(self):
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        pid = open_proposal(contract, accounts[1], amount=1000, tx_ctx=ctx)
        receipt = (
            contract.connect(accounts[0])
            .cast_vote(args=[pid, "invalid", True])
            .transact(transaction_context=ctx)
        )
        assert not tx_execution_succeeded(receipt)


class TestFinalizeVote:
    def _open_voted(self, yes_weight_accounts, amount=1000):
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx, quorum_bps=2000)
        # Total deposits determine total_voting_power
        deposit(contract, accounts[0], 0, 8_000, tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 2_000, tx_ctx=ctx)
        pid = open_proposal(contract, accounts[1], amount=amount, tx_ctx=ctx)
        for acc in yes_weight_accounts:
            contract.connect(acc).cast_vote(args=[pid, "fund", True]).transact(
                transaction_context=ctx
            )
        return contract, pid, ctx

    def test_finalize_pass_escrows_and_preserves_total_voting_power(self):
        contract, pid, ctx = self._open_voted([accounts[0]], amount=2000)
        before = contract.get_dao(args=[0]).call()
        assert before["total_voting_power"] == 10_000
        later = _mock_tx_context(
            screening_mocks(approved=True),
            genvm_datetime="2024-06-03T12:00:00Z",
        )
        receipt = (
            contract.connect(accounts[0])
            .finalize_vote(args=[pid])
            .transact(transaction_context=later)
        )
        assert tx_execution_succeeded(receipt)
        prop = contract.get_proposal(args=[pid]).call()
        dao = contract.get_dao(args=[0]).call()
        assert prop["status"] == 3  # ESCROWED
        assert prop["escrowed_amount"] == 2000
        assert dao["total_balance"] == 8000
        assert dao["total_voting_power"] == 10_000  # unchanged by escrow

    def test_finalize_quorum_fail(self):
        # Only 1000 of 10000 vote (10%) < 20% quorum
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx, quorum_bps=2000)
        deposit(contract, accounts[0], 0, 9_000, tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 1_000, tx_ctx=ctx)
        pid = open_proposal(contract, accounts[1], amount=500, tx_ctx=ctx)
        # Cast only 10% of power: reopen with a small voter — use a second
        # deposit account if available; here we vote with a zero-power account
        # first to force quorum fail by having no sufficient votes.
        # Instead cast nothing / cast with tiny power: restructure deposits.
        # accounts[0] has 10000 total. We need only 1000 voting → can't partial.
        # Workaround: don't cast any fund votes (0% participation).
        later = _mock_tx_context(
            screening_mocks(approved=True),
            genvm_datetime="2024-06-03T12:00:00Z",
        )
        receipt = (
            contract.connect(accounts[0])
            .finalize_vote(args=[pid])
            .transact(transaction_context=later)
        )
        assert tx_execution_succeeded(receipt)
        assert contract.get_proposal(args=[pid]).call()["status"] == 2  # VOTE_FAILED

    def test_finalize_second_proposal_vote_failed_when_treasury_gone(self):
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(
            tx_ctx=ctx, funding_cap_bps=5000, quorum_bps=1000  # 50%
        )
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        p1 = open_proposal(
            contract, accounts[1], amount=5000, tx_ctx=ctx, title="Big1"
        )
        p2 = open_proposal(
            contract, accounts[1], amount=5000, tx_ctx=ctx, title="Big2"
        )
        for pid in (p1, p2):
            contract.connect(accounts[0]).cast_vote(
                args=[pid, "fund", True]
            ).transact(transaction_context=ctx)
        later = _mock_tx_context(
            screening_mocks(approved=True),
            genvm_datetime="2024-06-03T12:00:00Z",
        )
        assert tx_execution_succeeded(
            contract.connect(accounts[0])
            .finalize_vote(args=[p1])
            .transact(transaction_context=later)
        )
        r2 = (
            contract.connect(accounts[0])
            .finalize_vote(args=[p2])
            .transact(transaction_context=later)
        )
        assert tx_execution_succeeded(r2)  # graceful, not hard error
        assert contract.get_proposal(args=[p2]).call()["status"] == 2  # VOTE_FAILED


class TestFinalizeReclaim:
    def _to_verification_failed(self):
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx, quorum_bps=2000)
        deposit(contract, accounts[0], 0, 8_000, tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 2_000, tx_ctx=ctx)
        pid = open_proposal(contract, accounts[1], amount=1000, tx_ctx=ctx)
        contract.connect(accounts[0]).cast_vote(args=[pid, "fund", True]).transact(
            transaction_context=ctx
        )
        later = _mock_tx_context(
            screening_mocks(approved=True),
            genvm_datetime="2024-06-03T12:00:00Z",
        )
        contract.connect(accounts[0]).finalize_vote(args=[pid]).transact(
            transaction_context=later
        )
        url = "https://example.com/evidence"
        llm, web = verification_mocks(passed=False, evidence_url=url)
        vctx = _mock_tx_context(llm, web, genvm_datetime=GENVM_T0)
        contract.connect(accounts[1]).submit_deliverable(
            args=[pid, url, "n"]
        ).transact(transaction_context=vctx)
        assert contract.get_proposal(args=[pid]).call()["status"] == 4
        return contract, pid

    def test_auto_return_when_reclaim_quorum_not_met(self):
        contract, pid = self._to_verification_failed()
        # No reclaim votes cast → quorum 0
        after = _mock_tx_context(
            genvm_datetime="2024-06-03T12:00:00Z"  # past reclaim window (1 day from T0 fail)
        )
        # fail was at T0; reclaim ends T0+86400 = 2024-06-02. Use June 3.
        receipt = (
            contract.connect(accounts[3])
            .finalize_reclaim(args=[pid])
            .transact(transaction_context=after)
        )
        assert tx_execution_succeeded(receipt)
        prop = contract.get_proposal(args=[pid]).call()
        assert prop["status"] == 5  # RECLAIMED
        assert "quorum" in prop["reclaim_reason"].lower()
        assert prop["escrowed_amount"] == 0
        # funds back to treasury (started 10000, escrowed 1000)
        assert contract.get_dao(args=[0]).call()["total_balance"] == 10_000

    def test_dao_voted_reclaim(self):
        contract, pid = self._to_verification_failed()
        # Cast reclaim yes with enough weight
        rctx = _mock_tx_context(genvm_datetime=GENVM_T0)
        contract.connect(accounts[0]).cast_vote(
            args=[pid, "reclaim", True]
        ).transact(transaction_context=rctx)
        after = _mock_tx_context(genvm_datetime="2024-06-03T12:00:00Z")
        receipt = (
            contract.connect(accounts[0])
            .finalize_reclaim(args=[pid])
            .transact(transaction_context=after)
        )
        assert tx_execution_succeeded(receipt)
        prop = contract.get_proposal(args=[pid]).call()
        assert prop["status"] == 5
        assert "reclaim" in prop["reclaim_reason"].lower()

    def test_dao_voted_keep_returns_to_escrowed(self):
        contract, pid = self._to_verification_failed()
        rctx = _mock_tx_context(genvm_datetime=GENVM_T0)
        # Vote NO on reclaim (= keep backing contributor)
        contract.connect(accounts[0]).cast_vote(
            args=[pid, "reclaim", False]
        ).transact(transaction_context=rctx)
        after = _mock_tx_context(genvm_datetime="2024-06-03T12:00:00Z")
        receipt = (
            contract.connect(accounts[0])
            .finalize_reclaim(args=[pid])
            .transact(transaction_context=after)
        )
        assert tx_execution_succeeded(receipt)
        prop = contract.get_proposal(args=[pid]).call()
        # max_resubmissions=3, count=1 → keep path → Escrowed
        assert prop["status"] == 3  # ESCROWED
        assert prop["escrowed_amount"] == 1000


class TestClaimFunds:
    def test_contributor_claims_after_verification_pass(self):
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 5_000, tx_ctx=ctx)
        pid = open_proposal(contract, accounts[1], amount=1000, tx_ctx=ctx)
        contract.connect(accounts[0]).cast_vote(args=[pid, "fund", True]).transact(
            transaction_context=ctx
        )
        later = _mock_tx_context(
            screening_mocks(approved=True),
            genvm_datetime="2024-06-03T12:00:00Z",
        )
        contract.connect(accounts[0]).finalize_vote(args=[pid]).transact(
            transaction_context=later
        )
        url = "https://example.com/evidence"
        llm, web = verification_mocks(passed=True, evidence_url=url)
        vctx = _mock_tx_context(llm, web, genvm_datetime=GENVM_T0)
        contract.connect(accounts[1]).submit_deliverable(
            args=[pid, url, "done"]
        ).transact(transaction_context=vctx)
        receipt = (
            contract.connect(accounts[1])
            .claim_funds(args=[pid])
            .transact(transaction_context=vctx)
        )
        assert tx_execution_succeeded(receipt)
        prop = contract.get_proposal(args=[pid]).call()
        assert prop["status"] == 7  # RELEASED
        assert prop["escrowed_amount"] == 0

    def test_non_contributor_cannot_claim(self):
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        pid = open_proposal(contract, accounts[1], amount=1000, tx_ctx=ctx)
        contract.connect(accounts[0]).cast_vote(args=[pid, "fund", True]).transact(
            transaction_context=ctx
        )
        later = _mock_tx_context(
            screening_mocks(approved=True),
            genvm_datetime="2024-06-03T12:00:00Z",
        )
        contract.connect(accounts[0]).finalize_vote(args=[pid]).transact(
            transaction_context=later
        )
        url = "https://example.com/evidence"
        llm, web = verification_mocks(passed=True, evidence_url=url)
        vctx = _mock_tx_context(llm, web, genvm_datetime=GENVM_T0)
        contract.connect(accounts[1]).submit_deliverable(
            args=[pid, url, "done"]
        ).transact(transaction_context=vctx)
        receipt = (
            contract.connect(accounts[2])
            .claim_funds(args=[pid])
            .transact(transaction_context=vctx)
        )
        assert not tx_execution_succeeded(receipt)

    def test_double_claim_rejected(self):
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        pid = open_proposal(contract, accounts[1], amount=1000, tx_ctx=ctx)
        contract.connect(accounts[0]).cast_vote(args=[pid, "fund", True]).transact(
            transaction_context=ctx
        )
        later = _mock_tx_context(
            screening_mocks(approved=True),
            genvm_datetime="2024-06-03T12:00:00Z",
        )
        contract.connect(accounts[0]).finalize_vote(args=[pid]).transact(
            transaction_context=later
        )
        url = "https://example.com/evidence"
        llm, web = verification_mocks(passed=True, evidence_url=url)
        vctx = _mock_tx_context(llm, web, genvm_datetime=GENVM_T0)
        contract.connect(accounts[1]).submit_deliverable(
            args=[pid, url, "done"]
        ).transact(transaction_context=vctx)
        c = contract.connect(accounts[1])
        c.claim_funds(args=[pid]).transact(transaction_context=vctx)
        receipt = c.claim_funds(args=[pid]).transact(transaction_context=vctx)
        assert not tx_execution_succeeded(receipt)


class TestReclaimExpiredEscrow:
    def test_reclaim_after_deadline(self):
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        # Deadline 1 day after T0
        pid = open_proposal(
            contract,
            accounts[1],
            amount=1000,
            deadline=GENVM_T0_UNIX + 86400,
            tx_ctx=ctx,
        )
        contract.connect(accounts[0]).cast_vote(args=[pid, "fund", True]).transact(
            transaction_context=ctx
        )
        mid = _mock_tx_context(
            screening_mocks(approved=True),
            genvm_datetime="2024-06-02T12:00:00Z",  # after vote end, before/at deadline
        )
        # vote_ends = T0+86400 = June 2 12:00; finalize needs now > vote_ends
        # Use June 2 12:00:01 equivalent — set to June 2 13:00
        mid = _mock_tx_context(
            screening_mocks(approved=True),
            genvm_datetime="2024-06-02T13:00:00Z",
        )
        contract.connect(accounts[0]).finalize_vote(args=[pid]).transact(
            transaction_context=mid
        )
        assert contract.get_proposal(args=[pid]).call()["status"] == 3
        # Past deadline (deadline was T0+1d = June 2 12:00)
        past = _mock_tx_context(genvm_datetime="2024-06-03T12:00:00Z")
        receipt = (
            contract.connect(accounts[3])
            .reclaim_expired_escrow(args=[pid])
            .transact(transaction_context=past)
        )
        assert tx_execution_succeeded(receipt)
        prop = contract.get_proposal(args=[pid]).call()
        assert prop["status"] == 5
        assert prop["reclaim_reason"] == "deadline passed without delivery"

    def test_submit_deliverable_after_deadline_rejected(self):
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        pid = open_proposal(
            contract,
            accounts[1],
            amount=1000,
            deadline=GENVM_T0_UNIX + 86400,
            tx_ctx=ctx,
        )
        contract.connect(accounts[0]).cast_vote(args=[pid, "fund", True]).transact(
            transaction_context=ctx
        )
        mid = _mock_tx_context(
            screening_mocks(approved=True),
            genvm_datetime="2024-06-02T13:00:00Z",
        )
        contract.connect(accounts[0]).finalize_vote(args=[pid]).transact(
            transaction_context=mid
        )
        url = "https://example.com/evidence"
        llm, web = verification_mocks(passed=True, evidence_url=url)
        past = _mock_tx_context(llm, web, genvm_datetime="2024-06-03T12:00:00Z")
        receipt = (
            contract.connect(accounts[1])
            .submit_deliverable(args=[pid, url, "late"])
            .transact(transaction_context=past)
        )
        assert not tx_execution_succeeded(receipt)


class TestReclaimRoundReset:
    def test_second_failure_resets_tallies_and_allows_revote(self):
        """
        Fail verify → cast reclaim vote → keep → Escrowed → fail again.
        Round 2 tallies start at 0; same voter can reclaim-vote again.
        """
        ctx = _mock_tx_context(screening_mocks(approved=True))
        contract = deploy_contract(tx_ctx=ctx, quorum_bps=1000, max_resubmissions=3)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        pid = open_proposal(contract, accounts[1], amount=1000, tx_ctx=ctx)
        contract.connect(accounts[0]).cast_vote(args=[pid, "fund", True]).transact(
            transaction_context=ctx
        )
        later = _mock_tx_context(
            screening_mocks(approved=True),
            genvm_datetime="2024-06-03T12:00:00Z",
        )
        contract.connect(accounts[0]).finalize_vote(args=[pid]).transact(
            transaction_context=later
        )
        url = "https://example.com/evidence"
        llm_fail, web = verification_mocks(passed=False, evidence_url=url)
        v1 = _mock_tx_context(llm_fail, web, genvm_datetime=GENVM_T0)
        contract.connect(accounts[1]).submit_deliverable(
            args=[pid, url, "1"]
        ).transact(transaction_context=v1)
        # Reclaim NO (keep)
        contract.connect(accounts[0]).cast_vote(
            args=[pid, "reclaim", False]
        ).transact(transaction_context=v1)
        after_r1 = _mock_tx_context(genvm_datetime="2024-06-03T12:00:00Z")
        contract.connect(accounts[0]).finalize_reclaim(args=[pid]).transact(
            transaction_context=after_r1
        )
        assert contract.get_proposal(args=[pid]).call()["status"] == 3  # Escrowed

        # Second failure
        v2 = _mock_tx_context(llm_fail, web, genvm_datetime=GENVM_T0)
        contract.connect(accounts[1]).submit_deliverable(
            args=[pid, url, "2"]
        ).transact(transaction_context=v2)
        prop = contract.get_proposal(args=[pid]).call()
        assert prop["status"] == 4
        assert prop["reclaim_round"] == 2
        assert prop["reclaim_yes_weight"] == 0
        assert prop["reclaim_no_weight"] == 0
        # Same voter can vote reclaim again in new round
        receipt = (
            contract.connect(accounts[0])
            .cast_vote(args=[pid, "reclaim", True])
            .transact(transaction_context=v2)
        )
        assert tx_execution_succeeded(receipt)
        assert contract.get_proposal(args=[pid]).call()["reclaim_yes_weight"] == 10_000


class TestSplitAuditFields:
    def test_rejected_proposal_has_screening_not_reclaim_reason(self):
        ctx = _mock_tx_context(
            screening_mocks(approved=False, reason="not relevant")
        )
        contract = deploy_contract(tx_ctx=ctx)
        deposit(contract, accounts[0], 0, 10_000, tx_ctx=ctx)
        contract.connect(accounts[1]).submit_proposal(
            args=[0, "X", "y", criteria_ok(), 100, future_deadline()]
        ).transact(transaction_context=ctx)
        pid = int(contract.get_proposal_count(args=[]).call()) - 1
        prop = contract.get_proposal(args=[pid]).call()
        assert "rejection_reason" not in prop
        assert prop["screening_rejection_reason"] != ""
        assert prop["reclaim_reason"] == ""


# ---------------------------------------------------------------------------
# Explicit: coverage holes that remain environment-dependent
# ---------------------------------------------------------------------------

class TestEnvironmentNotes:
    """
    Documented gaps that are NOT due to missing MockedLLMResponse support.
    genlayer-test 0.29 does provide MockedLLMResponse (confirmed in package types).
    """

    def test_mock_api_exists(self):
        from gltest.types import MockedLLMResponse as M

        # Structural check — TypedDict is present
        assert "nondet_exec_prompt" in M.__annotations__
        assert "eq_principle_prompt_comparative" in M.__annotations__
        assert "eq_principle_prompt_non_comparative" in M.__annotations__
