import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const RAW_DATA_PATH = path.join(
  ROOT,
  "2026-yazilim-sektoru-maaslari-onceki-yazilimci.json",
);
const GEOJSON_PATH = path.join(ROOT, "public", "data", "turkey-provinces.geojson");
const OUTPUT_DIR = path.join(ROOT, "public", "data");

const FIELDS = {
  seniority: "Uzmanlığınız nedir?",
  role: "Hangi pozisyonda çalışıyorsunuz?",
  technologies: "Hangi teknolojileri/araçları kullanıyorsunuz?",
  experience: "Kaç yıldır sektörde çalışıyorsunuz?",
  gender: "Cinsiyetiniz nedir?",
  companyType: "Çalıştığınız şirketi nasıl tanımlarsınız?",
  companySize: "Şirketin çalışan sayısı nedir?",
  workMode: "Şirketinizin çalışma düzeni nedir?",
  location: "Hangi ülkede/şehirde çalışıyorsunuz/yaşıyorsunuz?",
  currency: "Hangi para birimi ile maaş alıyorsunuz?",
  salary:
    "Aylık [NET] geliriniz nedir? (Brüt maaş alıyorsanız, yıllık net gelirinizi 12'ye bölüp aylık kazancınızı seçebilirsiniz. Bir önceki adımda seçtiğiniz para birimine göre seçim yapmalısınız.)",
  raises: "Yılda kaç kez zam alıyorsunuz?",
};

const SENIORITY_ORDER = ["Junior", "Middle", "Senior"];
const EXPERIENCE_ORDER = [
  "0 - 1 Yıl",
  "1 - 3 Yıl",
  "3 - 5 Yıl",
  "5 - 7 Yıl",
  "7 - 10 Yıl",
  "10 - 12 Yıl",
  "12 - 14 Yıl",
  "15 Yıl ve üzeri",
];
const EXPERIENCE_MIDPOINT = {
  "0 - 1 Yıl": 0.5,
  "1 - 3 Yıl": 2,
  "3 - 5 Yıl": 4,
  "5 - 7 Yıl": 6,
  "7 - 10 Yıl": 8.5,
  "10 - 12 Yıl": 11,
  "12 - 14 Yıl": 13,
  "15 Yıl ve üzeri": 16,
};
const COMPANY_SIZE_ORDER = [
  "1 - 5 Kişi",
  "6 - 10 Kişi",
  "11 - 20 Kişi",
  "21 - 50 Kişi",
  "51 - 100 Kişi",
  "101 - 249 Kişi",
  "250+",
];
const COMPANY_SIZE_MIDPOINT = {
  "1 - 5 Kişi": 3,
  "6 - 10 Kişi": 8,
  "11 - 20 Kişi": 15,
  "21 - 50 Kişi": 35,
  "51 - 100 Kişi": 75,
  "101 - 249 Kişi": 175,
  "250+": 300,
};
const WORK_MODE_LOOKUP = {
  Remote: {
    label: "Remote",
    group: "Remote",
    narrative: "Tam uzaktan",
  },
  "Hibrit (Ofis + Remote)": {
    label: "Hybrid",
    group: "Hybrid",
    narrative: "Hibrit",
  },
  Ofis: {
    label: "Office",
    group: "Office",
    narrative: "Ofisten",
  },
  "Şu an remote ama hibrite döneceğiz.": {
    label: "Remote -> Hybrid",
    group: "Remote",
    narrative: "Şimdilik remote",
  },
  "Şu an hibrit ama ofise döneceğiz.": {
    label: "Hybrid -> Office",
    group: "Hybrid",
    narrative: "Şimdilik hibrit",
  },
};
const CURRENCY_LOOKUP = {
  "₺ - Türk Lirası": "TRY",
  "$ - Dolar": "USD",
  "€ - Euro": "EUR",
  "£ - Sterlin": "GBP",
};
const REFERENCE_FX_RATES = {
  TRY: 1,
  USD: 44.3756,
  EUR: 51.5047,
  GBP: 59.5052,
};
const REFERENCE_FX_FETCHED_AT = "2026-03-26";
const LOCATION_ALIASES = {
  İçel: "Mersin",
  Hakkari: "Hakkâri",
};
const GEOJSON_NAME_ALIASES = {
  Afyon: "Afyonkarahisar",
  İçel: "Mersin",
  Urfa: "Şanlıurfa",
  Hakkari: "Hakkâri",
};
const QUERY_IDEAS = [
  {
    id: "seniority-pay-lift",
    title: "Kıdem maaşı ne kadar artırıyor?",
    prompt:
      "filter currency=TRY | group seniority | metric median(salary), p75(salary), count() | sort -median_salary | min_count 30",
  },
  {
    id: "remote-vs-city-modes",
    title: "Türkiye genelinde uzaktan çalışmak mı, şehirlerde hibrit veya ofisten çalışmak mı daha iyi ödüyor?",
    prompt:
      "filter currency=TRY | group province, workMode | metric median(salary), p75(salary), count() | min_count 20",
  },
  {
    id: "company-size-vs-seniority",
    title: "Şirket büyüklüğü maaşı ne kadar etkiliyor?",
    prompt:
      "filter currency=TRY | group companySize, seniority | metric median(salary), p75(salary), count() | sort -median_salary | min_count 20",
  },
  {
    id: "ai-usage-vs-seniority",
    title: "AI kullanımı maaşı etkiliyor mu?",
    prompt:
      "group hasAiTools | metric mean(salary), median(salary), p75(salary), count() | min_count 20",
  },
];

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeText(value) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeProvinceName(value) {
  const cleaned = LOCATION_ALIASES[value] ?? value;
  return normalizeText(cleaned);
}

