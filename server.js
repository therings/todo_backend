require("dotenv").config();

// First, install dependencies: npm install express
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000; // Vercel will override this automatically
const { router: userRoutes, auth } = require("./user/userRoutes");
const Comment = require("./models/Comment");

// Configure CORS with specific options
const allowedOrigins = [
  "https://todo-frontend-v1-git-vercel-neverefts-projects.vercel.app",
  "https://todo-frontend-v1.vercel.app",
  "https://todo-frontend-v1-git-main-neverefts-projects.vercel.app",
  "https://todo-frontend-h0g4ec09z-neverefts-projects.vercel.app",
  "https://todo-frontend-ashy.vercel.app", // Add your new frontend URL here
  process.env.FRONTEND_URL,
  // Add any other domains you might deploy to
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests, or same origin)
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.includes(origin) ||
      process.env.NODE_ENV !== "production"
    ) {
      callback(null, true);
    } else {
      console.log("CORS blocked for origin:", origin);
      callback(null, true); // Allow all origins for now (safer for debugging)
      // In production, you might want to use: callback(new Error("Not allowed by CORS"))
    }
  },
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Origin",
  ],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

// Apply CORS configuration before any other middleware
app.use(cors(corsOptions));

// Handle OPTIONS preflight requests explicitly
app.options("*", cors(corsOptions));

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
  assignedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
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

// Add JSON middleware to parse request body with increased limit
app.use(express.json({ limit: "10mb" }));

// Add an explicit handler for OPTIONS requests to all routes
app.options("*", (req, res) => {
  console.log("Handling OPTIONS request");
  // Set CORS headers
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With, Accept, Origin"
  );
  res.status(204).send();
});

// Add user routes
app.use("/api/users", userRoutes);

// Todo list route
app.get("/api/todos", auth, async (req, res) => {
  try {
    console.log("Fetching todos for user:", req.user._id);

    // Find todos where user is either the creator or is assigned
    const todos = await Todo.find({
      $or: [{ user: req.user._id }, { assignedUsers: req.user._id }],
    })
      .populate("assignedUsers", "name picture")
      .populate("user", "name picture")
      .lean();

    console.log("Found todos:", todos);

    const formattedTodos = todos.map((todo) => ({
      id: todo._id.toString(),
      title: todo.title,
      completed: todo.completed,
      createdAt: todo.createdAt,
      updatedAt: todo.updatedAt,
      completedAt: todo.completedAt,
      owner: {
        id: todo.user._id.toString(),
        name: todo.user.name,
        avatar: todo.user.picture || null,
      },
      isCreator: todo.user._id.toString() === req.user._id.toString(),
      isAssigned:
        todo.assignedUsers?.some(
          (user) => user._id.toString() === req.user._id.toString()
        ) || false,
      assignedUsers:
        todo.assignedUsers?.map((user) => ({
          id: user._id.toString(),
          name: user.name,
          avatar: user.picture || null,
        })) || [],
    }));

    console.log("Formatted todos:", formattedTodos);
    res.json(formattedTodos);
  } catch (err) {
    console.error("Error fetching todos:", {
      error: err.message,
      stack: err.stack,
      userId: req.user._id,
    });
    res.status(500).json({ error: err.message });
  }
});

