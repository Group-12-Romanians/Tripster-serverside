// server info
var server = 'http://146.169.46.142';
var port = process.env.PORT || 8081;
var serverUrl = server + ':' + port;

// trip preview details
var START_FLAG_URL = 'https://goo.gl/IOJ0Sx';
var FINISH_FLAG_URL = 'https://goo.gl/Mnyj3b';
var VISITED_PLACES_FLAG_URL = 'https://goo.gl/uqUiCs';
var NEIGHBOUR_PLACES_DISTANCE_LIMIT = 1000; // metres

// modules
var express = require('express');
var nano = require('nano')(server + ':5984');
var couchdb = nano.db.use('tripster01');
var bodyParser = require('body-parser');
var fs = require('fs');
var videoshow = require('videoshow');
var gm = require('gm');
var request = require('request');
var uuid = require('node-uuid');
var path = require('path');
var geolib = require('geolib');
var multer = require('multer');
var GooglePlaces = require('node-googleplaces');
var GOOGLE_API_KEY = 'AIzaSyBEcADKicF0ZeIooOSbh12Vu7BVyDOIjik';
var googlePlaces = new GooglePlaces(GOOGLE_API_KEY);

var app = express();
app.use(express.static(path.join(__dirname, '../uploads')));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// custom couchdb update function (needed to handle revisions)
couchdb.update = function(obj, key, callback) {
 var db = this;
 db.get(key, function(error, existing) {
   if(error) return;
   var changed = false;
   for (var prop in obj) {
     if (!(existing.hasOwnProperty(prop) && existing[prop] === obj[prop])) {
       changed = true;
       existing[prop] = obj[prop];
     }
   }
   if (changed) {
     db.insert(existing, key, callback);
   }
 });
};

var beforeStoreImage = multer.diskStorage({
	destination: path.join(__dirname, '../uploads'),
	filename: function (req, file, cb) {
		cb(null, req.query.photo_id + '.jpg');
	}
});
var upload = multer({storage: beforeStoreImage}).single('photo');

function searchAndUpdatePlace(photoId) {
	couchdb.get(photoId, function(err, doc) {
		if (err) {
      console.error('Failed in getting the photoId');
      return;
    }
    console.log('Adding place name to:' + doc.placeId);
    addPlaceDetails(doc.placeId);
	});
}

function addPlaceDetails(docId) {
  couchdb.get(docId, function(err, doc) {
    if (doc.name) {
			console.error('Already has name');
			return; // if place already has name we don't add one
		}
    var params = {
  		location: doc.lat.toString() + ',' + doc.lng.toString(),
  		radius: 250,
  		type: 'point_of_interest'
  	};
  	googlePlaces.nearbySearch(params, function updatePlace(err, res) {
  		var newDoc = {name: res.body.results[0].name};
  		couchdb.update(newDoc, docId, function(err, result) {
  			if (!err) {
  				console.log('Name given is:' + newDoc.name);
  			} else {
  				console.log('Error while updating doc: ' + err);
  			}
  		});
  	});
  });
}

app.post('/photos/upload', function(req, res, next) {
  upload(req, res, function(err, new_path) {
		if (err) res.status(500).send("Error occured while uploading photo!");
		else res.send("Photo uploaded successfully!" + new_path);
	});
});

app.get('/updatePreview', function(req, res, next) {
	addTripPreview(req.query.tripId);
  res.send("Will complete maybe, go check :)");
});

app.get('/updateVideo', function(req, res, next) {
	addTripVideo(req.query.tripId);
  res.send("Will complete maybe, go check :)");
});

var feed = couchdb.follow({since: "now"});
feed.filter = function(doc, req) {
  return doc.placeId !== null || // a photo
         doc.stoppedAt !== null || // a stopped trip
         (doc.folLevel !== null && doc.folLevel === -1); // a new follower with unset level
};
feed.on('change', function(change) {
  console.log("change: ", change);
  var doc = change.doc;
  if (doc.placeId) searchAndUpdatePlace(change.id); // a photo
  else if (doc.stoppedAt) { // a stopped trip
    if (!doc.name) addTripName(change.id); // a stopped trip with no name
    else if (!doc.preview) addTripPreview(change.id); // a stopped trip with no preview but with name
    else if (!doc.video) addTripVideo(change.id); // a stopped trip with no video but with preview and name
    else console.log('This trip has all the neccessary parts'); // these checks are neccessary to serialize
    // the edits so that we don't create multiple previews and videos
  }
  else if (doc.folLevel !== null && doc.folLevel === -1) createNotification(change.id); // a new follower
	else console.log('None of the feeds above');
});
feed.follow();

function createNotification(followId) {
  var res = followId.split(":");
  var doc = {
    time: new Date().getTime(),
    receiver: res[1],
    other: res[0],
    type: "follower"
  };
  couchdb.insert(doc, uuid.v4(), function(err, result) {
    if (err) console.error('Error while inserting notification for follower: ' + err);
    else console.log("Notification added successfully.");
  });
}

