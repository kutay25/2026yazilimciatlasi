import {
  EXPERIENCE_ORDER,
  ROLE_FAMILY_ORDER,
  SENIORITY_ORDER,
  type SurveyRow,
  WORK_MODE_ORDER,
} from "./data";

export type SalaryMode = "try" | "fx";
export type GeographyScope = "domestic" | "abroad" | "all";
export type AiScope = "all" | "with" | "without";

export interface FilterState {
  salaryMode: SalaryMode;
  geographyScope: GeographyScope;
  aiScope: AiScope;
  seniorities: string[];
  workModes: string[];
  roleFamilies: string[];
  sector: string;
}

export interface NumericSummary {
  count: number;
  median: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
  mean: number | null;
}

export interface AggregatedSlice extends NumericSummary {
  key: string;
  label: string;
  groupValues: Record<string, string>;
  aiShare: number;
  foreignCurrencyShare: number;
}

export interface HistogramBin {
  label: string;
  start: number;
  end: number;
  count: number;
}

export const DEFAULT_FILTERS: FilterState = {
  salaryMode: "fx",
  geographyScope: "domestic",
  aiScope: "all",
  seniorities: [...SENIORITY_ORDER],
  workModes: [...WORK_MODE_ORDER],
  roleFamilies: [...ROLE_FAMILY_ORDER],
  sector: "all",
};

export const FIELD_ACCESSORS: Record<string, (row: SurveyRow) => string | null> = {
  province: (row) => row.province,
  country: (row) => row.country,
  seniority: (row) => row.seniority,
  hasAiTools: (row) => (row.hasAiTools ? "AI kullanan" : "AI kullanmayan"),
  role: (row) => row.role,
  roleFamily: (row) => row.roleFamily,
  experience: (row) => row.experienceBand,
  workMode: (row) => row.workMode,
  companyType: (row) => row.companyType,
  companySize: (row) => row.companySize,
  gender: (row) => row.gender,
  currency: (row) => row.currency,
  raises: (row) => String(row.raisesPerYear),
};

export const BOOLEAN_ACCESSORS: Record<string, (row: SurveyRow) => boolean> = {
  hasAiTools: (row) => row.hasAiTools,
  isAbroad: (row) => row.isAbroad,
};

export function getSalaryValue(row: SurveyRow, salaryMode: SalaryMode) {
  if (salaryMode === "try") {
    return row.currency === "TRY" ? row.salaryMid : null;
  }
  return row.salaryTryReference;
}

export function quantile(values: number[], q: number) {
  if (!values.length) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const current = sorted[base];
  const next = sorted[base + 1];
  return next === undefined ? current : current + rest * (next - current);
}

export function summarizeValues(values: number[]): NumericSummary {
  if (!values.length) {
    return {
      count: 0,
      median: null,
      p25: null,
      p75: null,
      min: null,
      max: null,
      mean: null,
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    median: quantile(sorted, 0.5),
    p25: quantile(sorted, 0.25),
    p75: quantile(sorted, 0.75),
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: total / sorted.length,
  };
}

export function applyFilters(rows: SurveyRow[], filters: FilterState) {
  return rows.filter((row) => {
    if (filters.salaryMode === "try" && row.currency !== "TRY") {
      return false;
    }
    if (filters.geographyScope === "domestic" && row.isAbroad) {
      return false;
    }
    if (filters.geographyScope === "abroad" && !row.isAbroad) {
      return false;
    }
    if (!filters.seniorities.includes(row.seniority)) {
      return false;
    }
    if (!filters.workModes.includes(row.workMode)) {
      return false;
    }
    if (!filters.roleFamilies.includes(row.roleFamily)) {
      return false;
    }
    if (filters.sector !== "all" && row.companyType !== filters.sector) {
      return false;
    }
    if (filters.aiScope === "with" && !row.hasAiTools) {
      return false;
    }
    if (filters.aiScope === "without" && row.hasAiTools) {
      return false;
    }
    return true;
  });
}

function buildGroupKey(groupValues: Record<string, string>) {
  return Object.values(groupValues).join(" · ");
}

export function aggregateRows(
  rows: SurveyRow[],
  groupFields: string[],
  salaryMode: SalaryMode,
  minCount = 1,
) {
  const groups = new Map<
    string,
    {
      groupValues: Record<string, string>;
      members: SurveyRow[];
      values: number[];
    }
  >();

  for (const row of rows) {
    const groupValues = Object.fromEntries(
      groupFields.map((field) => [field, FIELD_ACCESSORS[field]?.(row) ?? "—"]),
    );
    const key = buildGroupKey(groupValues);
    if (!groups.has(key)) {
      groups.set(key, { groupValues, members: [], values: [] });
    }
    const group = groups.get(key)!;
    group.members.push(row);
    const salaryValue = getSalaryValue(row, salaryMode);
    if (salaryValue !== null) {
      group.values.push(salaryValue);
    }
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const summary = summarizeValues(group.values);
      return {
        key,
        label: key,
        groupValues: group.groupValues,
        aiShare:
          group.members.filter((member) => member.hasAiTools).length / Math.max(group.members.length, 1),
        foreignCurrencyShare:
          group.members.filter((member) => member.currency !== "TRY").length /
          Math.max(group.members.length, 1),
        ...summary,
      } satisfies AggregatedSlice;
    })
    .filter((entry) => entry.count >= minCount)
    .sort((a, b) => {
      if ((b.median ?? -Infinity) === (a.median ?? -Infinity)) {
        return b.count - a.count;
      }
      return (b.median ?? -Infinity) - (a.median ?? -Infinity);
    });
}

