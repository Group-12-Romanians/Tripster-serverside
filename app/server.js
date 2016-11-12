var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var url = require('url');
var path = require('path');
var db = require('./database');
var mongoose = require('mongoose');
mongoose.Promise = global.Promise;
var app = express();
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); 

var port = process.env.PORT || 8081

app.get('/', function (req, res) {
	db.User.find({}).then(function(users) {
		res.send('This is working well!!! DB contains:\n' + users);
	}).catch(function (err) {
		res.status(400).send('DB failed');
	});
});

app.get('/trips', function(req, res) {
	db.Trip.find({}).then(function(trips) {
		res.send(trips);
	}).catch(function(err) {
		res.status(500).send('Error while getting trips:' + err);	
	});
});

app.post('/sync_locations', function(req, res) {
	var obj = {trip_id: req.query.trip_id};
	var user_id = req.query.user_id;
	var locations = req.body.locations;
	var lines = locations.split('\n');
	var trip_name = lines[0];
	var evnts = [];
	for(let i=1; i < lines.length; ++i) {
		var data = lines[i].split(',');
		var evnt = {
			time: data[0],
			lat: data[1],
			lng: data[2]
		};
		if (data.length > 3) {
			evnt.img_ids = data.slice(3, data.length);
		}
		evnts.push(evnt);
	}
	console.log(req.query.trip_id);
	db.Trip.findOneAndUpdate(obj, {
		trip_id: req.query.trip_id,
		name: trip_name,
		owner: user_id
	}, {new: true, upsert: true}).then(function(doc) {
		console.log(doc.events);
		console.log(evnts);
		doc.events = doc.events.concat(evnts);
		console.log(doc.events);
		db.Trip.findOneAndUpdate(obj, doc, {new: true})
		.then(function(doc) {
			res.send(doc);
		}).catch(function(err) {
			res.status(500).send('Error while inserting events:' + err);
		});
	}).catch(function(err) {
		res.status(500).send('Error while creating trip:' + err);
	});	
});

app.get('/all_users', function(req, res) {
	db.User.find({}).then(function(all_users) {
		res.send(all_users);
	}).catch(function(err){
		res.status(400).send('Error while getting all users:' + err);
	});
});

app.post('/new_user', function(req, res) {
	var user = {
		user_id: req.body.id,
		name: req.body.name
	};
	db.User.findOneAndUpdate(user, user, {
		new: true,
		upsert: true,
	}).then(function(user) {
		res.send(user);
	}).catch(function (err) {
		res.status(400).send('Error while saving user: ' + err);
	});
});

app.get('/notifications/requests', function(req, res) {
	db.Friendship.find({friend2: req.query.user_id, level: "unconfirmed"})
	.then(function(friendship) {
		res.send(friendship);
	}).catch(function(err) {
		res.status(400).send('Error while getting pending requests.');
	});
});

app.post('/friend_response', function(req, res) {
	var friendship = {
		friend2: req.query.user_id,
		friend1: req.body.friend,
		level: "unconfirmed"
	}
	var stat = req.body.stat;
	if(stat==="confirmed") {
		db.Friendship.findOneAndUpdate(friendship, {
				level: "confirmed"}, {upsert: false, new: true})
		.then(function(doc) {
			res.send(doc);
		}).catch(function(err) {
			res.status(400).send("Error when confirming friendship");
		});
	} else {
		db.Friendship.remove(friendship).then(function() {
			res.send("OK");
		}).catch(function(err){
			res.status(400).send("Error when removing friendship: " + err);
		});
	}
});

app.post('/friend_request', function(req, res) {
	var sender = req.query.user_id;
	var recipient = req.body.friend;
	var friendship = new db.Friendship({
		friend1: sender,
		friend2: recipient,
		level: "unconfirmed"
	}).save().then(function(friendship){
		res.send(friendship);
	}).catch(function(err) {
	  res.status(400).send('User cannot be saved: ' + err);
	});
});

app.get('/my_friends', function(req, res) {
	var user_id = req.query.user_id;
	db.Friendship.find({
		$and: [
			{$or: [{friend1: user_id}, {friend2: user_id}]},
			{level: "confirmed"}
		]
	}).then(function(doc) {
		res.send(doc.map(function(friendship) {
			if (friendship.friend1 === user_id) {
				return friendship.friend2;
			} else {
				return friendship.friend1;
		});
	}).catch(function(err) {
		res.status(500).send('Error while getting my_friends' + err);
	});
});

var startServer = function() {
	var dbUrl = 'mongodb://146.169.46.220:27017';
	mongoose.connect(dbUrl);
	
	var server = app.listen(port);
	console.log('Server running now on port: ' + port);
	
	server.on('close', function() {
		return mongoose.connection.close();
	});

	return server;
};

startServer();