function parseSalaryBucket(label) {
  const cleaned = normalizeText(label);
  if (cleaned.endsWith("+")) {
    const lower = Number.parseInt(cleaned.replace(/[^\d]/g, ""), 10);
    return {
      label: cleaned,
      lower,
      upper: null,
      midpoint: lower + 25_000,
      visualUpper: lower + 50_000,
      openEnded: true,
    };
  }

  const match = cleaned.match(/([\d.]+)\s*-\s*([\d.]+)/);
  if (!match) {
    throw new Error(`Unable to parse salary bucket: ${label}`);
  }

  const lower = Number.parseInt(match[1].replaceAll(".", ""), 10);
  const upper = Number.parseInt(match[2].replaceAll(".", ""), 10);
  return {
    label: cleaned,
    lower,
    upper,
    midpoint: (lower + upper) / 2,
    visualUpper: upper,
    openEnded: false,
  };
}

function parseTechnologyTags(value) {
  const cleaned = normalizeText(value);
  if (!cleaned || cleaned === "-") {
    return [];
  }

  const tags = cleaned
    .split(",")
    .map((tag) => normalizeText(tag))
    .filter(Boolean);
  return [...new Set(tags)];
}

function quantile(values, q) {
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

function summarizeNumeric(values) {
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

function groupAndSummarize(rows, keyFn, valueFn, minCount = 1) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key === null || key === undefined || key === "") {
      continue;
    }
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(valueFn(row));
  }

  return [...groups.entries()]
    .map(([key, values]) => ({
      key,
      ...summarizeNumeric(values.filter((value) => value !== null)),
    }))
    .filter((entry) => entry.count >= minCount)
    .sort((a, b) => {
      if (b.median === a.median) {
        return b.count - a.count;
      }
      return (b.median ?? -Infinity) - (a.median ?? -Infinity);
    });
}

function countBy(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key === null || key === undefined || key === "") {
      continue;
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || `${a.key}`.localeCompare(`${b.key}`, "tr"));
}

function inferRoleFamily(role) {
  if (/CTO|Director|Manager|Lead|Architect/i.test(role)) {
    return "Leadership";
  }
  if (/Data Scientist|Data Analyst|Data Engineer|Machine Learning/i.test(role)) {
    return "Data & AI";
  }
  if (/Front-end|Back-end|Full Stack/i.test(role)) {
    return "Web Engineering";
  }
  if (/Android|iOS|Mobile/i.test(role)) {
    return "Mobile";
  }
  if (/QA|Test/i.test(role)) {
    return "Quality";
  }
  if (/DevOps|Site Reliability|Platform/i.test(role)) {
    return "Infra";
  }
  if (/Product|Business Analyst|Project Manager/i.test(role)) {
    return "Product & Delivery";
  }
  if (/Cyber/i.test(role)) {
    return "Security";
  }
  if (/Embedded/i.test(role)) {
    return "Embedded";
  }
  if (/SAP|ERP|ABAP/i.test(role)) {
    return "Enterprise Systems";
  }
  return "Specialist";
}

