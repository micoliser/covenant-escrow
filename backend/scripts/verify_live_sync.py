"""
MANUAL VERIFICATION TOOL

This script is used for verifying the real studionet integration against the live network.
It is NOT part of the automated test suite and should NOT be run in CI, as it depends on 
live network state and may fail if the network is down or the contract state changes.
"""

import os
import sys
import django

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'covenant_escrow_backend.settings')
django.setup()

from indexer.sync import run_full_sync, _fetch_dao_count_from_chain, _fetch_proposal_count_from_chain
from daos.models import DaoCache
from proposals.models import ProposalCache
from indexer.models import SyncCursor, RawStateSnapshot

def main():
    print("Testing connection to studionet...")
    try:
        dao_count = _fetch_dao_count_from_chain()
        prop_count = _fetch_proposal_count_from_chain()
        print(f"Chain DAO count: {dao_count}")
        print(f"Chain Proposal count: {prop_count}")
    except Exception as e:
        print(f"Error fetching counts: {e}")
        return

    print("\nRunning run_full_sync()...")
    # Make sure lock is clear
    SyncCursor.objects.all().delete()
    
    try:
        run_full_sync()
    except Exception as e:
        print(f"Error in run_full_sync: {e}")
        return
        
    print("\n--- Sync Complete ---")
    
    daos = DaoCache.objects.all()
    print(f"\nDAO Cache ({daos.count()} rows):")
    for dao in daos:
        print(f"  - ID: {dao.dao_id}, Name: {dao.name}, Total Balance: {dao.total_balance}, Admin: {dao.admin}")
        
    props = ProposalCache.objects.all()
    print(f"\nProposal Cache ({props.count()} rows):")
    for prop in props:
        print(f"  - ID: {prop.proposal_id}, DAO ID: {prop.dao_id}, Title: {prop.title}, Status: {prop.status}")
        
    snapshots = RawStateSnapshot.objects.all()
    print(f"\nRaw Snapshots: {snapshots.count()} rows")
    if snapshots.exists():
        print(f"Sample snapshot payload: {snapshots.last().raw_payload}")

if __name__ == "__main__":
    main()
