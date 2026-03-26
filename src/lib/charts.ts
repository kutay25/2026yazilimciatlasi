import type { EChartsOption } from "echarts";
import {
  formatInteger,
  formatMoney,
  formatPercent,
  formatQueryFieldLabel,
  formatRoleFamilyLabel,
  formatRoleFamilyShortLabel,
  formatSeniorityLabel,
  formatSeniorityShortLabel,
  formatWorkModeLabel,
  formatWorkModeShortLabel,
} from "./data";

const CHART_COLORS = {
  ink: "#163245",
  teal: "#0f766e",
  tealSoft: "#8ad2c4",
  copper: "#c46e3d",
  amber: "#efb64d",
  rose: "#c94f4f",
  sand: "#efe4cf",
  paper: "#f7f1e8",
};

function buildEmptyOption(message: string): EChartsOption {
  return {
    animation: false,
    xAxis: { show: false, type: "value" },
    yAxis: { show: false, type: "value" },
    series: [],
    graphic: {
      type: "text",
      left: "center",
      top: "middle",
      style: {
        text: message,
        fill: "#5a7384",
        font: '500 14px "IBM Plex Sans", sans-serif',
      },
    },
  };
}

function buildSparseOption(title: string, message: string): EChartsOption {
  return {
    ...buildEmptyOption(message),
    graphic: [
      {
        type: "text",
        left: "center",
        top: "42%",
        style: {
          text: title,
          fill: "#163245",
          font: '700 18px "Space Grotesk", sans-serif',
        },
      },
      {
        type: "text",
        left: "center",
        top: "54%",
        style: {
          text: message,
          fill: "#5a7384",
          font: '500 14px "IBM Plex Sans", sans-serif',
          width: 280,
        },
      },
    ],
  };
}

function normalizeVisualRange(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  if (min === max) {
    return { min, max: min + 1 };
  }
  return { min, max };
}

function axisLabelStyle() {
  return {
    color: "#111111",
    fontSize: 11,
  };
}

function tooltipBase() {
  return {
    backgroundColor: "rgba(10, 28, 40, 0.92)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    textStyle: {
      color: "#f5ede2",
      fontSize: 12,
      lineHeight: 18,
    },
  };
}

function formatScopeLabel(salaryMode: "try" | "fx") {
  return salaryMode === "fx" ? "referans TRY karşılığı" : "doğrudan TRY yanıtları";
}

function tooltipRows(title: string, rows: string[]) {
  return [title, ...rows].join("<br/>");
}

function formatAxisCategory(value: string, short = false) {
  const roleLabel = short ? formatRoleFamilyShortLabel(value) : formatRoleFamilyLabel(value);
  if (roleLabel !== value) {
    return roleLabel;
  }
  const workModeLabel = short ? formatWorkModeShortLabel(value) : formatWorkModeLabel(value);
  if (workModeLabel !== value) {
    return workModeLabel;
  }
  const seniorityLabel = short ? formatSeniorityShortLabel(value) : formatSeniorityLabel(value);
  if (seniorityLabel !== value) {
    return seniorityLabel;
  }
  return value;
}

function formatHeatmapLabel(params: any) {
  const value = params.data?.[2];
  return typeof value === "number" ? `${Math.round(value / 1000)}k` : "—";
}

function formatHeatmapLabelRich(
  params: any,
  visualRange: { min: number; max: number },
) {
  const value = params.data?.[2];
  if (typeof value !== "number") {
    return "{light|—}";
  }

  const threshold = visualRange.min + (visualRange.max - visualRange.min) * 0.62;
  const tone = value >= threshold ? "light" : "dark";
  return `{${tone}|${formatHeatmapLabel(params)}}`;
}