function addTripName(tripId) {
	var newDoc = {name: "Some smart name"};
  couchdb.update(newDoc, tripId, function(err, result) {
    if (err) console.error('Error while inserting preview: ' + err);
    else console.log("Trip name added successfully.");
  });
}

function addTripPreview(tripId) {
  couchdb.view('places', 'byTrip', {'key' : tripId}, function(err, body) {
		if (err) {
      console.error('Error when getting places for trip: ' + tripId);
      return;
    }
    var rawPlaces = body.rows;
		var visitedPlaces = [];
		var computedPlaces = [];
		rawPlaces.forEach(function(rawPlace) {
			if (rawPlace.value.name) {
        visitedPlaces.push({
  				lat: rawPlace.value.lat,
  				lng: rawPlace.value.lng,
  			});
			}
			computedPlaces.push({
				lat: rawPlace.value.lat,
				lng: rawPlace.value.lng,
				time: rawPlace.value.time
			});
		});
		var sortedPlaces = computedPlaces.sort(function(placeA, placeB) {
    	return placeA.time - placeB.time;
    });

		var newDoc = {preview: createPreviewImage(getPreviewUrl(sortedPlaces, visitedPlaces))};
    couchdb.update(newDoc, tripId, function(err, result) {
      if (err) console.error('Error while inserting preview: ' + err);
      else console.log("Preview added successfully.");
    });
  });
}

function addTripVideo(tripId) {
  couchdb.view('images', 'byTrip', {'key' : tripId}, function(err, body) {
    if (err) {
      console.error('Error when getting images for trip: ' + tripId);
      return;
    }
    var rawPlaces = body.rows;
		if (rawPlaces.length === 0) {
			console.log("No images for video!");
			return;
		}

		var images = [];
		rawPlaces.forEach(function(rawPlace) {
			images.push(rawPlace.value._id + '.jpg');
		});

    var video_options = {
      loop: 3, // seconds
      transition: true,
      transitionDuration: 1, // seconds
    };

    var video_photos = images.map(function(photoName) {
      return path.join(__dirname, '../uploads', photoName);
    });
    console.log(video_photos);
    var video_name = uuid.v4() + '.mp4';
    var video_path = path.join(__dirname, '../uploads', video_name);

    videoshow(video_photos, video_options)
    .save(video_path)
    .on('start', function() {
      console.log('Started writing video ' + video_name);
    })
    .on('error', function(err) {
      console.error('Error while writing video ' + video_name, err);
    })
    .on('end', function() {
      console.log('Finished writing video ' + video_name + ' and now adding to db.');
      var newDoc = {video: serverUrl + '/' + video_name};
      couchdb.update(newDoc, tripId, function(err, result) {
        if (err) console.error('Error while inserting preview: ' + err);
        else console.log("Video added successfully.");
      });
    });
  });
}

function getPolylineUrl(places) {
	var polylineCoords = '';
	var currPath = initPath(places[0]);
	var currPathSize = 1;
	var prevPlace = places[0];
	for (var i = 1; i < places.length; i++) {
		if (!areNeighbourPlaces(places[i], prevPlace)) {
			polylineCoords = polylineCoords + (currPathSize > 1 ? currPath : '') + pathJump(prevPlace, places[i]);
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

function latLngUrlString(place) {
  return '|' + place.lat + ',' + place.lng;
}

function pathJump(from, to) {
	return '&path=color:0x003000|weight:1'+ latLngUrlString(from) + latLngUrlString(to);
}

function getPreviewUrl(sortedPlaces, visitedPlaces) {
  var polylineUrl = getPolylineUrl(sortedPlaces);
  var startPlaceCoords = latLngUrlString(sortedPlaces[0]);
  var endPlaceCoords = latLngUrlString(sortedPlaces[sortedPlaces.length - 1]);
  var visitedPlacesCoords = visitedPlaces.reduce(function(acc, place) {
    return acc + latLngUrlString(place);
  }, '');

  var url = 'https://maps.googleapis.com/maps/api/staticmap?format=jpg&key=' +
  GOOGLE_API_KEY +
  '&size=640x640' +
  polylineUrl +
  '&markers=icon:' + START_FLAG_URL + startPlaceCoords +
  '&markers=icon:' + FINISH_FLAG_URL + endPlaceCoords +
  '&markers=icon:' + VISITED_PLACES_FLAG_URL + visitedPlacesCoords;
  console.log(url);
  return url;
}

function createPreviewImage(url) {
	var preview_img_name = uuid.v4() + '.jpg';
	var preview_image_path = path.join(__dirname, '../uploads', preview_img_name);
  request(url).pipe(fs.createWriteStream(preview_image_path));
	return serverUrl + '/' + preview_img_name;
}

function resize_img(new_path) {
	var canvasWidth = 500;
	var canvasHeight = 500;
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
					console.log(new_path);
				}
			});
  	}
	});
}

app.listen(port);
console.log('Server running now on port: ' + port);
