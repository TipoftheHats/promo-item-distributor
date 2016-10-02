'use strict';

const fs = require('fs');
const pg = require('pg');
const request = require('sync-request');
const winston = require('winston');
const convict = require('convict');
const Listr = require('listr');

// Set up logging. Every run of this program logs to a new file.
if (!fs.existsSync('logs')) {
	fs.mkdirSync('logs');
}

const logger = new (winston.Logger)({
	transports: [
		new (winston.transports.Console)({
			level: 'warn'
		}),
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
	application_name: 'promo-item-distributor_2016'
};

if (conf.env === 'production') {
	// logger.log('warn', `Running in PRODUCTION against a LIVE DATABASE at ${conf.host}!`);
	logger.log('info', 'Running in production mode is currently disabled.');
	process.exit(0);
	pgConfig.host = conf.host;
} else {
	logger.log('info', 'Running in development mode against localhost.');
}

const pgClient = new pg.Client(pgConfig);
pgClient.on('error', err => {
	logger.log('error', 'PostgreSQL client error!', err);
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
		title: `Connect to the database at ${conf.host}`,
		task: () => pgClient.connect()
	},
	{
		title: 'Create the tables if not already present',
		task: () => pgClient.query(`SELECT to_regclass('2016_donors');`)
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
					pgClient.query(`INSERT INTO "2016_donors" (steamid64) VALUES ('${donation.steamid64}') ON CONFLICT (steamid64) DO NOTHING;`, (err, result)=> {
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
				pgClient.query(`INSERT INTO "2016_donations" (id, steamid64, email, type, amount) VALUES ('${donation.id}', '${donation.steamid64}', '${donation.email}', '${donation.type}', '${donation.amount}') ON CONFLICT (id) DO NOTHING;`, (err, result)=> {
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
		title: 'Award medals to qualifying donors',
		skip: () => true,
		task: () => {

		}
	}
], {
	renderer: require('tty').isatty(process.stdout) ? require('listr-update-renderer') : require('listr-verbose-renderer')
});

tasks.run().then(() => {
	logger.log('info', 'All done! Exiting.');
	console.log('All done! Exiting.');
	process.exit(0);
}).catch(err => {
	logger.log('error', 'Task error!', err);
	process.exit(1);
});

return;
donations.forEach(recipient => {
	const id = recipient.steamid64;

	const res = request('POST', 'http://api.steampowered.com/ITFPromos_440/GrantItem/v0001/', {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: `SteamID=${id}&PromoID=PROMO_ID_HERE&key=KEY_GO_HERE`
	});

	const result = JSON.parse(res.getBody('UTF-8')).result;
	if (result.status === 1) {
		logger.log('info', 'Awarded Jaunty Pin (ID #%s) to %s', result.item_id, id);
	} else {
		if (result.status === 2 && result.statusDetail.contains('Unable to load/lock account')) {
			// This means the person put in a bad account and we can't do anything about it
			return;
		} else {
			throw new Error(`Failed to award Jaunty Pin to ${id}: ${result.statusDetail}`);
		}
	}
});
