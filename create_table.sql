CREATE TABLE IF NOT EXISTS "promo_records_2016" (
    "steamid64" character varying(32) NOT NULL,
    "total_donated"	character varying(32),
    "tier" integer,
    "promo_item_awarded" boolean,
    CONSTRAINT "promo_records_2016_pkey" PRIMARY KEY ("steamid64")
)
