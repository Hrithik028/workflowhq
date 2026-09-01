import { ArrowDown, ArrowUp, Check, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { getErrorMessage } from "../api/client";
import type { AcceptanceCriterion, Task, WorkspaceClient } from "../types";
import { parseDescriptionAcceptanceCriteria } from "../utils/acceptanceCriteria";

interface AcceptanceCriteriaProps {
  canEdit: boolean;
  client: WorkspaceClient;
  task: Task;
}

function AcceptanceCriteria({ canEdit, client, task }: AcceptanceCriteriaProps) {
  const [criteria, setCriteria] = useState<AcceptanceCriterion[]>([]);
  const [newBody, setNewBody] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState("");
  const importCandidates = useMemo(
    () => parseDescriptionAcceptanceCriteria(task.description),
    [task.description]
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setCriteria(await client.listAcceptanceCriteria(task.id));
      setError("");
    } catch (loadError) {
      setError(getErrorMessage(loadError, "Unable to load acceptance criteria."));
    } finally {
      setIsLoading(false);
    }
  }, [client, task.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const addCriterion = async (event: FormEvent) => {
    event.preventDefault();
    const body = newBody.trim();
    if (!body || !canEdit) return;
    setIsBusy(true);
    try {
      const created = await client.createAcceptanceCriterion(task.id, { body });
      setCriteria((current) => [...current, created]);
      setNewBody("");
      setError("");
    } catch (mutationError) {
      setError(getErrorMessage(mutationError, "Unable to add that acceptance criterion."));
    } finally {
      setIsBusy(false);
    }
  };

  const updateCriterion = async (
    criterion: AcceptanceCriterion,
    body: string,
    completed: boolean
  ) => {
    setIsBusy(true);
    try {
      const updated = await client.updateAcceptanceCriterion(task.id, criterion.id, {
        body: body.trim(),
        completed
      });
      setCriteria((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingId(null);
      setError("");
    } catch (mutationError) {
      setError(getErrorMessage(mutationError, "Unable to update that acceptance criterion."));
    } finally {
      setIsBusy(false);
    }
  };

  const removeCriterion = async (criterion: AcceptanceCriterion) => {
    if (!window.confirm("Delete this acceptance criterion?")) return;
    setIsBusy(true);
    try {
      await client.deleteAcceptanceCriterion(task.id, criterion.id);
      setCriteria((current) => current.filter((item) => item.id !== criterion.id));
      setError("");
    } catch (mutationError) {
      setError(getErrorMessage(mutationError, "Unable to delete that acceptance criterion."));
    } finally {
      setIsBusy(false);
    }
  };

  const moveCriterion = async (criterionIndex: number, direction: -1 | 1) => {
    const targetIndex = criterionIndex + direction;
    if (targetIndex < 0 || targetIndex >= criteria.length) return;
    const reordered = [...criteria];
    [reordered[criterionIndex], reordered[targetIndex]] = [
      reordered[targetIndex],
      reordered[criterionIndex]
    ];
    setIsBusy(true);
    try {
      setCriteria(
        await client.reorderAcceptanceCriteria(
          task.id,
          reordered.map((item) => item.id)
        )
      );
      setError("");
    } catch (mutationError) {
      setError(getErrorMessage(mutationError, "Unable to reorder acceptance criteria."));
    } finally {
      setIsBusy(false);
    }
  };

  const importFromDescription = async () => {
    if (!canEdit || importCandidates.length === 0) return;
    setIsBusy(true);
    try {
      const imported: AcceptanceCriterion[] = [];
      for (const body of importCandidates) {
        imported.push(await client.createAcceptanceCriterion(task.id, { body }));
      }
      setCriteria(imported);
      setError("");
    } catch (mutationError) {
      setError(
        getErrorMessage(
          mutationError,
          "Some criteria could not be imported. Refresh before trying again."
        )
      );
      await load();
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) return <p className="truthful-empty-state">Loading acceptance criteria…</p>;

  return (
    <div className="acceptance-criteria-editor">
      {error ? (
        <p className="criteria-error" role="alert">
          {error}
        </p>
      ) : null}

      {criteria.length > 0 ? (
        <ul className="acceptance-list interactive">
          {criteria.map((criterion, index) => (
            <li key={criterion.id}>
              <button
                aria-label={`${criterion.completed ? "Mark incomplete" : "Mark complete"}: ${criterion.body}`}
                className={`criterion-check${criterion.completed ? " checked" : ""}`}
                disabled={isBusy || !canEdit}
                onClick={() =>
                  void updateCriterion(criterion, criterion.body, !criterion.completed)
                }
                type="button"
              >
                {criterion.completed ? <Check size={14} /> : null}
              </button>

              {editingId === criterion.id ? (
                <form
                  className="criterion-edit-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (editingBody.trim()) {
                      void updateCriterion(criterion, editingBody, criterion.completed);
                    }
                  }}
                >
                  <input
                    aria-label="Edit acceptance criterion"
                    autoFocus
                    maxLength={1000}
                    onChange={(event) => setEditingBody(event.target.value)}
                    value={editingBody}
                  />
                  <button
                    aria-label="Save criterion"
                    disabled={isBusy || !editingBody.trim()}
                    type="submit"
                  >
                    <Save size={14} />
                  </button>
                  <button
                    aria-label="Cancel editing"
                    onClick={() => setEditingId(null)}
                    type="button"
                  >
                    <X size={14} />
                  </button>
                </form>
              ) : (
                <span className={`criterion-copy${criterion.completed ? " completed" : ""}`}>
                  {criterion.body}
                </span>
              )}

              {canEdit && editingId !== criterion.id ? (
                <div className="criterion-actions">
                  <button
                    aria-label={`Move up: ${criterion.body}`}
                    disabled={isBusy || index === 0}
                    onClick={() => void moveCriterion(index, -1)}
                    type="button"
                  >
                    <ArrowUp size={13} />
                  </button>
                  <button
                    aria-label={`Move down: ${criterion.body}`}
                    disabled={isBusy || index === criteria.length - 1}
                    onClick={() => void moveCriterion(index, 1)}
                    type="button"
                  >
                    <ArrowDown size={13} />
                  </button>
                  <button
                    aria-label={`Edit: ${criterion.body}`}
                    disabled={isBusy}
                    onClick={() => {
                      setEditingId(criterion.id);
                      setEditingBody(criterion.body);
                    }}
                    type="button"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    aria-label={`Delete: ${criterion.body}`}
                    disabled={isBusy}
                    onClick={() => void removeCriterion(criterion)}
                    type="button"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="criteria-empty-state">
          <p>No acceptance criteria have been added to this issue yet.</p>
          {canEdit && importCandidates.length > 0 ? (
            <button disabled={isBusy} onClick={() => void importFromDescription()} type="button">
              Import {importCandidates.length} from description
            </button>
          ) : null}
        </div>
      )}

      {canEdit ? (
        <form className="criterion-add-form" onSubmit={addCriterion}>
          <input
            aria-label="New acceptance criterion"
            disabled={isBusy}
            maxLength={1000}
            onChange={(event) => setNewBody(event.target.value)}
            placeholder="Add a measurable acceptance criterion…"
            value={newBody}
          />
          <button disabled={isBusy || !newBody.trim()} type="submit">
            <Plus size={14} /> Add criterion
          </button>
        </form>
      ) : (
        <p className="criteria-read-only">
          Project viewers can read criteria but cannot change them.
        </p>
      )}
    </div>
  );
}

export default AcceptanceCriteria;
