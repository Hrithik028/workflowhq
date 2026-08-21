import { ArrowUpDown, Search, SlidersHorizontal, X } from "lucide-react";

import type { Project, TaskPriority } from "../types";

export interface Filters {
  search: string;
  projectId: string;
  priority: "" | TaskPriority;
  sort: "updated_at" | "due_date" | "priority" | "title";
}

interface FilterBarProps {
  filters: Filters;
  projects: Project[];
  onChange: (filters: Filters) => void;
}

function FilterBar({ filters, projects, onChange }: FilterBarProps) {
  const hasFilters = filters.search || filters.projectId || filters.priority;
  return (
    <div className="filter-bar">
      <label className="search-field">
        <Search size={17} />
        <span className="sr-only">Search tasks</span>
        <input
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder="Search tasks…"
          value={filters.search}
        />
      </label>
      <label className="filter-select">
        <SlidersHorizontal size={16} />
        <span className="sr-only">Filter by project</span>
        <select
          onChange={(event) => onChange({ ...filters, projectId: event.target.value })}
          value={filters.projectId}
        >
          <option value="">All projects</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <label className="filter-select">
        <span className="priority-filter-dot" />
        <span className="sr-only">Filter by priority</span>
        <select
          onChange={(event) =>
            onChange({ ...filters, priority: event.target.value as Filters["priority"] })
          }
          value={filters.priority}
        >
          <option value="">All priorities</option>
          <option value="high">High priority</option>
          <option value="medium">Medium priority</option>
          <option value="low">Low priority</option>
        </select>
      </label>
      <label className="filter-select sort-select">
        <ArrowUpDown size={16} />
        <span className="sr-only">Sort tasks</span>
        <select
          onChange={(event) =>
            onChange({ ...filters, sort: event.target.value as Filters["sort"] })
          }
          value={filters.sort}
        >
          <option value="updated_at">Recently updated</option>
          <option value="due_date">Due date</option>
          <option value="priority">Priority</option>
          <option value="title">Task name</option>
        </select>
      </label>
      {hasFilters ? (
        <button
          className="clear-filters"
          type="button"
          onClick={() => onChange({ search: "", projectId: "", priority: "", sort: filters.sort })}
        >
          <X size={15} /> Clear
        </button>
      ) : null}
    </div>
  );
}

export default FilterBar;