// Get all deleted todos
app.get("/api/deleted-todos", auth, async (req, res) => {
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
app.post("/api/todos", auth, async (req, res) => {
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
    const populatedTodo = await Todo.findById(savedTodo._id)
      .populate("user", "name picture")
      .lean();

    const responseTodo = {
      id: savedTodo._id.toString(),
      title: savedTodo.title,
      completed: savedTodo.completed,
      createdAt: savedTodo.createdAt,
      updatedAt: savedTodo.updatedAt,
      completedAt: savedTodo.completedAt,
      owner: {
        id: populatedTodo.user._id.toString(),
        name: populatedTodo.user.name,
        avatar: populatedTodo.user.picture || null,
      },
      isCreator: true,
      assignedUsers: [],
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
app.post("/api/deleted-todos", auth, async (req, res) => {
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
app.put("/api/todos/:id", auth, async (req, res) => {
  try {
    const updateData = { ...req.body };

    // Only set updatedAt if there are changes other than completion status
    if (Object.keys(updateData).some((key) => key !== "completed")) {
      updateData.updatedAt = new Date();
    }

    if (updateData.completed !== undefined) {
      updateData.completedAt = updateData.completed ? new Date() : null;
    }

    const updatedTodo = await Todo.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: updateData },
      { new: true }
    )
      .populate("user", "name picture")
      .populate("assignedUsers", "name picture")
      .lean();

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
      owner: {
        id: updatedTodo.user._id.toString(),
        name: updatedTodo.user.name,
        avatar: updatedTodo.user.picture || null,
      },
      isCreator: updatedTodo.user._id.toString() === req.user._id.toString(),
      assignedUsers:
        updatedTodo.assignedUsers?.map((user) => ({
          id: user._id.toString(),
          name: user.name,
          avatar: user.picture || null,
        })) || [],
    };

    res.json(responseTodo);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Todo
app.delete("/api/todos/:id", auth, async (req, res) => {
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
app.delete("/api/deleted-todos/:id", auth, async (req, res) => {
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

// Get comments for a todo
app.get("/api/todos/:todoId/comments", auth, async (req, res) => {
  try {
    const comments = await Comment.find({ todoId: req.params.todoId })
      .populate("user", "name picture")
      .sort({ createdAt: -1 })
      .lean();

    const formattedComments = comments.map((comment) => ({
      id: comment._id.toString(),
      content: comment.content,
      createdAt: comment.createdAt,
      user: {
        id: comment.user._id.toString(),
        name: comment.user.name,
        avatar: comment.user.picture || null,
      },
    }));

    res.json(formattedComments);
  } catch (err) {
    console.error("Error in GET /api/todos/:todoId/comments:", {
      error: err.message,
      stack: err.stack,
      todoId: req.params.todoId,
    });
    res.status(500).json({ error: err.message });
  }
});

// Add a comment to a todo
app.post("/api/todos/:todoId/comments", auth, async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: "Comment content is required" });
    }

    const comment = new Comment({
      todoId: req.params.todoId,
      user: req.user._id,
      content,
    });

    const savedComment = await comment.save();
    const populatedComment = await Comment.findById(savedComment._id)
      .populate("user", "name picture")
      .lean();

    const formattedComment = {
      id: populatedComment._id.toString(),
      content: populatedComment.content,
      createdAt: populatedComment.createdAt,
      user: {
        id: populatedComment.user._id.toString(),
        name: populatedComment.user.name,
        avatar: populatedComment.user.picture || null,
      },
    };

    res.status(201).json(formattedComment);
  } catch (err) {
    console.error("Error in POST /api/todos/:todoId/comments:", {
      error: err.message,
      stack: err.stack,
      todoId: req.params.todoId,
    });
    res.status(500).json({ error: err.message });
  }
});

// Delete a comment
app.delete("/api/todos/:todoId/comments/:commentId", auth, async (req, res) => {
  try {
    // First, find the comment
    const comment = await Comment.findOne({
      _id: req.params.commentId,
      todoId: req.params.todoId,
    });

    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    // Check if user is the comment creator
    const isCommentCreator =
      comment.user.toString() === req.user._id.toString();

    // If not the creator, check if user is the todo owner
    let isTodoOwner = false;
    if (!isCommentCreator) {
      const todo = await Todo.findById(req.params.todoId);
      if (todo) {
        isTodoOwner = todo.user.toString() === req.user._id.toString();
      }
    }

    // Only allow deletion if user is either the comment creator or the todo owner
    if (!isCommentCreator && !isTodoOwner) {
      return res.status(403).json({
        error:
          "Permission denied. You can only delete your own comments or comments on your todos.",
      });
    }

    // Use findOneAndDelete instead of calling delete() on the document
    await Comment.findOneAndDelete({ _id: req.params.commentId });

    res.sendStatus(204);
  } catch (err) {
    console.error("Error deleting comment:", {
      error: err.message,
      stack: err.stack,
      todoId: req.params.todoId,
      commentId: req.params.commentId,
      userId: req.user._id,
    });
    res.status(500).json({ error: err.message });
  }
});

// Get assigned users for a todo
app.get("/api/todos/:todoId/assigned", auth, async (req, res) => {
  try {
    console.log("Fetching assigned users for todo:", req.params.todoId);

    // First verify the todo ID is valid
    if (!mongoose.Types.ObjectId.isValid(req.params.todoId)) {
      console.error("Invalid todo ID format:", req.params.todoId);
      return res.status(400).json({ error: "Invalid todo ID format" });
    }

    const todo = await Todo.findById(req.params.todoId)
      .populate("assignedUsers", "name picture")
      .lean();

    console.log("Found todo:", todo);

    if (!todo) {
      console.log("Todo not found with ID:", req.params.todoId);
      return res.status(404).json({ error: "Todo not found" });
    }

    if (!todo.assignedUsers) {
      console.log("No assigned users array found for todo:", req.params.todoId);
      return res.json([]);
    }

    const assignedUsers = todo.assignedUsers.map((user) => {
      console.log("Processing user:", user);
      return {
        id: user._id.toString(),
        name: user.name,
        avatar: user.picture || null,
      };
    });

    console.log("Returning assigned users:", assignedUsers);
    res.json(assignedUsers);
  } catch (err) {
    console.error("Error in /api/todos/:todoId/assigned:", {
      error: err.message,
      stack: err.stack,
      todoId: req.params.todoId,
    });
    res.status(500).json({ error: err.message });
  }
});

// Assign a user to a todo
app.post("/api/todos/:todoId/assign/:userId", auth, async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.todoId);
    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    // Check if user exists
    const user = await mongoose.model("User").findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Add user to assignedUsers if not already assigned
    if (!todo.assignedUsers.includes(req.params.userId)) {
      todo.assignedUsers.push(req.params.userId);
      await todo.save();
    }

    const updatedTodo = await Todo.findById(todo._id)
      .populate("assignedUsers", "name picture")
      .lean();

    const assignedUsers = updatedTodo.assignedUsers.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      avatar: user.picture,
    }));

    res.json(assignedUsers);
  } catch (err) {
    console.error("Error in POST /api/todos/:todoId/assign/:userId:", err);
    res.status(500).json({ error: err.message });
  }
});

// Remove assignment from a todo
app.delete("/api/todos/:todoId/assign/:userId", auth, async (req, res) => {
  try {
    const todo = await Todo.findById(req.params.todoId);
    if (!todo) {
      return res.status(404).json({ error: "Todo not found" });
    }

    todo.assignedUsers = todo.assignedUsers.filter(
      (userId) => userId.toString() !== req.params.userId
    );
    await todo.save();

    const updatedTodo = await Todo.findById(todo._id)
      .populate("assignedUsers", "name picture")
      .lean();

    const assignedUsers = updatedTodo.assignedUsers.map((user) => ({
      id: user._id.toString(),
      name: user.name,
      avatar: user.picture,
    }));

    res.json(assignedUsers);
  } catch (err) {
    console.error("Error in DELETE /api/todos/:todoId/assign/:userId:", err);
    res.status(500).json({ error: err.message });
  }
});

// Start the server on all network interfaces
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}
