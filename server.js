// Load environment variables from .env file
require("dotenv").config();

// Import required dependencies
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000; // Default port if not specified in environment

// MongoDB Connection Setup
mongoose.connect(process.env.MONGODB_URI);

const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
  console.log("Connected to MongoDB");
});

// Schema Definitions
// Todo Schema: Represents the structure of active todo items
const TodoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null }, // Tracks when a todo was completed
});

const Todo = mongoose.model("Todo", TodoSchema);

// DeletedTodo Schema: Keeps track of deleted todos for historical purposes
const DeletedTodoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date },
  updatedAt: { type: Date },
  completedAt: { type: Date },
  deletedAt: { type: Date, default: Date.now }, // Tracks when the todo was deleted
  originalId: { type: String }, // References the original todo's ID
});

const DeletedTodo = mongoose.model("DeletedTodo", DeletedTodoSchema);

// Middleware Configuration
app.use(express.json()); // Parse JSON request bodies
app.use(cors()); // Enable Cross-Origin Resource Sharing

// API Routes
// Basic health check endpoints
app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/hi", (req, res) => {
  res.send("Hi!");
});

// Todo Management Routes
// GET /todos - Retrieve all active todos
app.get("/todos", async (req, res) => {
  try {
    const todos = await Todo.find().lean();
    const formattedTodos = todos.map((todo) => ({
      id: todo._id.toString(),
      title: todo.title,
      completed: todo.completed,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
      completedAt: todo.completedAt,
    }));
    res.json(formattedTodos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /deleted-todos - Retrieve all deleted todos, sorted by deletion date
app.get("/deleted-todos", async (req, res) => {
  try {
    const deletedTodos = await DeletedTodo.find()
      .sort({ deletedAt: -1 })
      .lean();
    const formattedTodos = deletedTodos.map((todo) => ({
      id: todo._id.toString(),
      title: todo.title,
      completed: todo.completed,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
      completedAt: todo.completedAt,
      deletedAt: todo.deletedAt,
      originalId: todo.originalId,
    }));
    res.json(formattedTodos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /todos - Create a new todo
app.post("/todos", async (req, res) => {
  if (!req.body.title) {
    return res.status(400).json({ error: "Title is required" });
  }

  try {
    const newTodo = new Todo({
      title: req.body.title,
      createdAt: req.body.createdAt || new Date(),
      updatedAt: null,
      completedAt: null, // Explicitly set completedAt to null for new todos
    });
    const savedTodo = await newTodo.save();

    const responseTodo = {
      id: savedTodo._id.toString(),
      title: savedTodo.title,
      completed: savedTodo.completed,
      createdAt: savedTodo.createdAt,
      updatedAt: savedTodo.updatedAt,
      completedAt: savedTodo.completedAt, // Include completedAt in response
    };

    res.status(201).json(responseTodo);
  } catch (err) {
    console.error("Database save error:", err);
    res.status(500).json({
      error: "Internal server error",
      detail: err.message,
    });
  }
});

// POST /deleted-todos - Archive a deleted todo
app.post("/deleted-todos", async (req, res) => {
  try {
    const deletedTodo = new DeletedTodo({
      title: req.body.title,
      completed: req.body.completed,
      createdAt: req.body.createdAt,
      updatedAt: req.body.updatedAt,
      deletedAt: req.body.deletedAt || new Date(),
      originalId: req.body.originalId,
    });

    const savedTodo = await deletedTodo.save();

    const responseTodo = {
      id: savedTodo._id.toString(),
      title: savedTodo.title,
      completed: savedTodo.completed,
      createdAt: savedTodo.createdAt,
      updatedAt: savedTodo.updatedAt,
      deletedAt: savedTodo.deletedAt,
      originalId: savedTodo.originalId,
    };

    res.status(201).json(responseTodo);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// PUT /todos/:id - Update an existing todo
// Handles both general updates and completion status
app.put("/todos/:id", async (req, res) => {
  try {
    const updateData = { ...req.body };
    updateData.updatedAt = new Date();

    // Set completedAt when todo is marked as completed
    if (updateData.completed !== undefined) {
      updateData.completedAt = updateData.completed ? new Date() : null;
    }

    const updatedTodo = await Todo.findByIdAndUpdate(
      req.params.id,
      { $set: updateData },
      { new: true }
    );

    if (!updatedTodo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    const responseTodo = {
      id: updatedTodo._id.toString(),
      title: updatedTodo.title,
      completed: updatedTodo.completed,
      createdAt: updatedTodo.createdAt,
      updatedAt: updatedTodo.updatedAt,
      completedAt: updatedTodo.completedAt,
    };

    res.json(responseTodo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /todos/:id - Soft delete a todo (moves to deleted-todos)
app.delete("/todos/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const objectId = new mongoose.Types.ObjectId(id);
    const deletedTodo = await Todo.findByIdAndDelete(objectId);

    if (!deletedTodo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    res.sendStatus(204);
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

// DELETE /deleted-todos/:id - Permanently remove a todo from deleted-todos
app.delete("/deleted-todos/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const objectId = new mongoose.Types.ObjectId(id);
    const permanentlyDeletedTodo = await DeletedTodo.findByIdAndDelete(
      objectId
    );

    if (!permanentlyDeletedTodo) {
      return res.status(404).json({ error: "Deleted todo not found" });
    }

    res.sendStatus(204);
  } catch (err) {
    console.error("Permanent delete error:", {
      receivedId: req.params.id,
      error: err.message,
    });
    res.status(500).json({
      error: "Permanent delete failed",
      receivedId: req.params.id,
      expectedFormat: "MongoDB ObjectId string",
    });
  }
});

// Initialize server to listen on specified port
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
