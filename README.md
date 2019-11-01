# promo-item-distributor [![Build Status](https://travis-ci.org/TipoftheHats/promo-item-distributor.svg?branch=master)](https://travis-ci.org/TipoftheHats/promo-item-distributor)

The in-house app used by Tip of the Hats to award Steam Promo items (i.e. in-game TF2 medals) to qualifying donors.

## Usage

This is a command-line program written in TypeScript. As such, we don't bother compiling it down to normal JavaScript for distribution. Instead, we run the `*.ts` files directly via `ts-node`. This is handled automatically by this package's `npm` scripts.

### Starting the mock server
```bash
npm run mock-server
```

### Executing the main script
```bash
npm start
```

1. Take a backup of the database post-close.
2. Update everything for the new year (all queries, promo IDs, amounts, etc.)
3. Run the query to get raw cash donations (these will include cash and ScrapTF donations) and grab the file. Be sure to add the appropriate CSV headers.
4. Run anything else for other donation ingresses, such as Marketplace.tf roundups.
5. Place `raw-cash-donations.csv` and any other relevant files in `data`.
6. `npm run convert` to get donations.json.
7. Test out all three tiers of medals by using a custom `donations.json` that only has your user in it and running `npm run start`.
8. Use the real `donations.json` and do the needful. Be sure to capture the output to a log file (`npm run start 2>&1 | tee -a log.log`).
