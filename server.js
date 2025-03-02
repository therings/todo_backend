require("dotenv").config();

// First, install dependencies: npm install express
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000; // Vercel will override this automatically

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI);

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
  console.log("Connected to MongoDB");
});

// Define Todo model
const TodoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
const Todo = mongoose.model("Todo", TodoSchema);

// Add JSON middleware to parse request body
app.use(express.json());
app.use(cors());

// Root route
app.get("/", (req, res) => {
  res.send("Hello World!"); // Responds with a simple greeting
});

// Greeting route
app.get("/hi", (req, res) => {
  res.send("Hi!"); // Responds with a friendly greeting
});

// Todo list route
app.get("/todos", async (req, res) => {
  try {
    const todos = await Todo.find().lean(); // Fetch all todos from the database
    const formattedTodos = todos.map((todo) => ({
      id: todo._id.toString(), // Convert MongoDB ObjectId to string
      title: todo.title,
      completed: todo.completed,
      createdAt: todo.createdAt,
    }));
    res.json(formattedTodos); // Respond with the formatted list of todos
  } catch (err) {
    res.status(500).json({ error: err.message }); // Handle errors
  }
});

// Create new Todo
app.post("/todos", async (req, res) => {
  if (!req.body.title) {
    return res.status(400).json({ error: "Title is required" }); // Validate request body
  }

  try {
    const newTodo = new Todo({ title: req.body.title }); // Create a new Todo instance
    const savedTodo = await newTodo.save(); // Save the new Todo to the database

    // Convert _id to id for response
    const responseTodo = {
      id: savedTodo._id.toString(),
      title: savedTodo.title,
      completed: savedTodo.completed,
      createdAt: savedTodo.createdAt,
    };

    res.status(201).json(responseTodo); // Respond with the created Todo
  } catch (err) {
    console.error("Database save error:", err); // Log error
    res.status(500).json({
      error: "Internal server error",
      detail: err.message,
    });
  }
});

// Update Todo
app.put("/todos/:id", async (req, res) => {
  try {
    const updatedTodo = await Todo.findByIdAndUpdate(
      req.params.id,
      { $set: req.body }, // Update the Todo with the provided data
      { new: true }
    );

    if (!updatedTodo) {
      return res.status(404).json({ error: "Todo not found" }); // Handle not found case
    }

    // Format the response to match other endpoints
    const responseTodo = {
      id: updatedTodo._id.toString(),
      title: updatedTodo.title,
      completed: updatedTodo.completed,
      createdAt: updatedTodo.createdAt,
    };

    res.json(responseTodo); // Respond with the updated Todo
  } catch (err) {
    res.status(500).json({ error: err.message }); // Handle errors
  }
});

// Delete Todo
app.delete("/todos/:id", async (req, res) => {
  try {
    const id = req.params.id;

    // Convert to ObjectId uniformly
    const objectId = new mongoose.Types.ObjectId(id);
    const deletedTodo = await Todo.findByIdAndDelete(objectId); // Delete the Todo by ID

    if (!deletedTodo) {
      return res.status(404).json({ error: "Todo not found" }); // Handle not found case
    }

    res.sendStatus(204); // Respond with no content status
  } catch (err) {
    console.error("Delete error:", {
      receivedId: req.params.id,
      error: err.message,
    });
    res.status(500).json({
      error: "Delete failed",
      receivedId: req.params.id,
      expectedFormat: "MongoDB ObjectId string",
    });
  }
});

// Start the server on all network interfaces
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
