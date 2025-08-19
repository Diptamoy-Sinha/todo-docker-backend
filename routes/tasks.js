const express = require('express');
const pool = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const { validateTask, validateSubtask, validateTag, validateId, validateListId, validateTaskId, validateSubtaskId } = require('../middleware/validation');

const router = express.Router();

// Helper function to check list access
const checkListAccess = async (userId, listId) => {
  const result = await pool.query(`
    SELECT l.id, l.owner_id, lm.role
    FROM lists l
    LEFT JOIN list_members lm ON l.id = lm.list_id AND lm.user_id = $1
    WHERE l.id = $2 AND (l.owner_id = $1 OR lm.user_id = $1)
  `, [userId, listId]);
  
  return result.rows.length > 0 ? result.rows[0] : null;
};

// Get all tasks for a specific list
router.get('/list/:listId', authenticateToken, validateListId, async (req, res) => {
  try {
    const listId = req.params.listId;

    // Check if user has access to the list
    const listAccess = await checkListAccess(req.user.id, listId);
    if (!listAccess) {
      return res.status(404).json({ error: 'List not found or access denied' });
    }

    const result = await pool.query(`
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

    res.json({ tasks: result.rows });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific task with subtasks
router.get('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const taskId = req.params.id;

    // Get task and check access
    const taskResult = await pool.query(`
      SELECT t.id, t.list_id, t.title, t.description, t.priority, 
             t.due_date, t.completed, t.created_at,
             array_agg(
               CASE WHEN tag.name IS NOT NULL 
               THEN json_build_object('id', tag.id, 'name', tag.name)
               ELSE NULL END
             ) FILTER (WHERE tag.name IS NOT NULL) as tags
      FROM tasks t
      LEFT JOIN task_tags tt ON t.id = tt.task_id
      LEFT JOIN tags tag ON tt.tag_id = tag.id
      WHERE t.id = $1
      GROUP BY t.id, t.list_id, t.title, t.description, t.priority, t.due_date, t.completed, t.created_at
    `, [taskId]);

    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    // Check if user has access to the list
    const listAccess = await checkListAccess(req.user.id, task.list_id);
    if (!listAccess) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    // Get subtasks
    const subtasksResult = await pool.query(
      'SELECT id, title, completed, created_at FROM subtasks WHERE task_id = $1 ORDER BY created_at ASC',
      [taskId]
    );

    res.json({
      task: {
        ...task,
        tags: task.tags || [],
        subtasks: subtasksResult.rows
      }
    });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new task
router.post('/', authenticateToken, validateTask, async (req, res) => {
  try {
    const { list_id, title, description, priority, due_date, tags } = req.body;

    // Check if user has access to the list
    const listAccess = await checkListAccess(req.user.id, list_id);
    if (!listAccess) {
      return res.status(404).json({ error: 'List not found or access denied' });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Create task
      const taskResult = await pool.query(
        'INSERT INTO tasks (list_id, title, description, priority, due_date) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [list_id, title, description, priority, due_date]
      );

      const task = taskResult.rows[0];

      // Handle tags if provided
      if (tags && Array.isArray(tags)) {
        for (const tagName of tags) {
          // Create tag if it doesn't exist
          const tagResult = await pool.query(
            'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
            [tagName.trim().toLowerCase()]
          );

          const tagId = tagResult.rows[0].id;

          // Link tag to task
          await pool.query(
            'INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [task.id, tagId]
          );
        }
      }

      await pool.query('COMMIT');

      // Get the created task with tags
      const finalTaskResult = await pool.query(`
        SELECT t.*, 
               array_agg(
                 CASE WHEN tag.name IS NOT NULL 
                 THEN json_build_object('id', tag.id, 'name', tag.name)
                 ELSE NULL END
               ) FILTER (WHERE tag.name IS NOT NULL) as tags
        FROM tasks t
        LEFT JOIN task_tags tt ON t.id = tt.task_id
        LEFT JOIN tags tag ON tt.tag_id = tag.id
        WHERE t.id = $1
        GROUP BY t.id
      `, [task.id]);

      res.status(201).json({
        message: 'Task created successfully',
        task: {
          ...finalTaskResult.rows[0],
          tags: finalTaskResult.rows[0].tags || []
        }
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a task
router.put('/:id', authenticateToken, validateId, validateTask, async (req, res) => {
  try {
    const taskId = req.params.id;
    const { title, description, priority, due_date, completed, tags } = req.body;

    // Get task and check access
    const taskResult = await pool.query('SELECT list_id FROM tasks WHERE id = $1', [taskId]);
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    // Check if user has access to the list
    const listAccess = await checkListAccess(req.user.id, task.list_id);
    if (!listAccess) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    // Start transaction
    await pool.query('BEGIN');

    try {
      // Update task
      const updateResult = await pool.query(`
        UPDATE tasks 
        SET title = $1, description = $2, priority = $3, due_date = $4, completed = $5
        WHERE id = $6 
        RETURNING *
      `, [title, description, priority, due_date, completed !== undefined ? completed : false, taskId]);

      const updatedTask = updateResult.rows[0];

      // Handle tags if provided
      if (tags !== undefined && Array.isArray(tags)) {
        // Remove existing tags
        await pool.query('DELETE FROM task_tags WHERE task_id = $1', [taskId]);

        // Add new tags
        for (const tagName of tags) {
          if (tagName && tagName.trim()) {
            // Create tag if it doesn't exist
            const tagResult = await pool.query(
              'INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
              [tagName.trim().toLowerCase()]
            );

            const tagId = tagResult.rows[0].id;

            // Link tag to task
            await pool.query(
              'INSERT INTO task_tags (task_id, tag_id) VALUES ($1, $2)',
              [taskId, tagId]
            );
          }
        }
      }

      await pool.query('COMMIT');

      // Get the updated task with tags
      const finalTaskResult = await pool.query(`
        SELECT t.*, 
               array_agg(
                 CASE WHEN tag.name IS NOT NULL 
                 THEN json_build_object('id', tag.id, 'name', tag.name)
                 ELSE NULL END
               ) FILTER (WHERE tag.name IS NOT NULL) as tags
        FROM tasks t
        LEFT JOIN task_tags tt ON t.id = tt.task_id
        LEFT JOIN tags tag ON tt.tag_id = tag.id
        WHERE t.id = $1
        GROUP BY t.id
      `, [taskId]);

      res.json({
        message: 'Task updated successfully',
        task: {
          ...finalTaskResult.rows[0],
          tags: finalTaskResult.rows[0].tags || []
        }
      });
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle task completion
router.patch('/:id/toggle', authenticateToken, validateId, async (req, res) => {
  try {
    const taskId = req.params.id;

    // Get task and check access
    const taskResult = await pool.query('SELECT list_id, completed FROM tasks WHERE id = $1', [taskId]);
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    // Check if user has access to the list
    const listAccess = await checkListAccess(req.user.id, task.list_id);
    if (!listAccess) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    // Toggle completion
    const updateResult = await pool.query(
      'UPDATE tasks SET completed = $1 WHERE id = $2 RETURNING *',
      [!task.completed, taskId]
    );

    res.json({
      message: 'Task completion toggled successfully',
      task: updateResult.rows[0]
    });
  } catch (error) {
    console.error('Toggle task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a task
router.delete('/:id', authenticateToken, validateId, async (req, res) => {
  try {
    const taskId = req.params.id;

    // Get task and check access
    const taskResult = await pool.query('SELECT list_id FROM tasks WHERE id = $1', [taskId]);
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    // Check if user has access to the list
    const listAccess = await checkListAccess(req.user.id, task.list_id);
    if (!listAccess) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    await pool.query('DELETE FROM tasks WHERE id = $1', [taskId]);

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Subtask routes

// Create a subtask
router.post('/:taskId/subtasks', authenticateToken, validateTaskId, validateSubtask, async (req, res) => {
  try {
    const taskId = req.params.taskId;
    const { title } = req.body;

    // Get task and check access
    const taskResult = await pool.query('SELECT list_id FROM tasks WHERE id = $1', [taskId]);
    
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = taskResult.rows[0];

    // Check if user has access to the list
    const listAccess = await checkListAccess(req.user.id, task.list_id);
    if (!listAccess) {
      return res.status(404).json({ error: 'Task not found or access denied' });
    }

    const result = await pool.query(
      'INSERT INTO subtasks (task_id, title) VALUES ($1, $2) RETURNING *',
      [taskId, title]
    );

    res.status(201).json({
      message: 'Subtask created successfully',
      subtask: result.rows[0]
    });
  } catch (error) {
    console.error('Create subtask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a subtask
router.put('/subtasks/:subtaskId', authenticateToken, validateSubtaskId, validateSubtask, async (req, res) => {
  try {
    const subtaskId = req.params.subtaskId;
    const { title, completed } = req.body;

    // Get subtask and check access
    const subtaskResult = await pool.query(`
      SELECT s.*, t.list_id 
      FROM subtasks s
      JOIN tasks t ON s.task_id = t.id
      WHERE s.id = $1
    `, [subtaskId]);
    
    if (subtaskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    const subtask = subtaskResult.rows[0];

    // Check if user has access to the list
    const listAccess = await checkListAccess(req.user.id, subtask.list_id);
    if (!listAccess) {
      return res.status(404).json({ error: 'Subtask not found or access denied' });
    }

    const result = await pool.query(
      'UPDATE subtasks SET title = $1, completed = $2 WHERE id = $3 RETURNING *',
      [title, completed !== undefined ? completed : subtask.completed, subtaskId]
    );

    res.json({
      message: 'Subtask updated successfully',
      subtask: result.rows[0]
    });
  } catch (error) {
    console.error('Update subtask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle subtask completion
router.patch('/subtasks/:subtaskId/toggle', authenticateToken, validateSubtaskId, async (req, res) => {
  try {
    const subtaskId = req.params.subtaskId;

    // Get subtask and check access
    const subtaskResult = await pool.query(`
      SELECT s.*, t.list_id 
      FROM subtasks s
      JOIN tasks t ON s.task_id = t.id
      WHERE s.id = $1
    `, [subtaskId]);
    
    if (subtaskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    const subtask = subtaskResult.rows[0];

    // Check if user has access to the list
    const listAccess = await checkListAccess(req.user.id, subtask.list_id);
    if (!listAccess) {
      return res.status(404).json({ error: 'Subtask not found or access denied' });
    }

    const result = await pool.query(
      'UPDATE subtasks SET completed = $1 WHERE id = $2 RETURNING *',
      [!subtask.completed, subtaskId]
    );

    res.json({
      message: 'Subtask completion toggled successfully',
      subtask: result.rows[0]
    });
  } catch (error) {
    console.error('Toggle subtask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a subtask
router.delete('/subtasks/:subtaskId', authenticateToken, validateSubtaskId, async (req, res) => {
  try {
    const subtaskId = req.params.subtaskId;

    // Get subtask and check access
    const subtaskResult = await pool.query(`
      SELECT s.*, t.list_id 
      FROM subtasks s
      JOIN tasks t ON s.task_id = t.id
      WHERE s.id = $1
    `, [subtaskId]);
    
    if (subtaskResult.rows.length === 0) {
      return res.status(404).json({ error: 'Subtask not found' });
    }

    const subtask = subtaskResult.rows[0];

    // Check if user has access to the list
    const listAccess = await checkListAccess(req.user.id, subtask.list_id);
    if (!listAccess) {
      return res.status(404).json({ error: 'Subtask not found or access denied' });
    }

    await pool.query('DELETE FROM subtasks WHERE id = $1', [subtaskId]);

    res.json({ message: 'Subtask deleted successfully' });
  } catch (error) {
    console.error('Delete subtask error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all tags
router.get('/tags/all', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM tags ORDER BY name ASC');
    res.json({ tags: result.rows });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
