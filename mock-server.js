'use strict';

const PORT = 22364;
const express = require('express');
const bodyParser = require('body-parser');
const app = express();

app.use(bodyParser.urlencoded({extended: false}));

app.post('/grant_item', (req, res) => {
	console.log('got request:', req.body);
	res.json({
		result: {
			item_id: 5151341846, // eslint-disable-line camelcase
			status: 1
		}
	});
});

app.listen(PORT, () => {
	console.log(`Test server listening on port ${PORT}!`);
});