function extractAiToolLabel(tag) {
  return tag.replace(/^AI Model:\s*/, "");
}

function normalizeLocation(rawValue) {
  const cleaned = normalizeText(rawValue);
  if (cleaned.startsWith("* ")) {
    const country = normalizeText(cleaned.slice(2));
    return {
      raw: cleaned,
      province: null,
      country,
      geographyType: "country",
      isAbroad: country !== "Türkiye",
      label: country,
    };
  }

  const province = normalizeProvinceName(cleaned);
  return {
    raw: cleaned,
    province,
    country: "Türkiye",
    geographyType: "province",
    isAbroad: false,
    label: province,
  };
}

function flattenCoordinates(coordinates, points = []) {
  if (!Array.isArray(coordinates)) {
    return points;
  }
  if (typeof coordinates[0] === "number") {
    points.push(coordinates);
    return points;
  }
  for (const child of coordinates) {
    flattenCoordinates(child, points);
  }
  return points;
}

function geometryCentroid(geometry) {
  const points = flattenCoordinates(geometry.coordinates);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

function normalizeGeojsonProvinceName(name) {
  const aliased = GEOJSON_NAME_ALIASES[name] ?? name;
  return normalizeProvinceName(aliased);
}

function buildProvinceMeta(geojson) {
  return geojson.features.map((feature) => ({
    province: normalizeGeojsonProvinceName(feature.properties.name),
    provinceCode: feature.properties.number,
    centroid: geometryCentroid(feature.geometry),
  }));
}

function buildProcessedRows(rawRows) {
  return rawRows.map((row, index) => {
    const salary = parseSalaryBucket(row[FIELDS.salary]);
    const location = normalizeLocation(row[FIELDS.location]);
    const currency = CURRENCY_LOOKUP[row[FIELDS.currency]];
    const technologies = parseTechnologyTags(row[FIELDS.technologies]);
    const aiTools = technologies
      .filter((tag) => tag.startsWith("AI Model:"))
      .map(extractAiToolLabel)
      .sort((a, b) => a.localeCompare(b, "en"));
    const workModeMeta = WORK_MODE_LOOKUP[row[FIELDS.workMode]];

    return {
      id: index + 1,
      seniority: row[FIELDS.seniority],
      seniorityOrder: SENIORITY_ORDER.indexOf(row[FIELDS.seniority]),
      role: row[FIELDS.role],
      roleFamily: inferRoleFamily(row[FIELDS.role]),
      technologies,
      aiTools,
      hasAiTools: aiTools.length > 0,
      experienceBand: row[FIELDS.experience],
      experienceOrder: EXPERIENCE_ORDER.indexOf(row[FIELDS.experience]),
      experienceYearsMidpoint: EXPERIENCE_MIDPOINT[row[FIELDS.experience]] ?? null,
      gender: row[FIELDS.gender],
      companyType: row[FIELDS.companyType],
      companySize: row[FIELDS.companySize],
      companySizeOrder: COMPANY_SIZE_ORDER.indexOf(row[FIELDS.companySize]),
      companySizeMidpoint: COMPANY_SIZE_MIDPOINT[row[FIELDS.companySize]] ?? null,
      workMode: workModeMeta.label,
      workModeGroup: workModeMeta.group,
      workModeNarrative: workModeMeta.narrative,
      workModeRaw: row[FIELDS.workMode],
      locationRaw: location.raw,
      province: location.province,
      country: location.country,
      geographyType: location.geographyType,
      geographyLabel: location.label,
      isAbroad: location.isAbroad,
      currency,
      currencyLabel: row[FIELDS.currency],
      salaryBucket: salary.label,
      salaryLower: salary.lower,
      salaryUpper: salary.upper,
      salaryVisualUpper: salary.visualUpper,
      salaryMid: salary.midpoint,
      salaryTryReference: salary.midpoint * REFERENCE_FX_RATES[currency],
      salaryIsOpenEnded: salary.openEnded,
      raisesPerYear: Number.parseInt(row[FIELDS.raises], 10),
    };
  });
}

function buildHeatmap(rows, rowKeyFn, columnKeyFn, minCount = 10) {
  const matrix = new Map();
  for (const row of rows) {
    const rowKey = rowKeyFn(row);
    const columnKey = columnKeyFn(row);
    const compositeKey = `${rowKey}__${columnKey}`;
    if (!matrix.has(compositeKey)) {
      matrix.set(compositeKey, []);
    }
    matrix.get(compositeKey).push(row.salaryMid);
  }

  return [...matrix.entries()]
    .map(([key, values]) => {
      const [rowKey, columnKey] = key.split("__");
      return {
        rowKey,
        columnKey,
        ...summarizeNumeric(values),
      };
    })
    .filter((entry) => entry.count >= minCount);
}

function buildTechnologyStats(rows, minCount = 25) {
  const groups = new Map();
  for (const row of rows) {
    for (const tag of row.technologies) {
      if (!groups.has(tag)) {
        groups.set(tag, []);
      }
      groups.get(tag).push(row.salaryMid);
    }
  }

  return [...groups.entries()]
    .map(([tag, values]) => ({
      tag,
      slug: slugify(tag),
      isAiTool: tag.startsWith("AI Model:"),
      ...summarizeNumeric(values),
    }))
    .filter((entry) => entry.count >= minCount)
    .sort((a, b) => b.count - a.count || (b.median ?? -Infinity) - (a.median ?? -Infinity));
}

function enrichProvinceStats(rows, provinceMeta) {
  const salarySummary = new Map(
    groupAndSummarize(rows, (row) => row.province, (row) => row.salaryMid).map((entry) => [
      entry.key,
      entry,
    ]),
  );
  const counts = new Map(countBy(rows, (row) => row.province).map((entry) => [entry.key, entry.count]));

  return provinceMeta.map((province) => ({
    province: province.province,
    provinceCode: province.provinceCode,
    centroid: province.centroid,
    responseCount: counts.get(province.province) ?? 0,
    ...(salarySummary.get(province.province) ?? {
      count: 0,
      median: null,
      p25: null,
      p75: null,
      min: null,
      max: null,
      mean: null,
    }),
  }));
}

function buildSummary(rows, provinceMeta) {
  const tryRows = rows.filter((row) => row.currency === "TRY");
  const foreignRows = rows.filter((row) => row.isAbroad);
  const provinceRows = tryRows.filter((row) => row.province);
  const provinceStats = enrichProvinceStats(provinceRows, provinceMeta);
  const trySummary = summarizeNumeric(tryRows.map((row) => row.salaryMid));
  const istanbulMedian =
    provinceStats.find((entry) => entry.province === "İstanbul")?.median ?? null;

  return {
    generatedAt: new Date().toISOString(),
    referenceFxFetchedAt: REFERENCE_FX_FETCHED_AT,
    referenceFxRates: REFERENCE_FX_RATES,
    totals: {
      responses: rows.length,
      tryResponses: tryRows.length,
      abroadResponses: foreignRows.length,
      provincesCovered: provinceStats.filter((entry) => entry.responseCount > 0).length,
      techTagsTracked: [...new Set(rows.flatMap((row) => row.technologies))].length,
    },
    keyNumbers: {
      overallTryMedian: trySummary.median,
      istanbulMedian,
      istanbulPremiumVsOverall:
        istanbulMedian && trySummary.median ? istanbulMedian - trySummary.median : null,
      foreignCurrencyShare: foreignRows.length / rows.length,
      aiToolAdoptionShare: rows.filter((row) => row.hasAiTools).length / rows.length,
    },
    counts: {
      currency: countBy(rows, (row) => row.currency),
      roleFamily: countBy(rows, (row) => row.roleFamily),
      workMode: countBy(rows, (row) => row.workMode),
      companyType: countBy(rows, (row) => row.companyType),
      province: countBy(provinceRows, (row) => row.province),
      country: countBy(foreignRows, (row) => row.country),
      aiTools: countBy(
        rows.flatMap((row) => row.aiTools).map((tool) => ({ tool })),
        (entry) => entry.tool,
      ),
    },
    salaryStats: {
      byRole: groupAndSummarize(tryRows, (row) => row.role, (row) => row.salaryMid, 20),
      byRoleFamily: groupAndSummarize(
        tryRows,
        (row) => row.roleFamily,
        (row) => row.salaryMid,
        20,
      ),
      bySeniority: groupAndSummarize(
        tryRows,
        (row) => row.seniority,
        (row) => row.salaryMid,
        20,
      ),
      byExperience: groupAndSummarize(
        tryRows,
        (row) => row.experienceBand,
        (row) => row.salaryMid,
        20,
      ),
      byWorkMode: groupAndSummarize(
        tryRows,
        (row) => row.workMode,
        (row) => row.salaryMid,
        20,
      ),
      byCompanyType: groupAndSummarize(
        tryRows,
        (row) => row.companyType,
        (row) => row.salaryMid,
        20,
      ),
      byCompanySize: groupAndSummarize(
        tryRows,
        (row) => row.companySize,
        (row) => row.salaryMid,
        20,
      ),
      byGender: groupAndSummarize(tryRows, (row) => row.gender, (row) => row.salaryMid, 20),
      byRaises: groupAndSummarize(
        tryRows,
        (row) => String(row.raisesPerYear),
        (row) => row.salaryMid,
        20,
      ),
      byProvince: provinceStats.filter((entry) => entry.responseCount > 0),
      technologies: buildTechnologyStats(rows, 25),
    },
    heatmaps: {
      roleFamilyBySeniority: buildHeatmap(
        tryRows,
        (row) => row.roleFamily,
        (row) => row.seniority,
        15,
      ),
      companyTypeByWorkMode: buildHeatmap(
        tryRows,
        (row) => row.companyType,
        (row) => row.workMode,
        20,
      ),
      roleFamilyByExperience: buildHeatmap(
        tryRows,
        (row) => row.roleFamily,
        (row) => row.experienceBand,
        15,
      ),
    },
    methodology: {
      salaryRule:
        "Aralıklı maaş yanıtları sayısal orta noktalarla görselleştirilir. Açık uçlu 400.000+ yanıtları karşılaştırılabilirlik için 425.000 kabul edilir.",
      fxRule:
        "Farklı para birimlerini içeren grafikler düzenlenebilir referans kurları kullanır; bu görünüm kesin ücret dönüşümü değil, modelleme amaçlı bir karşılaştırmadır.",
      locationRule:
        "Türkiye haritası yalnızca yurt içi il bazlı yanıtları kullanır. Yurt dışı yanıtları ise ülke düzeyinde ayrı olarak erişilebilir kalır.",
      sampleRule:
        "Pek çok görselde çok küçük gruplar bastırılır veya geri planda bırakılır; böylece düşük örneklem gürültüsü anlatının önüne geçmez.",
    },
    queryIdeas: QUERY_IDEAS,
  };
}

async function main() {
  const [rawJson, geojsonJson] = await Promise.all([
    readFile(RAW_DATA_PATH, "utf8"),
    readFile(GEOJSON_PATH, "utf8"),
  ]);

  const rawRows = JSON.parse(rawJson);
  const geojson = JSON.parse(geojsonJson);
  const provinceMeta = buildProvinceMeta(geojson);
  const processedRows = buildProcessedRows(rawRows);
  const summary = buildSummary(processedRows, provinceMeta);

  await mkdir(OUTPUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(OUTPUT_DIR, "survey-processed.json"),
      JSON.stringify(processedRows, null, 2),
    ),
    writeFile(
      path.join(OUTPUT_DIR, "analysis-summary.json"),
      JSON.stringify(summary, null, 2),
    ),
  ]);

  console.log(
    `Generated ${processedRows.length} processed rows and ${summary.salaryStats.byProvince.length} province summaries.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
