-- Cap existing student hourly rates at €20/hr
UPDATE student_profiles
SET hourly_rate = 20
WHERE hourly_rate > 20;

-- Cap existing website project budgets at €500
UPDATE student_profiles
SET typical_budget_max = 500
WHERE typical_budget_max > 500;

UPDATE student_profiles
SET typical_budget_min = 500
WHERE typical_budget_min > 500;

-- Cap community post rates: hourly rates at €20
UPDATE community_posts
SET rate_max = 20
WHERE rate_unit = 'hourly' AND rate_max > 20;

UPDATE community_posts
SET rate_min = 20
WHERE rate_unit = 'hourly' AND rate_min > 20;

-- Cap community post rates: per-day and per-project at €200
UPDATE community_posts
SET rate_max = 200
WHERE rate_unit IN ('day', 'project') AND category != 'websites' AND rate_max > 200;

UPDATE community_posts
SET rate_min = 200
WHERE rate_unit IN ('day', 'project') AND category != 'websites' AND rate_min > 200;

-- Cap community post rates: website project prices at €500
UPDATE community_posts
SET rate_max = 500
WHERE category = 'websites' AND rate_max > 500;

UPDATE community_posts
SET rate_min = 500
WHERE category = 'websites' AND rate_min > 500;
