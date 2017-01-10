#!/usr/bin/env node
var server = 'http://146.169.46.142';
var nano = require('nano')(server + ':5984');
var couchdb = nano.db.use('tripster01');
var request = require('request');
var uuid = require('node-uuid');

var GooglePlaces = require('node-googleplaces');
var GOOGLE_API_KEY = 'AIzaSyBEcADKicF0ZeIooOSbh12Vu7BVyDOIjik';
var googlePlaces = new GooglePlaces(GOOGLE_API_KEY);

var PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json?';

var millisInADay = 86400000;

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

/*
var now = new Date();
var millisTill12 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0) - now;
if (millisTill12 < 0) {
     millisTill12 += millisInADay; // it's after 12am, try 12am tomorrow.
}
setTimeout(function() {
						sendSuggestions();
						setInterval(sendSuggestions, millisInADay);
					 }, millisTill12);
*/

function sendSuggestions() {
	couchdb.view('runningTrips', 'byId', function(err, body) {
		if (err) { console.error('Error when getting running trips: ' + err); }

		var runningTrips = body.rows;
		runningTrips.forEach(function(runningTrip) {
			tripId = runningTrip.value._id;
			userId = runningTrip.value.ownerId;
			couchdb.view('places', 'byTrip', {'key' : tripId}, function(err, body) {
				if (err) { console.error('Error when getting places for trip ' + tripId + ': ' + err); }
				var locations = body.rows;
				var lastTime = 0;
				var lastLocation = {};
				locations.forEach(function(loc) {
					if (loc.value.time > lastTime) {
						lastLocation = {
							lat: loc.value.lat,
							lng: loc.value.lng
						};
						lastTime = loc.value.time;
					}
					if (lastTime > 0) {
						var params = {
							location: lastLocation.lat.toString() + ',' + 
					  					  lastLocation.lng.toString(),
							radius: 1000,
							type: 'restaurant'
						};

						googlePlaces.nearbySearch(params, function(err, res) {
							if (res.body.results.length > 0) {
								var rest = res.body.results[0];
								var url = PLACE_DETAILS_URL + 'key='
								    + GOOGLE_API_KEY
								    + '&placeid='
								    + rest.place_id;
								request(url, function(err, res, body) {
									if (err) { console.log(err); }
									var doc = {
   									time: new Date().getTime(),
										restLink: JSON.parse(body).result.url,
										restaurant_pic: 'http://www.crosstimbersgazette.com/crosstimbersgazette/wp-content/uploads/2016/02/restaurant-generic.jpg',
    								receiver: userId,
    								type: "restaurant"
  								};

									var notificationId = uuid.v4();
  								couchdb.insert(doc, notificationId, function(err, result) {
    								if (err) console.error('Error while inserting suggestion: ' + err);
    								else {
											console.log("Suggestion " + notificationId + " added successfully.");
											setTimeout(function() {
												couchdb.get(notificationId, function(err, doc) {
													if (err) { console.log("Error when getting notification doc: " + err) }
													else if (!doc) {console.log("No notification doc found!")}
													else {
														couchdb.destroy(notificationId, doc._rev, function(err, body) {
															if (err) { console.log("Error when destroying notification doc: " + err); }
															else { console.log("Successfully destroyed notification doc!"); }
														});
													}
												});
											}, 7200000); // destroy doc after 2 hours
										}
  								});
								});
							}
						}); 
					}
				});
			});
		});
	});
}

sendSuggestions();

					 
