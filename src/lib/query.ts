import {
  BOOLEAN_ACCESSORS,
  FIELD_ACCESSORS,
  aggregateRows,
  getSalaryValue,
  type SalaryMode,
} from "./analytics";
import type { SurveyRow } from "./data";

type QueryMetricKind = "count" | "median" | "mean" | "p25" | "p75" | "max" | "min" | "share";

interface QueryFilter {
  field: string;
  operator: "=" | "!=" | "~" | "in";
  values: string[];
}

interface QueryMetric {
  id: string;
  kind: QueryMetricKind;
  target: string | null;
  label: string;
}

export interface ParsedQuery {
  filters: QueryFilter[];
  groupFields: string[];
  metrics: QueryMetric[];
  sortField: string;
  sortDirection: "asc" | "desc";
  limit: number;
  minCount: number;
}

export interface QueryExecutionResult {
  parsed: ParsedQuery;
  rows: Array<Record<string, string | number | null>>;
  groupFields: string[];
  metricFields: string[];
}

function normalizeField(field: string) {
  return field.trim();
}

function parseFilter(term: string): QueryFilter {
  const inMatch = term.match(/^([A-Za-z0-9_]+)\s+in\s*\((.+)\)$/i);
  if (inMatch) {
    return {
      field: normalizeField(inMatch[1]),
      operator: "in",
      values: inMatch[2]
        .split(/[;,]/)
        .map((value) => value.trim())
        .filter(Boolean),
    };
  }

  const containsMatch = term.match(/^([A-Za-z0-9_]+)\s*~\s*(.+)$/);
  if (containsMatch) {
    return {
      field: normalizeField(containsMatch[1]),
      operator: "~",
      values: [containsMatch[2].trim()],
    };
  }

  const inequalityMatch = term.match(/^([A-Za-z0-9_]+)\s*!=\s*(.+)$/);
  if (inequalityMatch) {
    return {
      field: normalizeField(inequalityMatch[1]),
      operator: "!=",
      values: [inequalityMatch[2].trim()],
    };
  }

  const equalityMatch = term.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
  if (equalityMatch) {
    return {
      field: normalizeField(equalityMatch[1]),
      operator: "=",
      values: [equalityMatch[2].trim()],
    };
  }

  throw new Error(`Filtre anlasilmadi: "${term}"`);
}

function parseMetric(token: string): QueryMetric {
  const cleaned = token.trim();
  if (/^count\(\)$/i.test(cleaned)) {
    return {
      id: "count",
      kind: "count",
      target: null,
      label: "count",
    };
  }

  const numericMatch = cleaned.match(/^(median|mean|p25|p75|max|min)\(salary\)$/i);
  if (numericMatch) {
    const kind = numericMatch[1].toLowerCase() as QueryMetricKind;
    return {
      id: `${kind}_salary`,
      kind,
      target: "salary",
      label: `${kind}_salary`,
    };
  }

  const shareMatch = cleaned.match(/^share\(([A-Za-z0-9_]+)\)$/i);
  if (shareMatch) {
    const target = normalizeField(shareMatch[1]);
    return {
      id: `share_${target}`,
      kind: "share",
      target,
      label: `share_${target}`,
    };
  }

  throw new Error(`Metrik anlasilmadi: "${token}"`);
}

export function parseQuery(query: string): ParsedQuery {
  const parts = query
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  const parsed: ParsedQuery = {
    filters: [],
    groupFields: [],
    metrics: [
      {
        id: "count",
        kind: "count",
        target: null,
        label: "count",
      },
    ],
    sortField: "count",
    sortDirection: "desc",
    limit: 12,
    minCount: 1,
  };

  for (const part of parts) {
    if (part.startsWith("filter ")) {
      parsed.filters = part
        .slice("filter ".length)
        .split("&")
        .map((term) => term.trim())
        .filter(Boolean)
        .map(parseFilter);
      continue;
    }
    if (part.startsWith("group ")) {
      parsed.groupFields = part
        .slice("group ".length)
        .split(",")
        .map((field) => normalizeField(field))
        .filter(Boolean);
      continue;
    }
    if (part.startsWith("metric ")) {
      parsed.metrics = part
        .slice("metric ".length)
        .split(",")
        .map((metric) => parseMetric(metric));
      continue;
    }
    if (part.startsWith("sort ")) {
      const directive = part.slice("sort ".length).trim();
      parsed.sortDirection = directive.startsWith("-") ? "desc" : "asc";
      parsed.sortField = directive.replace(/^[-+]/, "").trim();
      continue;
    }
    if (part.startsWith("limit ")) {
      parsed.limit = Number.parseInt(part.slice("limit ".length).trim(), 10);
      continue;
    }
    if (part.startsWith("min_count ")) {
      parsed.minCount = Number.parseInt(part.slice("min_count ".length).trim(), 10);
      continue;
    }

    throw new Error(`Bolum anlasilmadi: "${part}"`);
  }

  return parsed;
}

