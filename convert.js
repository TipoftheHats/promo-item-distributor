/* eslint-disable camelcase */
'use strict';

const csv = require('csv-parser');
const fs = require('fs');
const array = [];
const unique_steamid64s = new Set();
const cash_steamid64s = new Set();
const item_steamid64s = new Set();
const dual_donors = new Set();

fs.createReadStream('data/raw-cash-donations.csv')
	.pipe(csv())
	.on('data', data => {
		array.push({
			id: `cash_${data.id}`,
			steamid64: data.steamid,
			email: data.requestedemail,
			type: 'cash',
			amount: data.amount
		});
		unique_steamid64s.add(data.steamid);
		cash_steamid64s.add(data.steamid);

		if (data.steamid.length !== 17) {
			console.log('ABNORMAL STEAMID:', data);
		}
	})
	.on('end', () => {
		const itemDonations = require('./data/raw-item-donations.json').donations;
		itemDonations.forEach(itemDonation => {
			array.push({
				id: `item_${itemDonation.id}`,
				steamid64: itemDonation.user.steamid,
				email: '',
				type: 'item',
				amount: itemDonation.cash_value
			});
			unique_steamid64s.add(itemDonation.user.steamid);
			item_steamid64s.add(itemDonation.user.steamid);
			if (cash_steamid64s.has(itemDonation.user.steamid)) {
				dual_donors.add(itemDonation.user.steamid);
			}

			if (itemDonation.user.steamid.length !== 17) {
				console.log('ABNORMAL STEAMID:', itemDonation);
			}
		});

		console.log('unique steamids:', unique_steamid64s.size);
		console.log('cash steamids:', cash_steamid64s.size);
		console.log('item steamids:', item_steamid64s.size);
		console.log('dual donors:', dual_donors.size);
		fs.writeFileSync('data/donations.json', JSON.stringify(array), 'utf-8');
	});
