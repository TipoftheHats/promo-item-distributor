'use strict';

// Native
import * as fs from 'fs';

// Packages
import csv = require('csv-parser');

const array: {
	id: string;
	steamid64: string;
	email: string;
	type: 'item' | 'cash';
	amount: number;
}[] = [];
const uniqueSteamid64s = new Set();
const cashSteamid64s = new Set();
const itemSteamid64s = new Set();
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
		const itemDonations = require('../data/raw-item-donations.json').donations;
		itemDonations.forEach((itemDonation: any) => {
			array.push({
				id: `item_${itemDonation.id}`,
				steamid64: itemDonation.user.steamid,
				email: '',
				type: 'item',
				amount: itemDonation.cash_value
			});
			uniqueSteamid64s.add(itemDonation.user.steamid);
			itemSteamid64s.add(itemDonation.user.steamid);
			if (cashSteamid64s.has(itemDonation.user.steamid)) {
				dualDonors.add(itemDonation.user.steamid);
			}

			if (itemDonation.user.steamid.length !== 17) {
				console.log('ABNORMAL ITEM STEAMID:', itemDonation);
			}
		});

		console.log('unique steamids:', uniqueSteamid64s.size);
		console.log('cash steamids:', cashSteamid64s.size);
		console.log('item steamids:', itemSteamid64s.size);
		console.log('dual donors:', dualDonors.size);
		fs.writeFileSync('data/donations.json', JSON.stringify(array), 'utf-8');
	});
