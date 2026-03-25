import type { EChartsOption } from "echarts";
import { formatInteger, formatMoney, formatPercent } from "./data";

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
    color: "#355468",
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

export function buildHistogramOption(histogram: Array<{ label: string; count: number }>): EChartsOption {
  if (!histogram.length) {
    return buildEmptyOption("Bu filtre için histogram verisi yok.");
  }
  return {
    color: [CHART_COLORS.teal],
    tooltip: {
      ...tooltipBase(),
      trigger: "axis",
      axisPointer: { type: "shadow" },
    },
    grid: { left: 16, right: 12, bottom: 48, top: 20, containLabel: true },
    xAxis: {
      type: "category",
      data: histogram.map((item) => item.label),
      axisLine: { lineStyle: { color: "#cbbda8" } },
      axisLabel: {
        ...axisLabelStyle(),
        interval: Math.max(0, Math.floor(histogram.length / 8)),
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
  config: { color?: string; horizontal?: boolean; valueFormatter?: (value: number | null) => string },
): EChartsOption {
  if (!items.length) {
    return buildEmptyOption("Bu filtre için karsilastirma verisi yok.");
  }
  const horizontal = config.horizontal ?? true;
  const formatter = config.valueFormatter ?? formatMoney;
  const values = items.map((item) => item.value ?? 0);
  const categories = items.map((item) => item.label);
  return {
    color: [config.color ?? CHART_COLORS.copper],
    tooltip: {
      ...tooltipBase(),
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: any) => {
        const item = items[params[0].dataIndex];
        return `${item.label}<br/>${formatter(item.value)}<br/>Orneklem: ${formatInteger(item.count ?? 0)}`;
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
): EChartsOption {
  if (!items.length) {
    return buildEmptyOption("Bu filtre için egri verisi yok.");
  }
  return {
    color: [CHART_COLORS.ink],
    tooltip: {
      ...tooltipBase(),
      trigger: "axis",
      formatter: (params: any) => {
        const item = items[params[0].dataIndex];
        return `${item.label}<br/>${formatter(item.value)}<br/>Orneklem: ${formatInteger(item.count ?? 0)}`;
      },
    },
    grid: { left: 16, right: 12, top: 20, bottom: 24, containLabel: true },
    xAxis: {
      type: "category",
      data: items.map((item) => item.label),
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
): EChartsOption {
  if (!entries.length || !rows.length || !columns.length) {
    return buildEmptyOption("Bu filtre için isi haritasi verisi yok.");
  }
  const medians = entries.map((entry) => entry.median ?? 0);
  const visualRange = normalizeVisualRange(medians);
  return {
    tooltip: {
      ...tooltipBase(),
      formatter: (params: any) => {
        const [columnIndex, rowIndex, value, count] = params.data ?? [];
        return `${rows[rowIndex]} / ${columns[columnIndex]}<br/>Medyan: ${formatMoney(typeof value === "number" ? value : null)}<br/>Orneklem: ${formatInteger(typeof count === "number" ? count : null)}`;
      },
    },
    grid: { left: 90, right: 16, top: 20, bottom: 24 },
    xAxis: {
      type: "category",
      data: columns,
      splitArea: { show: true },
      axisLabel: axisLabelStyle(),
      axisLine: { lineStyle: { color: "#cbbda8" } },
    },
    yAxis: {
      type: "category",
      data: rows,
      splitArea: { show: true },
      axisLabel: axisLabelStyle(),
      axisLine: { lineStyle: { color: "#cbbda8" } },
    },
    visualMap: {
      min: visualRange.min,
      max: visualRange.max,
      show: false,
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
          formatter: (params: any) => {
            const value = params.data?.[2];
            return typeof value === "number" ? `${Math.round(value / 1000)}k` : "—";
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
): EChartsOption {
  if (!provinceStats.length) {
    return buildEmptyOption("Bu filtreyle eslesen il verisi yok.");
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
        return `${entry.province}<br/>${metricLabel}: ${metricFormatter(entry.value)}<br/>P75: ${formatMoney(entry.p75)}<br/>Orneklem: ${formatInteger(entry.count)}`;
      },
    },
    visualMap: {
      min: visualRange.min,
      max: visualRange.max,
      orient: "horizontal",
      left: "center",
      bottom: 0,
      textStyle: { color: "#355468" },
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
): EChartsOption {
  if (!items.length) {
    return buildEmptyOption("Bu filtre için teknoloji dagilimi yok.");
  }
  return {
    tooltip: {
      ...tooltipBase(),
      formatter: (params: any) => {
        const item = items[params.dataIndex];
        return `${item.label}<br/>Kullanim: ${formatInteger(item.count)}<br/>Medyan: ${formatMoney(item.median)}`;
      },
    },
    xAxis: {
      type: "value",
      name: "Kullanim",
      nameLocation: "middle",
      nameGap: 32,
      axisLabel: axisLabelStyle(),
      splitLine: { lineStyle: { color: "rgba(22, 50, 69, 0.1)" } },
    },
    yAxis: {
      type: "value",
      name: "Medyan gelir",
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
  labelField: string,
  metricField: string,
): EChartsOption {
  if (!rows.length) {
    return buildEmptyOption("Sorgu sonucunda gosterilecek satir yok.");
  }
  const labels = rows.map((row) => String(row[labelField] ?? "—"));
  const values = rows.map((row) => (typeof row[metricField] === "number" ? (row[metricField] as number) : 0));
  const isShare = metricField.startsWith("share_");
  return buildBarOption(
    labels.map((label, index) => ({
      label,
      value: values[index],
      count: typeof rows[index].count === "number" ? (rows[index].count as number) : undefined,
    })),
    {
      color: CHART_COLORS.ink,
      horizontal: true,
      valueFormatter: isShare ? formatPercent : formatMoney,
    },
  );
}
