'use strict';

const csv = require('csv-parser');
const fs = require('fs');
const array = [];

fs.createReadStream('data/raw-cash-donations.csv')
	.pipe(csv())
	.on('data', data => {
		array.push({
			id: data.id,
			steamid64: data.steamid,
			email: data.requestedemail,
			type: 'cash',
			amount: data.amount
		});
	})
	.on('end', () => {
		fs.writeFileSync('data/cash-donations.json', JSON.stringify(array), 'utf-8');
	});
