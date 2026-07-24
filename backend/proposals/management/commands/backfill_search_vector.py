from django.core.management.base import BaseCommand
from django.contrib.postgres.search import SearchVector
from proposals.models import ProposalCache

class Command(BaseCommand):
    help = "Backfills the search_vector field for all existing ProposalCache records."

    def handle(self, *args, **options):
        count = ProposalCache.objects.count()
        if count == 0:
            self.stdout.write(self.style.WARNING("No ProposalCache records found."))
            return

        self.stdout.write(f"Backfilling search_vector for {count} ProposalCache records...")
        
        ProposalCache.objects.update(
            search_vector=SearchVector('title', 'description')
        )
        
        self.stdout.write(self.style.SUCCESS("Successfully backfilled search_vector for all proposals."))
