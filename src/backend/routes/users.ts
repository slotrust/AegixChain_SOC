import { Router } from "express";
import { userService } from "../services/user_service.js";
import { authMiddleware, adminMiddleware } from "../middleware/auth.js";

const router = Router();

// All user routes require authentication and admin privileges
router.use(authMiddleware);
router.use(adminMiddleware);

router.get("/", (req, res) => {
  try {
    const users = userService.getUsers();
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }
    const newUser = await userService.createUser({ username, password, role });
    res.status(201).json(newUser);
  } catch (error: any) {
    console.error("Error creating user:", error);
    if (error.message === "Username already exists") {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create user" });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { role, password } = req.body;
    
    if (!role) {
      return res.status(400).json({ error: "Role is required" });
    }

    const updatedUser = await userService.updateUser(id, { role, password });
    res.json(updatedUser);
  } catch (error: any) {
    console.error("Error updating user:", error);
    if (error.message === "User not found") {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to update user" });
  }
});

router.delete("/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    // Prevent self-deletion
    if ((req as any).user.id === id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    userService.deleteUser(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting user:", error);
    if (error.message === "User not found") {
      return res.status(404).json({ error: error.message });
    }
    if (error.message === "Cannot delete the last admin user") {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
