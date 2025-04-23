const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const mongoose = require("mongoose");
const User = require("../models/User");

// Initialize Google OAuth client
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Default avatar URL - you can replace this with your preferred default avatar
const DEFAULT_AVATAR = "https://ui-avatars.com/api/?background=random&name=";

// Authentication middleware
// Verifies JWT token from request headers and attaches user object to request
// Usage: Add 'auth' middleware to routes that require authentication
const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");
    if (!token) {
      throw new Error();
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET environment variable is required");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: decoded._id });

    if (!user) {
      throw new Error();
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: "Please authenticate." });
  }
};

// Google OAuth login handler
// 1. Verifies Google ID token
// 2. Creates or updates user in database
// 3. Issues JWT token for subsequent requests
router.post("/google-login", async (req, res) => {
  try {
    const { credential } = req.body;
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { name, email, picture } = payload;

    console.log("Google payload:", { name, email, picture });

    // Find or create user
    let user = await User.findOne({ email });
    console.log("Existing user:", user);

    if (!user) {
      // Create new user if doesn't exist
      user = new User({
        name,
        email,
        picture,
        isGooglePicture: false,
      });
      await user.save();
      console.log("Created new user:", user);
    } else {
      // Update existing user's Google-specific info
      user.picture = picture;
      user.isGooglePicture = false;
      await user.save();
      console.log("Updated existing user:", user);
    }

    // Generate JWT token
    const token = jwt.sign(
      { _id: user._id.toString() },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    const responseData = {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        isGooglePicture: user.isGooglePicture,
      },
      token,
    };
    console.log("Sending response:", responseData);
    res.json(responseData);
  } catch (error) {
    console.error("Google login error:", error);
    res.status(401).json({ error: "Google authentication failed" });
  }
});

// Traditional email/password login
// 1. Validates credentials against database
// 2. Issues JWT token on successful authentication
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !user.password) {
      return res.status(401).json({ error: "Invalid login credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid login credentials" });
    }

    const token = jwt.sign(
      { _id: user._id.toString() },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        isGooglePicture: user.isGooglePicture,
      },
      token,
    });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
  }
});

// Password validation helper
const validatePassword = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const errors = [];
  if (password.length < minLength)
    errors.push(`Password must be at least ${minLength} characters long`);
  if (!hasUpperCase)
    errors.push("Password must contain at least one uppercase letter");
  if (!hasLowerCase)
    errors.push("Password must contain at least one lowercase letter");
  if (!hasNumbers) errors.push("Password must contain at least one number");
  if (!hasSpecialChar)
    errors.push(
      'Password must contain at least one special character (!@#$%^&*(),.?":{}|<>)'
    );

  return errors;
};

// New user registration
// 1. Checks for existing email to prevent duplicates
// 2. Hashes password for security
// 3. Creates new user with default avatar
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Input validation
    if (!name || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Password validation
    const passwordErrors = validatePassword(password);
    if (passwordErrors.length > 0) {
      const errorMessage = `Password requirements not met:\n\n${passwordErrors.join(
        "\n"
      )}`;
      return res.status(400).json({ error: errorMessage });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user with default avatar
    const user = new User({
      name,
      email,
      password: hashedPassword,
    });

    // Set default avatar based on name
    user.picture = user.getDefaultAvatar();

    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Get current user route
router.get("/me", auth, async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        picture: req.user.picture,
        isGooglePicture: req.user.isGooglePicture,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get user data" });
  }
});

// Profile picture update endpoint
// Validates and updates user's profile picture
// Supports base64 encoded images with size limit of 5MB
router.post("/update-profile-picture", auth, async (req, res) => {
  try {
    const { pictureUrl } = req.body;

    if (!pictureUrl) {
      return res.status(400).json({ error: "Picture data is required" });
    }

    // Validate base64 image
    if (!pictureUrl.startsWith("data:image/")) {
      return res.status(400).json({ error: "Invalid image format" });
    }

    // Check file size (base64 string length * 0.75 is approximate file size in bytes)
    const base64Data = pictureUrl.split(",")[1];
    const fileSize = base64Data.length * 0.75;
    if (fileSize > 5 * 1024 * 1024) {
      // 5MB limit
      return res
        .status(400)
        .json({ error: "File size should be less than 5MB" });
    }

    const user = req.user;
    user.picture = pictureUrl;
    user.isGooglePicture = false;
    await user.save();

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        isGooglePicture: user.isGooglePicture,
      },
    });
  } catch (error) {
    console.error("Profile picture update error:", error);
    res.status(500).json({ error: "Failed to update profile picture" });
  }
});

// Reset profile picture to default
// Generates new default avatar based on user's current name
router.post("/reset-profile-picture", auth, async (req, res) => {
  try {
    const user = req.user;
    user.picture = user.getDefaultAvatar();
    user.isGooglePicture = false;
    await user.save();

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to reset profile picture" });
  }
});

// Name update endpoint
// Updates user's display name and validates input
// Note: This may affect the default avatar if user resets their profile picture
router.post("/update-name", auth, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: "Name is required" });
    }

    const user = req.user;
    user.name = name.trim();
    await user.save();

    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        picture: user.picture,
        isGooglePicture: user.isGooglePicture,
      },
    });
  } catch (error) {
    console.error("Name update error:", error);
    res.status(500).json({ error: "Failed to update name" });
  }
});

// Get all users
router.get("/", auth, async (req, res) => {
  try {
    const users = await User.find({}, "name picture");
    const formattedUsers = users.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      avatar: user.picture || user.getDefaultAvatar(),
    }));
    res.json(formattedUsers);
  } catch (error) {
    console.error("Failed to fetch users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

module.exports = { router, auth };
