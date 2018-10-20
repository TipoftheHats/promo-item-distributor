'use strict';

// TODO: Update these for 2018.
const TIER_1_PROMO_ID = '1609';
const TIER_2_PROMO_ID = '1608';
const TIER_3_PROMO_ID = '1607';

const fs = require('fs');
const pg = require('pg');
const request = require('request-promise');
const winston = require('winston');
const convict = require('convict');
const Listr = require('listr');
const Observable = require('zen-observable');
const Promise = require('bluebird');

// Set up logging. Every run of this program logs to a new file.
if (!fs.existsSync('logs')) {
	fs.mkdirSync('logs');
}

const logger = new (winston.Logger)({
	transports: [
		new (winston.transports.File)({
			level: 'silly',
			filename: `logs/${Date.now()}.log`
		})
	]
});

// Set up configuration
const conf = convict({
	env: {
		doc: 'The applicaton environment.',
		format: ['production', 'development'],
		default: 'development',
		env: 'NODE_ENV',
		arg: 'env'
	},
	host: {
		doc: 'The database host to connect to.',
		format: 'ipaddress',
		default: 'localhost',
		env: 'HOST',
		arg: 'host'
	},
	password: {
		doc: 'The database password.',
		format: String,
		default: '',
		env: 'PASSWORD',
		arg: 'password'
	},
	steamApiKey: {
		doc: 'The Steam API key used to access the promo system and grant items.',
		format: String,
		default: '',
		env: 'STEAM_API_KEY',
		arg: 'steamApiKey'
	}
}).getProperties();

if (!conf.password) {
	logger.log('error', 'No password provided!');
	process.exit(1);
}

const pgConfig = {
	host: 'localhost',
	user: 'promo_records',
	database: 'promo_records',
	password: conf.password,
	application_name: 'promo-item-distributor_2018' // eslint-disable-line camelcase
};

if (conf.env === 'production') {
	logger.log('warn', `Running in PRODUCTION against a LIVE DATABASE at ${conf.host}!`);

	if (!conf.steamApiKey) {
		logger.log('error', 'Must provide a STEAM_API_KEY!');
		process.exit(1);
	}

	pgConfig.host = conf.host;
} else {
	logger.log('info', 'Running in development mode against localhost.');
}

const pgClient = new pg.Client(pgConfig);
pgClient.on('error', err => {
	logger.log('error', 'PostgreSQL client error!', err);
	process.exit(1);
});

let donations;

const tasks = new Listr([
	{
		title: 'Read donations from disk',
		task: () => {
			donations = require('./data/donations.json');
		}
	},
	{
		title: `Connect to the database at ${pgConfig.host}`,
		task: () => pgClient.connect()
	},
	{
		title: 'Create the tables if not already present',
		task: () => pgClient.query(`SELECT to_regclass('2018_donors');`)
			.then(result => {
				if (result.rows[0].to_regclass === null) {
					logger.log('info', `Tables not found, creating...`);
					const createTableSQL = fs.readFileSync('create_table.sql', 'utf-8');
					return pgClient.query(createTableSQL);
				}

				logger.log('info', `Tables found!`);
			})
			.then(result => {
				if (result && result.command === 'CREATE') {
					logger.log('info', `Successfully created tables!!`);
				}
			})
	},
	{
		title: 'Add donors and donations to database',
		task: () => {
			logger.log('info', 'Adding donors and donations to database...');

			// Load all donations into the database.
			donations.forEach(donation => {
				// Add this donor's SteamID64 to the "donors" table, if not already present.
				if (donation.steamid64) {
					pgClient.query(`INSERT INTO "2018_donors" (steamid64) VALUES ('${donation.steamid64}') ON CONFLICT (steamid64) DO NOTHING;`, (err, result) => {
						if (err) {
							logger.log('error', `Error adding donor SteamID64 "${donation.steamid64}" to database:`, err);
							return;
						}

						if (result.rowCount > 0) {
							logger.log('debug', `Added donor SteamID64 "${donation.steamid64}" to database.`);
						} else {
							logger.log('debug', `Skipped adding donor SteamID64 "${donation.steamid64}" to database, already present`);
						}
					});
				}

				// Add this donation to the "donations" table, if not already present
				pgClient.query(`INSERT INTO "2018_donations" (id, steamid64, email, type, amount) VALUES ('${donation.id}', '${donation.steamid64}', '${donation.email}', '${donation.type}', '${donation.amount}') ON CONFLICT (id) DO NOTHING;`, (err, result) => {
					if (err) {
						logger.log('error', `Error adding donation "${donation.id}" to database:`, err);
						return;
					}

					if (result.rowCount > 0) {
						logger.log('debug', `Added donation "${donation.id}" to database.`);
					} else {
						logger.log('debug', `Skipped adding donation "${donation.id}" to database, already present`);
					}
				});
			});

			return new Promise(resolve => {
				// This seems to fire one tick too early, so we use a nextTick in here.
				pgClient.once('drain', () => {
					process.nextTick(() => {
						logger.log('info', 'All donors & donations added to database.');
						resolve();
					});
				});
			});
		}
	},
	{
		title: `Award medals to qualifying donors${conf.env === 'production' ? '' : ' [Simulated]'}`,
		task: () => new Observable(observer => {
			pgClient.query('SELECT *, "2018_donors".total_donated FROM "2018_donors" WHERE promo_item_awarded = \'\' AND "2018_donors".total_donated >= 10 ORDER BY steamid64;').then(result => {
				observer.next(`Found ${result.rowCount} qualifying donations`);
				logger.info(`Found ${result.rowCount} qualifying donations`);

				if (result.rows.length === 0) {
					logger.log('info', 'Nothing to award, done.');
					observer.complete();
					return;
				}

				processDonor(result.rows, result.rows.pop(), observer);
			});
		})
	}
], {
	renderer: require('tty').isatty(process.stdout) ? require('listr-update-renderer') : require('listr-verbose-renderer')
});

