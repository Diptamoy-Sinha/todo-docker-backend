const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateListMember, validateId } = require('../middleware/validation');

const router = express.Router();

// Helper function to check if user is owner or admin of a list
const checkListPermission = async (userId, listId, requireOwner = false) => {
  const query = requireOwner 
    ? 'SELECT id FROM lists WHERE id = $1 AND owner_id = $2'
    : `SELECT l.id, l.owner_id, lm.role
       FROM lists l
       LEFT JOIN list_members lm ON l.id = lm.list_id AND lm.user_id = $2
       WHERE l.id = $1 AND (l.owner_id = $2 OR lm.role = 'admin')`;
  
  const result = await pool.query(query, [listId, userId]);
  return result.rows.length > 0 ? result.rows[0] : null;
};

// Get all members of a list
router.get('/:listId/members', authenticateToken, validateId, async (req, res) => {
  try {
    const listId = req.params.listId;

    // Check if user has access to the list
    const listCheck = await pool.query(`
      SELECT l.id
      FROM lists l
      LEFT JOIN list_members lm ON l.id = lm.list_id AND lm.user_id = $1
      WHERE l.id = $2 AND (l.owner_id = $1 OR lm.user_id = $1)
    `, [req.user.id, listId]);

    if (listCheck.rows.length === 0) {
      return res.status(404).json({ error: 'List not found or access denied' });
    }

    // Get list members including owner
    const result = await pool.query(`
      SELECT u.id, u.name, u.email, 'owner' as role, l.created_at as joined_at
      FROM lists l
      JOIN users u ON l.owner_id = u.id
      WHERE l.id = $1
      UNION
      SELECT u.id, u.name, u.email, lm.role, lm.created_at as joined_at
      FROM list_members lm
      JOIN users u ON lm.user_id = u.id
      WHERE lm.list_id = $1
      ORDER BY joined_at ASC
    `, [listId]);

    res.json({ members: result.rows });
  } catch (error) {
    console.error('Get list members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a member to a list
router.post('/:listId/members', authenticateToken, validateId, validateListMember, async (req, res) => {
  try {
    const listId = req.params.listId;
    const { email, role = 'member' } = req.body;

    // Check if user has permission to add members (owner or admin)
    const permission = await checkListPermission(req.user.id, listId);
    if (!permission) {
      return res.status(403).json({ error: 'Permission denied - only list owners and admins can add members' });
    }

    // Find the user to add
    const userResult = await pool.query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found with this email address' });
    }

    const userToAdd = userResult.rows[0];

    // Check if user is already the owner
    const ownerCheck = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND owner_id = $2',
      [listId, userToAdd.id]
    );

    if (ownerCheck.rows.length > 0) {
      return res.status(409).json({ error: 'User is already the owner of this list' });
    }

    // Check if user is already a member
    const memberCheck = await pool.query(
      'SELECT role FROM list_members WHERE list_id = $1 AND user_id = $2',
      [listId, userToAdd.id]
    );

    if (memberCheck.rows.length > 0) {
      return res.status(409).json({ error: 'User is already a member of this list' });
    }

    // Add the member
    await pool.query(
      'INSERT INTO list_members (list_id, user_id, role) VALUES ($1, $2, $3)',
      [listId, userToAdd.id, role]
    );

    res.status(201).json({
      message: 'Member added successfully',
      member: {
        id: userToAdd.id,
        name: userToAdd.name,
        email: userToAdd.email,
        role: role
      }
    });
  } catch (error) {
    console.error('Add list member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a member's role
router.put('/:listId/members/:userId', authenticateToken, validateId, async (req, res) => {
  try {
    const listId = req.params.listId;
    const userId = req.params.userId;
    const { role } = req.body;

    if (!role || !['member', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be either "member" or "admin"' });
    }

    // Check if current user has permission (owner or admin)
    const permission = await checkListPermission(req.user.id, listId);
    if (!permission) {
      return res.status(403).json({ error: 'Permission denied - only list owners and admins can update member roles' });
    }

    // Check if target user is a member
    const memberCheck = await pool.query(
      'SELECT role FROM list_members WHERE list_id = $1 AND user_id = $2',
      [listId, userId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User is not a member of this list' });
    }

    // Update the role
    const result = await pool.query(`
      UPDATE list_members 
      SET role = $1 
      WHERE list_id = $2 AND user_id = $3
      RETURNING (SELECT name FROM users WHERE id = $3) as name,
                (SELECT email FROM users WHERE id = $3) as email,
                role
    `, [role, listId, userId]);

    res.json({
      message: 'Member role updated successfully',
      member: {
        id: parseInt(userId),
        ...result.rows[0]
      }
    });
  } catch (error) {
    console.error('Update member role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove a member from a list
router.delete('/:listId/members/:userId', authenticateToken, validateId, async (req, res) => {
  try {
    const listId = req.params.listId;
    const userId = req.params.userId;

    // Check if current user has permission (owner or admin)
    const permission = await checkListPermission(req.user.id, listId);
    if (!permission) {
      return res.status(403).json({ error: 'Permission denied - only list owners and admins can remove members' });
    }

    // Check if target user is the owner
    const ownerCheck = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND owner_id = $2',
      [listId, userId]
    );

    if (ownerCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot remove the list owner' });
    }

    // Remove the member
    const result = await pool.query(
      'DELETE FROM list_members WHERE list_id = $1 AND user_id = $2',
      [listId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User is not a member of this list' });
    }

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Leave a list (for non-owners)
router.delete('/:listId/leave', authenticateToken, validateId, async (req, res) => {
  try {
    const listId = req.params.listId;

    // Check if user is the owner
    const ownerCheck = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND owner_id = $2',
      [listId, req.user.id]
    );

    if (ownerCheck.rows.length > 0) {
      return res.status(400).json({ error: 'List owners cannot leave their own lists. Transfer ownership or delete the list instead.' });
    }

    // Remove the user from the list
    const result = await pool.query(
      'DELETE FROM list_members WHERE list_id = $1 AND user_id = $2',
      [listId, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'You are not a member of this list' });
    }

    res.json({ message: 'Successfully left the list' });
  } catch (error) {
    console.error('Leave list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Transfer list ownership
router.put('/:listId/transfer-ownership', authenticateToken, validateId, async (req, res) => {
  try {
    const listId = req.params.listId;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if current user is the owner
    const ownerCheck = await checkListPermission(req.user.id, listId, true);
    if (!ownerCheck) {
      return res.status(403).json({ error: 'Permission denied - only list owners can transfer ownership' });
    }

    // Find the new owner
    const newOwnerResult = await pool.query(
      'SELECT id, name, email FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (newOwnerResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found with this email address' });
    }

    const newOwner = newOwnerResult.rows[0];

    if (newOwner.id === req.user.id) {
      return res.status(400).json({ error: 'You are already the owner of this list' });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Remove new owner from members if they are already a member
      await pool.query(
        'DELETE FROM list_members WHERE list_id = $1 AND user_id = $2',
        [listId, newOwner.id]
      );

      // Add current owner as admin member
      await pool.query(
        'INSERT INTO list_members (list_id, user_id, role) VALUES ($1, $2, $3)',
        [listId, req.user.id, 'admin']
      );

      // Transfer ownership
      await pool.query(
        'UPDATE lists SET owner_id = $1 WHERE id = $2',
        [newOwner.id, listId]
      );

      await pool.query('COMMIT');

      res.json({
        message: 'Ownership transferred successfully',
        new_owner: {
          id: newOwner.id,
          name: newOwner.name,
          email: newOwner.email
        }
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Transfer ownership error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
