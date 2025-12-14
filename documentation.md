## Daily log 

### December 4, 2025
- checked the create_mining_operations_table file, made few changes on the indexing and the RLS conditions, changed RLS from public to authenticated users so that row access is limited
- added partitions on rows trips and production summary as they can grow really fast and scanning all the rows is inefficient and resource intensive
- automatic script using cron so that partitions are made on pace with the uploaded data
- these changes overall increase querying speed and help prevent confusion