export function buildHistogramOption(
  histogram: Array<{ label: string; count: number }>,
  context: { salaryMode: "try" | "fx" },
): EChartsOption {
  if (!histogram.length) {
    return buildSparseOption(
      "Dağılım gösterilemiyor",
      "Bu filtrelerde ücret dağılımı çıkaracak yeterli gözlem bulunamadı.",
    );
  }
  return {
    color: [CHART_COLORS.teal],
    tooltip: {
      ...tooltipBase(),
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: any) => {
        const item = histogram[params[0].dataIndex];
        return tooltipRows(item.label, [
          `Örneklem: ${formatInteger(item.count)}`,
          `Kapsam: Aktif filtre kesiti`,
          `Ücret türü: ${formatScopeLabel(context.salaryMode)}`,
        ]);
      },
    },
    grid: { left: 16, right: 12, bottom: 64, top: 20, containLabel: true },
    xAxis: {
      type: "category",
      data: histogram.map((item) => item.label),
      axisLine: { lineStyle: { color: "#cbbda8" } },
      axisLabel: {
        ...axisLabelStyle(),
        interval: Math.max(0, Math.floor(histogram.length / 6)),
        rotate: 18,
        hideOverlap: true,
      },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "rgba(22, 50, 69, 0.1)" } },
      axisLabel: axisLabelStyle(),
    },
    series: [
      {
        type: "bar",
        data: histogram.map((item) => item.count),
        itemStyle: {
          borderRadius: [6, 6, 0, 0],
          color: CHART_COLORS.teal,
        },
      },
    ],
  };
}

export function buildBarOption(
  items: Array<{ label: string; value: number | null; count?: number }>,
  config: {
    color?: string;
    horizontal?: boolean;
    valueFormatter?: (value: number | null) => string;
    salaryMode?: "try" | "fx";
    metricLabel?: string;
    metricHelp?: string;
    categoryLabelFormatter?: (value: string) => string;
  },
): EChartsOption {
  if (!items.length) {
    return buildSparseOption(
      "Karşılaştırma gösterilemiyor",
      "Bu filtrelerde güvenilir bir karşılaştırma üretmek için yeterli örneklem yok.",
    );
  }
  const horizontal = config.horizontal ?? true;
  const formatter = config.valueFormatter ?? formatMoney;
  const values = items.map((item) => item.value ?? 0);
  const categories = items.map((item) =>
    config.categoryLabelFormatter ? config.categoryLabelFormatter(item.label) : item.label,
  );
  return {
    color: [config.color ?? CHART_COLORS.copper],
    tooltip: {
      ...tooltipBase(),
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: any) => {
        const item = items[params[0].dataIndex];
        const rows = [
          `${config.metricLabel ?? "Değer"}: ${formatter(item.value)}`,
          `Örneklem: ${formatInteger(item.count ?? 0)}`,
          `Kapsam: Aktif filtre kesiti`,
        ];
        if (config.salaryMode) {
          rows.push(`Ücret türü: ${formatScopeLabel(config.salaryMode)}`);
        }
        if (config.metricHelp) {
          rows.push(`Not: ${config.metricHelp}`);
        }
        return tooltipRows(item.label, rows);
      },
    },
    grid: { left: 16, right: 16, top: 20, bottom: 16, containLabel: true },
    xAxis: horizontal
      ? {
          type: "value",
          splitLine: { lineStyle: { color: "rgba(22, 50, 69, 0.1)" } },
          axisLabel: axisLabelStyle(),
        }
      : {
          type: "category",
          data: categories,
          axisLabel: {
            ...axisLabelStyle(),
            interval: 0,
            rotate: 24,
          },
          axisLine: { lineStyle: { color: "#cbbda8" } },
        },
    yAxis: horizontal
      ? {
          type: "category",
          data: categories,
          axisLabel: axisLabelStyle(),
          axisLine: { show: false },
          axisTick: { show: false },
        }
      : {
          type: "value",
          splitLine: { lineStyle: { color: "rgba(22, 50, 69, 0.1)" } },
          axisLabel: axisLabelStyle(),
        },
    series: [
      {
        type: "bar",
        data: values,
        itemStyle: {
          borderRadius: horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0],
          color: config.color ?? CHART_COLORS.copper,
        },
      },
    ],
  };
}

