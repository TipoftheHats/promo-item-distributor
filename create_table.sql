CREATE TABLE IF NOT EXISTS "2016_donors" (
    steamid64 character varying(32) NOT NULL,
    promo_item_awarded character varying(16) DEFAULT '',
    CONSTRAINT "2016_donors_pkey" PRIMARY KEY (steamid64)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '2016_donation_type') THEN
       CREATE TYPE "2016_donation_type" AS ENUM('item', 'cash');
    END IF;
END$$;

CREATE TABLE IF NOT EXISTS "2016_donations" (
    id character varying(32) NOT NULL,
    steamid64 character varying(32) NOT NULL,
    email character varying(128),
    type donation_type,
    amount NUMERIC(16, 2),
    CONSTRAINT "2016_donations_pkey" PRIMARY KEY (id)
);

CREATE FUNCTION total_donated("2016_donors")
  RETURNS NUMERIC(16, 2) AS
$func$
    SELECT sum(amount)
    FROM   "2016_donations"
    WHERE  "2016_donations".steamid64 = $1.steamid64
$func$ LANGUAGE SQL STABLE;
