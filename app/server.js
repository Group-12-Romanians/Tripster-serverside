var express = require('express');
var bodyParser = require('body-parser');
var fs = require('fs');
var gm = require('gm');
var request = require('request');
var url = require('url');
var uuid = require('node-uuid');
var spawn = require('threads').spawn;
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
});

var upload = multer( {storage: storage }).single('photo');

mongoose.Promise = global.Promise;
var app = express();
var GOOGLE_API_KEY = 'AIzaSyBEcADKicF0ZeIooOSbh12Vu7BVyDOIjik';

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
		res.status(500).send('Error whilie getting trips:' + err);	
	});
});

app.post('/new_trip', function(req, res) {
	var user_id = req.query.user_id;
	var locations = req.body.locations;
	var lines = locations.split('\n');
	var trip_info = lines[0].split(',');
	var evnts = [], images = [], coords = [];
	for(var i = 1; i < lines.length; ++i) {
		var data = lines[i].split(',');
		if (data.length > 2) {
			var evnt = {
				time: data[0],
				lat: data[1],
				lng: data[2]
			};
			coords.push(evnt.lat + ',' + evnt.lng);
			if (data.length > 3) {
				evnt.img_ids = data.slice(3, data.length);
				var evnt_images = evnt.img_ids.map(function get_image(image_id) {
					return path.join(__dirname, '../uploads', image_id + '.jpg');
				});
				images = images.concat(evnt_images);
			}
			evnts.push(evnt);
		}
	}
	
	var preview_img_name = uuid.v4();
	var preview_image_path = path.join(__dirname, '../uploads', preview_img_name + '.jpg');
	var video_name = uuid.v4() + '.mp4';
	var video_path = path.join(__dirname, '../uploads', video_name);
	var trip = new db.Trip({
		trip_id: trip_info[0],
		name: trip_info[1],
		preview_img: preview_img_name,
		preview_video: video_name,
		owner: user_id,
		events: evnts
	});

	res.send(trip);

	var video_options = {
		fps: 25,
		loop: 3, // seconds
		transition: true,
		transitionDuration: 1, // seconds
		videoBitrate: 1024,
	 	videoCodec: 'libx264',
		size: '640x?',
		format: 'mp4'
	};

	var fs = require('fs'); 
	var request = require('request');
	var videoshow = require('videoshow');
	var coords_path = coords.map(function path_point(latlong) {
						return '|' + latlong;
					})
				      .reduce(function compute_path(acc, point) {
						return acc + point;
					});   	
	var url = 'https://maps.googleapis.com/maps/api/staticmap?format=jpg&key=' 
			+ GOOGLE_API_KEY 
			+ '&size=640x440&path=color:0x0000ff|weight:5' 
			+ coords_path;

  request(url).pipe(fs.createWriteStream(preview_image_path));
	console.log(preview_image_path);
	var video_images = images;
	console.log(video_images);
	videoshow(video_images, video_options)
	.save(video_path)
	.on('start', function() {
		console.log('Started writing video ' + video_name);
	})
	.on('error', function(err) {
		console.error('Error while writing video ' + video_name, err);
	})
	.on('end', function() {
		console.log('Finished writing video ' + video_name 
				+ ', now adding to db.');
		trip.save().then(function(doc) {
			console.log('Successfully saved ' + doc);
		}).catch(function(err) {
			console.log(err);
		});
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
		name: req.body.name,
		avatar: req.body.avatar
	};
	db.User.findOneAndUpdate({user_id: req.body.id}, user, {
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
			if (friendship.friend1 == user_id) {
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
	upload(req, res, function(err, new_path) {
		if (err) {
			res.status(500).send("Error occured while uploading photo!");
		} else {
			res.send("Photo uploaded successfully!" + new_path);
		}
	});
});

function resize_img(new_path) {
	var canvasWidth = 640;
	var canvasHeight = 440;
	gm(path.join(__dir_name, "../uploads", new_path)).size(function(error, size) {
		if (error) {
			console.error(error);
		} else {
			// current image size
			var imageWidth = size.width;
			var imageHeight = size.height;
			// center placement
			var x = (canvasWidth / 2) - (imageWidth / 2);
 			var y = (canvasHeight / 2) - (imageHeight / 2);
 			this.background('#000000')
			.resize(imageWidth, imageHeight)
			.gravity('Center')
			.extent(canvasWidth, canvasHeight)
 			.write(path.join(__dirname, "../uploads", new_path), function(error) {
 				if (error) {
   				console.error(error);
				} else {
					console.log(this.outname);
				}
			});
  	}
	});

}

app.get('/my_trips', function(req, res) {
	var user_id = req.query.user_id;
	
	db.Trip.find({ owner: user_id }).then(function(doc) {
		res.send(doc);
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