export function buildLineOption(
  items: Array<{ label: string; value: number | null; count?: number }>,
  formatter: (value: number | null) => string = formatMoney,
  context?: {
    salaryMode?: "try" | "fx";
    metricLabel?: string;
    metricHelp?: string;
    labelFormatter?: (value: string) => string;
  },
): EChartsOption {
  if (!items.length) {
    return buildSparseOption(
      "Eğri gösterilemiyor",
      "Bu filtrelerde düzenli bir eğri çıkaracak kadar veri bulunamadı.",
    );
  }
  return {
    color: [CHART_COLORS.ink],
    tooltip: {
      ...tooltipBase(),
      trigger: "axis",
      formatter: (params: any) => {
        const item = items[params[0].dataIndex];
        const rows = [
          `${context?.metricLabel ?? "Değer"}: ${formatter(item.value)}`,
          `Örneklem: ${formatInteger(item.count ?? 0)}`,
          `Kapsam: Aktif filtre kesiti`,
        ];
        if (context?.salaryMode) {
          rows.push(`Ücret türü: ${formatScopeLabel(context.salaryMode)}`);
        }
        if (context?.metricHelp) {
          rows.push(`Not: ${context.metricHelp}`);
        }
        return tooltipRows(item.label, rows);
      },
    },
    grid: { left: 16, right: 12, top: 20, bottom: 24, containLabel: true },
    xAxis: {
      type: "category",
      data: items.map((item) =>
        context?.labelFormatter ? context.labelFormatter(item.label) : item.label,
      ),
      axisLine: { lineStyle: { color: "#cbbda8" } },
      axisLabel: axisLabelStyle(),
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "rgba(22, 50, 69, 0.1)" } },
      axisLabel: axisLabelStyle(),
    },
    series: [
      {
        type: "line",
        smooth: true,
        data: items.map((item) => item.value),
        symbolSize: 8,
        lineStyle: { width: 3 },
        itemStyle: { color: CHART_COLORS.ink },
        areaStyle: {
          color: "rgba(15, 118, 110, 0.14)",
        },
      },
    ],
  };
}

export function buildHeatmapOption(
  entries: Array<{ rowKey: string; columnKey: string; median: number | null; count: number }>,
  rows: string[],
  columns: string[],
  context: {
    salaryMode: "try" | "fx";
    rowLabel?: string;
    columnLabel?: string;
    minCount?: number;
  },
): EChartsOption {
  if (!entries.length || !rows.length || !columns.length) {
    return buildSparseOption(
      "Isı haritası gösterilemiyor",
      "Bu kombinasyonda hücreleri karşılaştırmak için yeterli örneklem yok. Daha geniş filtrelerle tekrar deneyin.",
    );
  }
  const medians = entries.map((entry) => entry.median ?? 0);
  const visualRange = normalizeVisualRange(medians);
  return {
    tooltip: {
      ...tooltipBase(),
      formatter: (params: any) => {
        const [columnIndex, rowIndex, value, count] = params.data ?? [];
        return tooltipRows(
          `${formatAxisCategory(rows[rowIndex])} / ${formatAxisCategory(columns[columnIndex])}`,
          [
            `Medyan ücret: ${formatMoney(typeof value === "number" ? value : null)}`,
            `Örneklem: ${formatInteger(typeof count === "number" ? count : null)}`,
            `Renk: Daha koyu ton daha yüksek medyan ücreti gösterir`,
            `Kapsam: Aktif filtre kesiti`,
            `Ücret türü: ${formatScopeLabel(context.salaryMode)}`,
          ],
        );
      },
    },
    grid: { left: 90, right: 16, top: 20, bottom: 24 },
    xAxis: {
      type: "category",
      data: columns.map((value) => formatAxisCategory(value, true)),
      splitArea: { show: true },
      axisLabel: axisLabelStyle(),
      axisLine: { lineStyle: { color: "#cbbda8" } },
      name: context.columnLabel,
      nameLocation: "middle",
      nameGap: 34,
    },
    yAxis: {
      type: "category",
      data: rows.map((value) => formatAxisCategory(value, true)),
      splitArea: { show: true },
      axisLabel: axisLabelStyle(),
      axisLine: { lineStyle: { color: "#cbbda8" } },
      name: context.rowLabel,
      nameLocation: "middle",
      nameGap: 70,
    },
    visualMap: {
      min: visualRange.min,
      max: visualRange.max,
      show: true,
      orient: "horizontal",
      left: "center",
      bottom: -4,
      text: ["Yüksek medyan", "Düşük medyan"],
      textStyle: { color: "#111111", fontSize: 11, fontWeight: 600 },
      inRange: {
        color: ["#f4efe5", "#ead3a1", "#d79246", "#8a4d2c", "#163245"],
      },
    },
    series: [
      {
        type: "heatmap",
        data: entries.map((entry) => [
          columns.indexOf(entry.columnKey),
          rows.indexOf(entry.rowKey),
          entry.median ?? 0,
          entry.count,
        ]),
        label: {
          show: true,
          formatter: (params: any) => formatHeatmapLabelRich(params, visualRange),
          fontSize: 12,
          fontWeight: 800,
          rich: {
            dark: {
              color: "#173246",
              textBorderColor: "rgba(255, 250, 242, 0.98)",
              textBorderWidth: 3.5,
              textShadowColor: "rgba(255, 250, 242, 0.92)",
              textShadowBlur: 8,
            },
            light: {
              color: "#173246",
              textBorderColor: "rgba(255, 250, 242, 0.96)",
              textBorderWidth: 4.5,
              textShadowColor: "rgba(255, 250, 242, 0.98)",
              textShadowBlur: 10,
            },
          },
        },
        itemStyle: {
          borderColor: "rgba(255, 250, 242, 0.9)",
          borderWidth: 1,
        },
        emphasis: {
          label: {
            show: true,
            formatter: (params: any) => formatHeatmapLabelRich(params, visualRange),
          },
          itemStyle: {
            shadowBlur: 10,
            shadowColor: "rgba(0, 0, 0, 0.35)",
            borderColor: "#fffaf2",
            borderWidth: 1.2,
          },
        },
      },
    ],
  };
}

