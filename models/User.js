const mongoose = require("mongoose");

// Default avatar URL - you can replace this with your preferred default avatar
const DEFAULT_AVATAR = "https://ui-avatars.com/api/?background=random&name=";

// User Schema
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  picture: { type: String },
  createdAt: { type: Date, default: Date.now },
  isGooglePicture: { type: Boolean, default: false },
});

// Generate default avatar URL based on user's name
UserSchema.methods.getDefaultAvatar = function () {
  return `${DEFAULT_AVATAR}${encodeURIComponent(this.name)}`;
};

module.exports = mongoose.model("User", UserSchema);
