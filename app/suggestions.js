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

var default_prefs = require('./default_prefs.json');

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
		if (err) { 
			console.error('Error when getting running trips: ' + err); 
			return; 
		}

		var runningTrips = body.rows;
		runningTrips.forEach(function(runningTrip) {
			tripId = runningTrip.value._id;
			userId = runningTrip.value.ownerId;
			couchdb.view('places', 'byTrip', {'key' : tripId}, function(err, body) {
				if (err) { 
					console.error('Error when getting places for trip ' + tripId + ': ' + err); 
					return;
				}
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
				});

				if (lastTime === 0) return;

				var params = {
					location: lastLocation.lat.toString() + ',' + 
									  lastLocation.lng.toString(),
					radius: 1000,
					type: getSuggestionType(userId)
				};

				googlePlaces.nearbySearch(params, function(err, res) {
					if (res.body.results.length > 0) {
						var rest = res.body.results[0];
						var url = PLACE_DETAILS_URL + 'key='
						    + GOOGLE_API_KEY
						    + '&placeid='
						    + rest.place_id;
						request(url, function(err, res, body) {
							if (err) { 
								console.log(err); 
								return;
							}

							var doc = {
   							time: new Date().getTime(),
								restLink: JSON.parse(body).result.url,
								restaurant_pic: 'http://www.crosstimbersgazette.com/crosstimbersgazette/wp-content/uploads/2016/02/restaurant-generic.jpg',
    						receiver: userId,
								ttl: new Date().getTime() + 7200000,
    						type: "restaurant"
  						};

							var notificationId = uuid.v4();
  						couchdb.insert(doc, notificationId, function(err, result) {
    						if (err) console.error('Error while inserting suggestion: ' + err);
    						else console.log("Suggestion " + notificationId + " added successfully.");
  						});
						});
					}
				}); 
			});
		});
	});
}

function getSuggestionType(userId) {
	couchdb.get(userId, function(err, doc) {
		var prefs = doc.prefs;
		if (!prefs) {
			return randomSuggestionType();
		}

		var sortedPrefs = Object.keys(prefs).sort(function(a, b) { return prefs[b] - prefs[a]; });
		
		if (prefs[sortedPrefs[0]] === 0) {
			return randomSuggestionType();
		}
		
		var fstPrefVal = prefs[sortedPrefs[0]];
		var sndPrefVal = prefs[sortedPrefs[1]];
		var trdPrefVal = prefs[sortedPrefs[2]];
		var sum = fstPrefVal + sndPrefVal + trdPrefVal;
		console.log(fstPrefVal);
		var rand = Math.random();
	
		if (rand < fstPrefVal / sum) {
			return sortedPrefs[0];
		}

		if (rand < (fstPrefVal + sndPrefVal) / sum) {
			return sortedPrefs[1];
		}

		return sortedPrefs[2]; 
	});
}

function randomSuggestionType() {
	var types = Object.keys(default_prefs);
	return types[Math.floor(Math.random() * types.length)];
}
	
getSuggestionType("1233379543368282");		
//sendSuggestions();

					 
