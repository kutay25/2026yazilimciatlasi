import {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as echarts from "echarts";
import ReactECharts from "echarts-for-react";
import {
  DEFAULT_FILTERS,
  aggregateRows,
  applyFilters,
  buildHistogram,
  buildKpis,
  buildOrderedHeatmapAxes,
  buildTechnologyStats,
  type FilterState,
} from "./lib/analytics";
import {
  buildBarOption,
  buildHeatmapOption,
  buildHistogramOption,
  buildLineOption,
  buildProvinceMapOption,
  buildQueryChartOption,
  buildScatterOption,
} from "./lib/charts";
import {
  EXPERIENCE_ORDER,
  ROLE_FAMILY_ORDER,
  SENIORITY_ORDER,
  TAB_ITEMS,
  WORK_MODE_ORDER,
  formatCompact,
  formatConversion,
  formatDateLabel,
  formatInteger,
  formatMoney,
  formatPercent,
  formatQueryFieldLabel,
  formatRoleFamilyLabel,
  formatSeniorityLabel,
  formatWorkModeLabel,
  loadAppData,
  type AppData,
  type TabId,
} from "./lib/data";
import { executeQuery } from "./lib/query";

const COMPANY_SIZE_ORDER = [
  "1 - 5 Kişi",
  "6 - 10 Kişi",
  "11 - 20 Kişi",
  "21 - 50 Kişi",
  "51 - 100 Kişi",
  "101 - 249 Kişi",
  "250+",
];

const DEFAULT_QUERY =
  "filter currency=TRY | group seniority | metric median(salary), count() | sort -median_salary | min_count 30";

type MapMetric = "median" | "p75" | "count";

function orderEntries<T extends { key: string }>(entries: T[], order: string[]) {
  return [...entries].sort((left, right) => {
    const leftIndex = order.indexOf(left.key);
    const rightIndex = order.indexOf(right.key);
    if (leftIndex === -1 && rightIndex === -1) {
      return left.key.localeCompare(right.key, "tr");
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

function toggleValue(current: string[], value: string) {
  if (current.includes(value)) {
    return current.length === 1 ? current : current.filter((entry) => entry !== value);
  }
  return [...current, value];
}

function formatMetricValue(field: string, value: string | number | null) {
  if (typeof value !== "number") {
    if (field === "roleFamily") {
      return formatRoleFamilyLabel(String(value ?? "—"));
    }
    if (field === "workMode") {
      return formatWorkModeLabel(String(value ?? "—"));
    }
    if (field === "seniority") {
      return formatSeniorityLabel(String(value ?? "—"));
    }
    return String(value ?? "—");
  }
  if (field.startsWith("share_")) {
    return formatPercent(value);
  }
  if (field === "count") {
    return formatInteger(value);
  }
  return formatMoney(value);
}

function getSalaryModeTitle(salaryMode: FilterState["salaryMode"]) {
  return salaryMode === "fx" ? "Referans TRY karşılığı" : "Doğrudan TRY";
}

function getSalaryModeExplanation(salaryMode: FilterState["salaryMode"]) {
  return salaryMode === "fx"
    ? "Farklı para birimlerindeki yanıtlar referans kurla TRY karşılığına çevrilir."
    : "Yalnızca doğrudan TRY yanıtları kullanılır.";
}

function getSliceScopeLabel(filters: FilterState) {
  const geography =
    filters.geographyScope === "domestic"
      ? "yurt içi"
      : filters.geographyScope === "abroad"
        ? "yurt dışı"
        : "tüm coğrafya";
  return `Aktif filtre kesiti, ${geography}`;
}

function buildReferenceFxNote(summary: AppData["summary"]) {
  const rateText = getReferenceFxEntries(summary)
    .map((entry) => `1 ${entry.code} = ${entry.value}`)
    .join(" · ");

  return `${rateText} · Kur tarihi: ${formatDateLabel(summary.referenceFxFetchedAt)}`;
}

function getReferenceFxEntries(summary: AppData["summary"]) {
  const orderedRates: Array<keyof AppData["summary"]["referenceFxRates"]> = [
    "USD",
    "EUR",
    "GBP",
  ];

  return orderedRates.map((code) => ({
    code,
    value: formatConversion(summary.referenceFxRates[code]),
  }));
}

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [mapMetric, setMapMetric] = useState<MapMetric>("median");
  const [mapMinCount, setMapMinCount] = useState(8);
  const [queryText, setQueryText] = useState(DEFAULT_QUERY);
  const [selectedQueryMetric, setSelectedQueryMetric] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadAppData()
      .then((payload) => {
        if (cancelled) {
          return;
        }
        setData(payload);
        const firstPreset = payload.summary.queryIdeas[0]?.prompt;
        if (firstPreset) {
          setSelectedQueryMetric(null);
          setQueryText(firstPreset);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (data) {
      echarts.registerMap("turkey", data.turkeyGeoJson as never);
    }
  }, [data]);

  const deferredQueryText = useDeferredValue(queryText);
  const filteredRows = useMemo(
    () => (data ? applyFilters(data.rows, filters) : []),
    [data, filters],
  );
  const deferredRows = useDeferredValue(filteredRows);

  const kpis = useMemo(
    () => buildKpis(deferredRows, filters.salaryMode),
    [deferredRows, filters.salaryMode],
  );

  const histogram = useMemo(
    () => buildHistogram(deferredRows, filters.salaryMode, 20),
    [deferredRows, filters.salaryMode],
  );

  const experienceCurve = useMemo(() => {
    const entries = aggregateRows(deferredRows, ["experience"], filters.salaryMode, 10);
    return orderEntries(entries, EXPERIENCE_ORDER).map((entry) => ({
      label: entry.key,
      value: entry.median,
      count: entry.count,
    }));
  }, [deferredRows, filters.salaryMode]);

  const companySizeCurve = useMemo(() => {
    const entries = aggregateRows(deferredRows, ["companySize"], filters.salaryMode, 10);
    return orderEntries(entries, COMPANY_SIZE_ORDER).map((entry) => ({
      label: entry.key,
      value: entry.median,
      count: entry.count,
    }));
  }, [deferredRows, filters.salaryMode]);

  const roleFamilyHeatmap = useMemo(() => {
    const entries = aggregateRows(
      deferredRows,
      ["roleFamily", "seniority"],
      filters.salaryMode,
      12,
    ).map((entry) => ({
      rowKey: entry.groupValues.roleFamily,
      columnKey: entry.groupValues.seniority,
      median: entry.median,
      count: entry.count,
    }));
    const axes = buildOrderedHeatmapAxes(entries);
    return { entries, axes };
  }, [deferredRows, filters.salaryMode]);

  const companyHeatmap = useMemo(() => {
    const entries = aggregateRows(
      deferredRows,
      ["companyType", "workMode"],
      filters.salaryMode,
      18,
    )
      .slice(0, 40)
      .map((entry) => ({
        rowKey: entry.groupValues.companyType,
        columnKey: entry.groupValues.workMode,
        median: entry.median,
        count: entry.count,
      }));
    const axes = buildOrderedHeatmapAxes(entries);
    return { entries, axes };
  }, [deferredRows, filters.salaryMode]);

  const topRoleBars = useMemo(
    () =>
      aggregateRows(deferredRows, ["role"], filters.salaryMode, 18)
        .slice(0, 12)
        .map((entry) => ({
          label: entry.key,
          value: entry.median,
          count: entry.count,
        })),
    [deferredRows, filters.salaryMode],
  );

  const companyTypeBars = useMemo(
    () =>
      aggregateRows(deferredRows, ["companyType"], filters.salaryMode, 18)
        .slice(0, 10)
        .map((entry) => ({
          label: entry.key,
          value: entry.median,
          count: entry.count,
        })),
    [deferredRows, filters.salaryMode],
  );

  const workModeBars = useMemo(
    () =>
      orderEntries(
        aggregateRows(deferredRows, ["workMode"], filters.salaryMode, 12),
        WORK_MODE_ORDER,
      ).map((entry) => ({
        label: entry.key,
        value: entry.median,
        count: entry.count,
      })),
    [deferredRows, filters.salaryMode],
  );

  const technologyScatter = useMemo(
    () =>
      buildTechnologyStats(deferredRows, filters.salaryMode, 30)
        .slice(0, 30)
        .map((entry) => ({
          label: entry.tag.replace(/^AI Model:\s*/, ""),
          count: entry.count,
          median: entry.median,
          isAiTool: entry.isAiTool,
        })),
    [deferredRows, filters.salaryMode],
  );

  const provinceStats = useMemo(() => {
    const entries = aggregateRows(
      deferredRows.filter((row) => row.province),
      ["province"],
      filters.salaryMode,
      mapMinCount,
    );
    return entries
      .map((entry) => ({
        province: entry.groupValues.province,
        count: entry.count,
        median: entry.median,
        p75: entry.p75,
      }))
      .sort((left, right) => {
        const leftValue =
          mapMetric === "count"
            ? left.count
            : mapMetric === "p75"
              ? left.p75 ?? -Infinity
              : left.median ?? -Infinity;
        const rightValue =
          mapMetric === "count"
            ? right.count
            : mapMetric === "p75"
              ? right.p75 ?? -Infinity
              : right.median ?? -Infinity;
        return rightValue - leftValue;
      });
  }, [deferredRows, filters.salaryMode, mapMetric, mapMinCount]);

  const mapOption = useMemo(() => {
    const metricLabel =
      mapMetric === "count"
        ? "Yanıt hacmi"
        : mapMetric === "p75"
          ? "Üst çeyrek ücret"
          : "Medyan ücret";
    const formatter = mapMetric === "count" ? formatInteger : formatMoney;
    return buildProvinceMapOption(
      provinceStats.map((entry) => ({
        province: entry.province,
        value:
          mapMetric === "count"
            ? entry.count
            : mapMetric === "p75"
              ? entry.p75
              : entry.median,
        count: entry.count,
        p75: entry.p75,
      })),
      metricLabel,
      formatter,
      {
        salaryMode: filters.salaryMode,
        mapScopeLabel: "Aktif filtre kesitindeki, il bilgisi olan yurt içi yanıtlar",
      },
    );
  }, [filters.salaryMode, mapMetric, provinceStats]);

  const focusInsights = useMemo(() => {
    const topRoleFamily = aggregateRows(deferredRows, ["roleFamily"], filters.salaryMode, 20)[0];
    const topProvince = provinceStats[0];
    const topSector = aggregateRows(deferredRows, ["companyType"], filters.salaryMode, 20)[0];
    return [
      {
        title: "Rol ailesi tavanı",
        value: topRoleFamily ? formatRoleFamilyLabel(topRoleFamily.key) : "—",
        detail: topRoleFamily
          ? `${formatMoney(topRoleFamily.median)} medyan, n=${formatInteger(topRoleFamily.count)}`
          : "Yeterli veri yok",
      },
      {
        title: "Haritada zirve",
        value: topProvince?.province ?? "—",
        detail: topProvince
          ? `${formatMoney(topProvince.median)} medyan, n=${formatInteger(topProvince.count)}`
          : "Yeterli veri yok",
      },
      {
        title: "En yüksek sektör farkı",
        value: topSector?.key ?? "—",
        detail: topSector
          ? `${formatMoney(topSector.median)} medyan, n=${formatInteger(topSector.count)}`
          : "Yeterli veri yok",
      },
    ];
  }, [deferredRows, filters.salaryMode, provinceStats]);

  const queryExecution = useMemo(() => {
    try {
      return {
        error: null,
        result: executeQuery(deferredRows, deferredQueryText || DEFAULT_QUERY, {
          salaryMode: filters.salaryMode,
        }),
      };
    } catch (queryError) {
      return {
        error: queryError instanceof Error ? queryError.message : String(queryError),
        result: null,
      };
    }
  }, [deferredRows, deferredQueryText, filters.salaryMode]);

  const roleFamilyOptions = useMemo(
    () =>
      ROLE_FAMILY_ORDER.filter((family) =>
        data?.rows.some((row) => row.roleFamily === family),
      ),
    [data],
  );
  const sectorOptions = useMemo(
    () =>
      data
        ? [...new Set(data.rows.map((row) => row.companyType))].sort((left, right) =>
            left.localeCompare(right, "tr"),
          )
        : [],
    [data],
  );
  const chartRuntimeProps = useMemo(
    () => ({
      echarts,
      notMerge: true,
      lazyUpdate: true,
    }),
    [],
  );
  const activeFilterSummary = useMemo(
    () => [
      getSalaryModeTitle(filters.salaryMode),
      filters.geographyScope === "domestic"
        ? "Kapsam: Türkiye"
        : filters.geographyScope === "abroad"
          ? "Kapsam: Yurt dışı"
          : "Kapsam: Tüm coğrafya",
      filters.aiScope === "all"
        ? "AI: Hepsi"
        : filters.aiScope === "with"
          ? "AI: Kullananlar"
          : "AI: Kullanmayanlar",
      filters.sector === "all" ? "Sektör: Tümü" : `Sektör: ${filters.sector}`,
      `Seviye: ${filters.seniorities.length}/${SENIORITY_ORDER.length}`,
      `Çalışma biçimi: ${filters.workModes.length}/${WORK_MODE_ORDER.length}`,
      `Rol ailesi: ${filters.roleFamilies.length}/${roleFamilyOptions.length}`,
    ],
    [filters, roleFamilyOptions.length],
  );

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!data) {
    return <LoadingState />;
  }

  const queryLabelField = queryExecution.result?.groupFields[0] ?? "label";
  const queryMetricOptions = queryExecution.result?.metricFields ?? [];
  const queryMetricField =
    selectedQueryMetric && queryMetricOptions.includes(selectedQueryMetric)
      ? selectedQueryMetric
      : queryMetricOptions[0] ?? "count";

  return (
    <div className="page-shell">
      <Hero
        summary={data.summary}
        totalResponses={data.summary.totals.responses}
        filteredResponses={deferredRows.length}
        overallMedian={kpis.median}
        aiShare={kpis.aiAdoptionShare}
        foreignShare={kpis.foreignCurrencyShare}
        foreignLabel="Dövizli maaş payı"
        salaryMode={filters.salaryMode}
        sliceScopeLabel={getSliceScopeLabel(filters)}
        provinces={kpis.provinceCount}
      />

      <div className="sticky-frame">
        <nav className="tab-bar" aria-label="Uygulama sekmeleri">
          {TAB_ITEMS.map((tab) => (
            <button
              key={tab.id}
              className={tab.id === activeTab ? "tab-button is-active" : "tab-button"}
              onClick={() => {
                startTransition(() => setActiveTab(tab.id));
              }}
              type="button"
            >
              <span>{tab.eyebrow}</span>
              <strong>{tab.label}</strong>
            </button>
          ))}
        </nav>

        <section className={filtersExpanded ? "control-panel" : "control-panel is-collapsed"}>
          <div className="control-header">
            <div className="control-header-copy">
              <span className="control-label">Geçerli görünüm</span>
              <strong>Şu anda gösterilen kesit</strong>
            </div>
            <div className="control-summary">
              <span className="summary-lead">Şu an:</span>
              {activeFilterSummary.map((item) => (
                <span key={item} className="summary-pill">
                  {item}
                </span>
              ))}
            </div>
            <div className="control-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => setFiltersExpanded((current) => !current)}
              >
                {filtersExpanded ? "Filtreleri gizle" : "Filtreleri göster"}
              </button>
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  startTransition(() => {
                    setFilters(DEFAULT_FILTERS);
                    setMapMetric("median");
                    setMapMinCount(8);
                  });
                }}
              >
                Filtreleri sıfırla
              </button>
            </div>
          </div>

          {filtersExpanded && (
            <div className="control-body">
              <div className="control-grid">
                <div className="control-group">
                  <span className="control-label">Odak</span>
                  <SegmentedToggle
                    items={[
                      { id: "try", label: "Doğrudan TRY" },
                      { id: "fx", label: "Referans TRY" },
                    ]}
                    activeId={filters.salaryMode}
                    onChange={(value) =>
                      setFilters((current) => ({ ...current, salaryMode: value as any }))
                    }
                  />
                </div>
                <div className="control-group">
                  <span className="control-label">Coğrafya</span>
                  <SegmentedToggle
                    items={[
                      { id: "domestic", label: "Türkiye" },
                      { id: "abroad", label: "Yurt dışı" },
                      { id: "all", label: "Tümü" },
                    ]}
                    activeId={filters.geographyScope}
                    onChange={(value) =>
                      setFilters((current) => ({ ...current, geographyScope: value as any }))
                    }
                  />
                </div>
                <div className="control-group">
                  <span className="control-label">AI araçları</span>
                  <SegmentedToggle
                    items={[
                      { id: "all", label: "Hepsi" },
                      { id: "with", label: "AI kullanan" },
                      { id: "without", label: "AI kullanmayan" },
                    ]}
                    activeId={filters.aiScope}
                    onChange={(value) =>
                      setFilters((current) => ({ ...current, aiScope: value as any }))
                    }
                  />
                </div>
                <div className="control-group">
                  <span className="control-label">Sektör odağı</span>
                  <select
                    className="surface-select"
                    value={filters.sector}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, sector: event.target.value }))
                    }
                  >
                    <option value="all">Tüm sektörler</option>
                    {sectorOptions.map((sector) => (
                      <option key={sector} value={sector}>
                        {sector}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="chip-grid">
                <FilterChipGroup
                  label="Seviye"
                  options={SENIORITY_ORDER}
                  selected={filters.seniorities}
                  formatLabel={formatSeniorityLabel}
                  onToggle={(value) =>
                    setFilters((current) => ({
                      ...current,
                      seniorities: toggleValue(current.seniorities, value),
                    }))
                  }
                />
                <FilterChipGroup
                  label="Çalışma biçimi"
                  options={WORK_MODE_ORDER}
                  selected={filters.workModes}
                  formatLabel={formatWorkModeLabel}
                  onToggle={(value) =>
                    setFilters((current) => ({
                      ...current,
                      workModes: toggleValue(current.workModes, value),
                    }))
                  }
                />
                <FilterChipGroup
                  label="Rol ailesi"
                  options={roleFamilyOptions}
                  selected={filters.roleFamilies}
                  formatLabel={formatRoleFamilyLabel}
                  onToggle={(value) =>
                    setFilters((current) => ({
                      ...current,
                      roleFamilies: toggleValue(current.roleFamilies, value),
                    }))
                  }
                />
              </div>
            </div>
          )}
        </section>
      </div>

      <main className="tab-content">
        {activeTab === "overview" && (
          <section className="tab-layout">
            <div className="metric-grid">
              <MetricCard
                label="Medyan ücret"
                value={formatMoney(kpis.median)}
                note={`${getSliceScopeLabel(filters)} • ${getSalaryModeTitle(filters.salaryMode)}`}
              />
              <MetricCard
                label="Üst çeyrek"
                value={formatMoney(kpis.p75)}
                note={`Aktif filtre kesiti • ${getSalaryModeTitle(filters.salaryMode)}`}
              />
              <MetricCard
                label="AI araç kullanımı"
                value={formatPercent(kpis.aiAdoptionShare)}
                note="Aktif filtre kesiti"
              />
              <MetricCard
                label="Kapsanan il"
                value={formatInteger(kpis.provinceCount)}
                note="Aktif filtre kesitinde il bilgisi bulunan yanıtlar"
              />
            </div>

            <div className="insight-grid">
              {focusInsights.map((insight) => (
                <article key={insight.title} className="insight-card">
                  <span>{insight.title}</span>
                  <strong>{insight.value}</strong>
                  <p>{insight.detail}</p>
                </article>
              ))}
            </div>

            <div className="chart-grid chart-grid--two">
              <ChartCard
                title="Gelir dağılımı"
                kicker="Kesitin maaş yoğunluğu"
                body="Anket bucket yapıda olduğu için görünüm bir dağılım ısısı gibi okunmalı."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildHistogramOption(histogram, { salaryMode: filters.salaryMode })}
                  className="chart"
                />
              </ChartCard>
              <ChartCard
                title="Deneyim eğrisi"
                kicker="Yıl bandına göre medyan"
                body="Sektörde geçirilen süre net bir fiyat merdiveni yaratıyor."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildLineOption(experienceCurve, formatMoney, {
                    salaryMode: filters.salaryMode,
                    metricLabel: "Medyan ücret",
                    metricHelp: getSalaryModeExplanation(filters.salaryMode),
                  })}
                  className="chart"
                />
              </ChartCard>
            </div>

            <div className="chart-grid chart-grid--two">
              <ChartCard
                title="Rol ailesi x seviye"
                kicker="Yoğunluğu değil, medyanı okur"
                body="Renk medyan ücreti gösterir. Hücre etiketleri yalnızca hover anında görünür; böylece yapı daha net okunur."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildHeatmapOption(
                    roleFamilyHeatmap.entries,
                    roleFamilyHeatmap.axes.rows,
                    roleFamilyHeatmap.axes.columns,
                    {
                      salaryMode: filters.salaryMode,
                      rowLabel: "Rol ailesi",
                      columnLabel: "Seviye",
                    },
                  )}
                  className="chart chart--tall"
                />
              </ChartCard>
              <ChartCard
                title="Çalışma düzeni"
                kicker="Uzaktan, hibrit, ofis"
                body="Aynı aktif kesitte çalışma biçimlerini yan yana karşılaştırır; her çubukta örneklem tooltip içinde görünür."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildBarOption(workModeBars, {
                    color: "#0f766e",
                    horizontal: false,
                    salaryMode: filters.salaryMode,
                    metricLabel: "Medyan ücret",
                    metricHelp: getSalaryModeExplanation(filters.salaryMode),
                    categoryLabelFormatter: formatWorkModeLabel,
                  })}
                  className="chart"
                />
              </ChartCard>
            </div>
          </section>
        )}

        {activeTab === "atlas" && (
          <section className="tab-layout">
            <div className="section-toolbar">
              <div>
                <p className="section-kicker">Harita modu</p>
                <SegmentedToggle
                  items={[
                    { id: "median", label: "Medyan" },
                    { id: "p75", label: "Üst çeyrek" },
                    { id: "count", label: "Yanıt hacmi" },
                  ]}
                  activeId={mapMetric}
                  onChange={(value) => setMapMetric(value as MapMetric)}
                />
              </div>
              <label className="range-control">
                <span>En düşük örneklem</span>
                <input
                  type="range"
                  min={4}
                  max={30}
                  value={mapMinCount}
                  onChange={(event) => setMapMinCount(Number.parseInt(event.target.value, 10))}
                />
                <strong>{mapMinCount}</strong>
              </label>
            </div>

            <div className="chart-grid chart-grid--atlas">
              <ChartCard
                title="Türkiye maaş atlası"
                kicker="İle göre ücret görünümü"
                body="Harita yalnızca il bilgisi olan yurt içi yanıtları kullanır. Renk seçili metriği, tooltip ise hem metriği hem örneklemi açıklar."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={mapOption}
                  className="chart chart--map"
                />
              </ChartCard>

              <aside className="ranking-panel">
                <div className="ranking-header">
                  <span>Öne çıkan iller</span>
                  <strong>{mapMetric === "count" ? "Yanıt hacmi" : "Gelir seviyesi"}</strong>
                </div>
                <div className="ranking-list">
                  {provinceStats.slice(0, 14).map((entry, index) => (
                    <div key={entry.province} className="ranking-row">
                      <span className="ranking-index">{index + 1}</span>
                      <div>
                        <strong>{entry.province}</strong>
                        <small>n={formatInteger(entry.count)}</small>
                      </div>
                      <span>
                        {mapMetric === "count"
                          ? formatInteger(entry.count)
                          : mapMetric === "p75"
                            ? formatMoney(entry.p75)
                            : formatMoney(entry.median)}
                      </span>
                    </div>
                  ))}
                </div>
              </aside>
            </div>

            <div className="chart-grid chart-grid--two">
              <ChartCard
                title="Şirket büyüklüğü merdiveni"
                kicker="Takım ölçeği arttıkça maaş ne yapıyor?"
                body="Aynı aktif kesitte şirket büyüklüğü arttıkça medyan ücretin nasıl değiştiğini gösterir."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildLineOption(companySizeCurve, formatMoney, {
                    salaryMode: filters.salaryMode,
                    metricLabel: "Medyan ücret",
                    metricHelp: getSalaryModeExplanation(filters.salaryMode),
                  })}
                  className="chart"
                />
              </ChartCard>
              <ChartCard
                title="Sektör karşılaştırması"
                kicker="Filtre içindeki en güçlü alanlar"
                body="Sektörleri aynı aktif kesitte medyan ücrete göre sıralar; yorumlarken her satırın örneklemine bakın."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildBarOption(companyTypeBars, {
                    color: "#c46e3d",
                    salaryMode: filters.salaryMode,
                    metricLabel: "Medyan ücret",
                    metricHelp: getSalaryModeExplanation(filters.salaryMode),
                  })}
                  className="chart"
                />
              </ChartCard>
            </div>
          </section>
        )}

        {activeTab === "patterns" && (
          <section className="tab-layout">
            <div className="chart-grid chart-grid--two">
              <ChartCard
                title="Rol bazlı lider tablo"
                kicker="En yüksek medyanlar"
                body="Düşük örneklemleri eledikten sonra rolleri aynı aktif kesitte medyan ücrete göre sıralar."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildBarOption(topRoleBars, {
                    color: "#163245",
                    salaryMode: filters.salaryMode,
                    metricLabel: "Medyan ücret",
                    metricHelp: getSalaryModeExplanation(filters.salaryMode),
                  })}
                  className="chart chart--tall"
                />
              </ChartCard>
              <ChartCard
                title="Sektör x çalışma modu"
                kicker="Hangi kombinasyonlar öne çıkıyor?"
                body="Renk medyan ücreti gösterir. Tam değerler ve örneklem sadece hover anında açılır; bu yüzden desen daha temiz görünür."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildHeatmapOption(
                    companyHeatmap.entries,
                    companyHeatmap.axes.rows,
                    companyHeatmap.axes.columns,
                    {
                      salaryMode: filters.salaryMode,
                      rowLabel: "Sektör",
                      columnLabel: "Çalışma biçimi",
                    },
                  )}
                  className="chart chart--tall"
                />
              </ChartCard>
            </div>

            <div className="chart-grid chart-grid--two">
              <ChartCard
                title="Teknoloji ve araç yayılımı"
                kicker="Kullanım hacmi ve ücret"
                body="Noktanın yeri medyan ücreti ve kullanım hacmini, tooltip ise örneklemi ve aktif kesit kapsamını açıklar."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildScatterOption(technologyScatter, {
                    salaryMode: filters.salaryMode,
                  })}
                  className="chart chart--tall"
                />
              </ChartCard>
              <ChartCard
                title="Bu veriyle en anlamlı sorular"
                kicker="Ne sorgulamaya değer?"
                body="Ham veri çok geniş; bu kartlar yüksek sinyalli sorgu yollarını öne çıkarıyor."
              >
                <div className="query-idea-stack">
                  {data.summary.queryIdeas.map((idea) => (
                    <button
                      key={idea.id}
                      className="query-idea-card"
                      type="button"
                      onClick={() => {
                        startTransition(() => {
                          setActiveTab("lab");
                          setSelectedQueryMetric(null);
                          setQueryText(idea.prompt);
                        });
                      }}
                    >
                      <span>{idea.title}</span>
                      <code>{idea.prompt}</code>
                    </button>
                  ))}
                </div>
              </ChartCard>
            </div>
          </section>
        )}

        {activeTab === "lab" && (
          <section className="tab-layout">
            <div className="lab-grid">
              <ChartCard
                title="Mini sorgu dili"
                kicker="filter -> group -> metric"
                body="Sorgular üstteki aktif filtrelerin içinde çalışır. Örnek: filter currency=TRY & seniority=Senior | group roleFamily, workMode | metric median(salary), count() | sort -median_salary | min_count 15"
              >
                <div className="query-lab">
                  <textarea
                    className="query-textarea"
                    value={queryText}
                    onChange={(event) => {
                      setSelectedQueryMetric(null);
                      setQueryText(event.target.value);
                    }}
                    spellCheck={false}
                  />
                  <div className="query-presets">
                    {data.summary.queryIdeas.map((idea) => (
                      <button
                        key={idea.id}
                        className="ghost-button"
                        type="button"
                        onClick={() => {
                          setSelectedQueryMetric(null);
                          setQueryText(idea.prompt);
                        }}
                      >
                        {idea.title}
                      </button>
                    ))}
                  </div>
                  {queryExecution.error ? (
                    <div className="query-error">{queryExecution.error}</div>
                  ) : (
                    <div className="query-meta">
                      <span>
                        {formatInteger(queryExecution.result?.rows.length ?? 0)} satır üretildi
                      </span>
                      <small>
                        Metrikler: {queryExecution.result?.metricFields.map(formatQueryFieldLabel).join(", ") ?? "Örneklem"}
                      </small>
                    </div>
                  )}
                </div>
              </ChartCard>

              <ChartCard
                title="Sorgu çıktısı"
                kicker="Metrikler arasında geçiş yapılabilir"
                body="Laboratuvar görünümü, üstteki filtreleri otomatik uygular; yani her sorgu o aktif kesit üzerinde çalışır."
              >
                {queryExecution.result ? (
                  <>
                    {queryMetricOptions.length > 1 && (
                      <div className="query-metric-tabs">
                        <SegmentedToggle
                          items={queryMetricOptions.map((field) => ({
                            id: field,
                            label: formatQueryFieldLabel(field),
                          }))}
                          activeId={queryMetricField}
                          onChange={(value) => setSelectedQueryMetric(value)}
                        />
                      </div>
                    )}
                    <ReactECharts
                      {...chartRuntimeProps}
                      option={buildQueryChartOption(
                        queryExecution.result.rows,
                        queryExecution.result.groupFields,
                        queryLabelField,
                        queryMetricField,
                        { salaryMode: filters.salaryMode },
                      )}
                      className="chart"
                    />
                    <QueryTable
                      rows={queryExecution.result.rows}
                      groupFields={queryExecution.result.groupFields}
                      metricFields={queryExecution.result.metricFields}
                    />
                  </>
                ) : (
                  <EmptyState title="Sorgu hata verdi" body={queryExecution.error ?? "Bir hata oluştu."} />
                )}
              </ChartCard>
            </div>
          </section>
        )}

        {activeTab === "method" && (
          <section className="tab-layout">
            <div className="method-grid">
              <MethodCard title="Temizleme kuralları" body={data.summary.methodology.salaryRule} />
              <MethodCard title="Kur üzerinden bakış" body={data.summary.methodology.fxRule} />
              <MethodCard title="Lokasyon mantığı" body={data.summary.methodology.locationRule} />
              <MethodCard title="Örneklem disiplini" body={data.summary.methodology.sampleRule} />
            </div>

            <div className="chart-grid chart-grid--two">
              <ChartCard
                title="Ham veri kapsamı"
                kicker="Bu uygulama hangi zeminde duruyor?"
                body="Bu kart yalnızca genel veri setinin kapsamını anlatır; aktif filtrelerden etkilenmez."
              >
                <ul className="fact-list">
                  <li>
                    <span>Toplam yanıt</span>
                    <strong>{formatInteger(data.summary.totals.responses)}</strong>
                  </li>
                  <li>
                    <span>TRY yanıtı</span>
                    <strong>{formatInteger(data.summary.totals.tryResponses)}</strong>
                  </li>
                  <li>
                    <span>Yurtdışı yanıtı</span>
                    <strong>{formatInteger(data.summary.totals.abroadResponses)}</strong>
                  </li>
                  <li>
                    <span>Kapsanan il</span>
                    <strong>{formatInteger(data.summary.totals.provincesCovered)}</strong>
                  </li>
                  <li>
                    <span>İzlenen teknoloji etiketi</span>
                    <strong>{formatInteger(data.summary.totals.techTagsTracked)}</strong>
                  </li>
                </ul>
              </ChartCard>
              <ChartCard
                title="Genel veri seti sinyalleri"
                kicker="Temel veri sinyalleri"
                body="Buradaki tüm değerler global veri setine aittir; aktif filtre kesitini değil, bütün anketi özetler."
              >
                <ul className="fact-list">
                  <li>
                    <span>Genel TRY medyanı</span>
                    <strong>{formatMoney(data.summary.keyNumbers.overallTryMedian)}</strong>
                  </li>
                  <li>
                    <span>İstanbul medyanı</span>
                    <strong>{formatMoney(data.summary.keyNumbers.istanbulMedian)}</strong>
                  </li>
                  <li>
                    <span>İstanbul farkı</span>
                    <strong>{formatMoney(data.summary.keyNumbers.istanbulPremiumVsOverall)}</strong>
                  </li>
                  <li>
                    <span>Döviz payı</span>
                    <strong>{formatPercent(data.summary.keyNumbers.foreignCurrencyShare)}</strong>
                  </li>
                  <li>
                    <span>AI araç kullanım payı</span>
                    <strong>{formatPercent(data.summary.keyNumbers.aiToolAdoptionShare)}</strong>
                  </li>
                </ul>
              </ChartCard>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Hero(props: {
  summary: AppData["summary"];
  totalResponses: number;
  filteredResponses: number;
  overallMedian: number | null;
  aiShare: number;
  foreignShare: number;
  foreignLabel: string;
  salaryMode: FilterState["salaryMode"];
  sliceScopeLabel: string;
  provinces: number;
}) {
  const attributionRepoUrl =
    "https://github.com/oncekiyazilimci/2026-yazilim-sektoru-maaslari";
  const attributionTwitterUrl = "https://x.com/oncekiyazilimci";
  const referenceFxEntries = getReferenceFxEntries(props.summary);

  return (
    <header className="hero">
      <div className="hero-copy">
        {/* <span className="hero-kicker">2026 Yazılım Sektörü Maaş Atlası</span> */}
        <h1>2026 Yazılımcı Maaş Atlası</h1>
        <p className="hero-context">
          Şu an görülen kartlar {props.sliceScopeLabel.toLowerCase()} için hesaplanır. 
          <br/>Ücret modu: {" "}
          <strong>{getSalaryModeTitle(props.salaryMode)}</strong>.
        </p>
        <div className="hero-sub-lines">
          <div className="hero-attribution">
            <span className="hero-attribution-label">Kaynak:</span>
            <div className="hero-attribution-links">
              <a
                className="hero-attribution-link"
                href={attributionRepoUrl}
                target="_blank"
                rel="noreferrer"
              >
                GitHub Veriseti
              </a>
              <span className="hero-attribution-separator">·</span>
              <span className="hero-attribution-link">Anketi derleyen</span>
              <a
                className="hero-attribution-link"
                href={attributionTwitterUrl}
                target="_blank"
                rel="noreferrer"
              >
                @oncekiyazilimci
              </a>
              <span className="hero-attribution-link">'ya teşekkürler</span>
            </div>
          </div>
          <div className="hero-reference-strip" aria-label="Referans kurlar">
            {referenceFxEntries.map((entry, index) => (
              <span key={entry.code} className="hero-reference-chip">
                {index > 0 && "· "}
                {`1 ${entry.code} = ${entry.value}`}
              </span>
            ))}
            <span className="hero-reference-date">
              {`· Kur tarihi: ${formatDateLabel(props.summary.referenceFxFetchedAt)}`}
            </span>
          </div>
        </div>
      </div>
      <div className="hero-metrics">
        <div>
          <span>Toplam yanıt</span>
          <strong>{formatCompact(props.totalResponses)}</strong>
          <small>Global veri seti</small>
        </div>
        <div>
          <span>Aktif kesit</span>
          <strong>{formatCompact(props.filteredResponses)}</strong>
          <small>Şu anki filtreler</small>
        </div>
        <div>
          <span>Medyan ücret</span>
          <strong>{formatMoney(props.overallMedian)}</strong>
          <small>{getSalaryModeTitle(props.salaryMode)}</small>
        </div>
        <div>
          <span>AI kullanımı</span>
          <strong>{formatPercent(props.aiShare)}</strong>
          <small>Aktif filtre kesiti</small>
        </div>
        <div>
          <span>{props.foreignLabel}</span>
          <strong>{formatPercent(props.foreignShare)}</strong>
          <small>Aktif filtre kesiti</small>
        </div>
        <div>
          <span>Kapsanan il</span>
          <strong>{formatInteger(props.provinces)}</strong>
          <small>Aktif filtre kesiti</small>
        </div>
      </div>
    </header>
  );
}

function SegmentedToggle(props: {
  items: Array<{ id: string; label: string }>;
  activeId: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="segmented-toggle">
      {props.items.map((item) => (
        <button
          key={item.id}
          type="button"
          className={item.id === props.activeId ? "segment is-active" : "segment"}
          onClick={() => props.onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function FilterChipGroup(props: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  formatLabel?: (value: string) => string;
}) {
  return (
    <div className="chip-group">
      <span className="chip-group-label">{props.label}</span>
      <div className="chip-row">
        {props.options.map((option) => {
          const selected = props.selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              className={selected ? "filter-chip is-active" : "filter-chip"}
              onClick={() => props.onToggle(option)}
            >
              {props.formatLabel ? props.formatLabel(option) : option}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MetricCard(props: { label: string; value: string; note: string }) {
  return (
    <article className="metric-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <p>{props.note}</p>
    </article>
  );
}

function ChartCard(props: {
  title: string;
  kicker: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <article className="chart-card">
      <div className="chart-card-header">
        <span>{props.kicker}</span>
        <h2>{props.title}</h2>
        <p>{props.body}</p>
      </div>
      {props.children}
    </article>
  );
}

function QueryTable(props: {
  rows: Array<Record<string, string | number | null>>;
  groupFields: string[];
  metricFields: string[];
}) {
  const fields = [...props.groupFields, ...props.metricFields];
  return (
    <div className="query-table-shell">
      <table className="query-table">
        <thead>
          <tr>
            {fields.map((field) => (
              <th key={field}>{formatQueryFieldLabel(field)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={`${row.label}-${index}`}>
              {fields.map((field) => (
                <td key={field}>{formatMetricValue(field, row[field] ?? null)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MethodCard(props: { title: string; body: string }) {
  return (
    <article className="method-card">
      <span>{props.title}</span>
      <p>{props.body}</p>
    </article>
  );
}

function LoadingState() {
  return (
    <div className="status-shell">
      <div className="status-card">
        <span>Yükleniyor</span>
        <h1>Veri atlası hazırlanıyor.</h1>
        <p>İşlenmiş anket dosyaları ve harita katmanı belleğe alınıyor.</p>
      </div>
    </div>
  );
}

function ErrorState(props: { message: string }) {
  return (
    <div className="status-shell">
      <div className="status-card status-card--error">
        <span>Hata</span>
        <h1>Uygulama yüklenemedi.</h1>
        <p>{props.message}</p>
      </div>
    </div>
  );
}

function EmptyState(props: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <strong>{props.title}</strong>
      <p>{props.body}</p>
    </div>
  );
}

export default App;
