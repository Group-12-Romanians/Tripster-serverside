var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var userSchema = new Schema({
	user_id: {
		type: String,
		unique: true,
		required: true
	},

	name: {
		type: String,
		required: true
	}
});
var User = mongoose.model('User', userSchema);

var friendshipSchema = new Schema({
	friend1: {
		type: Schema.Types.ObjectId, ref: 'User'
	},

	friend2: {
		type: Schema.Types.ObjectId, ref: 'User'
	},

	level: String
});
var Friendship = mongoose.model('Friendship', friendshipSchema);

var imageSchema = new Schema({
	id: {
		type: String,
		required: true,
		unique: true
	},

	path: String
});
var Image = mongoose.model('Image', imageSchema);

var eventSchema = new Schema({
	time: {
		type: Number,
		required: true,
	},

	lat: {
		type: Number,
		required: true
	},
	
	lng: {
		type: Number,
		required: true
	},
	
	img_ids: [String],

	visibility: {
		type: Number,
		default: 0
	}
});

var tripSchema = new Schema({
	trip_id: {
		type: String,
		unique: true,
		required: true
	},

	preview_img: String, // actually only id of the pic in uploads

	preview_video: String, // actually only the id of the video in uploads

	name: String,

	owner: {
		type: Schema.Types.ObjectId, ref: 'User'
	},

	events: [eventSchema]
});
var Trip = mongoose.model('Trip', tripSchema);

module.exports = {
	User: User,
	Friendship: Friendship,
	Trip: Trip,
	Image: Image
	};
