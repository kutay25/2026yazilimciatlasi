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
  ROLE_FAMILY_LABELS,
  ROLE_FAMILY_ORDER,
  SENIORITY_ORDER,
  TAB_ITEMS,
  WORK_MODE_ORDER,
  formatCompact,
  formatInteger,
  formatMoney,
  formatPercent,
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
  "filter currency=TRY | group roleFamily, seniority | metric median(salary), count() | sort -median_salary | min_count 20";

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

function formatRoleFamily(value: string) {
  return ROLE_FAMILY_LABELS[value] ?? value;
}

function formatMetricValue(field: string, value: string | number | null) {
  if (typeof value !== "number") {
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

function App() {
  const [data, setData] = useState<AppData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [mapMetric, setMapMetric] = useState<MapMetric>("median");
  const [mapMinCount, setMapMinCount] = useState(8);
  const [queryText, setQueryText] = useState(DEFAULT_QUERY);

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
          ? "Ust ceyrek gelir"
          : "Medyan gelir";
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
    );
  }, [mapMetric, provinceStats]);

  const focusInsights = useMemo(() => {
    const topRoleFamily = aggregateRows(deferredRows, ["roleFamily"], filters.salaryMode, 20)[0];
    const topProvince = provinceStats[0];
    const topSector = aggregateRows(deferredRows, ["companyType"], filters.salaryMode, 20)[0];
    return [
      {
        title: "Rol ailesi tavanı",
        value: topRoleFamily ? formatRoleFamily(topRoleFamily.key) : "—",
        detail: topRoleFamily
          ? `${formatMoney(topRoleFamily.median)} medyan, ${formatInteger(topRoleFamily.count)} yanit`
          : "Yeterli veri yok",
      },
      {
        title: "Haritada zirve",
        value: topProvince?.province ?? "—",
        detail: topProvince
          ? `${formatMoney(topProvince.median)} medyan, ${formatInteger(topProvince.count)} yanit`
          : "Yeterli veri yok",
      },
      {
        title: "Sektor premiumu",
        value: topSector?.key ?? "—",
        detail: topSector
          ? `${formatMoney(topSector.median)} medyan, ${formatInteger(topSector.count)} yanit`
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
      filters.salaryMode === "try" ? "TRY odagi" : "FX model",
      filters.geographyScope === "domestic"
        ? "Turkiye"
        : filters.geographyScope === "abroad"
          ? "Yurtdisi"
          : "Tum cografya",
      filters.aiScope === "all"
        ? "AI: hepsi"
        : filters.aiScope === "with"
          ? "AI: kullanan"
          : "AI: kullanmayan",
      filters.sector === "all" ? "Sektor: tumu" : `Sektor: ${filters.sector}`,
      `${filters.seniorities.length}/${SENIORITY_ORDER.length} seviye`,
      `${filters.workModes.length}/${WORK_MODE_ORDER.length} calisma bicimi`,
      `${filters.roleFamilies.length}/${roleFamilyOptions.length} rol ailesi`,
    ],
    [filters, roleFamilyOptions.length],
  );

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!data) {
    return <LoadingState />;
  }

  const queryLabelField =
    queryExecution.result?.groupFields[0] ?? "label";
  const queryMetricField =
    queryExecution.result?.metricFields[0] ?? "count";

  return (
    <div className="page-shell">
      <Hero
        totalResponses={data.summary.totals.responses}
        filteredResponses={deferredRows.length}
        overallMedian={kpis.median}
        aiShare={kpis.aiAdoptionShare}
        foreignShare={kpis.foreignCurrencyShare}
        foreignLabel="Doviz payi (aktif kesit)"
        provinces={kpis.provinceCount}
      />

      <div className="sticky-frame">
        <nav className="tab-bar" aria-label="Atlas tabs">
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
              <span className="control-label">Odak</span>
              <strong>Aktif kesit filtreleri</strong>
            </div>
            <div className="control-summary">
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
                {filtersExpanded ? "Filtreleri gizle" : "Filtreleri goster"}
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
                Filtreleri sifirla
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
                      { id: "try", label: "TRY odağı" },
                      { id: "fx", label: "FX model" },
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
                      { id: "domestic", label: "Turkiye" },
                      { id: "abroad", label: "Yurtdışı" },
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
                  <span className="control-label">Sektor odağı</span>
                  <select
                    className="surface-select"
                    value={filters.sector}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, sector: event.target.value }))
                    }
                  >
                    <option value="all">Tum sektorler</option>
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
                  formatLabel={formatRoleFamily}
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
              <MetricCard label="Medyan gelir" value={formatMoney(kpis.median)} note="Filtrelenmiş kesit" />
              <MetricCard label="Ust ceyrek" value={formatMoney(kpis.p75)} note="Yukarı bant" />
              <MetricCard label="AI araç kullanımı" value={formatPercent(kpis.aiAdoptionShare)} note="Kesit içinde" />
              <MetricCard label="Kapsanan il" value={formatInteger(kpis.provinceCount)} note="Haritada görünen" />
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
                  option={buildHistogramOption(histogram)}
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
                  option={buildLineOption(experienceCurve)}
                  className="chart"
                />
              </ChartCard>
            </div>

            <div className="chart-grid chart-grid--two">
              <ChartCard
                title="Rol ailesi x seviye"
                kicker="En temiz premium haritası"
                body="Küçük örnekleri eledikten sonra hangi rol ailesinin hangi seviyede öne çıktığını gösterir."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildHeatmapOption(
                    roleFamilyHeatmap.entries,
                    roleFamilyHeatmap.axes.rows,
                    roleFamilyHeatmap.axes.columns,
                  )}
                  className="chart chart--tall"
                />
              </ChartCard>
              <ChartCard
                title="Çalışma düzeni"
                kicker="Remote, hybrid, office"
                body="Ofis yoğun düzenlerin ücret seviyesi belirgin biçimde aşağıda kalıyor."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildBarOption(workModeBars, { color: "#0f766e", horizontal: false })}
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
                    { id: "p75", label: "Ust ceyrek" },
                    { id: "count", label: "Yanıt hacmi" },
                  ]}
                  activeId={mapMetric}
                  onChange={(value) => setMapMetric(value as MapMetric)}
                />
              </div>
              <label className="range-control">
                <span>Min örneklem</span>
                <input
                  type="range"
                  min={4}
                  max={20}
                  value={mapMinCount}
                  onChange={(event) => setMapMinCount(Number.parseInt(event.target.value, 10))}
                />
                <strong>{mapMinCount}</strong>
              </label>
            </div>

            <div className="chart-grid chart-grid--atlas">
              <ChartCard
                title="Turkiye maas atlasi"
                kicker="Ile göre ücret ısısı"
                body="Harita, filtrelenmiş kesitin yalnızca il bazında okunabilen yerli cevaplarını kullanır."
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
                        <small>{formatInteger(entry.count)} yanıt</small>
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
                body="Mikro ekiplerden 250+ yapılara doğru belirgin bir basamak etkisi oluşuyor."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildLineOption(companySizeCurve)}
                  className="chart"
                />
              </ChartCard>
              <ChartCard
                title="Sektör premium tablosu"
                kicker="Filtre içindeki en güçlü alanlar"
                body="Bu görünüm doğrudan hangi sektörlerin daha yüksek ücret tavanı ürettiğini öne çıkarır."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildBarOption(companyTypeBars, { color: "#c46e3d" })}
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
                body="Düşük örneklemleri filtreledikten sonra net şekilde yönetim ve mimari roller yukarı çıkıyor."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildBarOption(topRoleBars, { color: "#163245" })}
                  className="chart chart--tall"
                />
              </ChartCard>
              <ChartCard
                title="Sektör x çalışma modu"
                kicker="Premium hangi kombinasyonlarda yoğun?"
                body="Hibrit bankacılık ve bazı fintech kümeleri üst bantta toplanıyor."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildHeatmapOption(
                    companyHeatmap.entries,
                    companyHeatmap.axes.rows,
                    companyHeatmap.axes.columns,
                  )}
                  className="chart chart--tall"
                />
              </ChartCard>
            </div>

            <div className="chart-grid chart-grid--two">
              <ChartCard
                title="Teknoloji ve araç yayılımı"
                kicker="Kullanim hacmi vs gelir"
                body="AI araçları yüksek yayılım alanında bir küme oluşturuyor; ama kullanım tek başına gelir açıklamıyor."
              >
                <ReactECharts
                  {...chartRuntimeProps}
                  option={buildScatterOption(technologyScatter)}
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
                kicker="Filter -> group -> metric"
                body="Örnek: filter currency=TRY & seniority=Senior | group roleFamily, workMode | metric median(salary), count() | sort -median_salary | min_count 15"
              >
                <div className="query-lab">
                  <textarea
                    className="query-textarea"
                    value={queryText}
                    onChange={(event) => setQueryText(event.target.value)}
                    spellCheck={false}
                  />
                  <div className="query-presets">
                    {data.summary.queryIdeas.map((idea) => (
                      <button
                        key={idea.id}
                        className="ghost-button"
                        type="button"
                        onClick={() => setQueryText(idea.prompt)}
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
                        Metric: {queryExecution.result?.metricFields.join(", ") ?? "count"}
                      </small>
                    </div>
                  )}
                </div>
              </ChartCard>

              <ChartCard
                title="Sorgu çıktısı"
                kicker="İlk metrik grafiğe dökülür"
                body="Lab, üstteki global filtreleri de otomatik uygular; yani her sorgu o aktif kesit üzerinde çalışır."
              >
                {queryExecution.result ? (
                  <>
                    <ReactECharts
                      {...chartRuntimeProps}
                      option={buildQueryChartOption(
                        queryExecution.result.rows,
                        queryLabelField,
                        queryMetricField,
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
                kicker="Bu app hangi zeminde duruyor?"
                body="Ana hikaye 5.002 yanıtın temizlenmiş sürümü üzerine kuruludur."
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
                title="Varsayılan headline’lar"
                kicker="Temel veri sinyalleri"
                body="Bunlar genel veri setinin ilk seviyedeki okunabilir işaretleridir."
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
                    <span>İstanbul premiumu</span>
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
  totalResponses: number;
  filteredResponses: number;
  overallMedian: number | null;
  aiShare: number;
  foreignShare: number;
  foreignLabel: string;
  provinces: number;
}) {
  return (
    <header className="hero">
      <div className="hero-copy">
        <span className="hero-kicker">2026 yazilim sektoru maas atlasi</span>
        <h1>Ham veri yığınını okunabilir bir maaş haritasına dönüştüren interaktif çalışma yüzeyi.</h1>
        <p>
          Bu artefakt; veri temizleme, fiyat merdiveni, il bazlı atlas, sektör ve rol premiumları,
          ayrıca sorgu laboratuvarını tek bir sekmede toplar.
        </p>
      </div>
      <div className="hero-metrics">
        <div>
          <span>Toplam yanıt</span>
          <strong>{formatCompact(props.totalResponses)}</strong>
        </div>
        <div>
          <span>Aktif kesit</span>
          <strong>{formatCompact(props.filteredResponses)}</strong>
        </div>
        <div>
          <span>Medyan gelir</span>
          <strong>{formatMoney(props.overallMedian)}</strong>
        </div>
        <div>
          <span>AI kullanımı</span>
          <strong>{formatPercent(props.aiShare)}</strong>
        </div>
        <div>
          <span>{props.foreignLabel}</span>
          <strong>{formatPercent(props.foreignShare)}</strong>
        </div>
        <div>
          <span>Kapsanan il</span>
          <strong>{formatInteger(props.provinces)}</strong>
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
              <th key={field}>{field}</th>
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
        <span>Yukleniyor</span>
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