export function buildProvinceMapOption(
  provinceStats: Array<{
    province: string;
    value: number | null;
    count: number;
    p75: number | null;
  }>,
  metricLabel: string,
  metricFormatter: (value: number | null) => string,
  context: { salaryMode: "try" | "fx"; mapScopeLabel: string },
): EChartsOption {
  if (!provinceStats.length) {
    return buildSparseOption(
      "Harita gösterilemiyor",
      "Bu filtrelerde il düzeyinde okunabilir yeterli yerel yanıt kalmadı.",
    );
  }
  const values = provinceStats.map((entry) => entry.value ?? 0);
  const visualRange = normalizeVisualRange(values);
  return {
    tooltip: {
      ...tooltipBase(),
      formatter: (params: any) => {
        const entry = provinceStats.find((item) => item.province === params.name);
        if (!entry) {
          return params.name;
        }
        return tooltipRows(entry.province, [
          `${metricLabel}: ${metricFormatter(entry.value)}`,
          `Üst çeyrek: ${formatMoney(entry.p75)}`,
          `Örneklem: ${formatInteger(entry.count)}`,
          `Kapsam: ${context.mapScopeLabel}`,
          `Ücret türü: ${formatScopeLabel(context.salaryMode)}`,
        ]);
      },
    },
    visualMap: {
      min: visualRange.min,
      max: visualRange.max,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      // textStyle: { color: "#355468" },
      textStyle: { color: "#111111", fontWeight: 600 },
      inRange: {
        color: ["#efe4cf", "#efd37a", "#d58d4e", "#163245"],
      },
    },
    series: [
      {
        type: "map",
        map: "turkey",
        roam: true,
        zoom: 1.08,
        itemStyle: {
          borderColor: "#fff8ef",
          borderWidth: 1.1,
        },
        emphasis: {
          label: {
            show: true,
            color: "#10212e",
          },
          itemStyle: {
            areaColor: CHART_COLORS.tealSoft,
          },
        },
        data: provinceStats.map((entry) => ({
          name: entry.province,
          value: entry.value ?? undefined,
        })),
      },
    ],
  };
}

