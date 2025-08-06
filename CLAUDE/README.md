# CLAUDE Memory Organization

This directory contains dynamic context files for Claude Code sessions.

## Structure

- `current-task.md` - Current active work/task context that gets imported into main CLAUDE.md
- `[task-name].md` - Specific task contexts for different workstreams

## Usage

### For Current Work
1. Update `current-task.md` with your active task context
2. Include current branch, specific goals, blockers, and progress
3. This gets automatically imported into the main CLAUDE.md file

### For Specific Tasks/Projects
Create individual files like:
- `streaming-refactor.md` - Streaming system work
- `ui-improvements.md` - Frontend enhancements  
- `performance-optimization.md` - Performance work

### Best Practices
- Keep files focused and specific
- Update current-task.md when switching focus
- Archive completed tasks by renaming (e.g., `streaming-refactor-DONE.md`)
- Use clear headings and bullet points
- Include relevant file paths and line numbers

## File Lifecycle
1. Create new task file or update current-task.md
2. Work on task, updating context as needed
3. When switching tasks, update current-task.md to point to new work
4. Archive completed tasks

This keeps the main CLAUDE.md stable while allowing dynamic task context.