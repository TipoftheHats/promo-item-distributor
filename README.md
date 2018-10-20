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