function processDonor(donors, currentDonor, observer) {
	let promoId;
	if (currentDonor.total_donated >= 100) {
		promoId = TIER_3_PROMO_ID;
	} else if (currentDonor.total_donated >= 30) {
		promoId = TIER_2_PROMO_ID;
	} else if (currentDonor.total_donated >= 10) {
		promoId = TIER_1_PROMO_ID;
	} else {
		logger.error('Refusing to award medal to donor "%s", because their total_donated is less than the $10 threshold (%d)', currentDonor.steamid64, currentDonor.total_donated);
		return;
	}

	let uri = 'http://localhost:22364/grant_item';

	if (conf.env === 'production') {
		uri = 'http://api.steampowered.com/ITFPromos_440/GrantItem/v0001/';
	} else {
		promoId = `simulated_${promoId}`;
	}

	observer.next(`Awarding promo #${promoId} to ${currentDonor.steamid64}, total_donated: $${currentDonor.total_donated}...`);
	request({
		method: 'POST',
		uri,
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		form: {
			SteamID: currentDonor.steamid64,
			PromoID: promoId,
			key: conf.steamApiKey
		}
	}).then(body => {
		const result = JSON.parse(body).result;

		let statusStr = '';
		if (result.status === 1) {
			statusStr = `Awarding promo #${promoId} to ${currentDonor.steamid64}, total_donated: $${currentDonor.total_donated}... Success!`;
			observer.next(statusStr);
			logger.log('info', statusStr);
			return pgClient.query(`UPDATE "2018_donors" SET promo_item_awarded = '${promoId}' WHERE steamid64 = '${currentDonor.steamid64}';`);
		} else if (result.status === 2 && result.statusDetail.contains('Unable to load/lock account')) {
			// This means the person put in a bad account and we can't do anything about it
			statusStr = `Can't award Jaunty Pin to ${currentDonor.steamid64}, did they enter an invalid SteamID64?: ${result.statusDetail}`;
			logger.error(statusStr);
		} else {
			statusStr = `Failed to award Jaunty Pin to ${currentDonor.steamid64}: ${result.statusDetail}`;
			logger.error(statusStr);
		}

		observer.next(statusStr);
		return new Promise((resolve, reject) => {
			setTimeout(() => {
				reject();
			}, 1000);
		});
	}).then(result => {
		if (result.rowCount === 1) {
			logger.log(`Marked SteamID64 "${currentDonor.steamid64} as having received promo #${promoId} in database"`);
		} else {
			logger.warn(`Didn't mark SteamID64 "${currentDonor.steamid64} as having received promo #${promoId} in database! Don't know why!"`);
		}
	}).finally(() => {
		if (donors.length > 0) {
			processDonor(donors, donors.pop(), observer);
		} else {
			logger.log('info', 'All promo items awarded & logged.');
			observer.complete();
		}
	}).catch(err => {
		logger.error(`Failed to award Jaunty Pin to ${currentDonor.steamid64}:`, err);
	});
}

tasks.run().then(() => {
	logger.log('info', 'All done! Exiting.');
	console.log('All done! Exiting.');
	process.nextTick(() => {
		process.exit(0);
	});
}).catch(err => {
	logger.log('error', 'Task error!', err);
	process.exit(1);
});
