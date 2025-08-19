const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateList, validateId } = require('../middleware/validation');

const router = express.Router();

// Get all lists for the current user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT l.id, l.name, l.owner_id, l.created_at,
             u.name as owner_name,
             lm.role as user_role
      FROM lists l
      JOIN users u ON l.owner_id = u.id
      LEFT JOIN list_members lm ON l.id = lm.list_id AND lm.user_id = $1
      WHERE l.owner_id = $1 OR lm.user_id = $1
      ORDER BY l.created_at DESC
    `, [req.user.id]);

    res.json({ lists: result.rows });
  } catch (error) {
    console.error('Get lists error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific list with tasks
router.get('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const listId = req.params.id;

    // Check if user has access to the list
    const accessCheck = await pool.query(`
      SELECT l.id, l.name, l.owner_id, l.created_at,
             u.name as owner_name,
             CASE 
               WHEN l.owner_id = $1 THEN 'owner'
               WHEN lm.role IS NOT NULL THEN lm.role
               ELSE NULL
             END as user_role
      FROM lists l
      JOIN users u ON l.owner_id = u.id
      LEFT JOIN list_members lm ON l.id = lm.list_id AND lm.user_id = $1
      WHERE l.id = $2 AND (l.owner_id = $1 OR lm.user_id = $1)
    `, [req.user.id, listId]);

    if (accessCheck.rows.length === 0) {
      return res.status(404).json({ error: 'List not found or access denied' });
    }

    const list = accessCheck.rows[0];

    // Get tasks for the list
    const tasksResult = await pool.query(`
      SELECT t.id, t.title, t.description, t.priority, t.due_date, 
             t.completed, t.created_at,
             array_agg(
               CASE WHEN tag.name IS NOT NULL 
               THEN json_build_object('id', tag.id, 'name', tag.name)
               ELSE NULL END
             ) FILTER (WHERE tag.name IS NOT NULL) as tags
      FROM tasks t
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      LEFT JOIN tags tag ON tt.tag_id = tag.id
      WHERE t.list_id = $1
      GROUP BY t.id, t.title, t.description, t.priority, t.due_date, t.completed, t.created_at
      ORDER BY t.created_at DESC
    `, [listId]);

    // Get subtasks for each task
    const taskIds = tasksResult.rows.map(task => task.id);
    let subtasks = [];
    
    if (taskIds.length > 0) {
      const subtasksResult = await pool.query(`
        SELECT id, task_id, title, completed, created_at
        FROM subtasks
        WHERE task_id = ANY($1)
        ORDER BY created_at ASC
      `, [taskIds]);
      subtasks = subtasksResult.rows;
    }

    // Group subtasks by task_id
    const subtasksByTask = subtasks.reduce((acc, subtask) => {
      if (!acc[subtask.task_id]) {
        acc[subtask.task_id] = [];
      }
      acc[subtask.task_id].push(subtask);
      return acc;
    }, {});

    // Add subtasks to tasks
    const tasksWithSubtasks = tasksResult.rows.map(task => ({
      ...task,
      tags: task.tags || [],
      subtasks: subtasksByTask[task.id] || []
    }));

    res.json({
      list: {
        ...list,
        tasks: tasksWithSubtasks
      }
    });
  } catch (error) {
    console.error('Get list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new list
router.post('/', authenticateToken, validateList, async (req, res) => {
  try {
    const { name } = req.body;

    const result = await pool.query(
      'INSERT INTO lists (name, owner_id) VALUES ($1, $2) RETURNING id, name, owner_id, created_at',
      [name, req.user.id]
    );

    const list = result.rows[0];

    res.status(201).json({
      message: 'List created successfully',
      list: {
        ...list,
        owner_name: req.user.name,
        user_role: 'owner'
      }
    });
  } catch (error) {
    console.error('Create list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a list
router.put('/:id', authenticateToken, validateId, validateList, async (req, res) => {
  try {
    const listId = req.params.id;
    const { name } = req.body;

    // Check if user is the owner or has admin role
    const accessCheck = await pool.query(`
      SELECT l.id, l.owner_id, lm.role
      FROM lists l
      LEFT JOIN list_members lm ON l.id = lm.list_id AND lm.user_id = $1
      WHERE l.id = $2 AND (l.owner_id = $1 OR lm.role = 'admin')
    `, [req.user.id, listId]);

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Permission denied - only owners and admins can update lists' });
    }

    const result = await pool.query(
      'UPDATE lists SET name = $1 WHERE id = $2 RETURNING id, name, owner_id, created_at',
      [name, listId]
    );

    res.json({
      message: 'List updated successfully',
      list: result.rows[0]
    });
  } catch (error) {
    console.error('Update list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a list
router.delete('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const listId = req.params.id;

    // Check if user is the owner
    const ownerCheck = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND owner_id = $2',
      [listId, req.user.id]
    );

    if (ownerCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Permission denied - only list owners can delete lists' });
    }

    await pool.query('DELETE FROM lists WHERE id = $1', [listId]);

    res.json({ message: 'List deleted successfully' });
  } catch (error) {
    console.error('Delete list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