function niceStep(roughStep: number) {
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const residual = roughStep / magnitude;
  if (residual >= 5) {
    return 5 * magnitude;
  }
  if (residual >= 2) {
    return 2 * magnitude;
  }
  return magnitude;
}

export function buildHistogram(rows: SurveyRow[], salaryMode: SalaryMode, bins = 18) {
  const values = rows
    .map((row) => getSalaryValue(row, salaryMode))
    .filter((value): value is number => value !== null);

  if (!values.length) {
    return [] as HistogramBin[];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = niceStep((max - min) / bins || 1);
  const start = Math.floor(min / step) * step;
  const bucketCount = Math.max(1, Math.ceil((max - start) / step));
  const histogram = Array.from({ length: bucketCount }, (_, index) => ({
    start: start + index * step,
    end: start + (index + 1) * step,
    count: 0,
  }));

  for (const value of values) {
    const bucketIndex = Math.min(
      histogram.length - 1,
      Math.max(0, Math.floor((value - start) / step)),
    );
    histogram[bucketIndex].count += 1;
  }

  return histogram.map((bucket) => ({
    ...bucket,
    label: `${Math.round(bucket.start / 1000)}k - ${Math.round(bucket.end / 1000)}k`,
  }));
}

export function buildTechnologyStats(rows: SurveyRow[], salaryMode: SalaryMode, minCount = 25) {
  const groups = new Map<string, { values: number[]; count: number; isAiTool: boolean }>();
  for (const row of rows) {
    const salaryValue = getSalaryValue(row, salaryMode);
    for (const tag of row.technologies) {
      if (!groups.has(tag)) {
        groups.set(tag, { values: [], count: 0, isAiTool: tag.startsWith("AI Model:") });
      }
      const group = groups.get(tag)!;
      group.count += 1;
      if (salaryValue !== null) {
        group.values.push(salaryValue);
      }
    }
  }

  return [...groups.entries()]
    .map(([tag, group]) => {
      const { count: _valueCount, ...summary } = summarizeValues(group.values);
      return {
        tag,
        count: group.count,
        isAiTool: group.isAiTool,
        ...summary,
      };
    })
    .filter((entry) => entry.count >= minCount)
    .sort((a, b) => b.count - a.count || (b.median ?? -Infinity) - (a.median ?? -Infinity));
}

export function buildProvinceStats(rows: SurveyRow[], salaryMode: SalaryMode, minCount = 1) {
  return aggregateRows(
    rows.filter((row) => row.province),
    ["province"],
    salaryMode,
    minCount,
  );
}

export function buildKpis(rows: SurveyRow[], salaryMode: SalaryMode) {
  const salaryValues = rows
    .map((row) => getSalaryValue(row, salaryMode))
    .filter((value): value is number => value !== null);
  const summary = summarizeValues(salaryValues);

  return {
    ...summary,
    provinceCount: new Set(rows.map((row) => row.province).filter(Boolean)).size,
    roleFamilyCount: new Set(rows.map((row) => row.roleFamily)).size,
    aiAdoptionShare:
      rows.filter((row) => row.hasAiTools).length / Math.max(rows.length, 1),
    foreignCurrencyShare:
      rows.filter((row) => row.currency !== "TRY").length / Math.max(rows.length, 1),
  };
}

export function uniqueValues(rows: SurveyRow[], accessor: (row: SurveyRow) => string) {
  return [...new Set(rows.map(accessor))].sort((a, b) => a.localeCompare(b, "tr"));
}

export function sortByConfiguredOrder(values: string[], configuredOrder: string[]) {
  return [...values].sort((left, right) => {
    const leftIndex = configuredOrder.indexOf(left);
    const rightIndex = configuredOrder.indexOf(right);
    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right, "tr");
    }
    if (leftIndex === -1) {
      return 1;
    }
    if (rightIndex === -1) {
      return -1;
    }
    return leftIndex - rightIndex;
  });
}

export function buildOrderedHeatmapAxes(entries: Array<{ rowKey: string; columnKey: string }>) {
  const rows = sortByConfiguredOrder(
    [...new Set(entries.map((entry) => entry.rowKey))],
    ROLE_FAMILY_ORDER,
  );
  const columns = sortByConfiguredOrder(
    [...new Set(entries.map((entry) => entry.columnKey))],
    [...SENIORITY_ORDER, ...EXPERIENCE_ORDER, ...WORK_MODE_ORDER],
  );
  return { rows, columns };
}
