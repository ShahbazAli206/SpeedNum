"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { ExportMenu } from "@/components/dashboard/export-menu";
import { EmptyState, Pagination, Select } from "@/components/ui";
import { cn } from "@/lib/cn";
import { useSpreadsheetExport } from "@/lib/spreadsheet-export";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  /** Cell renderer. */
  cell: (row: T) => ReactNode;
  /** Comparable value; omit to make the column unsortable. */
  sortValue?: (row: T) => string | number;
  /**
   * Value written to CSV/Excel exports. Preferred over `sortValue` there,
   * since a sort key isn't always the human-readable form (e.g. a raw
   * timestamp used to sort a "3 days ago" cell). Falls back to `sortValue`,
   * then an empty cell, when omitted.
   */
  exportValue?: (row: T) => string | number;
  className?: string;
}

export interface FilterSpec<T> {
  label: string;
  options: { value: string; label: string }[];
  /** Return true to keep the row. `value` is never the "all" sentinel. */
  predicate: (row: T, value: string) => boolean;
}

const PAGE_SIZE = 8;

/**
 * Search + filter + sort + paginate over a client-side array.
 *
 * Deliberately not virtualised: the portal's lists are tens of rows, and a
 * plain table keeps the markup accessible and the sort state trivial.
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  searchKeys,
  searchPlaceholder = "Search…",
  filters = [],
  emptyTitle,
  emptyDescription,
  onRowClick,
  exportName,
}: {
  rows: T[];
  columns: Column<T>[];
  /** Fields concatenated for the search box. */
  searchKeys: (row: T) => string;
  searchPlaceholder?: string;
  filters?: FilterSpec<T>[];
  emptyTitle: string;
  emptyDescription: string;
  onRowClick?: (row: T) => void;
  /** Enables the CSV download button; used as the file name stem. */
  exportName?: string;
}) {
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    let result = rows;

    if (term) {
      result = result.filter((row) => searchKeys(row).toLowerCase().includes(term));
    }

    for (const filter of filters) {
      const value = filterValues[filter.label];
      if (!value || value === "all") continue;
      result = result.filter((row) => filter.predicate(row, value));
    }

    if (sort) {
      const column = columns.find((entry) => entry.key === sort.key);
      if (column?.sortValue) {
        const factor = sort.direction === "asc" ? 1 : -1;
        result = [...result].sort((a, b) => {
          const left = column.sortValue!(a);
          const right = column.sortValue!(b);
          if (typeof left === "number" && typeof right === "number") {
            return (left - right) * factor;
          }
          return String(left).localeCompare(String(right)) * factor;
        });
      }
    }

    return result;
  }, [rows, query, filterValues, filters, sort, columns, searchKeys]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (key: string) => {
    setPage(1);
    setSort((current) => {
      if (current?.key !== key) return { key, direction: "asc" };
      if (current.direction === "asc") return { key, direction: "desc" };
      return null;
    });
  };

  // Read exportValue (falling back to sortValue) so the file carries raw
  // values rather than the rendered React nodes.
  const { exportCsv, exportXlsx, exportPdf, exporting } = useSpreadsheetExport(
    filtered,
    useMemo(
      () =>
        columns.map((column) => ({
          header: column.header,
          value: (row: T) =>
            column.exportValue ? column.exportValue(row) : column.sortValue ? column.sortValue(row) : "",
        })),
      [columns],
    ),
    exportName ?? "export",
  );

  return (
    <div>
      {/* One filter row above the table, never per-column */}
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-5 py-3.5">
        <div className="relative min-w-52 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
            aria-label="Search rows"
            className="h-9 w-full rounded-lg border border-line bg-surface pr-3 pl-9 text-[13.5px] text-ink transition placeholder:text-muted/70 focus:border-brand"
          />
        </div>

        {filters.map((filter) => (
          <Select
            key={filter.label}
            aria-label={filter.label}
            value={filterValues[filter.label] ?? "all"}
            onValueChange={(value) => {
              setFilterValues((current) => ({ ...current, [filter.label]: value }));
              setPage(1);
            }}
            fullWidth={false}
            className="min-w-36 shrink-0"
            options={[
              { value: "all", label: `All ${filter.label.toLowerCase()}` },
              ...filter.options,
            ]}
          />
        ))}

        {exportName ? (
          <ExportMenu
            exportCsv={exportCsv}
            exportXlsx={exportXlsx}
            exportPdf={exportPdf}
            exporting={exporting}
          />
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-line">
                {columns.map((column) => {
                  const sorted = sort?.key === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        sorted ? (sort.direction === "asc" ? "ascending" : "descending") : "none"
                      }
                      className={cn(
                        "px-5 py-2.5 text-[11.5px] font-semibold tracking-wide text-muted uppercase",
                        column.align === "right" ? "text-right" : "text-left",
                      )}
                    >
                      {column.sortValue ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(column.key)}
                          className={cn(
                            "inline-flex items-center gap-1 transition hover:text-ink",
                            column.align === "right" && "flex-row-reverse",
                            sorted && "text-ink",
                          )}
                        >
                          {column.header}
                          {sorted ? (
                            sort.direction === "asc" ? (
                              <ArrowUp className="size-3" />
                            ) : (
                              <ArrowDown className="size-3" />
                            )
                          ) : (
                            <ChevronsUpDown className="size-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (event) => {
                          if (event.key === "Enter") onRowClick(row);
                        }
                      : undefined
                  }
                  className={cn(
                    "border-b border-line last:border-b-0",
                    onRowClick && "cursor-pointer transition hover:bg-surface-2",
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-5 py-3 text-ink-soft",
                        column.align === "right" && "text-right tabular-nums",
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={safePage}
        pageCount={pageCount}
        onPage={setPage}
        summary={
          filtered.length === rows.length
            ? `Showing ${visible.length} of ${rows.length}`
            : `Showing ${visible.length} of ${filtered.length} filtered (${rows.length} total)`
        }
      />
    </div>
  );
}
