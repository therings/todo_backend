require("dotenv").config();

// First, install dependencies: npm install express
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000; // Vercel will override this automatically
const { router: userRoutes, auth } = require("./user/userRoutes");

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
  updatedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});

const Todo = mongoose.model("Todo", TodoSchema);

// Define DeletedTodo model
const DeletedTodoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  completed: { type: Boolean, default: false },
  createdAt: { type: Date },
  updatedAt: { type: Date },
  completedAt: { type: Date },
  deletedAt: { type: Date, default: Date.now },
  originalId: { type: String },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});

const DeletedTodo = mongoose.model("DeletedTodo", DeletedTodoSchema);

// Add JSON middleware to parse request body
app.use(express.json());
app.use(cors());

// Add user routes
app.use("/api/users", userRoutes);

// Root route
app.get("/", (req, res) => {
  res.send("Hello World!"); // Responds with a simple greeting
});

// Greeting route
app.get("/hi", (req, res) => {
  res.send("Hi!"); // Responds with a friendly greeting
});

// Todo list route
app.get("/todos", auth, async (req, res) => {
  try {
    const todos = await Todo.find({ user: req.user._id }).lean();
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

// Get all deleted todos
app.get("/deleted-todos", auth, async (req, res) => {
  try {
    const deletedTodos = await DeletedTodo.find({ user: req.user._id })
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

// Create new Todo
app.post("/todos", auth, async (req, res) => {
  if (!req.body.title) {
    return res.status(400).json({ error: "Title is required" });
  }

  try {
    const newTodo = new Todo({
      title: req.body.title,
      createdAt: req.body.createdAt || new Date(),
      updatedAt: null,
      completedAt: null,
      user: req.user._id,
    });
    const savedTodo = await newTodo.save();

    const responseTodo = {
      id: savedTodo._id.toString(),
      title: savedTodo.title,
      completed: savedTodo.completed,
      createdAt: savedTodo.createdAt,
      updatedAt: savedTodo.updatedAt,
      completedAt: savedTodo.completedAt,
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

// Save deleted todo
app.post("/deleted-todos", auth, async (req, res) => {
  try {
    const deletedTodo = new DeletedTodo({
      title: req.body.title,
      completed: req.body.completed,
      createdAt: req.body.createdAt,
      updatedAt: req.body.updatedAt,
      deletedAt: req.body.deletedAt || new Date(),
      originalId: req.body.originalId,
      user: req.user._id,
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

// Update Todo
app.put("/todos/:id", auth, async (req, res) => {
  try {
    const updateData = { ...req.body };
    updateData.updatedAt = new Date();

    if (updateData.completed !== undefined) {
      updateData.completedAt = updateData.completed ? new Date() : null;
    }

    const updatedTodo = await Todo.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
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

// Delete Todo
app.delete("/todos/:id", auth, async (req, res) => {
  try {
    const id = req.params.id;
    const objectId = new mongoose.Types.ObjectId(id);
    const deletedTodo = await Todo.findOneAndDelete({
      _id: objectId,
      user: req.user._id,
    });

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

// Permanently delete todo from deleted-todos
app.delete("/deleted-todos/:id", auth, async (req, res) => {
  try {
    const id = req.params.id;
    const objectId = new mongoose.Types.ObjectId(id);
    const permanentlyDeletedTodo = await DeletedTodo.findOneAndDelete({
      _id: objectId,
      user: req.user._id,
    });

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

// Start the server on all network interfaces
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
