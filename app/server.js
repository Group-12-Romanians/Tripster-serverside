var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var url = require('url');
var path = require('path');
var db = require('./database');
var mongoose = require('mongoose');
var multer = require('multer');
var storage = multer.diskStorage({ 
		destination: path.join(__dirname, '../uploads'),
		filename: function (req, file, cb) {
			var new_name = req.query.photo_id;
			cb(null, new_name + '.jpg');
		}	
	})

var upload = multer( {storage: storage }).single('photo');
mongoose.Promise = global.Promise;
var app = express();
app.use(express.static(path.join(__dirname, '../uploads')));
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
	db.Trip.aggregate().lookup({
		from: 'users', 
		localField: 'owner', 
		foreignField:'_id',
		as: 'user'
	}).then(function(trips) {
		res.send(trips);
	}).catch(function(err) {
		res.status(500).send('Error while getting trips:' + err);	
	});
});

app.post('/new_trip', function(req, res) {
	var user_id = req.query.user_id;
	var locations = req.body.locations;
	var lines = locations.split('\n');
	var trip_info = lines[0].split(',');
	var evnts = [];
	for(var i = 1; i < lines.length; ++i) {
		var data = lines[i].split(',');
		if (data.length > 2) {
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
	}
	var trip = new db.Trip({
		trip_id: trip_info[0],
		name: trip_info[1],
		owner: user_id,
		events: evnts
	});
	console.log(trip);
	trip.save().then(function(doc) {
		res.send(doc);
	}).catch(function(err) {
		console.log(err);
		res.status(500).send("Could not save new trip:" + err);
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
			}
		}));
	}).catch(function(err) {
		res.status(500).send('Error while getting my_friends' + err);
	});
});

app.post('/photos/upload', function(req, res, next) {
	upload(req, res, function(err) {
		if (err) {
			res.status(500).send("Error occured while uploading photo!");
		} else {
			res.send("Photo uploaded successfully!");
			//console.log(req.file);
			//console.log(req.body);
		}
	}); 
});

app.get('/my_trips', function(req, res) {
	var user_id = req.query.user_id;
	
	db.Trip.find({ owner: user_id }).then(function(doc) {
		var tripPreviews = doc.map(function(trip) {
			var result = {
				name: trip.name,
				trip_id: trip.trip_id,
				owner: trip.owner,
				preview: ""
			};
			for (var i = 0; i < trip.events.length; i++) {
				if (trip.events[i].img_ids.length > 0) {
					result.preview = trip.events[i].img_ids[0];
					break;
				}
			}
			return result;
		});
		res.send(tripPreviews);
	}).catch(function(err) {
		res.status(500).send('Error while fetching my_trips' + err);
	});
});

app.get('/get_trip', function(req, res) {
	var trip_id = req.query.trip_id;

	db.Trip.findOne({ trip_id: trip_id }).then(function(doc) {
		res.send(doc);
	}).catch(function(err) {
		res.status(500).send('Error whille fetching trip data' + err);
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
