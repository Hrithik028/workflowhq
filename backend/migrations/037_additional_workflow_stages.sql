-- Stage identity is separate from the three reporting/automation categories.
ALTER TABLE project_status_labels DROP CONSTRAINT project_status_labels_status_check;
ALTER TABLE project_status_labels ADD COLUMN category VARCHAR(20);
UPDATE project_status_labels SET category = status;
ALTER TABLE project_status_labels ALTER COLUMN category SET NOT NULL;
ALTER TABLE project_status_labels ADD CONSTRAINT workflow_stage_category_check CHECK(category IN ('todo','in_progress','completed'));
ALTER TABLE project_status_labels ADD COLUMN position INTEGER NOT NULL DEFAULT 0;
UPDATE project_status_labels SET position = CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END;
CREATE UNIQUE INDEX workflow_stage_category_identity ON project_status_labels(project_id,status,category);
ALTER TABLE project_status_transitions DROP CONSTRAINT project_status_transitions_from_status_check;
ALTER TABLE project_status_transitions DROP CONSTRAINT project_status_transitions_to_status_check;
ALTER TABLE project_status_transitions ADD CONSTRAINT workflow_transition_source_fk FOREIGN KEY(project_id,from_status) REFERENCES project_status_labels(project_id,status) ON DELETE CASCADE;
ALTER TABLE project_status_transitions ADD CONSTRAINT workflow_transition_target_fk FOREIGN KEY(project_id,to_status) REFERENCES project_status_labels(project_id,status) ON DELETE CASCADE;
ALTER TABLE tasks ADD COLUMN workflow_stage VARCHAR(30) NOT NULL DEFAULT 'todo';
UPDATE tasks SET workflow_stage = status;
ALTER TABLE tasks ADD CONSTRAINT task_workflow_stage_fk FOREIGN KEY(project_id,workflow_stage,status) REFERENCES project_status_labels(project_id,status,category);
ALTER TABLE tasks ADD CONSTRAINT inbox_canonical_stage_check CHECK(project_id IS NOT NULL OR workflow_stage = status);
