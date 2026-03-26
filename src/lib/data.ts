export type CurrencyCode = "TRY" | "USD" | "EUR" | "GBP";

export interface SurveyRow {
  id: number;
  seniority: string;
  seniorityOrder: number;
  role: string;
  roleFamily: string;
  technologies: string[];
  aiTools: string[];
  hasAiTools: boolean;
  experienceBand: string;
  experienceOrder: number;
  experienceYearsMidpoint: number | null;
  gender: string;
  companyType: string;
  companySize: string;
  companySizeOrder: number;
  companySizeMidpoint: number | null;
  workMode: string;
  workModeGroup: string;
  workModeNarrative: string;
  workModeRaw: string;
  locationRaw: string;
  province: string | null;
  country: string;
  geographyType: string;
  geographyLabel: string;
  isAbroad: boolean;
  currency: CurrencyCode;
  currencyLabel: string;
  salaryBucket: string;
  salaryLower: number;
  salaryUpper: number | null;
  salaryVisualUpper: number;
  salaryMid: number;
  salaryTryReference: number;
  salaryIsOpenEnded: boolean;
  raisesPerYear: number;
}

export interface CountEntry {
  key: string;
  count: number;
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

export interface SalaryStatEntry extends NumericSummary {
  key: string;
}

export interface ProvinceStatEntry extends NumericSummary {
  province: string;
  provinceCode: number;
  centroid: [number, number];
  responseCount: number;
}

export interface HeatmapEntry extends NumericSummary {
  rowKey: string;
  columnKey: string;
}

export interface TechnologyStatEntry extends NumericSummary {
  tag: string;
  slug: string;
  isAiTool: boolean;
}

export interface QueryIdea {
  id: string;
  title: string;
  prompt: string;
}

export interface AnalysisSummary {
  generatedAt: string;
  referenceFxFetchedAt: string;
  referenceFxRates: Record<CurrencyCode, number>;
  totals: {
    responses: number;
    tryResponses: number;
    abroadResponses: number;
    provincesCovered: number;
    techTagsTracked: number;
  };
  keyNumbers: {
    overallTryMedian: number | null;
    istanbulMedian: number | null;
    istanbulPremiumVsOverall: number | null;
    foreignCurrencyShare: number;
    aiToolAdoptionShare: number;
  };
  counts: {
    currency: CountEntry[];
    roleFamily: CountEntry[];
    workMode: CountEntry[];
    companyType: CountEntry[];
    province: CountEntry[];
    country: CountEntry[];
    aiTools: CountEntry[];
  };
  salaryStats: {
    byRole: SalaryStatEntry[];
    byRoleFamily: SalaryStatEntry[];
    bySeniority: SalaryStatEntry[];
    byExperience: SalaryStatEntry[];
    byWorkMode: SalaryStatEntry[];
    byCompanyType: SalaryStatEntry[];
    byCompanySize: SalaryStatEntry[];
    byGender: SalaryStatEntry[];
    byRaises: SalaryStatEntry[];
    byProvince: ProvinceStatEntry[];
    technologies: TechnologyStatEntry[];
  };
  heatmaps: {
    roleFamilyBySeniority: HeatmapEntry[];
    companyTypeByWorkMode: HeatmapEntry[];
    roleFamilyByExperience: HeatmapEntry[];
  };
  methodology: {
    salaryRule: string;
    fxRule: string;
    locationRule: string;
    sampleRule: string;
  };
  queryIdeas: QueryIdea[];
}

export interface TurkeyGeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: {
      name: string;
      number: number;
    };
    geometry: {
      type: string;
      coordinates: unknown;
    };
  }>;
}

export interface AppData {
  rows: SurveyRow[];
  summary: AnalysisSummary;
  turkeyGeoJson: TurkeyGeoJsonFeatureCollection;
}

export const TAB_ITEMS = [
  { id: "overview", label: "Panorama", eyebrow: "Genel resim" },
  { id: "atlas", label: "Atlas", eyebrow: "Türkiye haritası" },
  { id: "patterns", label: "Desenler", eyebrow: "Kesitler ve farklar" },
  { id: "lab", label: "Sorgu Laboratuvarı", eyebrow: "Canlı kesitler" },
  { id: "method", label: "Metod", eyebrow: "Temizleme ve notlar" },
] as const;

export type TabId = (typeof TAB_ITEMS)[number]["id"];

export const SENIORITY_ORDER = ["Junior", "Middle", "Senior"];
export const SENIORITY_LABELS: Record<string, string> = {
  Junior: "Başlangıç",
  Middle: "Orta seviye",
  Senior: "Kıdemli",
};
export const SENIORITY_SHORT_LABELS: Record<string, string> = {
  Junior: "Başl.",
  Middle: "Orta",
  Senior: "Kıd.",
};
export const EXPERIENCE_ORDER = [
  "0 - 1 Yıl",
  "1 - 3 Yıl",
  "3 - 5 Yıl",
  "5 - 7 Yıl",
  "7 - 10 Yıl",
  "10 - 12 Yıl",
  "12 - 14 Yıl",
  "15 Yıl ve üzeri",
];
export const WORK_MODE_ORDER = [
  "Hybrid",
  "Remote",
  "Office",
  "Remote -> Hybrid",
  "Hybrid -> Office",
];
export const WORK_MODE_LABELS: Record<string, string> = {
  Hybrid: "Hibrit",
  Remote: "Uzaktan",
  Office: "Ofis",
  "Remote -> Hybrid": "Uzaktan -> Hibrit",
  "Hybrid -> Office": "Hibrit -> Ofis",
};
export const WORK_MODE_SHORT_LABELS: Record<string, string> = {
  Hybrid: "Hibrit",
  Remote: "Uzaktan",
  Office: "Ofis",
  "Remote -> Hybrid": "Uzak. -> Hibrit",
  "Hybrid -> Office": "Hibrit -> Ofis",
};
export const ROLE_FAMILY_ORDER = [
  "Leadership",
  "Web Engineering",
  "Mobile",
  "Data & AI",
  "Infra",
  "Product & Delivery",
  "Quality",
  "Security",
  "Embedded",
  "Enterprise Systems",
  "Specialist",
];