export function buildScatterOption(
  items: Array<{ label: string; count: number; median: number | null; isAiTool: boolean }>,
  context: { salaryMode: "try" | "fx" },
): EChartsOption {
  if (!items.length) {
    return buildSparseOption(
      "Yayılım gösterilemiyor",
      "Bu filtrelerde karşılaştırılabilir teknoloji kullanım kümeleri oluşmadı.",
    );
  }
  return {
    tooltip: {
      ...tooltipBase(),
      formatter: (params: any) => {
        const item = items[params.dataIndex];
        return tooltipRows(item.label, [
          `Kullanım: ${formatInteger(item.count)}`,
          `Medyan ücret: ${formatMoney(item.median)}`,
          `Kapsam: Aktif filtre kesiti`,
          `Ücret türü: ${formatScopeLabel(context.salaryMode)}`,
        ]);
      },
    },
    xAxis: {
      type: "value",
      name: "Kullanım",
      nameLocation: "middle",
      nameGap: 32,
      axisLabel: axisLabelStyle(),
      splitLine: { lineStyle: { color: "rgba(22, 50, 69, 0.1)" } },
    },
    yAxis: {
      type: "value",
      name: "Medyan ücret",
      nameLocation: "middle",
      nameGap: 48,
      axisLabel: axisLabelStyle(),
      splitLine: { lineStyle: { color: "rgba(22, 50, 69, 0.1)" } },
    },
    grid: { left: 48, right: 16, top: 20, bottom: 48 },
    series: [
      {
        type: "scatter",
        data: items.map((item) => [item.count, item.median, item.label]),
        symbolSize: (value: number[]) => Math.max(12, Math.min(38, value[0] / 14)),
        itemStyle: {
          color: (params: any) =>
            items[params.dataIndex]?.isAiTool ? CHART_COLORS.teal : CHART_COLORS.copper,
          opacity: 0.85,
        },
      },
    ],
  };
}

