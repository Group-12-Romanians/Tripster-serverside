var express = require('express');
var nano = require('nano')('http://146.169.46.220:6984');
var couchdb = nano.db.use('tripster');
var bodyParser = require('body-parser');
var fs = require('fs');
var gm = require('gm');
var request = require('request');
var url = require('url');
var uuid = require('node-uuid');
var spawn = require('threads').spawn;
var path = require('path');
var geolib = require('geolib');
var multer = require('multer');
var storage = multer.diskStorage({ 
	destination: path.join(__dirname, '../uploads'),
	filename: function (req, file, cb) {
		var new_name = req.query.photo_id;
		cb(null, new_name + '.jpg');
	}
});

var upload = multer( {storage: storage }).single('photo');

var app = express();
var GOOGLE_API_KEY = 'AIzaSyBEcADKicF0ZeIooOSbh12Vu7BVyDOIjik';

var NEIGHBOUR_PLACES_DISTANCE_LIMIT = 1000; // metres

var startFlagUrl = 'https://goo.gl/IOJ0Sx';
var finishFlagUrl = 'https://goo.gl/Mnyj3b';
var visitedPlaceFlagUrl = 'https://goo.gl/uqUiCs';

// custom couchdb update function
couchdb.update = function(obj, key, callback){
 var db = this;
 db.get(key, function (error, existing){ 
    if(!error) obj._rev = existing._rev;
    db.insert(obj, key, callback);
 });
}


app.use(express.static(path.join(__dirname, '../uploads')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true })); 

var port = process.env.PORT || 8081
var serverUrl = 'http://146.169.46.220:' + port;

app.get('/', function (req, res) {
	couchdb.view('users', 'byName', function(err, body) {
  		if (!err) {
			
			res.send('DB is fine: ' + JSON.stringify(body));
  		} else {
			res.status(500).send('DB is not fine: '+ err);	
		}
	});
});

app.get('/places', function (req, res) {
	couchdb.view('places', 'byTrip', {'key' : req.query.tripId}, function(err, body) {
		if (!err) {
			var rawPlaces = body.rows;
			
			var visitedPlacesIds = {};
			var computedPlaces = {};
			
			var places = rawPlaces.forEach(function getPlace(rawPlace) {
				if (rawPlace.value.placeId) {
					visitedPlacesIds[rawPlace.value.placeId] = 1;
				} else {
					computedPlaces[rawPlace.value._id] = {
						lat: rawPlace.value.lat,
						lng: rawPlace.value.lng,
						time: rawPlace.value.time	
					};
				}
			});
			
			var sortedPlaces = Object.keys(computedPlaces)
			.map(function getValue(key) { return computedPlaces[key]; })
			.sort(sortPlacesByTime);
			
			var polylineCoords = computePolylineCoords(sortedPlaces);

			var startPlaceCoords = latLngUrlString(sortedPlaces[0]);
			var endPlaceCoords = latLngUrlString(sortedPlaces[sortedPlaces.length - 1]);
			
			var visitedPlacesCoords = Object.keys(visitedPlacesIds)
			.map(function getVisitedPlace(placeId) {
				return computedPlaces[placeId];
			})
			.reduce(function getVisitedPlacesPath(acc, place) {
				return acc + latLngUrlString(place);
			}, '');
				
			var url = 'https://maps.googleapis.com/maps/api/staticmap?format=jpg&key=' 
				+ GOOGLE_API_KEY
				+ '&size=640x640' 
				+ polylineCoords
				+ '&markers=icon:' + startFlagUrl + startPlaceCoords
				+ '&markers=icon:' + finishFlagUrl   + endPlaceCoords
				+ '&markers=icon:' + visitedPlaceFlagUrl + visitedPlacesCoords;
			
			console.log(url);
			var preview_img_name = createPreviewImage(url);
			
			couchdb.view('trips', 'byId', {'key' : req.query.tripId}, function(err, body) {
				if (!err) {
					var id  = body.rows[0].id;
					var doc = body.rows[0].value;
					
					var currPreviewName = doc.preview.substring(serverUrl.length + 1);
					var currPreviewPath = path.join(__dirname, '../uploads', currPreviewName);
					fs.unlink(currPreviewPath, function afterRemoval(err) {
						if (err) {
							console.log('Error ocurred while deleting old preview: ' + err);
						} else {
							console.log('Old preview deleted successfully.');
						}
					});

					doc.preview = serverUrl + '/' + preview_img_name;
					
					couchdb.update(doc, id, function(err, result) {
						if (!err) {
							res.send(JSON.stringify(doc));
						} else {
							res.status(500).send('Error while updating doc: ' + err);
						}
					});
				} else {
					res.status(500).send('Error in DB query: ' + err);
				}
			});
                } else {
                        res.status(500).send('DB is not fine: '+ err);
                }
        });
});

function computePolylineCoords(places) {
	var polylineCoords = '';
	var currPath = initPath(places[0]);
	var currPathSize = 1;
	var prevPlace = places[0];
	for (let i = 1; i < places.length; i++) {
		if (!areNeighbourPlaces(places[i], prevPlace)) {
			polylineCoords = polylineCoords 
						+ (currPathSize > 1 ? currPath : '')
						+ pathJump(prevPlace, places[i]);
			currPath = initPath(places[i]);
			currPathSize = 1;
		} else {
			currPath = currPath + latLngUrlString(places[i]);
			currPathSize++;
		} 
		prevPlace = places[i];
	}
	polylineCoords = polylineCoords + (currPathSize > 1 ? currPath : '');
	return polylineCoords;
}

function areNeighbourPlaces(placeA, placeB) {
	return geolib.getDistance(placeA, placeB) <= NEIGHBOUR_PLACES_DISTANCE_LIMIT;
}

function initPath(place) {
	return '&path=color:0x0000ff|weight:5' + latLngUrlString(place);
}
 
function pathJump(from, to) {
	return '&path=color:0x003000|weight:1'+ latLngUrlString(from)
                                      	+ latLngUrlString(to);
}

function createPreviewImage(url) {
	var preview_img_name = uuid.v4() + '.jpg';
	var preview_image_path = path.join(__dirname, '../uploads', preview_img_name);
        request(url).pipe(fs.createWriteStream(preview_image_path));
	return preview_img_name;
}



function sortPlacesByTime(placeA, placeB) {
	return placeA.time - placeB.time;
};

function latLngUrlString(place) {
	return '|' + place.lat + ',' + place.lng;
}

function getVisitedPlaces(tripId) {
	couchdb.view('test', 'test', {'include_docs' : true}, function(err, body) {
		console.log(JSON.stringify(body)); 
	});
}

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
	
app.listen(port);
console.log('Server running now on port: ' + port);