export const ROLE_FAMILY_LABELS: Record<string, string> = {
  Leadership: "Liderlik",
  "Web Engineering": "Web Mühendisliği",
  Mobile: "Mobil",
  "Data & AI": "Veri ve AI",
  Infra: "Altyapı",
  "Product & Delivery": "Ürün ve teslimat",
  Quality: "Kalite",
  Security: "Güvenlik",
  Embedded: "Gömülü",
  "Enterprise Systems": "Kurumsal Sistemler",
  Specialist: "Uzman Roller",
};
export const ROLE_FAMILY_SHORT_LABELS: Record<string, string> = {
  Leadership: "Liderlik",
  "Web Engineering": "Web Müh.",
  Mobile: "Mobil",
  "Data & AI": "Veri & AI",
  Infra: "Altyapı",
  "Product & Delivery": "Ürün",
  Quality: "Kalite",
  Security: "Güvenlik",
  Embedded: "Gömülü",
  "Enterprise Systems": "Kurumsal",
  Specialist: "Uzman",
};

export const QUERY_FIELD_LABELS: Record<string, string> = {
  label: "Grup",
  province: "İl",
  country: "Ülke",
  seniority: "Seviye",
  hasAiTools: "AI kullanımı",
  role: "Rol",
  roleFamily: "Rol ailesi",
  experience: "Deneyim",
  workMode: "Çalışma biçimi",
  companyType: "Sektör",
  companySize: "Şirket büyüklüğü",
  gender: "Cinsiyet",
  currency: "Para birimi",
  raises: "Yıllık zam sayısı",
  isAbroad: "Yurt dışı",
  count: "Örneklem",
  median_salary: "Medyan ücret",
  mean_salary: "Ortalama ücret",
  p25_salary: "Alt çeyrek",
  p75_salary: "Üst çeyrek",
  max_salary: "Maksimum",
  min_salary: "Minimum",
  share_hasAiTools: "AI kullanım payı",
  share_isAbroad: "Yurt dışı payı",
  share_foreignCurrency: "Dövizli maaş payı",
};

export const assetPath = (fileName: string) => `${import.meta.env.BASE_URL}data/${fileName}`;

export async function loadAppData(): Promise<AppData> {
  const [rows, summary, turkeyGeoJson] = await Promise.all([
    fetch(assetPath("survey-processed.json")).then((response) => response.json()),
    fetch(assetPath("analysis-summary.json")).then((response) => response.json()),
    fetch(assetPath("turkey-provinces.geojson")).then((response) => response.json()),
  ]);

  return { rows, summary, turkeyGeoJson };
}
const conversionFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 2,
});
const moneyFormatter = new Intl.NumberFormat("tr-TR", {
  style: "currency",
  currency: "TRY",
  maximumFractionDigits: 0,
});
const compactFormatter = new Intl.NumberFormat("tr-TR", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const integerFormatter = new Intl.NumberFormat("tr-TR");
const percentFormatter = new Intl.NumberFormat("tr-TR", {
  style: "percent",
  maximumFractionDigits: 1,
});
const dateFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Istanbul",
});

export function formatMoney(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }
  return moneyFormatter.format(value);
}

export function formatCompact(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }
  return compactFormatter.format(value);
}

export function formatInteger(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }
  return integerFormatter.format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }
  return percentFormatter.format(value);
}

export function formatConversion(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "—";
  }
  return conversionFormatter.format(value);
}
export function formatDateLabel(value: string) {
  return dateFormatter.format(new Date(value));
}

export function formatSeniorityLabel(value: string) {
  return SENIORITY_LABELS[value] ?? value;
}

export function formatSeniorityShortLabel(value: string) {
  return SENIORITY_SHORT_LABELS[value] ?? formatSeniorityLabel(value);
}

export function formatWorkModeLabel(value: string) {
  return WORK_MODE_LABELS[value] ?? value;
}

export function formatWorkModeShortLabel(value: string) {
  return WORK_MODE_SHORT_LABELS[value] ?? formatWorkModeLabel(value);
}

export function formatRoleFamilyLabel(value: string) {
  return ROLE_FAMILY_LABELS[value] ?? value;
}

export function formatRoleFamilyShortLabel(value: string) {
  return ROLE_FAMILY_SHORT_LABELS[value] ?? formatRoleFamilyLabel(value);
}

export function formatQueryFieldLabel(value: string) {
  return QUERY_FIELD_LABELS[value] ?? value;
}