function matchesFilter(row: SurveyRow, filter: QueryFilter) {
  const fieldAccessor = FIELD_ACCESSORS[filter.field];
  const booleanAccessor = BOOLEAN_ACCESSORS[filter.field];
  const rawValue = fieldAccessor
    ? fieldAccessor(row)
    : booleanAccessor
      ? String(booleanAccessor(row))
      : null;

  if (rawValue === null) {
    return false;
  }

  const value = rawValue.toLowerCase();
  const filterValues = filter.values.map((item) => item.toLowerCase());

  if (filter.operator === "=") {
    return value === filterValues[0];
  }
  if (filter.operator === "!=") {
    return value !== filterValues[0];
  }
  if (filter.operator === "~") {
    return value.includes(filterValues[0]);
  }
  if (filter.operator === "in") {
    return filterValues.includes(value);
  }

  return false;
}

function computeMetric(
  metric: QueryMetric,
  rows: SurveyRow[],
  salaryMode: SalaryMode,
  aggregatedValue: Record<string, number | string | null>,
) {
  if (metric.kind === "count") {
    return rows.length;
  }

  if (metric.kind === "share") {
    const accessor = BOOLEAN_ACCESSORS[metric.target ?? ""];
    if (!accessor) {
      throw new Error(`share() hedefi desteklenmiyor: ${metric.target}`);
    }
    return rows.filter(accessor).length / Math.max(rows.length, 1);
  }

  if (metric.target !== "salary") {
    throw new Error(`Metrik hedefi desteklenmiyor: ${metric.target}`);
  }

  const value = aggregatedValue[metric.label];
  return typeof value === "number" ? value : null;
}

export function executeQuery(
  rows: SurveyRow[],
  query: string,
  options: { salaryMode: SalaryMode },
): QueryExecutionResult {
  const parsed = parseQuery(query);
  const filteredRows = rows.filter((row) => parsed.filters.every((filter) => matchesFilter(row, filter)));
  const groupedRows = parsed.groupFields.length
    ? aggregateRows(filteredRows, parsed.groupFields, options.salaryMode, parsed.minCount)
    : [
        {
          key: "All",
          label: "All",
          groupValues: {},
          count: filteredRows.length,
          median: null,
          p25: null,
          p75: null,
          min: null,
          max: null,
          mean: null,
          aiShare:
            filteredRows.filter((row) => row.hasAiTools).length / Math.max(filteredRows.length, 1),
          foreignCurrencyShare:
            filteredRows.filter((row) => row.currency !== "TRY").length / Math.max(filteredRows.length, 1),
        },
      ];

  const rowsWithMetrics = groupedRows.map((group) => {
    const groupMembers = parsed.groupFields.length
      ? filteredRows.filter((row) =>
          parsed.groupFields.every((field) => FIELD_ACCESSORS[field]?.(row) === group.groupValues[field]),
        )
      : filteredRows;

    const record: Record<string, string | number | null> = { label: group.label };
    for (const field of parsed.groupFields) {
      record[field] = group.groupValues[field];
    }
    record.count = groupMembers.length;
    record.median_salary = group.median;
    record.mean_salary = group.mean;
    record.p25_salary = group.p25;
    record.p75_salary = group.p75;
    record.max_salary = group.max;
    record.min_salary = group.min;
    record.share_hasAiTools = group.aiShare;
    record.share_foreignCurrency = group.foreignCurrencyShare;

    for (const metric of parsed.metrics) {
      record[metric.label] = computeMetric(metric, groupMembers, options.salaryMode, record);
    }

    return record;
  });

  const sortedRows = rowsWithMetrics.sort((left, right) => {
    const leftValue = left[parsed.sortField];
    const rightValue = right[parsed.sortField];
    const leftNumeric = typeof leftValue === "number" ? leftValue : -Infinity;
    const rightNumeric = typeof rightValue === "number" ? rightValue : -Infinity;
    if (parsed.sortDirection === "desc") {
      return rightNumeric - leftNumeric;
    }
    return leftNumeric - rightNumeric;
  });

  return {
    parsed,
    rows: sortedRows.slice(0, parsed.limit),
    groupFields: parsed.groupFields,
    metricFields: parsed.metrics.map((metric) => metric.label),
  };
}
