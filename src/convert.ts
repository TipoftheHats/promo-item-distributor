'use strict';

// Native
import * as fs from 'fs';

// Packages
import csv = require('csv-parser');

const array: {
	id: string;
	steamid64: string;
	email: string;
	type: 'mptf' | 'cash';
	amount: number;
}[] = [];
const uniqueSteamid64s = new Set();
const cashSteamid64s = new Set();
const mptfSteamid64s = new Set();
const dualDonors = new Set();

fs.createReadStream('data/raw-cash-donations.csv')
	.pipe(csv())
	.on('data', (data: any) => {
		array.push({
			id: `cash_${data.id}`,
			steamid64: data.steamid,
			email: data.requestedemail,
			type: 'cash',
			amount: data.amount
		});
		uniqueSteamid64s.add(data.steamid);
		cashSteamid64s.add(data.steamid);

		if (data.steamid.length !== 17) {
			console.log('ABNORMAL CASH STEAMID:', data);
		}
	})
	.on('end', () => {
		const mptfDonations = require('../data/raw-mptf-donations.json');
		mptfDonations.forEach((mptfDonation: any) => {
			array.push({
				id: `mptf_${mptfDonation.id}`,
				steamid64: mptfDonation.steamid,
				email: 'roundup_2019@marketplace.tf',
				type: 'mptf',
				amount: mptfDonation.amount
			});
			uniqueSteamid64s.add(mptfDonation.steamid);
			mptfSteamid64s.add(mptfDonation.steamid);
			if (cashSteamid64s.has(mptfDonation.steamid)) {
				dualDonors.add(mptfDonation.steamid);
			}

			if (mptfDonation.steamid.length !== 17) {
				console.log('ABNORMAL MPTF STEAMID:', mptfDonation);
			}
		});

		console.log('unique steamids:', uniqueSteamid64s.size);
		console.log('cash steamids:', cashSteamid64s.size);
		console.log('mptf steamids:', mptfSteamid64s.size);
		console.log('dual donors:', dualDonors.size);
		fs.writeFileSync('data/donations.json', JSON.stringify(array), 'utf-8');
	});
