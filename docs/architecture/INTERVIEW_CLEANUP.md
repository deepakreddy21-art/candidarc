# Interview Cleanup

Interview Lab product access has been removed from navigation, pages, API contracts, client services, runtime bootstrap, queue handlers, prompt registration, seed data, and tests.

The dormant `interview_*` tables in `0000_init.sql` are intentionally left in place to avoid a destructive migration and preserve historical compatibility. No active product route or required runtime service reads them. `interviewStatus` on an application remains a hiring-pipeline status, not an Interview Lab session.
