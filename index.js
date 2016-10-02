'use strict';

const TABLE_NAME = 'promo_records_2016';
const fs = require('fs');
const pg = require('pg');
const request = require('sync-request');
const winston = require('winston');
const convict = require('convict');

// Set up logging. Every run of this program logs to a new file.
if (!fs.existsSync('logs')) {
	fs.mkdirSync('logs');
}
winston.add(winston.transports.File, {
	level: 'silly',
	filename: `logs/${Date.now()}.log`
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
	winston.log('error', 'No password provided!');
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
	// winston.log('warn', `Running in PRODUCTION against a LIVE DATABASE at ${conf.host}!`);
	winston.log('info', 'Running in production mode is currently disabled.');
	process.exit(0);
	pgConfig.host = conf.host;
} else {
	winston.log('info', 'Running in development mode against localhost.');
}
const pgClient = new pg.Client(pgConfig);
const recipients = require('./recipients.json');

pgClient.on('error', e => {
	winston.log('error', 'Pool error!', e);
});

// Connect to tracker-database.tipofthehats.org
pgClient.connect();
pgClient.query(`SELECT to_regclass('${TABLE_NAME}');`)
	.then(result => {
		if (result.rows[0].to_regclass === null) {
			winston.log('info', `Table ${TABLE_NAME} not found, creating...`);
			const createTableSQL = fs.readFileSync('create_table.sql', 'utf-8');
			return pgClient.query(createTableSQL);
		}

		winston.log('info', `Table ${TABLE_NAME} found!`);
	})
	.then(result => {
		if (result && result.command === 'CREATE') {
			winston.log('info', `Successfully created table ${TABLE_NAME}!`);
		}

		// Load all recipients into the database. We'll give out the medals later.
		recipients.forEach(recipient => {
			pgClient.query(`INSERT INTO promo_records_2016 (steamid64) VALUES ('${recipient.steamid64}') ON CONFLICT (steamid64) DO NOTHING;`, (err, result)=> {
				if (err) {
					winston.log('error', `Error adding SteamID64 "${recipient.steamid64}" to database:`, err);
					return;
				}

				if (result.rowCount > 0) {
					winston.log('debug', `Added SteamID64 "${recipient.steamid64}" to database.`);
				} else {
					winston.log('debug', `Skipped adding SteamID64 "${recipient.steamid64}" to database, already present`);
				}
			});
		});

		return new Promise(resolve => {
			// This seems to fire one tick too early, so we use a nextTick in here.
			pgClient.once('drain', () => {
				process.nextTick(() => {
					winston.log('info', 'All donors added to database.');
					resolve();
				});
			});
		});
	})
	.then(() => {

	})
	.catch(err => {
		throw err;
	});

return;
recipients.forEach(recipient => {
	const id = recipient.steamid64;

	const res = request('POST', 'http://api.steampowered.com/ITFPromos_440/GrantItem/v0001/', {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: `SteamID=${id}&PromoID=PROMO_ID_HERE&key=KEY_GO_HERE`
	});

	const result = JSON.parse(res.getBody('UTF-8')).result;
	if (result.status === 1) {
		winston.log('info', 'Awarded Jaunty Pin (ID #%s) to %s', result.item_id, id);
	} else {
		if (result.status === 2 && result.statusDetail.contains('Unable to load/lock account')) {
			// This means the person put in a bad account and we can't do anything about it
			return;
		} else {
			throw new Error(`Failed to award Jaunty Pin to ${id}: ${result.statusDetail}`);
		}
	}
});