export function buildQueryChartOption(
  rows: Array<Record<string, string | number | null>>,
  groupFields: string[],
  labelField: string,
  metricField: string,
  context: { salaryMode: "try" | "fx" },
): EChartsOption {
  if (!rows.length) {
    return buildSparseOption(
      "Sorgu sonucu boş",
      "Bu sorgu ve aktif filtreler birlikte gösterilecek yeterli satır üretmedi.",
    );
  }
  const isShare = metricField.startsWith("share_");
  const metricFormatter = isShare ? formatPercent : formatMoney;
  const metricLabel = formatQueryFieldLabel(metricField);

  if (groupFields.length === 2) {
    const [primaryField, secondaryField] = groupFields;
    const primaryValues = [...new Set(rows.map((row) => String(row[primaryField] ?? "—")))];
    const secondaryValues = [...new Set(rows.map((row) => String(row[secondaryField] ?? "—")))];

    if (secondaryValues.length <= 5 && primaryValues.length <= 12) {
      const series = secondaryValues.map((secondaryValue, seriesIndex) => ({
        name: formatAxisCategory(secondaryValue),
        type: "bar" as const,
        data: primaryValues.map((primaryValue) => {
          const entry = rows.find(
            (row) =>
              String(row[primaryField] ?? "—") === primaryValue &&
              String(row[secondaryField] ?? "—") === secondaryValue,
          );
          return entry && typeof entry[metricField] === "number" ? (entry[metricField] as number) : null;
        }),
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: [CHART_COLORS.ink, CHART_COLORS.teal, CHART_COLORS.copper, CHART_COLORS.amber, CHART_COLORS.rose][seriesIndex % 5],
        },
      }));

      return {
        tooltip: {
          ...tooltipBase(),
          trigger: "item",
          formatter: (params: any) => {
            const primaryValue = primaryValues[params.dataIndex];
            const secondaryValue = secondaryValues[params.seriesIndex];
            const entry = rows.find(
              (row) =>
                String(row[primaryField] ?? "—") === primaryValue &&
                String(row[secondaryField] ?? "—") === secondaryValue,
            );
            const sampleSize = entry && typeof entry.count === "number" ? (entry.count as number) : null;
            return tooltipRows(
              `${primaryValue} / ${formatAxisCategory(secondaryValue)}`,
              [
                `${metricLabel}: ${metricFormatter(typeof params.value === "number" ? params.value : null)}`,
                `Örneklem: ${formatInteger(sampleSize)}`,
                `Kapsam: Aktif filtre kesiti`,
                ...(isShare ? [] : [`Ücret türü: ${formatScopeLabel(context.salaryMode)}`]),
              ],
            );
          },
        },
        legend: {
          top: 0,
          textStyle: { color: "#111111", fontSize: 11, fontWeight: 600 },
        },
        grid: { left: 16, right: 16, top: 48, bottom: 16, containLabel: true },
        xAxis: {
          type: "value",
          splitLine: { lineStyle: { color: "rgba(22, 50, 69, 0.1)" } },
          axisLabel: axisLabelStyle(),
        },
        yAxis: {
          type: "category",
          data: primaryValues.map((value) => formatAxisCategory(value)),
          axisLabel: axisLabelStyle(),
          axisLine: { show: false },
          axisTick: { show: false },
          name: formatQueryFieldLabel(primaryField),
          nameLocation: "middle",
          nameGap: 80,
        },
        series,
      };
    }

    const heatmapData = rows.map((row) => {
      const primaryValue = String(row[primaryField] ?? "—");
      const secondaryValue = String(row[secondaryField] ?? "—");
      return [
        secondaryValues.indexOf(secondaryValue),
        primaryValues.indexOf(primaryValue),
        typeof row[metricField] === "number" ? (row[metricField] as number) : null,
        typeof row.count === "number" ? (row.count as number) : null,
      ];
    });
    const values = heatmapData
      .map((entry) => entry[2])
      .filter((value): value is number => typeof value === "number");
    const visualRange = normalizeVisualRange(values);

    return {
      tooltip: {
        ...tooltipBase(),
        formatter: (params: any) => {
          const [secondaryIndex, primaryIndex, value, count] = params.data ?? [];
          return tooltipRows(
            `${primaryValues[primaryIndex]} / ${formatAxisCategory(secondaryValues[secondaryIndex])}`,
            [
              `${metricLabel}: ${metricFormatter(typeof value === "number" ? value : null)}`,
              `Örneklem: ${formatInteger(typeof count === "number" ? count : null)}`,
              `Kapsam: Aktif filtre kesiti`,
              ...(isShare ? [] : [`Ücret türü: ${formatScopeLabel(context.salaryMode)}`]),
            ],
          );
        },
      },
      grid: { left: 90, right: 16, top: 20, bottom: 24 },
      xAxis: {
        type: "category",
        data: secondaryValues.map((value) => formatAxisCategory(value, true)),
        splitArea: { show: true },
        axisLabel: axisLabelStyle(),
        axisLine: { lineStyle: { color: "#cbbda8" } },
        name: formatQueryFieldLabel(secondaryField),
        nameLocation: "middle",
        nameGap: 34,
      },
      yAxis: {
        type: "category",
        data: primaryValues.map((value) => formatAxisCategory(value)),
        splitArea: { show: true },
        axisLabel: axisLabelStyle(),
        axisLine: { lineStyle: { color: "#cbbda8" } },
        name: formatQueryFieldLabel(primaryField),
        nameLocation: "middle",
        nameGap: 70,
      },
      visualMap: {
        min: visualRange.min,
        max: visualRange.max,
        show: true,
        orient: "horizontal",
        left: "center",
        bottom: -4,
        text: [`Yüksek ${metricLabel.toLowerCase()}`, `Düşük ${metricLabel.toLowerCase()}`],
        textStyle: { color: "#111111", fontSize: 11, fontWeight: 600 },
        inRange: {
          color: ["#f4efe5", "#ead3a1", "#d79246", "#8a4d2c", "#163245"],
        },
      },
      series: [
        {
          type: "heatmap",
          data: heatmapData,
          label: {
            show: false,
            formatter: (params: any) => {
              const value = params.data?.[2];
              if (typeof value !== "number") {
                return "—";
              }
              return isShare ? formatPercent(value) : `${Math.round(value / 1000)}k`;
            },
            color: "#173246",
            fontSize: 12,
            fontWeight: 700,
            textBorderColor: "rgba(255, 250, 242, 0.82)",
            textBorderWidth: 2,
          },
          itemStyle: {
            borderColor: "rgba(255, 250, 242, 0.9)",
            borderWidth: 1,
          },
          emphasis: {
            label: {
              show: true,
            },
          },
        },
      ],
    };
  }

  const labels = rows.map((row) => {
    if (groupFields.length > 1) {
      return groupFields.map((field) => String(row[field] ?? "—")).join(" · ");
    }
    return String(row[labelField] ?? "—");
  });
  const values = rows.map((row) => (typeof row[metricField] === "number" ? (row[metricField] as number) : 0));
  return buildBarOption(
    labels.map((label, index) => ({
      label,
      value: values[index],
      count: typeof rows[index].count === "number" ? (rows[index].count as number) : undefined,
    })),
    {
      color: CHART_COLORS.ink,
      horizontal: true,
      valueFormatter: metricFormatter,
      salaryMode: isShare ? undefined : context.salaryMode,
      metricLabel,
      metricHelp: "Sorgu sonucu, üstteki aktif filtrelere göre hesaplanır.",
    },
  );
}
