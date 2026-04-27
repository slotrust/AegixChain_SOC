import { db } from "../database.js";
import { authUtils } from "../utils/auth.js";

export const userService = {
  getUsers: () => {
    return db.prepare("SELECT id, username, role, created_at FROM users ORDER BY created_at DESC").all();
  },

  getUserById: (id: number) => {
    return db.prepare("SELECT id, username, role, created_at FROM users WHERE id = ?").get(id);
  },

  createUser: async (userData: any) => {
    const existingUser = db.prepare("SELECT id FROM users WHERE username = ?").get(userData.username);
    if (existingUser) {
      throw new Error("Username already exists");
    }

    const hashedPassword = await authUtils.hashPassword(userData.password);
    const role = userData.role || 'analyst';

    const stmt = db.prepare("INSERT INTO users (username, password, role) VALUES (?, ?, ?)");
    const info = stmt.run(userData.username, hashedPassword, role);
    
    return userService.getUserById(info.lastInsertRowid as number);
  },

  updateUser: async (id: number, userData: any) => {
    const user = userService.getUserById(id);
    if (!user) throw new Error("User not found");

    if (userData.password) {
      const hashedPassword = await authUtils.hashPassword(userData.password);
      db.prepare("UPDATE users SET role = ?, password = ? WHERE id = ?").run(userData.role, hashedPassword, id);
    } else {
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(userData.role, id);
    }

    return userService.getUserById(id);
  },

  deleteUser: (id: number) => {
    const user = userService.getUserById(id);
    if (!user) throw new Error("User not found");
    
    // Prevent deleting the last admin
    if ((user as any).role === 'admin') {
      const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get() as {count: number};
      if (adminCount.count <= 1) {
        throw new Error("Cannot delete the last admin user");
      }
    }

    db.prepare("DELETE FROM users WHERE id = ?").run(id);
    return { success: true };
  }
};
